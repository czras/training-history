export type IntervalsRace = "A" | "B" | "C" | false;

export type ActivitySemanticClass =
  | "main_race"
  | "preparatory_race"
  | "minor_event"
  | "generic_training"
  | "community_event"
  | "named_event"
  | "unknown";

export type ClassificationSignal =
  | {
      kind: "intervals_race";
      value: IntervalsRace;
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
]);

export function classifyActivity(
  source: Record<string, unknown>,
): ActivityClassification {
  const signals: ClassificationSignal[] = [];

  const race = readIntervalsRace(source);

  if (race !== undefined) {
    signals.push({
      kind: "intervals_race",
      value: race,
    });

    if (race === "A") {
      return {
        class: "main_race",
        signals,
      };
    }

    if (race === "B") {
      return {
        class: "preparatory_race",
        signals,
      };
    }

    if (race === "C") {
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

  return {
    class: "unknown",
    signals,
  };
}

function readIntervalsRace(
  source: Record<string, unknown>,
): IntervalsRace | undefined {
  const value = source.race;

  if (value === false) {
    return false;
  }

  if (value === "A" || value === "B" || value === "C") {
    return value;
  }

  return undefined;
}

function readName(
  source: Record<string, unknown>,
): string | undefined {
  return typeof source.name === "string"
    ? source.name.trim()
    : undefined;
}
