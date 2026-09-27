import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { OSMTransform } from "osm-pbf-parser-node";

import {
  loadCuration,
  type CurationEntry,
} from "./selection.js";
import { isGeographic } from "./filter.js";
import {
  section,
  item,
  detail,
  done,
  endSection,
} from "./log.js";

const ROOT = path.resolve(".");
const RAW_DIR = path.join(ROOT, "data", "geography", "raw");
const MATERIALIZED_DIR = path.join(
  ROOT,
  "data",
  "geography",
  "materialized",
);
const WHOLE_COUNTRY_DIR = path.join(
  RAW_DIR,
  "whole-country",
);

function countrySlug(country: string): string {
  return country
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function osmId(entry: CurationEntry): string {
  const match = entry.candidateKey.match(
    /^(node|way|relation)\/(\d+)$/,
  );

  if (!match) {
    throw new Error(
      `Invalid curated candidate key: ${entry.candidateKey}`,
    );
  }

  const prefix = {
    node: "n",
    way: "w",
    relation: "r",
  }[match[1]];

  return `${prefix}${match[2]}`;
}

function osmIdFromEntity(
  entity: any,
): string | undefined {
  if (
    entity.type !== "node" &&
    entity.type !== "way" &&
    entity.type !== "relation"
  ) {
    return undefined;
  }

  const prefix = {
    node: "n",
    way: "w",
    relation: "r",
  }[entity.type];

  return `${prefix}${entity.id}`;
}

function tagsFromEntity(
  entity: any,
): Record<string, string> {
  if (!entity.tags) {
    return {};
  }

  if (Array.isArray(entity.tags)) {
    return Object.fromEntries(
      entity.tags.map((tag: any) => [
        tag.key ?? tag.k,
        tag.value ?? tag.v,
      ]),
    );
  }

  return Object.fromEntries(
    Object.entries(entity.tags).map(
      ([key, value]) => [key, String(value)],
    ),
  );
}

function run(
  command: string,
  args: string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
    });

    child.once("error", reject);

    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} failed with ${
            signal
              ? `signal ${signal}`
              : `exit code ${code}`
          }`,
        ),
      );
    });
  });
}

async function namedPbf(
  country: string,
  sourcePath: string,
): Promise<string> {
  const outputPath = path.join(
    WHOLE_COUNTRY_DIR,
    `${countrySlug(country)}-named.osm.pbf`,
  );

  await fs.mkdir(WHOLE_COUNTRY_DIR, {
    recursive: true,
  });

  item("Named-object extraction", {
    country,
  });

  await run("osmium", [
    "tags-filter",
    "--overwrite",
    "--progress",
    "-R",
    sourcePath,
    "nwr/name=*",
    "-o",
    outputPath,
  ]);

  done("Named-object extraction complete", {
    file: path.relative(".", outputPath),
  });

  return outputPath;
}

async function collectWholeCountryIds(
  country: string,
  sourcePath: string,
): Promise<string[]> {
  const namedPath = await namedPbf(
    country,
    sourcePath,
  );

  item("Geographic filtering", {
    country,
  });

  const ids: string[] = [];

  const input = createReadStream(namedPath);
  const parser = new OSMTransform({
    withTags: true,
    withInfo: false,
  });

  input.pipe(parser);

  for await (const batch of parser) {
    const entities = Array.isArray(batch)
      ? batch
      : [batch];

    for (const entity of entities as any[]) {
      const tags = tagsFromEntity(entity);

      if (!isGeographic(tags)) {
        continue;
      }

      const id = osmIdFromEntity(entity);

      if (id) {
        ids.push(id);
      }
    }
  }

  done("Geographic filtering complete", {
    retained: ids.length,
  });

  return ids;
}

async function materializeCountryIds(
  country: string,
  sourcePath: string,
  ids: string[],
): Promise<string> {
  if (ids.length === 0) {
    throw new Error(
      `No geographic objects selected for ${country}`,
    );
  }

  const outputPath = path.join(
    MATERIALIZED_DIR,
    `${countrySlug(country)}.osm.pbf`,
  );

  await fs.mkdir(MATERIALIZED_DIR, {
    recursive: true,
  });

  item(country, {
    selected: ids.length,
    source: path.relative(".", sourcePath),
  });

  detail("OSM IDs", {
    ids: ids.length,
  });

  await run("osmium", [
    "getid",
    "--overwrite",
    "--add-referenced",
    sourcePath,
    ...ids,
    "-o",
    outputPath,
  ]);

  done("Materialized country", {
    file: path.relative(".", outputPath),
  });

  return outputPath;
}

function groupByCountry(
  entries: CurationEntry[],
): Map<string, CurationEntry[]> {
  const grouped = new Map<string, CurationEntry[]>();

  for (const entry of entries) {
    const entriesForCountry =
      grouped.get(entry.country) ?? [];

    entriesForCountry.push(entry);
    grouped.set(entry.country, entriesForCountry);
  }

  return grouped;
}

async function materializeCuratedCountry(
  country: string,
  entries: CurationEntry[],
): Promise<string> {
  const sourcePath = path.join(
    RAW_DIR,
    `${countrySlug(country)}.osm.pbf`,
  );

  try {
    await fs.access(sourcePath);
  } catch {
    throw new Error(
      `Source PBF for ${country} does not exist: ${sourcePath}`,
    );
  }

  const ids = entries.map(osmId);

  return materializeCountryIds(
    country,
    sourcePath,
    ids,
  );
}

async function materializeWholeCountry(
  country: string,
): Promise<string> {
  const sourcePath = path.join(
    RAW_DIR,
    `${countrySlug(country)}.osm.pbf`,
  );

  try {
    await fs.access(sourcePath);
  } catch {
    throw new Error(
      `Source PBF for ${country} does not exist: ${sourcePath}`,
    );
  }

  const ids = await collectWholeCountryIds(
    country,
    sourcePath,
  );

  return materializeCountryIds(
    country,
    sourcePath,
    ids,
  );
}

async function main(): Promise<void> {
  section("Geographic materialization");

  const entries = await loadCuration();

  detail("curated selections", {
    count: entries.length,
  });

  const curatedByCountry = groupByCountry(entries);

  section("Curated OSM extraction");

  for (const [country, countryEntries] of curatedByCountry) {
    await materializeCuratedCountry(
      country,
      countryEntries,
    );
  }

  endSection("Curated OSM extraction complete", {
    countries: curatedByCountry.size,
  });

  section("Whole-country extraction");

  const wholeCountry = ["Hungary"];

  for (const country of wholeCountry) {
    await materializeWholeCountry(country);
  }

  endSection("Whole-country extraction complete", {
    countries: wholeCountry.length,
  });

  endSection("Geographic materialization complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
