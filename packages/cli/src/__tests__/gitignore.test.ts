import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ignoreRecords } from "../gitignore.js";
import { inNpxCache } from "../install.js";

let ws: string;
const gitignore = () => readFileSync(join(ws, ".gitignore"), "utf8");

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "lazycop-ws-"));
});

describe("lazycop init keeps .lazycop/ out of git", () => {
  it("appends the entry and keeps every existing line", () => {
    writeFileSync(join(ws, ".gitignore"), "node_modules/\ndist");
    expect(ignoreRecords(ws)).toBe(true);
    expect(gitignore()).toBe("node_modules/\ndist\n# LazyCop's per-task records\n.lazycop/\n");
  });

  it("writes nothing when the entry is already there, in any usual spelling", () => {
    for (const line of [".lazycop", "/.lazycop/", "  .lazycop/  "]) {
      writeFileSync(join(ws, ".gitignore"), `a\n${line}\n`);
      expect(ignoreRecords(ws), line).toBe(false);
      expect(gitignore()).toBe(`a\n${line}\n`);
    }
  });

  it("creates a .gitignore in a git repo that has none", () => {
    mkdirSync(join(ws, ".git"));
    expect(ignoreRecords(ws)).toBe(true);
    expect(gitignore()).toBe("# LazyCop's per-task records\n.lazycop/\n");
  });

  it("leaves a folder that is not a git repo alone", () => {
    expect(ignoreRecords(ws)).toBe(false);
    expect(existsSync(join(ws, ".gitignore"))).toBe(false);
  });
});

describe("lazycop init spots the npx cache", () => {
  it("flags an engine under npm's _npx folder only", () => {
    expect(inNpxCache("/home/dev/.npm/_npx/3f2a/node_modules/lazycop/node_modules/@lazycops/engine/dist/mcp-server.js")).toBe(true);
    expect(inNpxCache("C:\\Users\\dev\\AppData\\Local\\npm-cache\\_npx\\3f2a\\mcp-server.js")).toBe(true);
    expect(inNpxCache("/usr/local/lib/node_modules/lazycop/node_modules/@lazycops/engine/dist/mcp-server.js")).toBe(false);
  });
});
