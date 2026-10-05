import fs from "node:fs/promises";
import path from "node:path";

import type { CountrySelection } from "./coverage.js";
import type { Candidate } from "./candidates.js";
import type { Resolution } from "./resolve.js";
import {
  item,
  detail,
  done,
} from "../log.js";

const CURATION_FILE = path.join(
  path.resolve("."),
  "geography",
  "curation.md",
);

const HEADER = `# Geographic curation

<!--
generated: true
source: coverage.md
purpose: human selection of geographic entities
-->

`;

const INTERESTING_TAGS = [
  "place",
  "boundary",
  "admin_level",
  "natural",
  "mountain_pass",
  "waterway",
  "geological",
  "tourism",
  "leisure",
  "landuse",
  "amenity",
  "sport",
  "highway",
  "railway",
];

function candidateKey(candidate: Candidate): string {
  return `${candidate.type}/${candidate.id}`;
}

function checkedCandidatesFromMarkdown(
  content: string,
): Set<string> {
  const checked = new Set<string>();

  const pattern =
    /^- \[x\] `(node|way|relation)\/(\d+)`/gm;

  for (const match of content.matchAll(pattern)) {
    checked.add(`${match[1]}/${match[2]}`);
  }

  return checked;
}

function formatOtherTags(
  candidate: Candidate,
): string | undefined {
  const otherTags = Object.entries(candidate.tags)
    .filter(([key]) => !INTERESTING_TAGS.includes(key))
    .sort(([a], [b]) => a.localeCompare(b));

  if (otherTags.length === 0) {
    return undefined;
  }

  return otherTags
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function formatCandidate(
  candidate: Candidate,
  resolution: Resolution,
): string {
  const matchingNames = candidate.names
    .filter(
      (name) =>
        name.value.localeCompare(
          resolution.selection,
          undefined,
          { sensitivity: "accent" },
        ) === 0,
    )
    .map((name) => `${name.key}=${name.value}`)
    .join(", ");

  const classification = resolution.candidates.find(
    (item) =>
      candidateKey(item.candidate) ===
      candidateKey(candidate),
  );

  if (!classification) {
    throw new Error(
      `Candidate ${candidateKey(candidate)} is missing from resolution`,
    );
  }

  const lines = [
    `- CHECKBOX_PLACEHOLDER \`${candidateKey(candidate)}\` — ${candidate.name}`,
    `  - role: ${classification.roles.join(", ")}`,
  ];

  if (matchingNames) {
    lines.push(`  - matched: ${matchingNames}`);
  }

  for (const key of INTERESTING_TAGS) {
    if (candidate.tags[key]) {
      lines.push(
        `  - ${key}=${candidate.tags[key]}`,
      );
    }
  }

  const otherTags = formatOtherTags(candidate);

  if (
    otherTags &&
    classification.roles.includes("unknown")
  ) {
    lines.push(`  - other: ${otherTags}`);
  }

  return lines.join("\n");
}

function renderCandidate(
  candidate: Candidate,
  resolution: Resolution,
  checked: Set<string>,
): string {
  const key = candidateKey(candidate);
  const rendered = formatCandidate(
    candidate,
    resolution,
  );

  return rendered.replace(
    "CHECKBOX_PLACEHOLDER",
    checked.has(key) ? "[x]" : "[ ]",
  );
}

function renderCountry(
  selection: CountrySelection,
  resolutions: Resolution[],
  checked: Set<string>,
): string {
  const lines = [
    `## ${selection.country}`,
    "",
  ];

  if (selection.areas.length === 0) {
    lines.push(
      "_Whole-country coverage; no named geographic curation required._",
      "",
    );

    return lines.join("\n");
  }

  for (const resolution of resolutions) {
    lines.push(
      `### ${resolution.selection}`,
      "",
    );

    if (resolution.candidates.length === 0) {
      lines.push(
        "- **UNRESOLVED:** no matching named OSM object",
        "",
      );

      continue;
    }

    for (const classification of resolution.candidates) {
      lines.push(
        renderCandidate(
          classification.candidate,
          resolution,
          checked,
        ),
        "",
      );
    }
  }

  return lines.join("\n");
}

export async function writeCuration(
  selections: CountrySelection[],
  resolutionsByCountry: Map<string, Resolution[]>,
): Promise<void> {
  let existing = "";

  try {
    existing = await fs.readFile(
      CURATION_FILE,
      "utf8",
    );
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !==
      "ENOENT"
    ) {
      throw error;
    }
  }

  const checked =
    checkedCandidatesFromMarkdown(existing);

  detail("existing selections", {
    checked: checked.size,
  });

  const sections = selections.map((selection) => {
    const resolutions =
      resolutionsByCountry.get(
        selection.country,
      ) ?? [];

    item(selection.country, {
      areas: selection.areas.length,
      candidates: resolutions.reduce(
        (total, resolution) =>
          total + resolution.candidates.length,
        0,
      ),
    });

    return renderCountry(
      selection,
      resolutions,
      checked,
    );
  });

  const content =
    HEADER + sections.join("\n");

  await fs.mkdir(
    path.dirname(CURATION_FILE),
    { recursive: true },
  );

  await fs.writeFile(
    CURATION_FILE,
    content,
    "utf8",
  );

  done("Wrote curation", {
    file: path.relative(
      ".",
      CURATION_FILE,
    ),
  });
}
