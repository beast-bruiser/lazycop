#!/usr/bin/env node
// Committed launcher, so npm can link the `lazycop` command before the CLI is built.
try {
  await import("../dist/cli.js");
} catch (err) {
  if (err?.code !== "ERR_MODULE_NOT_FOUND") throw err;
  console.error("LazyCop is not built yet: run `npm run build` in the lazycop repo.");
  process.exit(1);
}
