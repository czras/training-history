import { pathToFileURL } from "node:url";
import path from "node:path";

import { loadCoverage } from "./coverage.js";
import {
  discoverCandidates,
  printCandidates,
} from "./candidates.js";
import { acquireCountries } from "./osm.js";

const ROOT = path.resolve(".");
const RAW_DIR = path.join(ROOT, "data", "geography", "raw");

async function main(): Promise<void> {
  const selections = await loadCoverage();

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

    const candidates = await discoverCandidates(
      selection,
      sourcePath,
    );

    printCandidates(selection, candidates);
  }

  console.log("");
  console.log("Geographic candidate discovery complete.");
}

const entrypoint = pathToFileURL(process.argv[1] ?? "").href;

if (import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
