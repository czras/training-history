import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

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

  console.log("");
  console.log("Geography GeoPackage");
  console.log("====================");
  console.log(
    `file: ${path.relative(".", GPKG)}`,
  );

  console.log("");
  console.log("Layers");
  console.log("------");

  const layers = await run(
    "ogrinfo",
    [
      "-ro",
      "-so",
      GPKG,
    ],
  );

  console.log(layers.trim());

  console.log("");
  console.log("Schema");
  console.log("------");

  const schema = await run(
    "ogrinfo",
    [
      "-ro",
      "-so",
      GPKG,
      "geography",
    ],
  );

  console.log(schema.trim());

  console.log("");
  console.log("Role distribution");
  console.log("-----------------");

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

  console.log(roles.trim());

  console.log("");
  console.log("Country distribution");
  console.log("--------------------");

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

  console.log(countries.trim());

  console.log("");
  console.log("Geometry distribution");
  console.log("--------------------");

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

  console.log(geometry.trim());

  console.log("");
  console.log("Known geographic examples");
  console.log("-------------------------");

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

  console.log(examples.trim());

  console.log("");
  console.log("Null / provenance checks");
  console.log("------------------------");

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

  console.log(quality.trim());

  console.log("");
  console.log("Inspection complete.");
}

inspect().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
