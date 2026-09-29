export type GeographicReason =
  | "administrative_boundary"
  | "regional_boundary"
  | "protected_area"
  | "settlement"
  | "locality"
  | "geographic_feature"
  | "watercourse"
  | "geological_feature"
  | "mountain_pass";

const ADMINISTRATIVE_BOUNDARIES = new Set([
  "administrative",
]);

const REGIONAL_BOUNDARIES = new Set([
  "region",
  "tourism_region",
  "national_park",
  "nature_reserve",
]);

const PROTECTED_BOUNDARIES = new Set([
  "protected_area",
]);

const SETTLEMENT_PLACES = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "suburb",
  "neighbourhood",
  "municipality",
  "borough",
  "quarter",
  "isolated_dwelling",
]);

const LOCALITY_PLACES = new Set([
  "locality",
  "islet",
  "island",
  "subregion",
  "county",
  "region",
]);

const GEOGRAPHIC_NATURAL_FEATURES = new Set([
  "peak",
  "valley",
  "cliff",
  "wetland",
  "ridge",
  "rock",
  "grassland",
  "beach",
  "scrub",
  "saddle",
  "sinkhole",
  "heath",
  "bare_rock",
  "mud",
  "sand",
  "bay",
  "mountain_range",
  "volcano",
  "fell",
  "scree",
  "peninsula",
  "cape",
  "plain",
  "reef",
  "shoal",
  "gorge",
  "hot_spring",
  "strait",
  "shingle",
  "cave",
  "geyser",
]);

const WATERCOURSES = new Set([
  "river",
  "stream",
  "canal",
  "brook",
  "derelict_canal",
  "flowline",
  "confluence",
  "channeling",
  "tidal_channel",
]);

/**
 * Positive Osmium tag filters corresponding to the semantic
 * geographic corpus defined by geographicReason().
 *
 * Keep this explicit rather than using broad keys such as
 * `nwr/place=*` or `nwr/natural=*`; the latter would pull in
 * large amounts of non-geographic or infrastructure-like data.
 */
export const GEOGRAPHIC_OSMIUM_FILTERS = [
  "nwr/boundary=administrative",
  "nwr/boundary=region",
  "nwr/boundary=tourism_region",
  "nwr/boundary=national_park",
  "nwr/boundary=nature_reserve",
  "nwr/boundary=protected_area",

  "nwr/place=city",
  "nwr/place=town",
  "nwr/place=village",
  "nwr/place=hamlet",
  "nwr/place=suburb",
  "nwr/place=neighbourhood",
  "nwr/place=municipality",
  "nwr/place=borough",
  "nwr/place=quarter",
  "nwr/place=isolated_dwelling",

  "nwr/place=locality",
  "nwr/place=islet",
  "nwr/place=island",
  "nwr/place=subregion",
  "nwr/place=county",
  "nwr/place=region",

  "nwr/natural=peak",
  "nwr/natural=valley",
  "nwr/natural=cliff",
  "nwr/natural=wetland",
  "nwr/natural=ridge",
  "nwr/natural=rock",
  "nwr/natural=grassland",
  "nwr/natural=beach",
  "nwr/natural=scrub",
  "nwr/natural=saddle",
  "nwr/natural=sinkhole",
  "nwr/natural=heath",
  "nwr/natural=bare_rock",
  "nwr/natural=mud",
  "nwr/natural=sand",
  "nwr/natural=bay",
  "nwr/natural=mountain_range",
  "nwr/natural=volcano",
  "nwr/natural=fell",
  "nwr/natural=scree",
  "nwr/natural=peninsula",
  "nwr/natural=cape",
  "nwr/natural=plain",
  "nwr/natural=reef",
  "nwr/natural=shoal",
  "nwr/natural=gorge",
  "nwr/natural=hot_spring",
  "nwr/natural=strait",
  "nwr/natural=shingle",
  "nwr/natural=cave",
  "nwr/natural=geyser",

  "nwr/waterway=river",
  "nwr/waterway=stream",
  "nwr/waterway=canal",
  "nwr/waterway=brook",
  "nwr/waterway=derelict_canal",
  "nwr/waterway=flowline",
  "nwr/waterway=confluence",
  "nwr/waterway=channeling",
  "nwr/waterway=tidal_channel",

  "nwr/geological=*",
  "nwr/mountain_pass=*",
];

export function isExcluded(
  tags: Record<string, string>,
): boolean {
  return (
    tags.railway !== undefined ||
    tags.aerialway !== undefined ||
    tags.public_transport !== undefined ||
    tags.type === "public_transport" ||
    tags.amenity === "ferry_terminal" ||
    tags.highway !== undefined ||
    tags.traffic_sign !== undefined ||
    tags.man_made === "monitoring_station" ||
    tags.tourism === "information"
  );
}

export function geographicReason(
  tags: Record<string, string>,
): GeographicReason | undefined {
  if (isExcluded(tags)) {
    return undefined;
  }

  const boundary = tags.boundary;

  if (boundary) {
    if (
      ADMINISTRATIVE_BOUNDARIES.has(
        boundary,
      )
    ) {
      return "administrative_boundary";
    }

    if (
      PROTECTED_BOUNDARIES.has(boundary)
    ) {
      return "protected_area";
    }

    if (
      REGIONAL_BOUNDARIES.has(boundary)
    ) {
      return "regional_boundary";
    }
  }

  const place = tags.place;

  if (place) {
    if (
      SETTLEMENT_PLACES.has(place)
    ) {
      return "settlement";
    }

    if (
      LOCALITY_PLACES.has(place)
    ) {
      return "locality";
    }
  }

  const natural = tags.natural;

  if (
    natural &&
    GEOGRAPHIC_NATURAL_FEATURES.has(
      natural,
    )
  ) {
    return "geographic_feature";
  }

  const waterway = tags.waterway;

  if (
    waterway &&
    WATERCOURSES.has(waterway)
  ) {
    return "watercourse";
  }

  if (tags.geological !== undefined) {
    return "geological_feature";
  }

  if (tags.mountain_pass !== undefined) {
    return "mountain_pass";
  }

  return undefined;
}

export function isGeographic(
  tags: Record<string, string>,
): boolean {
  return geographicReason(tags) !== undefined;
}
