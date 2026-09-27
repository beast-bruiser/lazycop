import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where the watsonx credentials are read from: LAZYCOP_ENV_FILE, else ~/.lazycop/.env.
 *  Never a path next to the install, which moves with npm and never in a Bob workspace. */
export function envFilePath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return env.LAZYCOP_ENV_FILE || join(home, ".lazycop", ".env");
}

/** Loads KEY=value lines into process.env without overriding what is already set. Missing file is fine. */
export function loadEnvFile(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]!] !== undefined) continue;
    process.env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
  }
}
