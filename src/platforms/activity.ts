export type ActivitySource = {
  id: string;
  start_date_local: string;
  [key: string]: unknown;
};

export type ActivityRaceClassification =
  | "main"
  | "preparatory"
  | "minor";

export type ActivityNormalization = {
  activityRace?: boolean;
  activityRaceClassification?: ActivityRaceClassification;
};

export type Activity = {
  source: ActivitySource;
  streams: unknown[];
  workout?: unknown;

  activityRace?: boolean;
  activityRaceClassification?: ActivityRaceClassification;
};

export interface ActivityPlatform {
  discoverActivities(
    oldest: string,
    newest: string,
  ): Promise<ActivitySource[]>;

  getActivity(id: string): Promise<Activity>;

  normalizeActivity(
    source: ActivitySource,
    workout?: unknown,
  ): ActivityNormalization;
}
