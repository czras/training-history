export type ActivitySource = {
  id: string;
  start_date_local: string;
  [key: string]: unknown;
};

export type Activity = {
  source: ActivitySource;
  streams: unknown[];
  workout?: unknown;
};

export interface ActivityPlatform {
  getActivity(id: string): Promise<Activity>;
}
