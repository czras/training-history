import fs from "node:fs/promises";
import path from "node:path";

import type { Candidate } from "./candidates.js";

const CURATION_FILE = path.join(
  path.resolve("."),
  "geography",
  "curation.md",
);

export type CuratedSelection = {
  country: string;
  area: string;
  candidate: Candidate;
};

export type CurationEntry = {
  country: string;
  area: string;
  candidateKey: string;
};

function candidateKey(candidate: Candidate): string {
  return `${candidate.type}/${candidate.id}`;
}

function selectedCandidateKeys(
  content: string,
): Set<string> {
  const selected = new Set<string>();

  const pattern =
    /^- \[x\] `(node|way|relation)\/(\d+)`/gm;

  for (const match of content.matchAll(pattern)) {
    selected.add(`${match[1]}/${match[2]}`);
  }

  return selected;
}

function parseSections(
  content: string,
): CurationEntry[] {
  const lines = content.split(/\r?\n/);

  let country: string | undefined;
  let area: string | undefined;

  const sections: Array<{
    country: string;
    area: string;
    candidateKey: string;
  }> = [];

  for (const line of lines) {
    const countryMatch = line.match(
      /^## (.+)$/,
    );

    if (countryMatch) {
      country = countryMatch[1];
      area = undefined;
      continue;
    }

    const areaMatch = line.match(
      /^### (.+)$/,
    );

    if (areaMatch) {
      area = areaMatch[1];
      continue;
    }

    const candidateMatch = line.match(
      /^- \[x\] `(node|way|relation)\/(\d+)`/,
    );

    if (!candidateMatch) {
      continue;
    }

    if (!country || !area) {
      throw new Error(
        `Curated candidate appears outside a country/area section: ${line}`,
      );
    }

    sections.push({
      country,
      area,
      candidateKey:
        `${candidateMatch[1]}/${candidateMatch[2]}`,
    });
  }

  return sections;
}

export async function loadCuration(): Promise<CurationEntry[]> {
  const content = await fs.readFile(
    CURATION_FILE,
    "utf8",
  );

  return parseSections(content);
}

export async function loadCuratedSelections(
  candidatesByCountry: Map<string, Candidate[]>,
): Promise<CuratedSelection[]> {
  const entries = await loadCuration();

  const candidatesByKey = new Map<
    string,
    Candidate
  >();

  for (const candidates of candidatesByCountry.values()) {
    for (const candidate of candidates) {
      candidatesByKey.set(
        candidateKey(candidate),
        candidate,
      );
    }
  }

  return entries.map((entry) => {
    const candidate = candidatesByKey.get(
      entry.candidateKey,
    );

    if (!candidate) {
      throw new Error(
        `Curated candidate ${entry.candidateKey} is not present in the current candidate corpus`,
      );
    }

    return {
      country: entry.country,
      area: entry.area,
      candidate,
    };
  });
}
