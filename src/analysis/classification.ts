import { readFile } from "node:fs/promises";
import path from "node:path";

import { info } from "../log.js";

type ActivityIndex = {
  activities: Array<{
    id: string;
    start_date_local: string;
  }>;
};

type Derived = {
  modality?: string;
  classification?: {
    class?: string;
    signals?: Array<{
      kind?: string;
      value?: unknown;
    }>;
  };
};

type Source = {
  name?: unknown;
};

type RaceClassification =
  | "main"
  | "preparatory"
  | "minor";

const ROOT = process.cwd();
const INDEX = path.join(
  ROOT,
  "activities",
  "index.json",
);

async function readJson<T>(
  file: string,
): Promise<T> {
  return JSON.parse(
    await readFile(file, "utf8"),
  ) as T;
}

async function main(): Promise<void> {
  const index =
    await readJson<ActivityIndex>(INDEX);

  const classes = new Map<string, number>();
  const modalities = new Map<string, number>();
  const classByModality =
    new Map<string, Map<string, number>>();
  const raceClassifications =
    new Map<string, number>();
  const unknownNames =
    new Map<string, number>();

  for (const activity of index.activities) {
    const year =
      activity.start_date_local.slice(0, 4);
    const month =
      activity.start_date_local.slice(5, 7);

    const activityDir = path.join(
      ROOT,
      "activities",
      year,
      month,
      activity.id,
    );

    const [source, derived] =
      await Promise.all([
        readJson<Source>(
          path.join(
            activityDir,
            "source.json",
          ),
        ),
        readJson<Derived>(
          path.join(
            activityDir,
            "derived.json",
          ),
        ),
      ]);

    const classification =
      derived.classification?.class ??
      "missing";

    classes.set(
      classification,
      (classes.get(classification) ?? 0) + 1,
    );

    const modality =
      derived.modality ?? "missing";

    modalities.set(
      modality,
      (modalities.get(modality) ?? 0) + 1,
    );

    let modalityClasses =
      classByModality.get(modality);

    if (!modalityClasses) {
      modalityClasses =
        new Map<string, number>();

      classByModality.set(
        modality,
        modalityClasses,
      );
    }

    modalityClasses.set(
      classification,
      (modalityClasses.get(classification) ?? 0) + 1,
    );

    const raceClassification =
      derived.classification?.signals?.find(
        (signal) =>
          signal.kind ===
          "activity_race_classification",
      )?.value;

    if (
      raceClassification === "main" ||
      raceClassification === "preparatory" ||
      raceClassification === "minor"
    ) {
      raceClassifications.set(
        raceClassification,
        (raceClassifications.get(
          raceClassification,
        ) ?? 0) + 1,
      );
    }

    if (classification === "unknown") {
      const name =
        typeof source.name === "string"
          ? source.name.trim()
          : "<no name>";

      unknownNames.set(
        name,
        (unknownNames.get(name) ?? 0) + 1,
      );
    }
  }

  info("Classification");

  for (
    const [name, count] of [
      ...classes.entries(),
    ].sort()
  ) {
    info(
      name.padEnd(22),
      { count },
    );
  }

  info("Modality");

  for (
    const [name, count] of [
      ...modalities.entries(),
    ].sort()
  ) {
    info(
      name.padEnd(22),
      { count },
    );
  }

  info("Classification by modality");

  for (
    const [
      modality,
      modalityClasses,
    ] of [
      ...classByModality.entries(),
    ].sort()
  ) {
    info(modality);

    for (
      const [
        classification,
        count,
      ] of [
        ...modalityClasses.entries(),
      ].sort()
    ) {
      info(
        classification.padEnd(20),
        { count },
      );
    }
  }

  info("Activity race classification");

  for (
    const name of [
      "main",
      "preparatory",
      "minor",
    ] as RaceClassification[]
  ) {
    info(
      name.padEnd(22),
      {
        count:
          raceClassifications.get(name) ??
          0,
      },
    );
  }

  info("Unknown activity names");

  for (
    const [name, count] of [
      ...unknownNames.entries(),
    ].sort(
      (a, b) =>
        b[1] - a[1] ||
        a[0].localeCompare(b[0]),
    )
  ) {
    info(
      name,
      { count },
    );
  }
}

await main();
