import { readFile } from "node:fs/promises";
import path from "node:path";

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
const INDEX = path.join(ROOT, "activities", "index.json");

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function main(): Promise<void> {
  const index = await readJson<ActivityIndex>(INDEX);

  const classes = new Map<string, number>();
  const modalities = new Map<string, number>();
  const classByModality = new Map<string, Map<string, number>>();
  const raceClassifications = new Map<string, number>();
  const unknownNames = new Map<string, number>();

  for (const activity of index.activities) {
    const year = activity.start_date_local.slice(0, 4);
    const month = activity.start_date_local.slice(5, 7);

    const activityDir = path.join(
      ROOT,
      "activities",
      year,
      month,
      activity.id,
    );

    const [source, derived] = await Promise.all([
      readJson<Source>(
        path.join(activityDir, "source.json"),
      ),
      readJson<Derived>(
        path.join(activityDir, "derived.json"),
      ),
    ]);

    const classification =
      derived.classification?.class ?? "missing";

    classes.set(
      classification,
      (classes.get(classification) ?? 0) + 1,
    );

    const modality = derived.modality ?? "missing";

    modalities.set(
      modality,
      (modalities.get(modality) ?? 0) + 1,
    );

    let modalityClasses =
      classByModality.get(modality);

    if (!modalityClasses) {
      modalityClasses = new Map<string, number>();
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
        (raceClassifications.get(raceClassification) ?? 0) + 1,
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

  console.log("\nClassification");
  console.log("==============");

  for (const [name, count] of [...classes.entries()].sort()) {
    console.log(`${name.padEnd(22)} ${count}`);
  }

  console.log("\nModality");
  console.log("========");

  for (
    const [name, count] of [...modalities.entries()].sort()
  ) {
    console.log(`${name.padEnd(22)} ${count}`);
  }

  console.log("\nClassification by modality");
  console.log("==========================");

  for (
    const [modality, modalityClasses] of [
      ...classByModality.entries(),
    ].sort()
  ) {
    console.log(`\n${modality}`);

    for (
      const [classification, count] of [
        ...modalityClasses.entries(),
      ].sort()
    ) {
      console.log(
        `  ${classification.padEnd(20)} ${count}`,
      );
    }
  }

  console.log("\nActivity race classification");
  console.log("============================");

  for (
    const name of [
      "main",
      "preparatory",
      "minor",
    ] as RaceClassification[]
  ) {
    console.log(
      `${name.padEnd(22)} ${raceClassifications.get(name) ?? 0}`,
    );
  }

  console.log("\nUnknown activity names");
  console.log("======================");

  for (
    const [name, count] of [...unknownNames.entries()]
      .sort(
        (a, b) =>
          b[1] - a[1] ||
          a[0].localeCompare(b[0]),
      )
  ) {
    console.log(
      `${String(count).padStart(4)}  ${name}`,
    );
  }
}

await main();
