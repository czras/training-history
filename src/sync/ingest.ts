import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ActivityPlatform } from "../platforms/activity.js";
import { IntervalsIcuPlatform } from "../platforms/intervals-icu/index.js";

const ACTIVITY_INDEX_PATH = join("data", "sync", "activities.json");

const activityPlatform: ActivityPlatform =
  new IntervalsIcuPlatform();

type ActivityIndexEntry = {
  id: string;
  start_date_local: string;
  type: string;
  name: string;
};

type ActivityIndex = {
  source: string;
  object_type: string;
  activities: ActivityIndexEntry[];
};

type IngestionFailure = {
  entry: ActivityIndexEntry;
  error: unknown;
};

function parseActivityId(): string | undefined {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return undefined;
  }

  const activityId = args[0] === "--" ? args[1] : args[0];

  if (!activityId) {
    throw new Error(
      "Usage: pnpm run ingest [-- <activity-id>]",
    );
  }

  if (args[0] === "--" && args.length > 2) {
    throw new Error(
      "Usage: pnpm run ingest [-- <activity-id>]",
    );
  }

  if (args[0] !== "--" && args.length > 1) {
    throw new Error(
      "Usage: pnpm run ingest [-- <activity-id>]",
    );
  }

  return activityId;
}

async function readActivityIndex(): Promise<ActivityIndex> {
  const content = await readFile(ACTIVITY_INDEX_PATH, "utf8");
  const index = JSON.parse(content);

  if (
    !index ||
    typeof index !== "object" ||
    !Array.isArray(index.activities)
  ) {
    throw new Error(
      `Invalid activity index: ${ACTIVITY_INDEX_PATH}`,
    );
  }

  if (index.source !== "intervals.icu") {
    throw new Error(
      `Unexpected activity index source: ${String(index.source)}`,
    );
  }

  if (index.object_type !== "activity") {
    throw new Error(
      `Unexpected activity index object_type: ${String(index.object_type)}`,
    );
  }

  for (const activity of index.activities) {
    if (
      !activity ||
      typeof activity !== "object" ||
      typeof activity.id !== "string"
    ) {
      throw new Error(
        `Invalid activity entry in ${ACTIVITY_INDEX_PATH}`,
      );
    }
  }

  return index as ActivityIndex;
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

function findStream(streams: unknown[], type: string): any | undefined {
  return streams.find(
    (stream) =>
      stream &&
      typeof stream === "object" &&
      "type" in stream &&
      stream.type === type,
  );
}

function numericValues(data: unknown): number[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
}

function streamRange(
  streams: unknown[],
  type: string,
): { min: number; max: number } | undefined {
  const stream = findStream(streams, type);
  const values = numericValues(stream?.data);

  if (values.length === 0) {
    return undefined;
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function coordinateValues(
  streams: unknown[],
): Array<[number, number]> {
  const stream = findStream(streams, "latlng");

  if (
    !stream ||
    !Array.isArray(stream.data) ||
    !Array.isArray(stream.data2)
  ) {
    return [];
  }

  const count = Math.min(stream.data.length, stream.data2.length);
  const coordinates: Array<[number, number]> = [];

  for (let i = 0; i < count; i++) {
    const lat = stream.data[i];
    const lng = stream.data2[i];

    if (
      typeof lat === "number" &&
      Number.isFinite(lat) &&
      typeof lng === "number" &&
      Number.isFinite(lng)
    ) {
      coordinates.push([lat, lng]);
    }
  }

  return coordinates;
}

function geographicDerivation(streams: unknown[]) {
  const coordinates = coordinateValues(streams);

  if (coordinates.length === 0) {
    return undefined;
  }

  const latitudes = coordinates.map(([lat]) => lat);
  const longitudes = coordinates.map(([, lng]) => lng);

  return {
    source: "streams.json",
    stream: "latlng",
    coordinateCount: coordinates.length,
    boundingBox: {
      north: Math.max(...latitudes),
      south: Math.min(...latitudes),
      east: Math.max(...longitudes),
      west: Math.min(...longitudes),
    },
  };
}

function activityEvidence(
  activity: any,
  streams: unknown[],
): string {
  const isRun = activity.type === "Run";

  const cadenceLabel = isRun
    ? `Average unilateral cadence: ${formatNumber(activity.average_cadence, 1)} [steps/min]`
    : `Average cadence: ${formatNumber(activity.average_cadence, 1)} [rpm]`;

  const coreTemperature = streamRange(streams, "core_temperature");
  const geography = geographicDerivation(streams);

  const coreTemperatureSection = coreTemperature
    ? `## Physiology

- Core temperature: ${formatNumber(coreTemperature.min, 2)}–${formatNumber(coreTemperature.max, 2)} [°C]
`
    : "";

  const geographySection = geography
    ? `## Geography

- GPS coordinate count: ${geography.coordinateCount}
- Bounding box:
  - North: ${formatNumber(geography.boundingBox.north, 6)} [°]
  - South: ${formatNumber(geography.boundingBox.south, 6)} [°]
  - East: ${formatNumber(geography.boundingBox.east, 6)} [°]
  - West: ${formatNumber(geography.boundingBox.west, 6)} [°]

`
    : "";

  return `# Activity

- Source: Intervals.icu
- Source ID: \`${activity.id ?? "unknown"}\`
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
- Average stance time percent: ${formatNumber(activity.average_stance_time_percent, 1)} [%]
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

${coreTemperatureSection}
${geographySection}## Training

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

\`${activity.id ?? "unknown"}\`

## Notes

This document is a generated human-readable projection of \`source.json\` and \`streams.json\`.

The canonical source evidence is preserved unchanged.

Geographic and physiological values in this document are calculated from the preserved activity streams. No external geographic enrichment is applied.
`;
}

async function ingestActivity(activityId: string): Promise<void> {
  const activity = await activityPlatform.getActivity(activityId);

  const startDate = new Date(activity.source.start_date_local);

  if (Number.isNaN(startDate.getTime())) {
    throw new Error(
      `Activity ${activityId} has invalid start_date_local: ${activity.source.start_date_local}`,
    );
  }

  const year = activity.source.start_date_local.slice(0, 4);
  const month = activity.source.start_date_local.slice(5, 7);

  const directory = join("activities", year, month, activityId);

  await mkdir(directory, { recursive: true });

  const sourcePath = join(directory, "source.json");
  const streamsPath = join(directory, "streams.json");
  const workoutPath = join(directory, "workout.json");
  const evidencePath = join(directory, "evidence.md");

  await writeFile(
    sourcePath,
    JSON.stringify(activity.source, null, 2) + "\n",
    "utf8",
  );

  await writeFile(
    streamsPath,
    JSON.stringify(activity.streams, null, 2) + "\n",
    "utf8",
  );

  if (activity.workout !== undefined) {
    await writeFile(
      workoutPath,
      JSON.stringify(activity.workout, null, 2) + "\n",
      "utf8",
    );
  }

  await writeFile(
    evidencePath,
    activityEvidence(activity.source, activity.streams),
    "utf8",
  );
}

function formatFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function ingestAll(
  entries: ActivityIndexEntry[],
): Promise<IngestionFailure[]> {
  console.log('Downloads are rate-limited; the first result may take a few seconds.')

  const results = await Promise.all(
    entries.map(async (entry, index) => {
      try {
        await ingestActivity(entry.id);

        console.log(
          `[${index + 1}/${entries.length}] OK — ${entry.id} — ${entry.start_date_local} — ${entry.type} — ${entry.name}`,
        );

        return undefined;
      } catch (error) {
        console.error(
          `[${index + 1}/${entries.length}] FAILED — ${entry.id} — ${entry.start_date_local} — ${entry.type} — ${entry.name}`,
        );
        console.error(`  ${formatFailure(error)}`);

        return { entry, error };
      }
    }),
  );

  return results.filter(
    (result): result is IngestionFailure =>
      result !== undefined,
  );
}

async function main() {
  const activityId = parseActivityId();

  if (activityId) {
    console.log(`Ingesting activity ${activityId}`);

    await ingestActivity(activityId);

    console.log(`Ingested ${activityId}`);
    console.log(`  activities/${activityId}/source.json`);
    console.log(`  activities/${activityId}/streams.json`);
    console.log(`  activities/${activityId}/evidence.md`);

    return;
  }

  const index = await readActivityIndex();

  console.log("Ingesting activities from discovery index");
  console.log(`  Index: ${ACTIVITY_INDEX_PATH}`);
  console.log(`  Activities: ${index.activities.length}`);
  console.log("");

  const failures = await ingestAll(index.activities);
  const succeeded = index.activities.length - failures.length;

  console.log("");
  console.log("Ingestion complete");
  console.log("");
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed:    ${failures.length}`);

  if (failures.length > 0) {
    console.log("");
    console.log("Failed activities:");

    for (const failure of failures) {
      console.log(
        `  ${failure.entry.id} — ${failure.entry.start_date_local} — ${failure.entry.type} — ${failure.entry.name}`,
      );
      console.log(`    ${formatFailure(failure.error)}`);
    }

    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
