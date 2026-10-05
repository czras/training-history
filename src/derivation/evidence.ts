import { Eta } from "eta";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { DerivedFacts } from "./activity.js";

const eta = new Eta({
  views: dirname(fileURLToPath(import.meta.url)),
});

type ActivityEvidenceModel = {
  source: string;
  id: string;
  type: string;
  name: string;
  start: string;

  session: {
    distance: string;
    movingTime: string;
    elapsedTime: string;
    recordingTime: string;
    elevationGain: string;
    elevationLoss: string;
  };

  performance: {
    averageSpeed: string;
    maximumSpeed: string;
    averageHeartRate: string;
    maximumHeartRate: string;
    averagePower: string;
    weightedAveragePower: string;
    cadence: string;
  };

  runningDynamics: {
    averageStrideLength: string;
    averageStanceTime: string;
    averageStanceTimePercent: string;
    averageVerticalOscillation: string;
    averageVerticalRatio: string;
    averageLegSpringStiffness: string;
  };

  environment: {
    recordedTemperature: string;
    weatherTemperature: string;
    feelsLikeTemperature: string;
    averageWindSpeed: string;
    averageWindGust: string;
    headwind: string;
    tailwind: string;
  };

  physiology?: {
    coreTemperatureMin: string;
    coreTemperatureMax: string;
  };

  geography?: {
    coordinateCount: number;
    north: string;
    south: string;
    east: string;
    west: string;
  };

  externalGeography?: {
    matchCount: number;
  };

  classification: {
    modality: string;
    class: string;
    signals: string[];
  };

  training: {
    trainingLoad: string;
    hrLoad: string;
    paceLoad: string;
    powerLoad: string;
    intensity: string;
    decoupling: string;
    rpe: string;
    feel: string;
  };
};

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

function formatValue(value: unknown): string {
  return value === undefined || value === null
    ? "unknown"
    : String(value);
}

function formatClassificationSignal(
  signal: {
    kind: string;
    value?: unknown;
    rule?: string;
  },
): string {
  if (signal.kind === "modality") {
    return `Modality: ${signal.value}`;
  }

  if (signal.kind === "activity_race") {
    return `Activity race: ${String(signal.value)}`;
  }

  if (
    signal.kind ===
    "activity_race_classification"
  ) {
    return `Activity race classification: ${signal.value}`;
  }

  return `Name pattern: ${signal.rule}`;
}

function buildEvidenceModel(
  activity: Record<string, unknown>,
  facts: DerivedFacts,
): ActivityEvidenceModel {
  const isRun = activity.type === "Run";

  return {
    source: "Intervals.icu",
    id: formatValue(activity.id),
    type: formatValue(activity.type),
    name: formatValue(activity.name),
    start: formatValue(activity.start_date_local),

    session: {
      distance: formatNumber(
        typeof activity.distance === "number"
          ? activity.distance / 1000
          : undefined,
        2,
      ),
      movingTime: `${formatValue(activity.moving_time)} [s] (${formatDuration(activity.moving_time)})`,
      elapsedTime: `${formatValue(activity.elapsed_time)} [s] (${formatDuration(activity.elapsed_time)})`,
      recordingTime: `${formatValue(activity.icu_recording_time)} [s] (${formatDuration(activity.icu_recording_time)})`,
      elevationGain: `${formatValue(activity.total_elevation_gain)} [m+]`,
      elevationLoss: `${formatValue(activity.total_elevation_loss)} [m-]`,
    },

    performance: {
      averageSpeed: `${formatNumber(activity.average_speed, 2)} [m/s]`,
      maximumSpeed: `${formatNumber(activity.max_speed, 2)} [m/s]`,
      averageHeartRate: `${formatValue(activity.average_heartrate)} [bpm]`,
      maximumHeartRate: `${formatValue(activity.max_heartrate)} [bpm]`,
      averagePower: `${formatValue(activity.icu_average_watts)} [W]`,
      weightedAveragePower: `${formatValue(activity.icu_weighted_avg_watts)} [W]`,
      cadence: isRun
        ? `Average unilateral cadence: ${formatNumber(activity.average_cadence, 1)} [steps/min]`
        : `Average cadence: ${formatNumber(activity.average_cadence, 1)} [rpm]`,
    },

    runningDynamics: {
      averageStrideLength: `${formatNumber(activity.average_stride, 3)} [m]`,
      averageStanceTime: `${formatNumber(activity.average_stance_time, 1)} [ms]`,
      averageStanceTimePercent: `${formatNumber(activity.average_stance_time_percent, 1)} [%]`,
      averageVerticalOscillation: `${formatNumber(activity.average_vertical_oscillation, 1)} [mm]`,
      averageVerticalRatio: `${formatNumber(activity.average_vertical_ratio, 1)} [%]`,
      averageLegSpringStiffness: `${formatNumber(activity.average_leg_spring_stiffness, 2)} [kN/m]`,
    },

    environment: {
      recordedTemperature: `${formatNumber(activity.average_temp, 1)} [°C]`,
      weatherTemperature: `${formatNumber(activity.average_weather_temp, 2)} [°C]`,
      feelsLikeTemperature: `${formatNumber(activity.average_feels_like, 2)} [°C]`,
      averageWindSpeed: `${formatNumber(activity.average_wind_speed, 2)} [m/s]`,
      averageWindGust: `${formatNumber(activity.average_wind_gust, 2)} [m/s]`,
      headwind: `${formatNumber(activity.headwind_percent, 1)} [%]`,
      tailwind: `${formatNumber(activity.tailwind_percent, 1)} [%]`,
    },

    ...(facts.coreTemperature
      ? {
          physiology: {
            coreTemperatureMin:
              formatNumber(
                facts.coreTemperature.min,
                2,
              ),
            coreTemperatureMax:
              formatNumber(
                facts.coreTemperature.max,
                2,
              ),
          },
        }
      : {}),

    ...(facts.geography
      ? {
          geography: {
            coordinateCount:
              facts.geography.coordinateCount,
            north: formatNumber(
              facts.geography.boundingBox.north,
              6,
            ),
            south: formatNumber(
              facts.geography.boundingBox.south,
              6,
            ),
            east: formatNumber(
              facts.geography.boundingBox.east,
              6,
            ),
            west: formatNumber(
              facts.geography.boundingBox.west,
              6,
            ),
          },
        }
      : {}),

    ...(facts.externalGeography
      ? {
          externalGeography: {
            matchCount:
              facts.externalGeography.length,
          },
        }
      : {}),

    classification: {
      modality: facts.modality ?? "unknown",
      class: facts.classification.class,
      signals:
        facts.classification.signals.map(
          formatClassificationSignal,
        ),
    },

    training: {
      trainingLoad: formatValue(
        activity.icu_training_load,
      ),
      hrLoad: formatValue(activity.hr_load),
      paceLoad: formatValue(activity.pace_load),
      powerLoad: formatValue(activity.power_load),
      intensity: `${formatNumber(activity.icu_intensity, 1)} [%]`,
      decoupling: `${formatNumber(activity.decoupling, 2)} [%]`,
      rpe: `${formatValue(activity.icu_rpe)} [1–10]`,
      feel: formatValue(activity.feel),
    },
  };
}

export function activityEvidence(
  activity: Record<string, unknown>,
  facts: DerivedFacts,
): string {
  const model = buildEvidenceModel(
    activity,
    facts,
  );

  return eta.render(
    "./activity.md.eta",
    model,
  );
}
