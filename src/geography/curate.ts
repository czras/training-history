import { pathToFileURL } from "node:url";
import path from "node:path";

import { loadCoverage } from "./coverage.js";
import {
  discoverCandidates,
  printCandidates,
} from "./candidates.js";
import { acquireCountries } from "./osm.js";
import {
  section,
  item,
  detail,
  done,
  info,
} from "./log.js";

const ROOT = path.resolve(".");
const RAW_DIR = path.join(ROOT, "data", "geography", "raw");

function countrySlug(country: string): string {
  return country
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main(): Promise<void> {
  info("Geographic curation");

  section("Coverage");

  const selections = await loadCoverage();

  if (selections.length === 0) {
    throw new Error("No checked countries found in coverage.md");
  }

  for (const selection of selections) {
    item(
      selection.country +
        (selection.areas.length
          ? `: ${selection.areas.join(", ")}`
          : ": whole country"),
    );
  }

  done("Coverage loaded", {
    countries: selections.length,
  });

  section("Acquisition");

  await acquireCountries(
    selections.map((selection) => selection.country),
    RAW_DIR,
  );

  done("Acquisition complete");

  section("Candidate discovery");

  const candidatesByCountry = new Map<
    string,
    Awaited<ReturnType<typeof discoverCandidates>>
  >();

  for (const selection of selections) {
    const sourcePath = path.join(
      RAW_DIR,
      `${countrySlug(selection.country)}.osm.pbf`,
    );

    item(selection.country);

    const candidates = await discoverCandidates(
      selection,
      sourcePath,
    );

    candidatesByCountry.set(selection.country, candidates);

    detail("candidates", {
      count: candidates.length,
    });

    printCandidates(selection, candidates);
  }

  done("Candidate discovery complete");
}

const isMain =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href ===
    import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
