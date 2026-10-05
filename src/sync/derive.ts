import {
  readFile,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  activityEvidence,
  deriveActivity,
} from "../derivation/activity.js";
import {
  GeographyResolver,
} from "../derivation/geography.js";
import type { ActivityPlatform } from "../platforms/activity.js";
import { IntervalsIcuPlatform } from "../platforms/intervals-icu/index.js";
import type { ActivityIndexEntry } from "./activities.js";

const ACTIVITIES_DIR = "activities";

type DerivationFailure = {
  entry: ActivityIndexEntry;
  error: unknown;
};

const activityPlatform: ActivityPlatform =
  new IntervalsIcuPlatform();

async function readJson(
  path: string,
): Promise<unknown> {
  const content = await readFile(
    path,
    "utf8",
  );
  return JSON.parse(content);
}

function activityDirectory(
  entry: ActivityIndexEntry,
): string {
  const year = entry.start_date_local.slice(0, 4);
  const month = entry.start_date_local.slice(5, 7);

  return join(
    ACTIVITIES_DIR,
    year,
    month,
    entry.id,
  );
}

async function deriveActivityEntry(
  entry: ActivityIndexEntry,
  geographyResolver: GeographyResolver,
): Promise<void> {
  const directory = activityDirectory(entry);

  const sourcePath = join(directory, "source.json");
  const streamsPath = join(directory, "streams.json");
  const derivedPath = join(directory, "derived.json");
  const evidencePath = join(directory, "evidence.md");
  const workoutPath = join(directory, "workout.json");

  const source = await readJson(sourcePath);
  const streams = await readJson(streamsPath);

  let workout: unknown;

  try {
    workout = await readJson(workoutPath);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }

  if (
    !source ||
    typeof source !== "object" ||
    Array.isArray(source)
  ) {
    throw new Error(
      `Invalid source.json: ${sourcePath}`,
    );
  }

  if (!Array.isArray(streams)) {
    throw new Error(
      `Invalid streams.json: ${streamsPath}`,
    );
  }

  const normalization =
    activityPlatform.normalizeActivity(
      source as Record<string, unknown> & {
        id: string;
        start_date_local: string;
      },
      workout,
    );

  const facts = await deriveActivity(
    source as Record<string, unknown>,
    streams,
    normalization,
    geographyResolver,
  );

  await writeFile(
    derivedPath,
    JSON.stringify(facts, null, 2) + "\n",
    "utf8",
  );

  await writeFile(
    evidencePath,
    activityEvidence(
      source as Record<string, unknown>,
      facts,
    ),
    "utf8",
  );
}

export async function deriveAll(
  entries: ActivityIndexEntry[],
): Promise<DerivationFailure[]> {
  if (entries.length === 0) {
    return [];
  }

  console.log(
    "Deriving local corpus",
  );

  const geographyResolver =
    await GeographyResolver.open();

  try {
    const results = await Promise.all(
      entries.map(async (entry, index) => {
        try {
          await deriveActivityEntry(
            entry,
            geographyResolver,
          );

          console.log(
            "[" +
              (index + 1) +
              "/" +
              entries.length +
              "] OK — " +
              entry.id +
              " — " +
              entry.start_date_local +
              " — " +
              entry.type +
              " — " +
              entry.name,
          );

          return undefined;
        } catch (error) {
          console.error(
            "[" +
              (index + 1) +
              "/" +
              entries.length +
              "] FAILED — " +
              entry.id +
              " — " +
              entry.start_date_local +
              " — " +
              entry.type +
              " — " +
              entry.name,
          );
          console.error(
            "  " +
              (error instanceof Error
                ? error.message
                : String(error)),
          );

          return {
            entry,
            error,
          };
        }
      }),
    );

    return results.filter(
      (
        result,
      ): result is DerivationFailure =>
        result !== undefined,
    );
  } finally {
    geographyResolver.close();
  }
}
