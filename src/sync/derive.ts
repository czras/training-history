import {
  readFile,
} from "node:fs/promises";
import { join } from "node:path";

import { deriveActivity } from "../derivation/activity.js";
import { activityEvidence } from "../derivation/evidence.js";
import {
  GeographyResolver,
} from "../derivation/geography.js";
import type { ActivityPlatform } from "../platforms/activity.js";
import { IntervalsIcuPlatform } from "../platforms/intervals-icu/index.js";
import type { ActivityIndexEntry } from "./activities.js";
import { writeFileAtomic } from "./write.js";

const ACTIVITIES_DIR = "activities";
const PROGRESS_INTERVAL = 25;

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

  await writeFileAtomic(
    derivedPath,
    JSON.stringify(facts, null, 2) + "\n",
  );

  await writeFileAtomic(
    evidencePath,
    activityEvidence(
      source as Record<string, unknown>,
      facts,
    ),
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

  let completed = 0;

  try {
    const results = await Promise.all(
      entries.map(async (entry) => {
        try {
          await deriveActivityEntry(
            entry,
            geographyResolver,
          );

          completed++;

          if (
            completed === entries.length ||
            completed % PROGRESS_INTERVAL === 0
          ) {
            const percent = Math.round(
              (completed / entries.length) * 100,
            );

            console.log(
              `  progress: ${completed}/${entries.length} (${percent}%)`,
            );
          }

          return undefined;
        } catch (error) {
          completed++;

          if (
            completed === entries.length ||
            completed % PROGRESS_INTERVAL === 0
          ) {
            const percent = Math.round(
              (completed / entries.length) * 100,
            );

            console.log(
              `  progress: ${completed}/${entries.length} (${percent}%)`,
            );
          }

          console.error(
            "  FAILED — " +
              entry.id +
              " — " +
              entry.start_date_local +
              " — " +
              entry.type +
              " — " +
              entry.name,
          );
          console.error(
            "    " +
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
