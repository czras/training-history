export type Activity = {
  source: {
    id: string;
    start_date_local: string;
    [key: string]: unknown;
  };
  streams: unknown[];
  workout?: unknown;
};

export interface ActivityPlatform {
  getActivity(id: string): Promise<Activity>;
}
