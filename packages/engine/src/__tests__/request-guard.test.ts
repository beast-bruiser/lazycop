import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { startServer } from "../server.js";

let server: http.Server;
let port = 0;

beforeAll(async () => {
  server = await startServer(0);
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** node:http, not fetch, so the test can set Host and Origin as a browser or attacker would. */
function send(method: string, path: string, headers: Record<string, string>, body?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    req.on("error", reject);
    req.end(body);
  });
}

const json = { "content-type": "application/json" };

describe("the engine server serves only its own page and local tools", () => {
  it("refuses a Host that is not its own, as after DNS rebinding", async () => {
    expect(await send("GET", "/", { host: `evil.example:${port}` })).toBe(403);
    expect(await send("POST", "/hold", { ...json, host: `evil.example:${port}` }, "{}")).toBe(403);
  });

  it("serves both local host names", async () => {
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`]) {
      expect(await send("POST", "/nowhere", { ...json, host }, "{}"), host).toBe(404);
    }
  });

  it("refuses a POST from another site", async () => {
    expect(await send("POST", "/answer", { ...json, origin: "https://evil.example" }, "{}")).toBe(403);
    expect(await send("POST", "/queue", { ...json, origin: `http://localhost:${port + 1}` }, "{}")).toBe(403);
  });

  it("refuses a POST whose body is not declared JSON, as a no-cors fetch would send", async () => {
    expect(await send("POST", "/answer", { "content-type": "text/plain" }, "{}")).toBe(403);
    expect(await send("POST", "/hook", {}, "{}")).toBe(403);
  });

  it("accepts the page's own POSTs and the hook's origin-less ones", async () => {
    expect(await send("POST", "/nowhere", { ...json, origin: `http://127.0.0.1:${port}` }, "{}")).toBe(404);
    expect(await send("POST", "/nowhere", { "content-type": "application/json; charset=utf-8" }, "{}")).toBe(404);
  });
});
