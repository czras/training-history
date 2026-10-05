import {
  classifyActivity,
  type ActivityClassification,
} from "../semantics/classify.js";
import type {
  ActivityModality,
  ActivityNormalization,
} from "../platforms/activity.js";
import {
  deriveStreamFacts,
  type StreamFacts,
} from "./streams.js";
import {
  type GeographicFeature,
  type GeographyBoundingBox,
  GeographyResolver,
} from "./geography.js";

export type DerivedFacts = StreamFacts & {
  modality?: ActivityModality;
  classification: ActivityClassification;
  externalGeography?: GeographicFeature[];
};

export async function deriveActivity(
  source: Record<string, unknown>,
  streams: unknown[],
  normalization: ActivityNormalization = {},
  geographyResolver?: GeographyResolver,
): Promise<DerivedFacts> {
  const streamFacts = deriveStreamFacts(streams);

  const classification = classifyActivity(
    source,
    normalization.modality,
    normalization.activityRace,
    normalization.activityRaceClassification,
  );

  let externalGeography:
    | GeographicFeature[]
    | undefined;

  if (streamFacts.geography && geographyResolver) {
    const boundingBox: GeographyBoundingBox =
      streamFacts.geography.boundingBox;

    externalGeography =
      await geographyResolver.query(
        boundingBox,
      );
  }

  return {
    ...streamFacts,
    modality: normalization.modality,
    classification,
    ...(externalGeography
      ? { externalGeography }
      : {}),
  };
}

function formatDuration(seconds: unknown): string {
  if (typeof seconds !== "number") {
    return "unknown";
  }

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function formatNumber(
  value: unknown,
  decimals = 2,
): string {
  return typeof value === "number"
    ? value.toFixed(decimals)
    : "unknown";
}

export function activityEvidence(
  activity: Record<string, unknown>,
  facts: DerivedFacts,
): string {
  const isRun = activity.type === "Run";

  const cadenceLabel = isRun
    ? `Average unilateral cadence: ${formatNumber(activity.average_cadence, 1)} [steps/min]`
    : `Average cadence: ${formatNumber(activity.average_cadence, 1)} [rpm]`;

  const coreTemperature = facts.coreTemperature;
  const geography = facts.geography;
  const externalGeography =
    facts.externalGeography;
  const classification = facts.classification;

  const coreTemperatureSection =
    coreTemperature
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

  const externalGeographySection =
    externalGeography
      ? `## External Geography

- Bounding-box feature matches: ${externalGeography.length}

`
      : "";

  const classificationSection = `## Classification

- Modality: ${facts.modality ?? "unknown"}
- Class: ${classification.class}
- Signals:
${
  classification.signals.length > 0
    ? classification.signals
        .map((signal) => {
          if (signal.kind === "modality") {
            return `  - Modality: ${signal.value}`;
          }

          if (signal.kind === "activity_race") {
            return `  - Activity race: ${String(signal.value)}`;
          }

          if (
            signal.kind ===
            "activity_race_classification"
          ) {
            return `  - Activity race classification: ${signal.value}`;
          }

          return `  - Name pattern: ${signal.rule}`;
        })
        .join("\n")
    : "  - none"
}

`;

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
${geographySection}${externalGeographySection}${classificationSection}## Training

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

The derived values in this document are calculated from the preserved \`streams.json\` and semantic classification from \`source.json\`. They are also preserved in \`derived.json\`.

External geographic matches are derived from the materialized geography corpus using the activity bounding box.

No semantic interpretation of external geographic matches is applied.
`;
}
