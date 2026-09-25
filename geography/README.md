# Geography

The repository contains a curated geographic dataset used to interpret
geographic observations in the training history.

The curated dataset is generated from OpenStreetMap data. The acquisition
and curation workflow uses external command-line tools for binary transport
and OSM processing.

## External dependencies

The geography curation tooling requires:

* **curl** — downloads the OSM source extracts and provides download progress
  and resumable transfers.
* **osmium-tool** — validates and processes OSM PBF files, including the
  initial filtering used to reduce large country extracts to named
  geographic candidates.

These are system-level dependencies and are not installed through the
Node.js package manager.

The Node.js tooling orchestrates the workflow and performs the semantic
curation; it intentionally delegates large binary downloads and heavy PBF
processing to these native tools.

## Workflow

The curation pipeline is:

```text
coverage.md
    ↓
curl
    ↓
raw OSM PBF
    ↓
osmium
    ↓
named geographic candidates
    ↓
repository curation
    ↓
geography.gpkg
```

Raw downloaded OSM extracts are kept locally under `data/geography/raw/` and
are not committed to the repository.

The curated `geography/geography.gpkg` is the versioned geographic artifact.

## External dependency installation

On Arch Linux, the required system dependencies can be installed with
`paru`:

```bash
paru -S curl osmium-tool
```

Verify the installation with:

```bash
curl --version
osmium --version
```

Other operating systems should install equivalent `curl` and `osmium-tool`
packages using their native package manager.
