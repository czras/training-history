import { spawn } from "node:child_process";
import {
  mkdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  error,
  info,
} from "../log.js";

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

async function readJson<T>(
  filePath: string,
): Promise<T | undefined> {
  try {
    const content = await import("node:fs/promises").then((fs) =>
      fs.readFile(filePath, "utf8"),
    );

    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

async function writeJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await writeFile(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function parseHeaders(output: string): HttpMetadata {
  const headers: Record<string, string> = {};

  let current: Record<string, string> = {};

  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("HTTP/")) {
      current = {};
      continue;
    }

    const separator = line.indexOf(":");

    if (separator === -1) {
      continue;
    }

    const name = line
      .slice(0, separator)
      .trim()
      .toLowerCase();

    const value = line.slice(separator + 1).trim();

    current[name] = value;
  }

  headers.etag = current.etag;
  headers["last-modified"] = current["last-modified"];
  headers["content-length"] = current["content-length"];

  const contentLengthHeader = headers["content-length"];

  const contentLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : undefined;

  return {
    etag: headers.etag,
    lastModified: headers["last-modified"],
    contentLength:
      contentLength !== undefined &&
      Number.isFinite(contentLength)
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

async function inspectRemote(
  url: string,
): Promise<HttpMetadata> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "curl",
      [
        "--fail",
        "--silent",
        "--show-error",
        "--head",
        "--location",
        "--header",
        "Accept-Encoding: identity",
        url,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() ||
              `curl HEAD request failed with exit code ${code}`,
          ),
        );
        return;
      }

      resolve(parseHeaders(stdout));
    });
  });
}

async function validatePbf(
  filePath: string,
  expectedSize?: number,
): Promise<void> {
  const result = await stat(filePath);

  if (!result.isFile() || result.size === 0) {
    throw new Error("Downloaded OSM source is empty");
  }

  if (
    expectedSize !== undefined &&
    result.size !== expectedSize
  ) {
    throw new Error(
      `Downloaded OSM source size ${result.size} does not match expected ${expectedSize}`,
    );
  }

  info("Validating PBF with osmium");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "osmium",
      ["fileinfo", "--input-format=pbf", "--no-progress", filePath],
      {
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    let stderr = "";

    child.stderr.setEncoding("utf8");

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim()
              ? `Downloaded OSM source failed PBF validation:\n${stderr.trim()}`
              : "Downloaded OSM source failed PBF validation",
          ),
        );
        return;
      }

      info("PBF validation passed");
      resolve();
    });
  });
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

      info("Resuming download", {
        bytes: formatBytes(existingBytes),
      });
    } else {
      info("Partial download is stale; restarting");

      try {
        await unlink(temporaryPath);
      } catch {}

      try {
        await unlink(metadataPath);
      } catch {}

      existingBytes = 0;
    }
  }

  await writeJson(metadataPath, {
    url,
    ...remoteMetadata,
    downloadedAt: new Date().toISOString(),
  });

  const args = [
    "--fail",
    "--location",
    "--header",
    "Accept-Encoding: identity",
    "--progress-bar",
  ];

  if (append) {
    args.push("--continue-at", "-");
  }

  args.push("--output", temporaryPath);
  args.push(url);

  info("Downloading");

  await new Promise<void>((resolve, reject) => {
    const child = spawn("curl", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();

      process.stderr.write(text);

      stderr += text;
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim()
              ? `curl download failed:\n${stderr.trim()}`
              : `curl download failed with exit code ${code}`,
          ),
        );
        return;
      }

      resolve();
    });
  });

  const completed = await stat(temporaryPath);

  if (completed.size === 0) {
    throw new Error("Downloaded OSM source is empty");
  }

  if (
    remoteMetadata.contentLength !== undefined &&
    completed.size !== remoteMetadata.contentLength
  ) {
    throw new Error(
      `Downloaded OSM source size ${completed.size} does not match expected ${remoteMetadata.contentLength}`,
    );
  }

  await validatePbf(
    temporaryPath,
    remoteMetadata.contentLength,
  );

  return completed.size;
}

export async function acquireCountry(
  country: string,
): Promise<OsmSource> {
  const url = sourceForCountry(country);
  const filename = filenameForCountry(country);

  await mkdir(RAW_DIRECTORY, { recursive: true });

  const targetPath = path.join(
    RAW_DIRECTORY,
    filename,
  );

  const metadataPath = metadataPathFor(targetPath);
  const temporaryPath = `${targetPath}.part`;
  const temporaryMetadataPath =
    partialMetadataPathFor(targetPath);

  let targetExists = false;

  try {
    const existing = await stat(targetPath);

    targetExists =
      existing.isFile() && existing.size > 0;
  } catch {}

  if (targetExists) {
    const localMetadata =
      await readJson<SourceMetadata>(metadataPath);

    if (localMetadata?.url === url) {
      info("Checking OSM source", { country });

      const remoteMetadata =
        await inspectRemote(url);

      if (
        sameRemoteVersion(
          localMetadata,
          remoteMetadata,
        )
      ) {
        info("Unchanged — using local source");

        await validatePbf(
          targetPath,
          remoteMetadata.contentLength,
        );

        return {
          country,
          url,
          path: targetPath,
          downloaded: false,
        };
      }

      info("Upstream source changed");
    } else {
      info("OSM source exists but has no usable metadata", {
        path: targetPath,
      });
    }
  }

  info("Downloading OSM source", { country });
  info("Source", { url });
  info("Target", { path: targetPath });

  const remoteMetadata =
    await inspectRemote(url);

  const downloadedBytes = await download(
    url,
    temporaryPath,
    temporaryMetadataPath,
    remoteMetadata,
  );

  await rename(
    temporaryPath,
    targetPath,
  );

  await rename(
    temporaryMetadataPath,
    metadataPath,
  );

  info("Download complete", {
    bytes: formatBytes(downloadedBytes),
  });

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
    sources.push(
      await acquireCountry(country),
    );
  }

  return sources;
}
