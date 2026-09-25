import { createWriteStream } from "node:fs";
import {
  mkdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const RAW_DIRECTORY = path.resolve("data/geography/raw");

interface HttpMetadata {
  etag?: string;
  lastModified?: string;
  contentLength?: number;
}

interface SourceMetadata extends HttpMetadata {
  url: string;
  downloadedAt: string;
}

export interface OsmSource {
  country: string;
  url: string;
  path: string;
  downloaded: boolean;
}

function geofabrikSlug(country: string): string {
  return country
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sourceForCountry(country: string): string {
  const slug = geofabrikSlug(country);
  return `https://download.geofabrik.de/europe/${slug}-latest.osm.pbf`;
}

function filenameForCountry(country: string): string {
  return `${geofabrikSlug(country)}.osm.pbf`;
}

function metadataPathFor(targetPath: string): string {
  return `${targetPath}.json`;
}

function partialMetadataPathFor(targetPath: string): string {
  return `${targetPath}.part.json`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }

  return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
}

async function readJson<T>(filePath: string): Promise<T | undefined> {
  try {
    const content = await import("node:fs/promises").then((fs) =>
      fs.readFile(filePath, "utf8"),
    );
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function metadataFromResponse(response: Response): HttpMetadata {
  const etag = response.headers.get("etag") ?? undefined;
  const lastModified =
    response.headers.get("last-modified") ?? undefined;

  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : undefined;

  return {
    etag,
    lastModified,
    contentLength:
      contentLength !== undefined && Number.isFinite(contentLength)
        ? contentLength
        : undefined,
  };
}

function sameRemoteVersion(
  local: HttpMetadata,
  remote: HttpMetadata,
): boolean {
  if (local.etag && remote.etag) {
    return local.etag === remote.etag;
  }

  if (local.lastModified && remote.lastModified) {
    return local.lastModified === remote.lastModified;
  }

  if (
    local.contentLength !== undefined &&
    remote.contentLength !== undefined
  ) {
    return local.contentLength === remote.contentLength;
  }

  return false;
}

async function inspectRemote(url: string): Promise<HttpMetadata> {
  const response = await fetch(url, { method: "HEAD" });

  if (!response.ok) {
    throw new Error(
      `Failed to inspect OSM source: ${response.status} ${response.statusText}`,
    );
  }

  return metadataFromResponse(response);
}

async function download(
  url: string,
  temporaryPath: string,
  metadataPath: string,
  remoteMetadata: HttpMetadata,
): Promise<number> {
  let existingBytes = 0;

  try {
    const existing = await stat(temporaryPath);
    if (existing.isFile()) {
      existingBytes = existing.size;
    }
  } catch {}

  let append = false;

  if (existingBytes > 0) {
    const partialMetadata =
      await readJson<SourceMetadata>(metadataPath);

    const canResume =
      partialMetadata?.url === url &&
      sameRemoteVersion(partialMetadata, remoteMetadata);

    if (canResume) {
      append = true;
      console.log(`  resuming from ${formatBytes(existingBytes)}`);
    } else {
      console.log("  partial download is stale; restarting");
      try {
        await unlink(temporaryPath);
      } catch {}
      try {
        await unlink(metadataPath);
      } catch {}
      existingBytes = 0;
    }
  }

  const headers: Record<string, string> = {};

  if (append) {
    headers.Range = `bytes=${existingBytes}-`;
  }

  let response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `Failed to download OSM source: ${response.status} ${response.statusText}`,
    );
  }

  if (append && response.status !== 206) {
    console.log("  server did not resume the partial download; restarting");

    append = false;
    existingBytes = 0;

    try {
      await unlink(temporaryPath);
    } catch {}

    response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to restart OSM source download: ${response.status} ${response.statusText}`,
      );
    }
  }

  if (!response.body) {
    throw new Error("OSM source returned no response body");
  }

  const responseMetadata = metadataFromResponse(response);

  const responseBytes = responseMetadata.contentLength;

  const totalBytes =
    responseBytes !== undefined
      ? existingBytes + responseBytes
      : undefined;

  const startedAt = Date.now();
  let downloadedBytes = existingBytes;
  let lastUpdate = startedAt;

  const source = Readable.fromWeb(response.body);

  // Establish progress line after the destination line printed
  // by acquireCountry().
  process.stdout.write("  ");

  source.on("data", (chunk: Buffer) => {
    downloadedBytes += chunk.length;

    const now = Date.now();

    if (now - lastUpdate < 250) {
      return;
    }

    lastUpdate = now;

    const elapsedSeconds = Math.max(
      (now - startedAt) / 1000,
      0.001,
    );

    const speed =
      (downloadedBytes - existingBytes) / elapsedSeconds;

    process.stdout.write("\r  ");

    if (totalBytes && Number.isFinite(totalBytes)) {
      const percentage = (downloadedBytes / totalBytes) * 100;

      process.stdout.write(
        `${percentage.toFixed(1).padStart(5)}% ` +
          `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} ` +
          `${formatSpeed(speed)}`,
      );
    } else {
      process.stdout.write(
        `${formatBytes(downloadedBytes)} ${formatSpeed(speed)}`,
      );
    }
  });

  // Persist the identity of the representation being downloaded.
  await writeJson(metadataPath, {
    url,
    ...remoteMetadata,
    downloadedAt: new Date().toISOString(),
  });

  await pipeline(
    source,
    createWriteStream(temporaryPath, {
      flags: append ? "a" : "w",
    }),
  );

  process.stdout.write("\n");

  const completed = await stat(temporaryPath);

  if (completed.size === 0) {
    throw new Error("Downloaded OSM source is empty");
  }

  return completed.size;
}

export async function acquireCountry(
  country: string,
): Promise<OsmSource> {
  const url = sourceForCountry(country);
  const filename = filenameForCountry(country);

  await mkdir(RAW_DIRECTORY, { recursive: true });

  const targetPath = path.join(RAW_DIRECTORY, filename);
  const metadataPath = metadataPathFor(targetPath);
  const temporaryPath = `${targetPath}.part`;
  const temporaryMetadataPath =
    partialMetadataPathFor(targetPath);

  let targetExists = false;

  try {
    const existing = await stat(targetPath);
    targetExists = existing.isFile() && existing.size > 0;
  } catch {}

  /*
   * Existing complete source:
   *
   * Check the upstream representation before downloading anything.
   * HEAD only transfers response headers, so an unchanged multi-GB
   * PBF costs essentially nothing to validate.
   */
  if (targetExists) {
    const localMetadata =
      await readJson<SourceMetadata>(metadataPath);

    if (localMetadata?.url === url) {
      console.log(`Checking OSM source for ${country}`);

      const remoteMetadata = await inspectRemote(url);

      if (sameRemoteVersion(localMetadata, remoteMetadata)) {
        console.log("  unchanged — using local source");

        return {
          country,
          url,
          path: targetPath,
          downloaded: false,
        };
      }

      console.log("  upstream source changed");
    } else {
      console.log(
        `OSM source exists but has no usable metadata: ${targetPath}`,
      );
    }
  }

  console.log(`Downloading OSM source for ${country}`);
  console.log(`  ${url}`);
  console.log(`  → ${targetPath}`);

  /*
   * Get the current upstream identity before deciding whether an
   * existing partial download can be resumed.
   */
  const remoteMetadata = await inspectRemote(url);

  /*
   * A complete local file without metadata is not trusted as fresh.
   * Downloading it again also establishes the metadata sidecar.
   */
  const downloadedBytes = await download(
    url,
    temporaryPath,
    temporaryMetadataPath,
    remoteMetadata,
  );

  await rename(temporaryPath, targetPath);

  /*
   * Promote the partial metadata to the completed source metadata.
   */
  await rename(temporaryMetadataPath, metadataPath);

  console.log(`  completed: ${formatBytes(downloadedBytes)}`);

  return {
    country,
    url,
    path: targetPath,
    downloaded: true,
  };
}

export async function acquireCountries(
  countries: string[],
): Promise<OsmSource[]> {
  const sources: OsmSource[] = [];

  for (const country of countries) {
    sources.push(await acquireCountry(country));
  }

  return sources;
}
