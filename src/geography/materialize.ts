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
const TEMP_DIR = path.join(
  MATERIALIZED_DIR,
  ".tmp",
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
    TEMP_DIR,
    `${slug}-semantic.osm.pbf`,
  );

  const outputPath = path.join(
    MATERIALIZED_DIR,
    `${slug}.osm.pbf`,
  );

  await fs.mkdir(
    TEMP_DIR,
    { recursive: true },
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

  await fs.rm(
    semanticPath,
    { force: true },
  );

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
    detail("Referenced geometry", {
      count: rejected,
    });
  }

  console.log("");
  console.log(
    `Geographic tag distribution for ${country}`,
  );

  printDistribution(tagDistribution);
}

async function exportGeoJson(
  country: string,
  materializedPath: string,
): Promise<string> {
  const slug = countrySlug(country);
  const outputPath = path.join(
    TEMP_DIR,
    `${slug}.geojson`,
  );

  await fs.mkdir(
    TEMP_DIR,
    { recursive: true },
  );

  item("GIS export", {
    country,
  });

  await run("osmium", [
    "export",
    "--overwrite",
    "--add-unique-id=type_id",
    "--attributes=type,id",
    materializedPath,
    "-o",
    outputPath,
  ]);

  done("GIS export complete", {
    file: path.relative(
      ".",
      outputPath,
    ),
  });

  return outputPath;
}

type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry?: unknown;
};

type GeoJsonCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

async function normalizeGeoJson(
  country: string,
  geoJsonPath: string,
): Promise<string> {
  const slug = countrySlug(country);
  const outputPath = path.join(
    TEMP_DIR,
    `${slug}-normalized.geojson`,
  );

  const content =
    await fs.readFile(
      geoJsonPath,
      "utf8",
    );

  const collection =
    JSON.parse(content) as GeoJsonCollection;

  const features: GeoJsonFeature[] = [];

  for (const feature of collection.features) {
    const properties =
      feature.properties ?? {};

    const tags = Object.fromEntries(
      Object.entries(properties).filter(
        ([key]) =>
          !key.startsWith("@") &&
          key !== "osm_id" &&
          key !== "osm_type",
      ),
    );

    const reason = geographicReason(
      Object.fromEntries(
        Object.entries(tags).map(
          ([key, value]) => [
            key,
            String(value),
          ],
        ),
      ),
    );

    if (!reason) {
      continue;
    }

    const osmType =
      typeof properties["@type"] === "string"
        ? properties["@type"]
        : undefined;

    const osmIdValue =
      properties["@id"] !== undefined
        ? String(properties["@id"])
        : undefined;

    const name =
      typeof properties.name === "string"
        ? properties.name
        : undefined;

    features.push({
      type: "Feature",
      properties: {
        country,
        role: reason,
        osm_type: osmType,
        osm_id: osmIdValue,
        name: name ?? null,
        tags: JSON.stringify(tags),
      },
      geometry: feature.geometry,
    });
  }

  const normalized: GeoJsonCollection = {
    type: "FeatureCollection",
    features,
  };

  await fs.writeFile(
    outputPath,
    JSON.stringify(normalized),
    "utf8",
  );

  done("Normalized GIS dataset", {
    features: features.length,
  });

  return outputPath;
}

async function materializeGeoPackage(
  country: string,
  normalizedGeoJsonPath: string,
): Promise<string> {
  const outputPath = path.join(
    MATERIALIZED_DIR,
    "geography.gpkg",
  );

  item("GeoPackage materialization", {
    country,
  });

  await run("ogr2ogr", [
    "-f",
    "GPKG",
    "-overwrite",
    outputPath,
    normalizedGeoJsonPath,
    "-nln",
    "geography",
    "-nlt",
    "PROMOTE_TO_MULTI",
    "-a_srs",
    "EPSG:4326",
  ]);

  done("GeoPackage materialization complete", {
    file: path.relative(
      ".",
      outputPath,
    ),
  });

  return outputPath;
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

  const idFilePath = path.join(
    TEMP_DIR,
    `${countrySlug(country)}-ids.txt`,
  );

  await fs.mkdir(
    MATERIALIZED_DIR,
    { recursive: true },
  );

  await fs.mkdir(
    TEMP_DIR,
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

  await fs.writeFile(
    idFilePath,
    `${ids.join("\n")}\n`,
    "utf8",
  );

  try {
    await run("osmium", [
      "getid",
      "--overwrite",
      "--add-referenced",
      sourcePath,
      "--id-file",
      idFilePath,
      "-o",
      outputPath,
    ]);
  } finally {
    await fs.rm(
      idFilePath,
      { force: true },
    );
  }

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

    const geoJsonPath =
      await exportGeoJson(
        country,
        materializedPath,
      );

    const normalizedPath =
      await normalizeGeoJson(
        country,
        geoJsonPath,
      );

    await materializeGeoPackage(
      country,
      normalizedPath,
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
