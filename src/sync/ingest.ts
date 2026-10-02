import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ActivityPlatform } from "../platforms/activity.js";
import { IntervalsIcuPlatform } from "../platforms/intervals-icu/index.js";
import { persistActivity } from "./persist.js";

const ACTIVITY_INDEX_PATH = join("data", "sync", "activities.json");

const activityPlatform: ActivityPlatform =
  new IntervalsIcuPlatform();

type ActivityIndexEntry = {
  id: string;
  start_date_local: string;
  type: string;
  name: string;
};

type ActivityIndex = {
  source: string;
  object_type: string;
  activities: ActivityIndexEntry[];
};

type IngestionFailure = {
  entry: ActivityIndexEntry;
  error: unknown;
};

function parseActivityId(): string | undefined {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return undefined;
  }

  const activityId = args[0] === "--" ? args[1] : args[0];

  if (!activityId) {
    throw new Error(
      "Usage: pnpm run ingest [-- <activity-id>]",
    );
  }

  if (args[0] === "--" && args.length > 2) {
    throw new Error(
      "Usage: pnpm run ingest [-- <activity-id>]",
    );
  }

  if (args[0] !== "--" && args.length > 1) {
    throw new Error(
      "Usage: pnpm run ingest [-- <activity-id>]",
    );
  }

  return activityId;
}

async function readActivityIndex(): Promise<ActivityIndex> {
  const content = await readFile(ACTIVITY_INDEX_PATH, "utf8");
  const index = JSON.parse(content);

  if (
    !index ||
    typeof index !== "object" ||
    !Array.isArray(index.activities)
  ) {
    throw new Error(
      `Invalid activity index: ${ACTIVITY_INDEX_PATH}`,
    );
  }

  if (index.source !== "intervals.icu") {
    throw new Error(
      `Unexpected activity index source: ${String(index.source)}`,
    );
  }

  if (index.object_type !== "activity") {
    throw new Error(
      `Unexpected activity index object_type: ${String(index.object_type)}`,
    );
  }

  for (const activity of index.activities) {
    if (
      !activity ||
      typeof activity !== "object" ||
      typeof activity.id !== "string"
    ) {
      throw new Error(
        `Invalid activity entry in ${ACTIVITY_INDEX_PATH}`,
      );
    }
  }

  return index as ActivityIndex;
}

async function ingestActivity(activityId: string): Promise<void> {
  const activity = await activityPlatform.getActivity(activityId);

  await persistActivity(activityId, activity);
}

function formatFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function ingestAll(
  entries: ActivityIndexEntry[],
): Promise<IngestionFailure[]> {
  console.log('Downloads are rate-limited; the first result may take a few seconds.')

  const results = await Promise.all(
    entries.map(async (entry, index) => {
      try {
        await ingestActivity(entry.id);

        console.log(
          `[${index + 1}/${entries.length}] OK — ${entry.id} — ${entry.start_date_local} — ${entry.type} — ${entry.name}`,
        );

        return undefined;
      } catch (error) {
        console.error(
          `[${index + 1}/${entries.length}] FAILED — ${entry.id} — ${entry.start_date_local} — ${entry.type} — ${entry.name}`,
        );
        console.error(`  ${formatFailure(error)}`);

        return { entry, error };
      }
    }),
  );

  return results.filter(
    (result): result is IngestionFailure =>
      result !== undefined,
  );
}

async function main() {
  const activityId = parseActivityId();

  if (activityId) {
    console.log(`Ingesting activity ${activityId}`);

    await ingestActivity(activityId);

    console.log(`Ingested ${activityId}`);

    return;
  }

  const index = await readActivityIndex();

  console.log("Ingesting activities from discovery index");
  console.log(`  Index: ${ACTIVITY_INDEX_PATH}`);
  console.log(`  Activities: ${index.activities.length}`);
  console.log("");

  const failures = await ingestAll(index.activities);
  const succeeded = index.activities.length - failures.length;

  console.log("");
  console.log("Ingestion complete");
  console.log("");
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed:    ${failures.length}`);

  if (failures.length > 0) {
    console.log("");
    console.log("Failed activities:");

    for (const failure of failures) {
      console.log(
        `  ${failure.entry.id} — ${failure.entry.start_date_local} — ${failure.entry.type} — ${failure.entry.name}`,
      );
      console.log(`    ${formatFailure(failure.error)}`);
    }

    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
