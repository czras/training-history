import type { CountrySelection } from "./coverage.js";
import type { Candidate } from "./candidates.js";

export type GeographicRole =
  | "country"
  | "region"
  | "settlement"
  | "feature"
  | "unknown";

export type CandidateClassification = {
  candidate: Candidate;
  roles: GeographicRole[];
  reasons: string[];
  matchingNames: Candidate["names"];
};

export type Resolution = {
  selection: string;
  candidates: CandidateClassification[];
};

function classifyCandidate(
  candidate: Candidate,
  selection: string,
): CandidateClassification {
  const roles = new Set<GeographicRole>();
  const reasons: string[] = [];

  const matchingNames = candidate.names.filter(
    (name) =>
      name.value.localeCompare(selection, undefined, {
        sensitivity: "accent",
      }) === 0,
  );

  const tags = candidate.tags;

  if (tags.boundary === "administrative") {
    if (tags.admin_level === "2") {
      roles.add("country");
      reasons.push("administrative boundary, admin_level=2");
    } else {
      roles.add("region");
      reasons.push(
        `administrative boundary, admin_level=${tags.admin_level ?? "unknown"}`,
      );
    }
  }

  if (tags.landuse === "winter_sports") {
    roles.add("feature");
    reasons.push("landuse=winter_sports");
  }

  if (tags.site === "piste") {
    roles.add("feature");
    reasons.push("site=piste");
  }

  if (tags.place) {
    switch (tags.place) {
      case "city":
      case "town":
      case "village":
      case "hamlet":
      case "suburb":
      case "neighbourhood":
      case "municipality":
        roles.add("settlement");
        reasons.push(`place=${tags.place}`);
        break;

      case "locality":
        roles.add("feature");
        reasons.push("place=locality");
        break;

      case "state":
        roles.add("region");
        reasons.push("place=state");
        break;
    }
  }

  const featureTags = [
    "natural",
    "mountain_pass",
    "waterway",
    "geological",
  ].filter((key) => tags[key]);

  if (featureTags.length > 0) {
    roles.add("feature");
    reasons.push(
      `geographic feature (${featureTags
        .map((key) => `${key}=${tags[key]}`)
        .join(", ")})`,
    );
  }

  if (roles.size === 0) {
    roles.add("unknown");
    reasons.push("no recognized geographic semantics");
  }

  return {
    candidate,
    roles: [...roles],
    reasons,
    matchingNames,
  };
}

export function resolveSelection(
  selection: CountrySelection,
  candidates: Candidate[],
): Resolution[] {
  return selection.areas.map((area) => {
    const matches = candidates.filter((candidate) =>
      candidate.names.some(
        (name) =>
          name.value.localeCompare(area, undefined, {
            sensitivity: "accent",
          }) === 0,
      ),
    );

    return {
      selection: area,
      candidates: matches.map((candidate) =>
        classifyCandidate(candidate, area),
      ),
    };
  });
}

function formatCandidate(
  classification: CandidateClassification,
): string {
  const { candidate, roles, reasons, matchingNames } = classification;

  const matchedNameText = matchingNames
    .map((name) => `${name.key}=${name.value}`)
    .join(", ");

  return (
    `    ${candidate.type}/${candidate.id} ${candidate.name}` +
    ` [${roles.join(", ")}]` +
    (matchedNameText ? ` [matched: ${matchedNameText}]` : "") +
    ` — ${reasons.join("; ")}`
  );
}

export function printResolutions(
  selection: CountrySelection,
  resolutions: Resolution[],
): void {
  if (selection.areas.length === 0) {
    console.log("");
    console.log(
      `No named-area resolution required for ${selection.country}: whole country`,
    );
    return;
  }

  console.log("");
  console.log(`Geographic resolution for ${selection.country}`);

  for (const resolution of resolutions) {
    console.log("");
    console.log(
      `  ${resolution.selection}: ${resolution.candidates.length} candidate(s)`,
    );

    if (resolution.candidates.length === 0) {
      console.log("    UNRESOLVED: no matching named OSM object");
      continue;
    }

    const roleCounts = new Map<GeographicRole, number>();

    for (const candidate of resolution.candidates) {
      for (const role of candidate.roles) {
        roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
      }
    }

    const summary = [...roleCounts.entries()]
      .map(([role, count]) => `${role}=${count}`)
      .join(", ");

    console.log(`    semantic candidates: ${summary}`);

    for (const candidate of resolution.candidates.slice(0, 20)) {
      console.log(formatCandidate(candidate));
    }

    if (resolution.candidates.length > 20) {
      console.log(
        `    ... ${resolution.candidates.length - 20} more`,
      );
    }
  }
}
