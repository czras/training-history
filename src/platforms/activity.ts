export type Activity = {
  source: unknown;
  streams: unknown[];
  workout?: unknown;
};

export interface ActivityPlatform {
  getActivity(id: string): Promise<Activity>;
}
