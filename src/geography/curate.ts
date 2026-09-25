import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { OSMTransform } from "osm-pbf-parser-node";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";

import { acquireCountries } from "./osm.js";

const ROOT = path.resolve(".");
const COVERAGE_PATH = path.join(ROOT, "geography", "coverage.md");
const RAW_DIR = path.join(ROOT, "data", "geography", "raw");
const CANDIDATE_DIR = path.join(RAW_DIR, "candidates");

type CountrySelection = {
  country: string;
  areas: string[];
};

type Candidate = {
  type: "node" | "way" | "relation";
  id: number;
  name: string;
  tags: Record<string, string>;
};

function parseCoverage(markdown: string): CountrySelection[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);

  const selections: CountrySelection[] = [];
  let currentCountry: CountrySelection | undefined;

  visit(tree, "listItem", (node: any) => {
    const text = node.children
      .filter((child: any) => child.type === "paragraph")
      .flatMap((paragraph: any) => paragraph.children ?? [])
      .filter((child: any) => child.type === "text")
      .map((child: any) => child.value)
      .join("")
      .trim();

    if (!text) {
      return;
    }

    const checked = node.checked === true;

    if (node.position?.start?.column === 1 && checked) {
      currentCountry = {
        country: text,
        areas: [],
      };

      selections.push(currentCountry);
      return;
    }

    if (currentCountry && node.position?.start?.column > 1) {
      currentCountry.areas.push(text);
    }
  });

  return selections;
}

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
    console.log("  filtering named OSM objects with osmium...");

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
        reject(new Error(`osmium tags-filter exited with code ${code}`));
      }
    });
  });
}

function tagsFromEntity(entity: any): Record<string, string> {
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

async function scanCandidates(
  country: CountrySelection,
  sourcePath: string,
): Promise<Candidate[]> {
  const outputPath = candidateFile(country.country);

  await mkdir(CANDIDATE_DIR, { recursive: true });

  await runOsmium(sourcePath, outputPath);

  const outputStats = await stat(outputPath);

  console.log(
    `  candidate PBF: ${(outputStats.size / 1024 / 1024).toFixed(1)} MB`,
  );

  const candidates: Candidate[] = [];

  const input = createReadStream(outputPath);
  const parser = new OSMTransform({
    withTags: true,
    withInfo: false,
  });

  input.pipe(parser);

  for await (const batch of parser) {
    const entities = Array.isArray(batch) ? batch : [batch];

    for (const entity of entities as any[]) {
      const tags = tagsFromEntity(entity);
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
        tags,
      });
    }
  }

  return candidates;
}

function printCandidates(
  country: CountrySelection,
  candidates: Candidate[],
): void {
  const nodes = candidates.filter((candidate) => candidate.type === "node");
  const ways = candidates.filter((candidate) => candidate.type === "way");
  const relations = candidates.filter(
    (candidate) => candidate.type === "relation",
  );

  console.log("");
  console.log(`Candidates for ${country.country}`);
  console.log(`  nodes:      ${nodes.length.toLocaleString()}`);
  console.log(`  ways:       ${ways.length.toLocaleString()}`);
  console.log(`  relations:  ${relations.length.toLocaleString()}`);

  if (country.areas.length === 0) {
    console.log("  configured scope: whole country");
    return;
  }

  console.log("");
  console.log("Configured selections");

  for (const area of country.areas) {
    const matches = candidates.filter(
      (candidate) =>
        candidate.name.localeCompare(area, undefined, {
          sensitivity: "accent",
        }) === 0,
    );

    console.log(`  ${area}: ${matches.length} match(es)`);

    for (const match of matches.slice(0, 20)) {
      const interestingTags = Object.entries(match.tags)
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
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");

      console.log(
        `    ${match.type}/${match.id} ${match.name}` +
          (interestingTags ? ` [${interestingTags}]` : ""),
      );
    }

    if (matches.length > 20) {
      console.log(`    ... ${matches.length - 20} more`);
    }
  }
}

async function main(): Promise<void> {
  const markdown = await readFile(COVERAGE_PATH, "utf8");
  const selections = parseCoverage(markdown);

  if (selections.length === 0) {
    throw new Error("No checked countries found in coverage.md");
  }

  console.log("Geographic curation");
  console.log("");

  for (const selection of selections) {
    console.log(
      `  ${selection.country}` +
        (selection.areas.length
          ? `: ${selection.areas.join(", ")}`
          : ": whole country"),
    );
  }

  console.log("");

  await acquireCountries(
    selections.map((selection) => selection.country),
    RAW_DIR,
  );

  console.log("");

  for (const selection of selections) {
    const slug = selection.country
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const sourcePath = path.join(RAW_DIR, `${slug}.osm.pbf`);

    const candidates = await scanCandidates(selection, sourcePath);

    printCandidates(selection, candidates);
  }

  console.log("");
  console.log("Geographic candidate discovery complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
