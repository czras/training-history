import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const API_BASE = "https://intervals.icu/api/v1";

const apiKey = process.env.INTERVALS_ICU_API_KEY;
const args = process.argv.slice(2);
const activityId = args[0] === "--" ? args[1] : args[0];

if (!apiKey) {
  throw new Error("INTERVALS_ICU_API_KEY is not set");
}

if (!activityId) {
  throw new Error("Usage: npm run ingest -- <activity-id>");
}

function authHeader(): string {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`;
}

async function fetchActivity(id: string): Promise<unknown> {
  const url = `${API_BASE}/activity/${encodeURIComponent(id)}?intervals=true`;

  const response = await fetch(url, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Intervals.icu API returned ${response.status}: ${body}`,
    );
  }

  return response.json();
}

function formatDuration(seconds: unknown): string {
  if (typeof seconds !== "number") {
    return "unknown";
  }

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function formatNumber(value: unknown, decimals = 2): string {
  return typeof value === "number" ? value.toFixed(decimals) : "unknown";
}

function activityEvidence(activity: any): string {
  const isRun = activity.type === "Run";

  const cadenceLabel = isRun
    ? `Average unilateral cadence: ${formatNumber(activity.average_cadence, 1)} [steps/min]`
    : `Average cadence: ${formatNumber(activity.average_cadence, 1)} [rpm]`;

  return `# Activity

- Source: Intervals.icu
- Source ID: \`${activity.id ?? activityId}\`
- Type: ${activity.type ?? "unknown"}
- Name: ${activity.name ?? "unknown"}
- Start: ${activity.start_date_local ?? "unknown"}

## Session

- Distance: ${formatNumber(
    typeof activity.distance === "number"
      ? activity.distance / 1000
      : undefined,
    2,
  )} [km]
- Moving time: ${activity.moving_time ?? "unknown"} [s] (${formatDuration(activity.moving_time)})
- Elapsed time: ${activity.elapsed_time ?? "unknown"} [s] (${formatDuration(activity.elapsed_time)})
- Recording time: ${activity.icu_recording_time ?? "unknown"} [s] (${formatDuration(activity.icu_recording_time)})
- Elevation gain: ${activity.total_elevation_gain ?? "unknown"} [m+]
- Elevation loss: ${activity.total_elevation_loss ?? "unknown"} [m-]

## Performance

- Average speed: ${formatNumber(activity.average_speed, 2)} [m/s]
- Maximum speed: ${formatNumber(activity.max_speed, 2)} [m/s]
- Average heart rate: ${activity.average_heartrate ?? "unknown"} [bpm]
- Maximum heart rate: ${activity.max_heartrate ?? "unknown"} [bpm]
- Average power: ${activity.icu_average_watts ?? "unknown"} [W]
- Weighted average power: ${activity.icu_weighted_avg_watts ?? "unknown"} [W]
- ${cadenceLabel}

## Running Dynamics

- Average stride length: ${formatNumber(activity.average_stride, 3)} [m]
- Average stance time: ${formatNumber(activity.average_stance_time, 1)} [ms]
- Average stance time: ${formatNumber(activity.average_stance_time_percent, 1)} [%]
- Average vertical oscillation: ${formatNumber(activity.average_vertical_oscillation, 1)} [mm]
- Average vertical ratio: ${formatNumber(activity.average_vertical_ratio, 1)} [%]
- Average leg spring stiffness: ${formatNumber(activity.average_leg_spring_stiffness, 2)} [kN/m]

## Environment

- Recorded temperature: ${formatNumber(activity.average_temp, 1)} [°C]
- Weather temperature: ${formatNumber(activity.average_weather_temp, 2)} [°C]
- Feels-like temperature: ${formatNumber(activity.average_feels_like, 2)} [°C]
- Average wind speed: ${formatNumber(activity.average_wind_speed, 2)} [m/s]
- Average wind gust: ${formatNumber(activity.average_wind_gust, 2)} [m/s]
- Headwind: ${formatNumber(activity.headwind_percent, 1)} [%]
- Tailwind: ${formatNumber(activity.tailwind_percent, 1)} [%]

## Training

- Training load: ${activity.icu_training_load ?? "unknown"}
- HR load: ${activity.hr_load ?? "unknown"}
- Pace load: ${activity.pace_load ?? "unknown"}
- Power load: ${activity.power_load ?? "unknown"}
- Intensity: ${formatNumber(activity.icu_intensity, 1)} [%]
- Decoupling: ${formatNumber(activity.decoupling, 2)} [%]
- RPE: ${activity.icu_rpe ?? "unknown"} [1–10]
- Feel: ${activity.feel ?? "unknown"}

## Source

Intervals.icu activity:

\`${activity.id ?? activityId}\`

## Notes

This document is a generated human-readable projection of \`source.json\`.

The canonical evidence is the preserved source response.
`;
}

function gitCommitMessage(activity: any): string {
  const type = activity.type ?? "Activity";
  const name = activity.name?.trim();
  const date = activity.start_date_local?.replace("T", " ").slice(0, 16);
  const distanceKm =
    typeof activity.distance === "number"
      ? `${(activity.distance / 1000).toFixed(2)} km`
      : undefined;

  const label = [type, name, date, distanceKm]
    .filter(Boolean)
    .join(" — ");

  return `ingest: ${label}`;
}

async function main() {
  const activity = await fetchActivity(activityId);

  const directory = join("activities", activityId);

  await mkdir(directory, { recursive: true });

  const sourcePath = join(directory, "source.json");
  const evidencePath = join(directory, "evidence.md");

  await writeFile(
    sourcePath,
    JSON.stringify(activity, null, 2) + "\n",
    "utf8",
  );

  await writeFile(
    evidencePath,
    activityEvidence(activity),
    "utf8",
  );

  execFileSync("git", ["add", sourcePath, evidencePath], {
    stdio: "inherit",
  });

  execFileSync(
    "git",
    ["commit", "-m", gitCommitMessage(activity)],
    { stdio: "inherit" },
  );

  console.log(`Ingested ${activityId}`);
  console.log(`  ${sourcePath}`);
  console.log(`  ${evidencePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
