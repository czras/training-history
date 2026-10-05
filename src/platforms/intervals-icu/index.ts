import { http } from "../../http/index.js";
import type {
  Activity,
  ActivityPlatform,
  ActivityRaceClassification,
  ActivitySource,
} from "../activity.js";

const API_BASE = "https://intervals.icu/api/v1";
const DISCOVERY_LIMIT = 200;

type IntervalsIcuActivitySource = ActivitySource & {
  icu_athlete_id?: unknown;
  paired_event_id?: unknown;
};

export class IntervalsIcuPlatform implements ActivityPlatform {
  private readonly authorization: string;

  constructor() {
    const apiKey = process.env.INTERVALS_ICU_API_KEY;

    if (!apiKey) {
      throw new Error("INTERVALS_ICU_API_KEY is not set");
    }

    this.authorization =
      "Basic " +
      Buffer.from("API_KEY:" + apiKey).toString("base64");
  }

  async discoverActivities(
    oldest: string,
    newest: string,
  ): Promise<ActivitySource[]> {
    const oldestDate = parseDate(oldest, "oldest");
    const newestDate = parseDate(newest, "newest");

    if (oldestDate > newestDate) {
      throw new Error(
        "Oldest date must not be after newest date: " +
          oldest +
          " > " +
          newest,
      );
    }

    return this.discoverRange(
      formatDate(oldestDate),
      formatDate(newestDate),
    );
  }

  async getActivity(id: string): Promise<Activity> {
    const source = await this.fetchActivity(id);
    const streams = await this.getStreams(id);
    const workout = await this.getPairedEvent(source, id);

    return {
      source,
      streams,
      workout,
      activityRace: readActivityRace(source),
      activityRaceClassification:
        readActivityRaceClassification(workout),
    };
  }

  private async discoverRange(
    oldest: string,
    newest: string,
  ): Promise<ActivitySource[]> {
    const activities = await this.fetchActivities(oldest, newest);

    if (activities.length < DISCOVERY_LIMIT) {
      console.log(
        "  " +
          oldest +
          ".." +
          newest +
          ": " +
          activities.length +
          " activities",
      );

      return activities;
    }

    const oldestDate = parseDate(oldest, "oldest");
    const newestDate = parseDate(newest, "newest");

    if (oldestDate.getTime() === newestDate.getTime()) {
      throw new Error(
        "Intervals.icu returned " +
          DISCOVERY_LIMIT +
          " activities for a single day (" +
          oldest +
          "). " +
          "The discovery limit is insufficient to safely enumerate this day.",
      );
    }

    const midpoint = new Date(
      oldestDate.getTime() +
        Math.floor(
          (newestDate.getTime() - oldestDate.getTime()) / 2,
        ),
    );

    const leftNewest = formatDate(
      new Date(midpoint.getTime() - 24 * 60 * 60 * 1000),
    );
    const rightOldest = formatDate(midpoint);

    console.log(
      "  " +
        oldest +
        ".." +
        newest +
        ": reached " +
        DISCOVERY_LIMIT +
        "; splitting at " +
        rightOldest,
    );

    const [left, right] = await Promise.all([
      this.discoverRange(oldest, leftNewest),
      this.discoverRange(rightOldest, newest),
    ]);

    return [...left, ...right];
  }

  private async fetchActivities(
    oldest: string,
    newest: string,
  ): Promise<ActivitySource[]> {
    const url = new URL(
      API_BASE + "/athlete/0/activities",
    );

    url.searchParams.set("oldest", oldest);
    url.searchParams.set("newest", newest);
    url.searchParams.set("limit", String(DISCOVERY_LIMIT));

    const response = await http.get(url.toString(), {
      headers: {
        Authorization: this.authorization,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        "Intervals.icu activities API returned " +
          response.status +
          " for " +
          oldest +
          ".." +
          newest +
          ": " +
          body,
      );
    }

    if (response.status === 204) {
      return [];
    }

    const data: unknown = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(
        "Intervals.icu activities API returned unexpected data for " +
          oldest +
          ".." +
          newest,
      );
    }

    return data.map((value) => {
      if (!isActivitySource(value)) {
        throw new Error(
          "Intervals.icu returned an invalid activity for " +
            oldest +
            ".." +
            newest,
        );
      }

      return value;
    });
  }

  private async fetchActivity(
    id: string,
  ): Promise<IntervalsIcuActivitySource> {
    const url =
      API_BASE +
      "/activity/" +
      encodeURIComponent(id) +
      "?intervals=true";

    const response = await http.get(url, {
      headers: {
        Authorization: this.authorization,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        "Intervals.icu API returned " +
          response.status +
          " for activity " +
          id +
          ": " +
          body,
      );
    }

    const source: unknown = await response.json();

    if (!isActivitySource(source)) {
      throw new Error(
        "Intervals.icu activity " +
          id +
          " returned unexpected data",
      );
    }

    return source;
  }

  private async getStreams(id: string): Promise<unknown[]> {
    const url =
      API_BASE +
      "/activity/" +
      encodeURIComponent(id) +
      "/streams.json";

    const response = await http.get(url, {
      headers: {
        Authorization: this.authorization,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        "Intervals.icu streams API returned " +
          response.status +
          " for activity " +
          id +
          ": " +
          body,
      );
    }

    const streams: unknown = await response.json();

    if (!Array.isArray(streams)) {
      throw new Error(
        "Intervals.icu streams API returned unexpected data for activity " +
          id,
      );
    }

    return streams;
  }

  private async getPairedEvent(
    source: unknown,
    activityId: string,
  ): Promise<unknown | undefined> {
    if (!isActivitySource(source)) {
      return undefined;
    }

    if (
      typeof source.icu_athlete_id !== "string" ||
      typeof source.paired_event_id !== "number"
    ) {
      return undefined;
    }

    const url =
      API_BASE +
      "/athlete/" +
      encodeURIComponent(source.icu_athlete_id) +
      "/events/" +
      encodeURIComponent(String(source.paired_event_id));

    const response = await http.get(url, {
      headers: {
        Authorization: this.authorization,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        "Intervals.icu event API returned " +
          response.status +
          " for paired event " +
          source.paired_event_id +
          " of activity " +
          activityId +
          ": " +
          body,
      );
    }

    return response.json();
  }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string, label: string): Date {
  const date = new Date(value + "T00:00:00Z");

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid " + label + " date: " + value);
  }

  return date;
}

function isActivitySource(
  value: unknown,
): value is IntervalsIcuActivitySource {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const source = value as Record<string, unknown>;

  return (
    typeof source.id === "string" &&
    typeof source.start_date_local === "string"
  );
}

function readActivityRace(
  source: Record<string, unknown>,
): boolean | undefined {
  return typeof source.race === "boolean"
    ? source.race
    : undefined;
}

function readActivityRaceClassification(
  workout: unknown,
): ActivityRaceClassification | undefined {
  if (
    typeof workout !== "object" ||
    workout === null
  ) {
    return undefined;
  }

  const category =
    (workout as Record<string, unknown>).category;

  if (category === "RACE_A") {
    return "main";
  }

  if (category === "RACE_B") {
    return "preparatory";
  }

  if (category === "RACE_C") {
    return "minor";
  }

  return undefined;
}
