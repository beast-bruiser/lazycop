#!/usr/bin/env node
// prepack/postpack for the published `lazycop` package.
// npm will not bundle workspace packages it only reaches through symlinks, so before a pack
// this puts a real copy of @lazycops/engine and @lazycops/page (exactly what their own
// `files` ship) into packages/cli/node_modules, where bundleDependencies picks them up.
// The inner pack runs with --dry-run=false: a dry-run outer pack passes its flag down.
// It also copies the repo README and LICENSE in, for the npm page.
// `clean` removes both again so the workspace resolves to the live packages.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(cliDir, "..");
const staged = join(cliDir, "node_modules", "@lazycops");
const bundled = ["engine", "page"];

rmSync(staged, { recursive: true, force: true });
const copied = ["README.md", "LICENSE"];
for (const file of copied) rmSync(join(cliDir, file), { force: true });
if (process.argv[2] !== "clean") {
  for (const file of copied) copyFileSync(join(packagesDir, "..", file), join(cliDir, file));
  const tmp = mkdtempSync(join(tmpdir(), "lazycop-bundle-"));
  try {
    for (const name of bundled) {
      const out = execFileSync("npm", ["pack", "--silent", "--dry-run=false", "--pack-destination", tmp], { cwd: join(packagesDir, name), encoding: "utf8" });
      const tarball = join(tmp, out.trim().split("\n").pop());
      const dest = join(staged, name);
      mkdirSync(dest, { recursive: true });
      execFileSync("tar", ["-xzf", tarball, "-C", dest, "--strip-components=1"]);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
} else if (existsSync(dirname(staged)) && readdirSync(dirname(staged)).length === 0) {
  rmSync(dirname(staged), { recursive: true });
}
