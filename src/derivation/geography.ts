import { GeoPackageAPI } from "@ngageoint/geopackage";

const GEOGRAPHY_PATH =
  "data/geography/materialized/geography.gpkg";

const GEOGRAPHY_TABLE = "geography";

export type GeographicFeature = {
  country: string;
  role: string;
  osmType: string;
  osmId: number;
  name: string;
  tags: string;
};

export type GeographyBoundingBox = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export class GeographyResolver {
  private constructor(
    private readonly geoPackage: Awaited<
      ReturnType<typeof GeoPackageAPI.open>
    >,
  ) {}

  static async open(): Promise<GeographyResolver> {
    const geoPackage =
      await GeoPackageAPI.open(GEOGRAPHY_PATH);

    if (
      !geoPackage.hasFeatureTable(
        GEOGRAPHY_TABLE,
      )
    ) {
      geoPackage.close();

      throw new Error(
        `GeoPackage does not contain feature table: ${GEOGRAPHY_TABLE}`,
      );
    }

    return new GeographyResolver(geoPackage);
  }

  async query(
    boundingBox: GeographyBoundingBox,
  ): Promise<GeographicFeature[]> {
    const results =
      await this.geoPackage.getFeaturesInBoundingBox(
        GEOGRAPHY_TABLE,
        boundingBox.west,
        boundingBox.east,
        boundingBox.south,
        boundingBox.north,
      );

    const features: GeographicFeature[] = [];

    for (const row of results) {
      features.push({
        country: String(
          row.getValueWithColumnName("country"),
        ),
        role: String(
          row.getValueWithColumnName("role"),
        ),
        osmType: String(
          row.getValueWithColumnName("osm_type"),
        ),
        osmId: Number(
          row.getValueWithColumnName("osm_id"),
        ),
        name: String(
          row.getValueWithColumnName("name"),
        ),
        tags: String(
          row.getValueWithColumnName("tags"),
        ),
      });
    }

    return features;
  }

  close(): void {
    this.geoPackage.close();
  }
}
