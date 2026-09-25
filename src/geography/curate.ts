import { readFile } from "node:fs/promises";
import path from "node:path";

import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";

import { acquireCountries } from "./osm.js";

const COVERAGE_FILE = path.resolve("geography/coverage.md");

interface CoverageSelection {
  country: string;
  mode: "country" | "areas";
  areas?: string[];
}

interface MdastNode {
  type: string;
  value?: string;
  checked?: boolean | null;
  children?: MdastNode[];
}

function nodeText(node: MdastNode): string {
  if (node.type === "text") {
    return node.value ?? "";
  }

  return (node.children ?? []).map(nodeText).join("");
}

function listItemName(item: MdastNode): string {
  const paragraph = item.children?.find(
    (child) => child.type === "paragraph",
  );

  if (!paragraph) {
    throw new Error("Coverage list item has no paragraph");
  }

  return nodeText(paragraph).trim();
}

function nestedAreas(item: MdastNode): string[] {
  const nestedList = item.children?.find(
    (child) => child.type === "list",
  );

  if (!nestedList) {
    return [];
  }

  const areas: string[] = [];

  for (const child of nestedList.children ?? []) {
    if (child.type !== "listItem") {
      continue;
    }

    const area = listItemName(child);

    if (!area) {
      throw new Error("Coverage contains an empty area");
    }

    // Areas are deliberately not task-list items.
    if (child.checked !== null && child.checked !== undefined) {
      throw new Error(
        `Area "${area}" must not use checkbox syntax`,
      );
    }

    areas.push(area);
  }

  return areas;
}

function parseCoverage(markdown: string): CoverageSelection[] {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(markdown) as unknown as MdastNode;

  const selections: CoverageSelection[] = [];

  /*
   * coverage.md has this structure:
   *
   *   # Geographic coverage
   *
   *   ## Europe
   *
   *   * [x] Austria
   *     * Vienna
   *     * Präbichl
   *
   * The Europe list is therefore a list directly contained by a section.
   *
   * We walk only list nodes whose parent is a section/root-level container.
   * Nested lists are consumed by nestedAreas() and are not processed again.
   */
  function processList(list: MdastNode): void {
    for (const child of list.children ?? []) {
      if (child.type !== "listItem") {
        continue;
      }

      const country = listItemName(child);

      if (!country) {
        throw new Error("Coverage contains an empty country");
      }

      const areas = nestedAreas(child);

      /*
       * An unchecked country is not selected, but an unchecked country
       * must not contain areas because that would make the configuration
       * ambiguous.
       */
      if (child.checked !== true) {
        if (areas.length > 0) {
          throw new Error(
            `Unchecked country "${country}" must not have areas`,
          );
        }

        continue;
      }

      if (areas.length === 0) {
        selections.push({
          country,
          mode: "country",
        });
      } else {
        selections.push({
          country,
          mode: "areas",
          areas,
        });
      }
    }
  }

  function walk(node: MdastNode, insideList = false): void {
    if (node.type === "list") {
      if (!insideList) {
        processList(node);
      }

      // Nested lists belong to the country currently being processed.
      return;
    }

    for (const child of node.children ?? []) {
      walk(child, insideList || node.type === "list");
    }
  }

  walk(tree);

  validateCoverage(selections);

  return selections;
}

function validateCoverage(selections: CoverageSelection[]): void {
  const countries = new Set<string>();

  for (const selection of selections) {
    if (countries.has(selection.country)) {
      throw new Error(
        `Duplicate country in coverage configuration: ${selection.country}`,
      );
    }

    countries.add(selection.country);

    if (selection.mode !== "areas") {
      continue;
    }

    if (!selection.areas || selection.areas.length === 0) {
      throw new Error(
        `Country "${selection.country}" has area restrictions but no areas`,
      );
    }

    const areas = new Set<string>();

    for (const area of selection.areas) {
      if (!area.trim()) {
        throw new Error(
          `Country "${selection.country}" contains an empty area`,
        );
      }

      if (areas.has(area)) {
        throw new Error(
          `Duplicate area "${area}" in country "${selection.country}"`,
        );
      }

      areas.add(area);
    }
  }
}

async function main(): Promise<void> {
  const markdown = await readFile(COVERAGE_FILE, "utf8");
  const selections = parseCoverage(markdown);

  console.log("Geography coverage:");

  for (const selection of selections) {
    if (selection.mode === "country") {
      console.log(`  ${selection.country}: whole country`);
      continue;
    }

    console.log(`  ${selection.country}:`);

    for (const area of selection.areas ?? []) {
      console.log(`    - ${area}`);
    }
  }

  const countries = selections.map((selection) => selection.country);

  if (countries.length === 0) {
    console.log("\nNo countries selected.");
    return;
  }

  console.log("\nAcquiring OSM sources...\n");

  const sources = await acquireCountries(countries);

  console.log("\nOSM acquisition complete:");

  for (const source of sources) {
    const status = source.downloaded ? "downloaded" : "already present";

    console.log(`  ${source.country}: ${status}`);
    console.log(`    ${source.path}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
