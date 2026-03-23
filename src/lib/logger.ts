type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function write(level: LogLevel, scope: string, message: string): void {
  if (shouldSuppress(level)) {
    return;
  }

  if (level === "DEBUG" && !isDebugEnabled()) {
    return;
  }

  const line = `[${new Date().toISOString()}] [${level}] [${scope}] ${message}`;
  if (level === "ERROR") {
    console.error(line);
    return;
  }

  if (level === "WARN") {
    console.warn(line);
    return;
  }

  console.log(line);
}

function isDebugEnabled(): boolean {
  const value = process.env.DEBUG ?? process.env.APP_DEBUG ?? "";
  return value === "1" || value.toLowerCase() === "true";
}

function shouldSuppress(level: LogLevel): boolean {
  const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const forceLogs = process.env.FORCE_LOGS === "1" || process.env.FORCE_LOGS?.toLowerCase() === "true";
  return isTest && !forceLogs && level !== "ERROR";
}

export const logger = {
  info(scope: string, message: string): void {
    write("INFO", scope, message);
  },
  warn(scope: string, message: string): void {
    write("WARN", scope, message);
  },
  error(scope: string, message: string): void {
    write("ERROR", scope, message);
  },
  debug(scope: string, message: string): void {
    write("DEBUG", scope, message);
  }
};
