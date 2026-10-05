import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Activity } from "../platforms/activity.js";
import { deriveActivity } from "../derivation/activity.js";
import { activityEvidence } from "../derivation/evidence.js";
import { GeographyResolver } from "../derivation/geography.js";

async function writeFileLogged(
  path: string,
  content: string,
): Promise<void> {
  await writeFile(path, content, "utf8");
  console.log(`  saved ${path}`);
}

export async function persistActivity(
  activityId: string,
  activity: Activity,
): Promise<void> {
  const startDate = new Date(
    activity.source.start_date_local,
  );

  if (Number.isNaN(startDate.getTime())) {
    throw new Error(
      `Activity ${activityId} has invalid start_date_local: ${activity.source.start_date_local}`,
    );
  }

  const year = activity.source.start_date_local.slice(0, 4);
  const month = activity.source.start_date_local.slice(5, 7);

  const directory = join(
    "activities",
    year,
    month,
    activityId,
  );

  await mkdir(directory, { recursive: true });

  const sourcePath = join(directory, "source.json");
  const streamsPath = join(directory, "streams.json");
  const derivedPath = join(directory, "derived.json");
  const workoutPath = join(directory, "workout.json");
  const evidencePath = join(directory, "evidence.md");

  const geographyResolver =
    await GeographyResolver.open();

  try {
    const facts = await deriveActivity(
      activity.source,
      activity.streams,
      {
        modality: activity.modality,
        activityRace: activity.activityRace,
        activityRaceClassification:
          activity.activityRaceClassification,
      },
      geographyResolver,
    );

    await writeFileLogged(
      sourcePath,
      JSON.stringify(activity.source, null, 2) + "\n",
    );

    await writeFileLogged(
      streamsPath,
      JSON.stringify(activity.streams, null, 2) + "\n",
    );

    await writeFileLogged(
      derivedPath,
      JSON.stringify(facts, null, 2) + "\n",
    );

    if (activity.workout !== undefined) {
      await writeFileLogged(
        workoutPath,
        JSON.stringify(activity.workout, null, 2) + "\n",
      );
    }

    await writeFileLogged(
      evidencePath,
      activityEvidence(
        activity.source,
        facts,
      ),
    );
  } finally {
    geographyResolver.close();
  }
}
