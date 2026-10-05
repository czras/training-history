import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { OSMTransform } from "osm-pbf-parser-node";

import { info } from "../log.js";
import type { CountrySelection } from "./coverage.js";
import { isExcluded } from "./filter.js";

const ROOT = path.resolve(".");
const RAW_DIR = path.join(ROOT, "data", "geography", "raw");
const CANDIDATE_DIR = path.join(RAW_DIR, "candidates");

export type CandidateName = {
  key: string;
  value: string;
};

export type Candidate = {
  type: "node" | "way" | "relation";
  id: number;
  name: string;
  names: CandidateName[];
  tags: Record<string, string>;
};

function candidateFile(country: string): string {
  const slug = country
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return path.join(CANDIDATE_DIR, `${slug}-named.osm.pbf`);
}

function runOsmium(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    info(
      "Filtering named geographic objects with osmium",
    );

    const child = spawn(
      "osmium",
      [
        "tags-filter",
        "--overwrite",
        "--progress",
        "-R",
        sourcePath,
        "nwr/name=*",
        "-o",
        outputPath,
      ],
      {
        stdio: "inherit",
      },
    );

    child.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "osmium was not found. Install osmium-tool and make sure `osmium` is on PATH.",
          ),
        );
        return;
      }

      reject(error);
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `osmium tags-filter exited with code ${code}`,
          ),
        );
      }
    });
  });
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
    Object.entries(entity.tags).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
}

function namesFromTags(
  tags: Record<string, string>,
): CandidateName[] {
  return Object.entries(tags)
    .filter(
      ([key, value]) =>
        (key === "name" || key.startsWith("name:")) &&
        Boolean(value),
    )
    .map(([key, value]) => ({
      key,
      value,
    }));
}

export async function discoverCandidates(
  country: CountrySelection,
  sourcePath: string,
): Promise<Candidate[]> {
  const outputPath = candidateFile(country.country);

  await mkdir(CANDIDATE_DIR, { recursive: true });

  await runOsmium(sourcePath, outputPath);

  const outputStats = await stat(outputPath);

  info("Candidate PBF", {
    size: `${(outputStats.size / 1024 / 1024).toFixed(1)} MB`,
  });

  const candidates: Candidate[] = [];

  const input = createReadStream(outputPath);
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

      if (isExcluded(tags)) {
        continue;
      }

      const name = tags.name;

      if (!name) {
        continue;
      }

      let type: Candidate["type"];

      if (entity.type === "node") {
        type = "node";
      } else if (entity.type === "way") {
        type = "way";
      } else if (entity.type === "relation") {
        type = "relation";
      } else {
        continue;
      }

      candidates.push({
        type,
        id: Number(entity.id),
        name,
        names: namesFromTags(tags),
        tags,
      });
    }
  }

  return candidates;
}

export function printCandidates(
  country: CountrySelection,
  candidates: Candidate[],
): void {
  const nodes = candidates.filter(
    (candidate) => candidate.type === "node",
  );
  const ways = candidates.filter(
    (candidate) => candidate.type === "way",
  );
  const relations = candidates.filter(
    (candidate) => candidate.type === "relation",
  );

  info(`Candidates for ${country.country}`);
  info("Candidate counts", {
    nodes: nodes.length,
    ways: ways.length,
    relations: relations.length,
  });

  if (country.areas.length === 0) {
    info("Configured scope: whole country");
    return;
  }

  info("Configured selections");

  for (const area of country.areas) {
    const matches = candidates.filter((candidate) =>
      candidate.names.some(
        (name) =>
          name.value.localeCompare(
            area,
            undefined,
            {
              sensitivity: "accent",
            },
          ) === 0,
      ),
    );

    info(`Selection ${area}`, {
      matches: matches.length,
    });

    for (const match of matches.slice(0, 20)) {
      const matchingNames = match.names
        .filter(
          (name) =>
            name.value.localeCompare(
              area,
              undefined,
              {
                sensitivity: "accent",
              },
            ) === 0,
        )
        .map(
          (name) =>
            `${name.key}=${name.value}`,
        )
        .join(", ");

      const interestingTags = Object.entries(
        match.tags,
      )
        .filter(([key]) =>
          [
            "place",
            "boundary",
            "admin_level",
            "natural",
            "mountain_pass",
            "landuse",
            "leisure",
            "tourism",
            "type",
          ].includes(key),
        )
        .map(
          ([key, value]) =>
            `${key}=${value}`,
        )
        .join(", ");

      info(
        `${match.type}/${match.id} ${match.name}` +
          (matchingNames
            ? ` [matched: ${matchingNames}]`
            : "") +
          (interestingTags
            ? ` [${interestingTags}]`
            : ""),
      );
    }

    if (matches.length > 20) {
      info(`... ${matches.length - 20} more`);
    }
  }
}
