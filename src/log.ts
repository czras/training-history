export type LogFields = Record<
  string,
  string | number | boolean | undefined
>;

type LogLevel = "info" | "warn" | "error";

const sectionStack: string[] = [];

function timestamp(): string {
  return new Date().toISOString();
}

function formatValue(
  value: string | number | boolean | undefined,
): string {
  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "string" && /\s/.test(value)) {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatFields(fields?: LogFields): string {
  if (!fields) {
    return "";
  }

  const entries = Object.entries(fields).filter(
    (
      entry,
    ): entry is [
      string,
      string | number | boolean,
    ] => entry[1] !== undefined,
  );

  if (entries.length === 0) {
    return "";
  }

  return (
    " " +
    entries
      .map(([key, value]) => `${key}=${formatValue(value)}`)
      .join(" ")
  );
}

function indent(): string {
  return "│  ".repeat(sectionStack.length);
}

function write(
  level: LogLevel,
  message: string,
  fields?: LogFields,
): void {
  const levelPrefix =
    level === "info"
      ? ""
      : level === "warn"
        ? "WARN "
        : "ERROR ";

  process.stdout.write(
    `[${timestamp()}] ${indent()}${levelPrefix}${message}${formatFields(fields)}\n`,
  );
}

export function info(
  message: string,
  fields?: LogFields,
): void {
  write("info", message, fields);
}

export function warn(
  message: string,
  fields?: LogFields,
): void {
  write("warn", message, fields);
}

export function error(
  message: string,
  fields?: LogFields,
): void {
  write("error", message, fields);
}

export function section(label: string): void {
  write("info", `├─ ${label}`);
  sectionStack.push(label);
}

export function item(
  message: string,
  fields?: LogFields,
): void {
  write("info", `├─ ${message}`, fields);
}

export function detail(
  message: string,
  fields?: LogFields,
): void {
  write("info", `├─ ${message}`, fields);
}

export function endSection(
  message?: string,
  fields?: LogFields,
): void {
  if (sectionStack.length === 0) {
    return;
  }

  sectionStack.pop();

  const label = message ?? sectionStack.at(-1) ?? "complete";

  process.stdout.write(
    `[${timestamp()}] ${indent()}└─ ${label}${formatFields(fields)}\n`,
  );
}

export function done(
  message: string,
  fields?: LogFields,
): void {
  write("info", `└─ ${message}`, fields);
}
