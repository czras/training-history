import type { ActivityPlatform } from "../platforms/activity.js";

export type ActivityIndexEntry = {
  id: string;
  start_date_local: string;
  type: string;
  name: string;
};

export async function discoverActivities(
  platform: ActivityPlatform,
  oldest: string,
  newest: string,
): Promise<ActivityIndexEntry[]> {
  const discovered = await platform.discoverActivities(
    oldest,
    newest,
  );

  const byId = new Map<string, ActivityIndexEntry>();

  for (const activity of discovered) {
    if (!activity.id) {
      throw new Error("Discovered activity without an ID");
    }

    byId.set(activity.id, {
      id: activity.id,
      start_date_local: activity.start_date_local,
      type: readString(activity.type),
      name: readString(activity.name),
    });
  }

  return [...byId.values()].sort((a, b) => {
    if (a.start_date_local !== b.start_date_local) {
      return a.start_date_local.localeCompare(b.start_date_local);
    }

    return a.id.localeCompare(b.id);
  });
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
