import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startServer } from "../server.js";

let server: Server;
let base = "";

beforeAll(async () => {
  server = await startServer(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("optional page art", () => {
  it("answers 404 for an image that was not dropped in", async () => {
    expect((await fetch(`${base}/assets/map-none.png`)).status).toBe(404);
  });

  it("serves nothing but kebab-case .png files from the assets folder", async () => {
    for (const path of ["/assets/README.md", "/assets/%2e%2e%2fpackage.json", "/assets/sub/map.png", "/assets/Map.png", "/assets/../package.json"]) {
      const res = await fetch(base + path);
      expect(res.headers.get("content-type"), path).not.toBe("image/png");
      expect(res.status, path).toBe(404);
    }
  });
});
