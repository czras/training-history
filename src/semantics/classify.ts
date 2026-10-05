import type {
  ActivityModality,
  ActivityRaceClassification,
} from "../platforms/activity.js";

export type ActivitySemanticClass =
  | "main_race"
  | "preparatory_race"
  | "minor_event"
  | "generic_training"
  | "community_event"
  | "commute"
  | "strength"
  | "test"
  | "named_event"
  | "unknown";

export type ClassificationSignal =
  | {
      kind: "modality";
      value: ActivityModality;
    }
  | {
      kind: "activity_race";
      value: boolean;
    }
  | {
      kind: "activity_race_classification";
      value: ActivityRaceClassification;
    }
  | {
      kind: "name_pattern";
      rule: string;
    };

export type ActivityClassification = {
  class: ActivitySemanticClass;
  signals: ClassificationSignal[];
};

const GENERIC_TRAINING_NAMES = new Set([
  "Hosszú",
  "Könnyű",
  "Regeneráló",
  "Tempó",
  "Lendületes",
  "Morning Run",
  "Lunch Run",
  "Afternoon Run",
  "Evening Run",
  "Night Run",
  "Morning Walk",
  "Afternoon Walk",
]);

const COMMUTE_NAMES = new Set([
  "Munkába",
  "Munkából",
  "Irodába",
  "Irodából",
]);

const STRENGTH_NAMES = new Set([
  "Strivacity erősítés",
  "SVSE erősítés",
  "SVSE futóiskola, erősítés",
]);

const TEST_NAMES = new Set([
  "MLSS teszt",
]);

export function classifyActivity(
  source: Record<string, unknown>,
  modality?: ActivityModality,
  activityRace?: boolean,
  activityRaceClassification?: ActivityRaceClassification,
): ActivityClassification {
  const signals: ClassificationSignal[] = [];

  if (modality !== undefined) {
    signals.push({
      kind: "modality",
      value: modality,
    });
  }

  if (activityRace !== undefined) {
    signals.push({
      kind: "activity_race",
      value: activityRace,
    });
  }

  if (activityRaceClassification !== undefined) {
    signals.push({
      kind: "activity_race_classification",
      value: activityRaceClassification,
    });

    if (activityRaceClassification === "main") {
      return {
        class: "main_race",
        signals,
      };
    }

    if (activityRaceClassification === "preparatory") {
      return {
        class: "preparatory_race",
        signals,
      };
    }

    if (activityRaceClassification === "minor") {
      return {
        class: "minor_event",
        signals,
      };
    }
  }

  const name = readName(source);

  if (name && GENERIC_TRAINING_NAMES.has(name)) {
    signals.push({
      kind: "name_pattern",
      rule: `generic-name:${name}`,
    });

    return {
      class: "generic_training",
      signals,
    };
  }

  if (name?.startsWith("Résztáv")) {
    signals.push({
      kind: "name_pattern",
      rule: "name-prefix:Résztáv",
    });

    return {
      class: "generic_training",
      signals,
    };
  }

  if (name?.startsWith("Domb ")) {
    signals.push({
      kind: "name_pattern",
      rule: "name-prefix:Domb",
    });

    return {
      class: "generic_training",
      signals,
    };
  }

  if (name && COMMUTE_NAMES.has(name)) {
    signals.push({
      kind: "name_pattern",
      rule: `commute-name:${name}`,
    });

    return {
      class: "commute",
      signals,
    };
  }

  if (
    modality === "strength" ||
    (name && STRENGTH_NAMES.has(name))
  ) {
    if (name && STRENGTH_NAMES.has(name)) {
      signals.push({
        kind: "name_pattern",
        rule: `strength-name:${name}`,
      });
    }

    return {
      class: "strength",
      signals,
    };
  }

  if (name && TEST_NAMES.has(name)) {
    signals.push({
      kind: "name_pattern",
      rule: `test-name:${name}`,
    });

    return {
      class: "test",
      signals,
    };
  }

  if (name?.startsWith("SVSE futóklub")) {
    signals.push({
      kind: "name_pattern",
      rule: "name-prefix:SVSE futóklub",
    });

    return {
      class: "community_event",
      signals,
    };
  }

  if (name?.startsWith("VeszpRun")) {
    signals.push({
      kind: "name_pattern",
      rule: "name-prefix:VeszpRun",
    });

    return {
      class: "community_event",
      signals,
    };
  }

  if (activityRace === true) {
    return {
      class: "named_event",
      signals,
    };
  }

  return {
    class: "unknown",
    signals,
  };
}

function readName(
  source: Record<string, unknown>,
): string | undefined {
  return typeof source.name === "string"
    ? source.name.trim()
    : undefined;
}
