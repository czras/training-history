import type {
  Activity,
  ActivityModality,
  ActivityNormalization,
  ActivityPlatform,
  ActivityRaceClassification,
  ActivitySource,
} from "../activity.js";

const API_BASE = "https://intervals.icu/api/v1";
const DISCOVERY_LIMIT = 200;

type IntervalsIcuWorkout = {
  id?: string;
  category?: string;
  [key: string]: unknown;
};

export class IntervalsIcuPlatform implements ActivityPlatform {
  private readonly apiKey: string;

  constructor() {
    const apiKey = process.env.INTERVALS_ICU_API_KEY;

    if (!apiKey) {
      throw new Error(
        "INTERVALS_ICU_API_KEY environment variable is required",
      );
    }

    this.apiKey = apiKey;
  }

  async discoverActivities(
    oldest: string,
    newest: string,
  ): Promise<ActivitySource[]> {
    return this.discoverRange(oldest, newest);
  }

  private async discoverRange(
    oldest: string,
    newest: string,
  ): Promise<ActivitySource[]> {
    const activities = await this.request<ActivitySource[]>(
      `/athlete/0/activities?oldest=${encodeURIComponent(
        oldest,
      )}&newest=${encodeURIComponent(newest)}`,
    );

    if (activities.length < DISCOVERY_LIMIT) {
      return activities;
    }

    const oldestDate = new Date(oldest);
    const newestDate = new Date(newest);
    const midpoint = new Date(
      (oldestDate.getTime() + newestDate.getTime()) / 2,
    );

    const midpointIso = midpoint.toISOString();

    const before = await this.discoverRange(oldest, midpointIso);
    const after = await this.discoverRange(midpointIso, newest);

    return [...before, ...after];
  }

  async getActivity(id: string): Promise<Activity> {
    const [source, streams] = await Promise.all([
      this.request<ActivitySource>(`/activity/${id}`),
      this.request<unknown[]>(`/activity/${id}/streams`),
    ]);

    const workout = await this.getWorkout(id);

    const normalization = this.normalizeActivity(source, workout);

    return {
      source,
      streams,
      workout,
      ...normalization,
    };
  }

  normalizeActivity(
    source: ActivitySource,
    workout?: unknown,
  ): ActivityNormalization {
    return {
      modality: readActivityModality(source),
      activityRace: readActivityRace(source),
      activityRaceClassification:
        readActivityRaceClassification(workout),
    };
  }

  private async getWorkout(
    activityId: string,
  ): Promise<IntervalsIcuWorkout | undefined> {
    try {
      return await this.request<IntervalsIcuWorkout>(
        `/activity/${activityId}/event`,
      );
    } catch {
      return undefined;
    }
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `API_KEY:${this.apiKey}`,
        ).toString("base64")}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Intervals.icu request failed: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as T;
  }
}

function readActivityModality(
  source: ActivitySource,
): ActivityModality | undefined {
  const type = source.type;

  if (typeof type !== "string") {
    return undefined;
  }

  switch (type) {
    case "Run":
    case "TrailRun":
      return "run";

    case "Ride":
    case "GravelRide":
      return "ride";

    case "Swim":
      return "swim";

    case "Hike":
      return "hike";

    case "Walk":
      return "walk";

    case "WeightTraining":
      return "strength";

    case "Workout":
    case "Other":
      return "other";

    default:
      return "other";
  }
}

function readActivityRace(source: ActivitySource): boolean | undefined {
  const race = source.race;

  return typeof race === "boolean" ? race : undefined;
}

function readActivityRaceClassification(
  workout: unknown,
): ActivityRaceClassification | undefined {
  if (!workout || typeof workout !== "object") {
    return undefined;
  }

  const category = (workout as Record<string, unknown>).category;

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
