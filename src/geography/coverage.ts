import { readFile } from "node:fs/promises";
import path from "node:path";

import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";

const ROOT = path.resolve(".");
const COVERAGE_PATH = path.join(ROOT, "geography", "coverage.md");

export type CountrySelection = {
  country: string;
  areas: string[];
};

export async function loadCoverage(): Promise<CountrySelection[]> {
  const markdown = await readFile(COVERAGE_PATH, "utf8");

  return parseCoverage(markdown);
}

function parseCoverage(markdown: string): CountrySelection[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);

  const selections: CountrySelection[] = [];
  let currentCountry: CountrySelection | undefined;

  visit(tree, "listItem", (node: any) => {
    const text = node.children
      .filter((child: any) => child.type === "paragraph")
      .flatMap((paragraph: any) => paragraph.children ?? [])
      .filter((child: any) => child.type === "text")
      .map((child: any) => child.value)
      .join("")
      .trim();

    if (!text) {
      return;
    }

    const checked = node.checked === true;

    if (node.position?.start?.column === 1 && checked) {
      currentCountry = {
        country: text,
        areas: [],
      };

      selections.push(currentCountry);
      return;
    }

    if (currentCountry && node.position?.start?.column > 1) {
      currentCountry.areas.push(text);
    }
  });

  return selections;
}
