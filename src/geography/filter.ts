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
    tags.boundary === "statistical" ||
    tags.man_made === "monitoring_station" ||
    tags.tourism === "information"
  );
}

export function isGeographic(
  tags: Record<string, string>,
): boolean {
  if (isExcluded(tags)) {
    return false;
  }

  if (tags.boundary !== undefined) {
    return true;
  }

  if (tags.place !== undefined) {
    return true;
  }

  if (tags.natural !== undefined) {
    return true;
  }

  if (tags.mountain_pass !== undefined) {
    return true;
  }

  if (tags.waterway !== undefined) {
    return true;
  }

  if (tags.geological !== undefined) {
    return true;
  }

  if (tags.landuse !== undefined) {
    return true;
  }

  if (tags.site !== undefined) {
    return true;
  }

  return false;
}
