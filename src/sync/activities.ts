import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const API_BASE = "https://intervals.icu/api/v1";
const DEFAULT_OLDEST = "1970-01-01";
const LIMIT = 200;

const apiKey = process.env.INTERVALS_ICU_API_KEY;

if (!apiKey) {
  throw new Error("INTERVALS_ICU_API_KEY is not set");
}

function authHeader(): string {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string, label: string): Date {
  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label} date: ${value}`);
  }

  return date;
}

function parseArgs(): { oldest: string; newest: string } {
  const args = process.argv.slice(2);

  let oldest = DEFAULT_OLDEST;
  let newest = formatDate(new Date());

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--from") {
      const value = args[++i];

      if (!value) {
        throw new Error(
          "Usage: pnpm run discover:activities -- [--from YYYY-MM-DD]",
        );
      }

      oldest = value;
      continue;
    }

    if (arg === "--to") {
      const value = args[++i];

      if (!value) {
        throw new Error(
          "Usage: pnpm run discover:activities -- [--from YYYY-MM-DD] [--to YYYY-MM-DD]",
        );
      }

      newest = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const oldestDate = parseDate(oldest, "oldest");
  const newestDate = parseDate(newest, "newest");

  if (oldestDate > newestDate) {
    throw new Error(
      `Oldest date must not be after newest date: ${oldest} > ${newest}`,
    );
  }

  return {
    oldest: formatDate(oldestDate),
    newest: formatDate(newestDate),
  };
}

async function fetchActivities(
  oldest: string,
  newest: string,
): Promise<any[]> {
  const url = new URL(`${API_BASE}/athlete/0/activities`);

  url.searchParams.set("oldest", oldest);
  url.searchParams.set("newest", newest);
  url.searchParams.set("limit", String(LIMIT));

  const response = await fetch(url, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Intervals.icu activities API returned ${response.status} for ${oldest}..${newest}: ${body}`,
    );
  }

  if (response.status === 204) {
    return [];
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      `Intervals.icu activities API returned unexpected data for ${oldest}..${newest}`,
    );
  }

  return data;
}

async function discoverRange(
  oldest: string,
  newest: string,
): Promise<any[]> {
  const activities = await fetchActivities(oldest, newest);

  if (activities.length < LIMIT) {
    console.log(
      `  ${oldest}..${newest}: ${activities.length} activities`,
    );

    return activities;
  }

  const oldestDate = parseDate(oldest, "oldest");
  const newestDate = parseDate(newest, "newest");

  if (oldestDate.getTime() === newestDate.getTime()) {
    throw new Error(
      `Intervals.icu returned ${LIMIT} activities for a single day (${oldest}). ` +
        "The discovery limit is insufficient to safely enumerate this day.",
    );
  }

  const midpoint = new Date(
    oldestDate.getTime() +
      Math.floor((newestDate.getTime() - oldestDate.getTime()) / 2),
  );

  const leftNewest = formatDate(
    new Date(midpoint.getTime() - 24 * 60 * 60 * 1000),
  );
  const rightOldest = formatDate(midpoint);

  console.log(
    `  ${oldest}..${newest}: reached ${LIMIT}; splitting at ${rightOldest}`,
  );

  const [left, right] = await Promise.all([
    discoverRange(oldest, leftNewest),
    discoverRange(rightOldest, newest),
  ]);

  return [...left, ...right];
}

function activityKey(activity: any): string {
  return String(activity.id);
}

function sortActivities(activities: any[]): any[] {
  return [...activities].sort((a, b) => {
    const aDate = String(a.start_date_local ?? "");
    const bDate = String(b.start_date_local ?? "");

    if (aDate !== bDate) {
      return aDate.localeCompare(bDate);
    }

    return activityKey(a).localeCompare(activityKey(b));
  });
}

function deduplicateActivities(activities: any[]): any[] {
  const byId = new Map<string, any>();

  for (const activity of activities) {
    const id = activityKey(activity);

    if (id === "undefined") {
      throw new Error("Discovered activity without an ID");
    }

    byId.set(id, activity);
  }

  return sortActivities([...byId.values()]);
}

type ActivityIndexEntry = {
  id: string;
  start_date_local: string;
  type: string;
  name: string;
};

function toIndexEntry(activity: any): ActivityIndexEntry {
  const id = activityKey(activity);

  if (id === "undefined") {
    throw new Error("Discovered activity without an ID");
  }

  return {
    id,
    start_date_local: String(activity.start_date_local ?? ""),
    type: String(activity.type ?? ""),
    name: String(activity.name ?? ""),
  };
}

function buildActivityIndex(
  activities: any[],
): ActivityIndexEntry[] {
  return sortActivities(activities).map(toIndexEntry);
}

async function main() {
  const { oldest, newest } = parseArgs();

  console.log("Discovering Intervals.icu activities");
  console.log(`  From: ${oldest}`);
  console.log(`  To:   ${newest}`);

  const discovered = await discoverRange(oldest, newest);
  const activities = deduplicateActivities(discovered);
  const index = buildActivityIndex(activities);

  const directory = join("data", "sync");
  await mkdir(directory, { recursive: true });

  const outputPath = join(directory, "activities.json");

  const output = {
    source: "intervals.icu",
    object_type: "activity",
    activities: index,
  };

  await writeFile(
    outputPath,
    JSON.stringify(output, null, 2) + "\n",
    "utf8",
  );

  console.log("");
  console.log(`Discovered ${index.length} unique activities`);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
