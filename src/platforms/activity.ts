export type ActivitySource = {
  id: string;
  start_date_local: string;
  [key: string]: unknown;
};

export type ActivityModality =
  | "run"
  | "ride"
  | "swim"
  | "hike"
  | "walk"
  | "strength"
  | "other";

export type ActivityRaceClassification =
  | "main"
  | "preparatory"
  | "minor";

export type ActivityNormalization = {
  modality?: ActivityModality;
  activityRace?: boolean;
  activityRaceClassification?: ActivityRaceClassification;
};

export type Activity = {
  source: ActivitySource;
  streams: unknown[];
  workout?: unknown;

  modality?: ActivityModality;
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
