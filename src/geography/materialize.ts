import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { OSMTransform } from "osm-pbf-parser-node";

import {
  loadCuration,
  type CurationEntry,
} from "./selection.js";
import {
  geographicReason,
  GEOGRAPHIC_OSMIUM_FILTERS,
  type GeographicReason,
} from "./filter.js";
import {
  section,
  item,
  detail,
  done,
  endSection,
} from "./log.js";

const ROOT = path.resolve(".");
const RAW_DIR = path.join(
  ROOT,
  "data",
  "geography",
  "raw",
);
const MATERIALIZED_DIR = path.join(
  ROOT,
  "data",
  "geography",
  "materialized",
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
      ([key, value]) => [
        key,
        String(value),
      ],
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

    child.once("error", (error) => {
      if (
        (error as NodeJS.ErrnoException).code ===
        "ENOENT"
      ) {
        reject(
          new Error(
            `${command} was not found. Make sure it is installed and on PATH.`,
          ),
        );
        return;
      }

      reject(error);
    });

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

type TagDistribution = Map<
  GeographicReason,
  Map<string, Map<string, number>>
>;

function incrementDistribution(
  distribution: TagDistribution,
  reason: GeographicReason,
  tags: Record<string, string>,
): void {
  const tagKey =
    reason === "administrative_boundary" ||
    reason === "regional_boundary" ||
    reason === "protected_area"
      ? "boundary"
      : reason === "settlement" ||
          reason === "locality"
        ? "place"
        : reason === "geographic_feature"
          ? "natural"
          : reason === "watercourse"
            ? "waterway"
            : reason === "geological_feature"
              ? "geological"
              : reason === "mountain_pass"
                ? "mountain_pass"
                : undefined;

  if (!tagKey) {
    return;
  }

  const value = tags[tagKey];

  if (!value) {
    return;
  }

  const tagValues =
    distribution.get(reason) ??
    new Map<string, Map<string, number>>();

  const values =
    tagValues.get(tagKey) ??
    new Map<string, number>();

  values.set(
    value,
    (values.get(value) ?? 0) + 1,
  );

  tagValues.set(tagKey, values);
  distribution.set(reason, tagValues);
}

function printDistribution(
  distribution: TagDistribution,
): void {
  const categories = [
    ...distribution.entries(),
  ].sort(
    ([a], [b]) => a.localeCompare(b),
  );

  for (const [
    reason,
    tagGroups,
  ] of categories) {
    console.log(`    ${reason}`);

    for (const [
      tagKey,
      values,
    ] of tagGroups) {
      const entries = [
        ...values.entries(),
      ].sort(
        ([, a], [, b]) => b - a,
      );

      for (const [
        value,
        count,
      ] of entries) {
        console.log(
          `      ${tagKey}=${value}: ${count.toLocaleString()}`,
        );
      }
    }
  }
}

async function materializeWholeCountry(
  country: string,
  sourcePath: string,
): Promise<string> {
  const slug = countrySlug(country);

  const semanticPath = path.join(
    MATERIALIZED_DIR,
    `${slug}-semantic.osm.pbf`,
  );

  const outputPath = path.join(
    MATERIALIZED_DIR,
    `${slug}.osm.pbf`,
  );

  await fs.mkdir(
    MATERIALIZED_DIR,
    { recursive: true },
  );

  item("Semantic geographic extraction", {
    country,
    filters:
      GEOGRAPHIC_OSMIUM_FILTERS.length,
  });

  await run("osmium", [
    "tags-filter",
    "--overwrite",
    "--progress",
    "-R",
    sourcePath,
    ...GEOGRAPHIC_OSMIUM_FILTERS,
    "-o",
    semanticPath,
  ]);

  done("Semantic extraction complete", {
    file: path.relative(
      ".",
      semanticPath,
    ),
  });

  item("Named geographic extraction", {
    country,
  });

  await run("osmium", [
    "tags-filter",
    "--overwrite",
    "--progress",
    "-R",
    semanticPath,
    "nwr/name=*",
    "-o",
    outputPath,
  ]);

  done("Materialized whole country", {
    file: path.relative(
      ".",
      outputPath,
    ),
  });

  return outputPath;
}

async function inspectMaterializedCountry(
  country: string,
  materializedPath: string,
): Promise<void> {
  item("Semantic verification", {
    country,
  });

  const reasonCounts = new Map<
    GeographicReason,
    number
  >();

  const tagDistribution: TagDistribution =
    new Map();

  let retained = 0;
  let rejected = 0;

  const input =
    createReadStream(materializedPath);

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
      const reason = geographicReason(tags);

      if (!reason) {
        rejected++;
        continue;
      }

      retained++;

      reasonCounts.set(
        reason,
        (reasonCounts.get(reason) ?? 0) + 1,
      );

      incrementDistribution(
        tagDistribution,
        reason,
        tags,
      );
    }
  }

  done("Semantic verification complete", {
    retained,
    rejected,
  });

  detail("Geographic categories", {
    categories: [
      ...reasonCounts.entries(),
    ]
      .map(
        ([reason, count]) =>
          `${reason}=${count}`,
      )
      .join(","),
  });

  if (rejected > 0) {
    detail("Warning", {
      message:
        "Materialized PBF contains referenced geometry that is not itself a geographic candidate.",
      rejected,
    });
  }

  console.log("");
  console.log(
    `Geographic tag distribution for ${country}`,
  );

  printDistribution(tagDistribution);
}

function groupByCountry(
  entries: CurationEntry[],
): Map<string, CurationEntry[]> {
  const grouped = new Map<
    string,
    CurationEntry[]
  >();

  for (const entry of entries) {
    const entriesForCountry =
      grouped.get(entry.country) ?? [];

    entriesForCountry.push(entry);
    grouped.set(
      entry.country,
      entriesForCountry,
    );
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

  const outputPath = path.join(
    MATERIALIZED_DIR,
    `${countrySlug(country)}.osm.pbf`,
  );

  await fs.mkdir(
    MATERIALIZED_DIR,
    { recursive: true },
  );

  const ids = entries.map(osmId);

  item(country, {
    selected: ids.length,
    source: path.relative(
      ".",
      sourcePath,
    ),
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
    file: path.relative(
      ".",
      outputPath,
    ),
  });

  return outputPath;
}

async function main(): Promise<void> {
  section(
    "Geographic materialization",
  );

  const entries =
    await loadCuration();

  detail("curated selections", {
    count: entries.length,
  });

  const curatedByCountry =
    groupByCountry(entries);

  section(
    "Curated OSM extraction",
  );

  for (
    const [
      country,
      countryEntries,
    ] of curatedByCountry
  ) {
    await materializeCuratedCountry(
      country,
      countryEntries,
    );
  }

  endSection(
    "Curated OSM extraction complete",
    {
      countries:
        curatedByCountry.size,
    },
  );

  section(
    "Whole-country materialization",
  );

  const wholeCountry = [
    "Hungary",
  ];

  for (const country of wholeCountry) {
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

    const materializedPath =
      await materializeWholeCountry(
        country,
        sourcePath,
      );

    await inspectMaterializedCountry(
      country,
      materializedPath,
    );
  }

  endSection(
    "Whole-country materialization complete",
    {
      countries:
        wholeCountry.length,
    },
  );

  endSection(
    "Geographic materialization complete",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
