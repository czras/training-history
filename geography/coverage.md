```yaml
# configuration:
#   hierarchy:
#     - continent
#     - country
#     - area
#
#   semantics:
#     continent:
#       meaning: organizational grouping only
#
#     country:
#       selected: checkbox state
#       if_selected_without_areas: whole_country
#       if_selected_with_areas: restricted_to_areas
#
#     area:
#       meaning: named geographic selection resolved against OSM
#       hierarchy: none
#       type: arbitrary_osm_geographic_object
#
#   rules:
#     - only_checked_countries_are_curated
#     - unchecked_country_must_not_have_areas
#     - checked_country_without_areas_means_whole_country
#     - checked_country_with_areas_means_only_those_areas
#     - area_names_are_resolved_against_osm
#     - area_type_is_not_defined_by_this_configuration
#
#   output:
#     generated_from: this_file
#     artifact: geography/geography.gpkg
```

# Geographic coverage

## Europe

* [ ] Albania
* [x] Austria
  * Vienna
  * Präbichl
* [ ] Belarus
* [ ] Belgium
* [ ] Bosnia and Herzegovina
* [ ] Bulgaria
* [ ] Croatia
* [ ] Cyprus
* [ ] Czechia
* [ ] Denmark
* [ ] Estonia
* [ ] Finland
* [ ] France
* [ ] Germany
* [ ] Greece
* [ ] Iceland
* [ ] Ireland
* [x] Hungary
* [ ] Italy
* [ ] Kosovo
* [ ] Latvia
* [ ] Liechtenstein
* [ ] Lithuania
* [ ] Luxembourg
* [ ] Malta
* [ ] Moldova
* [ ] Monaco
* [ ] Montenegro
* [ ] Netherlands
* [ ] North Macedonia
* [ ] Norway
* [ ] Poland
* [ ] Portugal
* [ ] Romania
* [ ] Russia
* [ ] San Marino
* [ ] Serbia
* [ ] Slovakia
* [ ] Slovenia
* [ ] Spain
* [x] Switzerland
  * Geneva
  * Lugano
  * Montreux
  * St. Moritz
  * Vals
  * Zermatt
* [ ] Turkey
* [ ] Ukraine
* [ ] United Kingdom
* [ ] Vatican City
