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
