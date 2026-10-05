import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  info,
  error,
} from "../log.js";

const ROOT = path.resolve(".");
const GPKG = path.join(
  ROOT,
  "data",
  "geography",
  "materialized",
  "geography.gpkg",
);

function run(
  command: string,
  args: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.once("error", (caughtError) => {
      if (
        (caughtError as NodeJS.ErrnoException).code ===
        "ENOENT"
      ) {
        reject(
          new Error(
            `${command} was not found. Make sure it is installed and on PATH.`,
          ),
        );
        return;
      }

      reject(caughtError);
    });

    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(
        new Error(
          `${command} failed with ${
            signal
              ? `signal ${signal}`
              : `exit code ${code}`
          }\n${stderr}`,
        ),
      );
    });
  });
}

async function inspect(): Promise<void> {
  try {
    await fs.access(GPKG);
  } catch {
    throw new Error(
      `GeoPackage does not exist: ${path.relative(".", GPKG)}`,
    );
  }

  info("Geography GeoPackage");

  info(
    "file",
    {
      path: path.relative(".", GPKG),
    },
  );

  info("Layers");

  const layers = await run(
    "ogrinfo",
    [
      "-ro",
      "-so",
      GPKG,
    ],
  );

  info(layers.trim());

  info("Schema");

  const schema = await run(
    "ogrinfo",
    [
      "-ro",
      "-so",
      GPKG,
      "geography",
    ],
  );

  info(schema.trim());

  info("Role distribution");

  const roles = await run(
    "ogrinfo",
    [
      "-ro",
      "-dialect",
      "SQLite",
      GPKG,
      "-sql",
      [
        "SELECT",
        "role, COUNT(*) AS count",
        "FROM geography",
        "GROUP BY role",
        "ORDER BY count DESC, role",
      ].join(" "),
    ],
  );

  info(roles.trim());

  info("Country distribution");

  const countries = await run(
    "ogrinfo",
    [
      "-ro",
      "-dialect",
      "SQLite",
      GPKG,
      "-sql",
      [
        "SELECT",
        "country, COUNT(*) AS count",
        "FROM geography",
        "GROUP BY country",
        "ORDER BY count DESC, country",
      ].join(" "),
    ],
  );

  info(countries.trim());

  info("Geometry distribution");

  const geometry = await run(
    "ogrinfo",
    [
      "-ro",
      "-dialect",
      "SQLite",
      GPKG,
      "-sql",
      [
        "SELECT",
        "GeometryType(geom) AS geometry_type,",
        "COUNT(*) AS count",
        "FROM geography",
        "GROUP BY GeometryType(geom)",
        "ORDER BY count DESC, geometry_type",
      ].join(" "),
    ],
  );

  info(geometry.trim());

  info("Known geographic examples");

  const examples = await run(
    "ogrinfo",
    [
      "-ro",
      "-dialect",
      "SQLite",
      GPKG,
      "-sql",
      [
        "SELECT",
        "role,",
        "country,",
        "name,",
        "osm_type,",
        "osm_id",
        "FROM geography",
        "WHERE name IN",
        "('Veszprém', 'Balaton', 'Bakony')",
        "ORDER BY name, role",
        "LIMIT 50",
      ].join(" "),
    ],
  );

  info(examples.trim());

  info("Null / provenance checks");

  const quality = await run(
    "ogrinfo",
    [
      "-ro",
      "-dialect",
      "SQLite",
      GPKG,
      "-sql",
      [
        "SELECT",
        "COUNT(*) AS total,",
        "SUM(CASE WHEN role IS NULL THEN 1 ELSE 0 END) AS missing_role,",
        "SUM(CASE WHEN name IS NULL THEN 1 ELSE 0 END) AS missing_name,",
        "SUM(CASE WHEN osm_type IS NULL THEN 1 ELSE 0 END) AS missing_osm_type,",
        "SUM(CASE WHEN osm_id IS NULL THEN 1 ELSE 0 END) AS missing_osm_id,",
        "SUM(CASE WHEN country IS NULL THEN 1 ELSE 0 END) AS missing_country",
        "FROM geography",
      ].join(" "),
    ],
  );

  info(quality.trim());

  info("Inspection complete.");
}

inspect().catch((caughtError) => {
  error(
    caughtError instanceof Error
      ? caughtError.message
      : String(caughtError),
  );
  process.exitCode = 1;
});
