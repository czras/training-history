import {
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";

export async function writeFileAtomic(
  path: string,
  content: string,
): Promise<void> {
  const temporaryPath =
    `${path}.${randomUUID()}.tmp`;

  try {
    await writeFile(
      temporaryPath,
      content,
      "utf8",
    );

    await rename(
      temporaryPath,
      path,
    );
  } finally {
    try {
      await unlink(temporaryPath);
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        )
      ) {
        throw error;
      }
    }
  }
}
