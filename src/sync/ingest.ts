import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import type { ActivityPlatform } from "../platforms/activity.js";
import { IntervalsIcuPlatform } from "../platforms/intervals-icu/index.js";
import {
  discoverActivities,
  type ActivityIndexEntry,
} from "./activities.js";
import { deriveAll } from "./derive.js";
import { persistActivity } from "./persist.js";

const ACTIVITY_INDEX_PATH = join(
  "activities",
  "index.json",
);

const activityPlatform: ActivityPlatform =
  new IntervalsIcuPlatform();

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

  const activityId =
    args[0] === "--" ? args[1] : args[0];

  if (!activityId) {
    throw new Error(
      "Usage: pnpm run ingest [-- <activity-id>]",
    );
  }

  if (
    (args[0] === "--" && args.length > 2) ||
    (args[0] !== "--" && args.length > 1)
  ) {
    throw new Error(
      "Usage: pnpm run ingest [-- <activity-id>]",
    );
  }

  return activityId;
}

async function readActivityIndex(): Promise<ActivityIndex> {
  const content = await readFile(
    ACTIVITY_INDEX_PATH,
    "utf8",
  );

  const index = JSON.parse(content);

  if (
    !index ||
    typeof index !== "object" ||
    !Array.isArray(index.activities)
  ) {
    throw new Error(
      "Invalid activity index: " + ACTIVITY_INDEX_PATH,
    );
  }

  if (index.source !== "intervals.icu") {
    throw new Error(
      "Unexpected activity index source: " +
        String(index.source),
    );
  }

  if (index.object_type !== "activity") {
    throw new Error(
      "Unexpected activity index object_type: " +
        String(index.object_type),
    );
  }

  for (const activity of index.activities) {
    if (
      !activity ||
      typeof activity !== "object" ||
      typeof activity.id !== "string" ||
      typeof activity.start_date_local !== "string" ||
      typeof activity.type !== "string" ||
      typeof activity.name !== "string"
    ) {
      throw new Error(
        "Invalid activity entry in " +
          ACTIVITY_INDEX_PATH,
      );
    }
  }

  return index as ActivityIndex;
}

function latestActivityDate(
  activities: ActivityIndexEntry[],
): string | undefined {
  if (activities.length === 0) {
    return undefined;
  }

  return activities.reduce(
    (latest, activity) =>
      activity.start_date_local > latest
        ? activity.start_date_local
        : latest,
    activities[0].start_date_local,
  );
}

function mergeActivities(
  local: ActivityIndexEntry[],
  remote: ActivityIndexEntry[],
): ActivityIndexEntry[] {
  const byId = new Map<string, ActivityIndexEntry>();

  for (const activity of local) {
    byId.set(activity.id, activity);
  }

  for (const activity of remote) {
    byId.set(activity.id, activity);
  }

  return [...byId.values()].sort((a, b) => {
    if (a.start_date_local !== b.start_date_local) {
      return a.start_date_local.localeCompare(
        b.start_date_local,
      );
    }

    return a.id.localeCompare(b.id);
  });
}

async function reconcileActivityIndex(): Promise<{
  index: ActivityIndex;
  newActivities: ActivityIndexEntry[];
}> {
  const local = await readActivityIndex();

  const latest = latestActivityDate(
    local.activities,
  );

  const oldest = latest
    ? latest.slice(0, 10)
    : "1970-01-01";

  const newest = new Date()
    .toISOString()
    .slice(0, 10);

  console.log("Reconciling activities");
  console.log("  Index: " + ACTIVITY_INDEX_PATH);
  console.log(
    "  Remote range: " +
      oldest +
      ".." +
      newest,
  );

  const remote = await discoverActivities(
    activityPlatform,
    oldest,
    newest,
  );

  const localIds = new Set(
    local.activities.map(
      (activity) => activity.id,
    ),
  );

  const newActivities = remote.filter(
    (activity) => !localIds.has(activity.id),
  );

  const merged = mergeActivities(
    local.activities,
    remote,
  );

  const index: ActivityIndex = {
    source: "intervals.icu",
    object_type: "activity",
    activities: merged,
  };

  await mkdir("activities", {
    recursive: true,
  });

  await writeFile(
    ACTIVITY_INDEX_PATH,
    JSON.stringify(index, null, 2) + "\n",
    "utf8",
  );

  console.log(
    "  Local activities:  " +
      local.activities.length,
  );
  console.log(
    "  Remote discovered: " +
      remote.length,
  );
  console.log(
    "  New activities:    " +
      newActivities.length,
  );
  console.log(
    "  Reconciled total:  " +
      merged.length,
  );

  return {
    index,
    newActivities,
  };
}

async function ingestActivity(
  activityId: string,
): Promise<void> {
  const activity =
    await activityPlatform.getActivity(
      activityId,
    );

  await persistActivity(
    activityId,
    activity,
  );
}

function formatFailure(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

async function ingestAll(
  entries: ActivityIndexEntry[],
): Promise<IngestionFailure[]> {
  if (entries.length === 0) {
    return [];
  }

  console.log(
    "Downloads are rate-limited; the first result may take a few seconds.",
  );

  const results = await Promise.all(
    entries.map(async (entry, index) => {
      try {
        await ingestActivity(entry.id);

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
          "  " + formatFailure(error),
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
    ): result is IngestionFailure =>
      result !== undefined,
  );
}

function logFailure(failure: IngestionFailure) {
  console.log(
    "  " +
    failure.entry.id +
    " — " +
    failure.entry.start_date_local +
    " — " +
    failure.entry.type +
    " — " +
    failure.entry.name
  );
  console.log(
    "    " +
    formatFailure(failure.error)
  );
}

async function main(): Promise<void> {
  const activityId = parseActivityId();

  if (activityId) {
    console.log(
      "Ingesting activity " + activityId,
    );

    await ingestActivity(activityId);

    console.log(
      "Ingested " + activityId,
    );

    return;
  }

  const {
    index,
    newActivities,
  } =
    await reconcileActivityIndex();

  console.log("");

  const failures =
    await ingestAll(newActivities);

  console.log("");

  const derivationFailures =
    await deriveAll(index.activities);

  console.log("");
  console.log("Ingestion complete");
  console.log("");
  console.log(
    "Reconciled: " +
      index.activities.length,
  );
  console.log(
    "Downloaded: " +
      (newActivities.length - failures.length),
  );
  console.log(
    "Derived:    " +
      (index.activities.length -
        derivationFailures.length),
  );
  console.log(
    "Failed:     " +
      (failures.length +
        derivationFailures.length),
  );

  if (failures.length > 0) {
    console.log("");
    console.log("Failed downloads:");

    for (const failure of failures) {
      logFailure(failure);
    }
  }

  if (derivationFailures.length > 0) {
    console.log("");
    console.log("Failed derivations:");

    for (const failure of derivationFailures) {
      logFailure(failure);
    }
  }

  if (
    failures.length > 0 ||
    derivationFailures.length > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
