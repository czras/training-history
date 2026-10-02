import { http } from "../../http/index.js";
import type { Activity, ActivityPlatform, ActivitySource } from "../activity.js";

const API_BASE = "https://intervals.icu/api/v1";

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

    this.authorization = `Basic ${
      Buffer.from(`API_KEY:${apiKey}`).toString("base64")
    }`;
  }

  async getActivity(id: string): Promise<Activity> {
    const source = await this.fetchActivity(id);
    const streams = await this.getStreams(id);

    const workout = await this.getPairedEvent(source, id);

    return {
      source,
      streams,
      workout,
    };
  }

  private async fetchActivity(id: string): Promise<IntervalsIcuActivitySource> {
    const url =
      `${API_BASE}/activity/${encodeURIComponent(id)}?intervals=true`;

    const response = await http.get(url, {
      headers: {
        Authorization: this.authorization,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `Intervals.icu API returned ${response.status} for activity ${id}: ${body}`,
      );
    }

    const source = await response.json();

    if (!isActivitySource(source)) {
      throw new Error(
        `Intervals.icu activity ${id} returned unexpected data`,
      );
    }

    return source;
  }

  async getStreams(id: string): Promise<unknown[]> {
    const url =
      `${API_BASE}/activity/${encodeURIComponent(id)}/streams.json`;

    const response = await http.get(url, {
      headers: {
        Authorization: this.authorization,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `Intervals.icu streams API returned ${response.status} for activity ${id}: ${body}`,
      );
    }

    const streams = await response.json();

    if (!Array.isArray(streams)) {
      throw new Error(
        `Intervals.icu streams API returned unexpected data for activity ${id}`,
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
      `${API_BASE}/athlete/${encodeURIComponent(source.icu_athlete_id)}` +
      `/events/${encodeURIComponent(String(source.paired_event_id))}`;

    const response = await http.get(url, {
      headers: {
        Authorization: this.authorization,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `Intervals.icu event API returned ${response.status} ` +
        `for paired event ${source.paired_event_id} of activity ${activityId}: ${body}`,
      );
    }

    return response.json();
  }
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

  const source =
    value as Record<string, unknown>;

  return (
    typeof source.id === "string" &&
    typeof source.start_date_local === "string"
  );
}
