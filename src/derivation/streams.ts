export type StreamFacts = {
  coreTemperature?: {
    min: number;
    max: number;
  };

  geography?: {
    coordinateCount: number;
    boundingBox: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
  };
};

type Stream = {
  type?: unknown;
  data?: unknown;
  data2?: unknown;
};

function findStream(
  streams: unknown[],
  type: string,
): Stream | undefined {
  return streams.find(
    (stream): stream is Stream =>
      typeof stream === "object" &&
      stream !== null &&
      "type" in stream &&
      (stream as Stream).type === type,
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

function geographicDerivation(
  streams: unknown[],
): StreamFacts["geography"] {
  const coordinates = coordinateValues(streams);

  if (coordinates.length === 0) {
    return undefined;
  }

  const latitudes = coordinates.map(([lat]) => lat);
  const longitudes = coordinates.map(([, lng]) => lng);

  return {
    coordinateCount: coordinates.length,
    boundingBox: {
      north: Math.max(...latitudes),
      south: Math.min(...latitudes),
      east: Math.max(...longitudes),
      west: Math.min(...longitudes),
    },
  };
}

export function deriveStreamFacts(
  streams: unknown[],
): StreamFacts {
  const coreTemperature = streamRange(
    streams,
    "core_temperature",
  );

  const geography = geographicDerivation(streams);

  return {
    ...(coreTemperature
      ? { coreTemperature }
      : {}),
    ...(geography
      ? { geography }
      : {}),
  };
}
