import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { cardWriter, setCardWriter } from "../writer.js";

const seen: { path: string; body: string; auth?: string }[] = [];
let mock: http.Server;
let reply = '["expires at the end of the local day", "expires 30 days after issue", "extra"]';

beforeAll(async () => {
  mock = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ path: req.url ?? "", body, auth: req.headers.authorization });
      res.setHeader("content-type", "application/json");
      if (req.url === "/identity/token") return res.end(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }));
      res.end(JSON.stringify({ choices: [{ message: { content: reply } }] }));
    });
  });
  await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
  Object.assign(process.env, { WATSONX_API_KEY: "key-1", WATSONX_PROJECT_ID: "proj-1", WATSONX_URL: base, WATSONX_IAM_URL: `${base}/identity/token`, WATSONX_MODEL: "ibm/granite-4-h-small" });
  setCardWriter(null);
});

afterAll(() => {
  for (const k of ["WATSONX_API_KEY", "WATSONX_PROJECT_ID", "WATSONX_URL", "WATSONX_IAM_URL", "WATSONX_MODEL"]) delete process.env[k];
  setCardWriter(null);
  return new Promise<void>((r) => mock.close(() => r()));
});

describe("watsonx.ai card writer", () => {
  it("gets an IAM token once, then calls the chat API with the model and project", async () => {
    const writer = cardWriter();
    expect(await writer.alternatives({ task: "t", intent: "i", assumption: "a" })).toEqual(["expires at the end of the local day", "expires 30 days after issue"]);
    await writer.alternatives({ task: "t", intent: "i", assumption: "b" });

    expect(seen.filter((r) => r.path === "/identity/token")).toHaveLength(1);
    expect(new URLSearchParams(seen[0]!.body).get("apikey")).toBe("key-1");
    const chat = seen.find((r) => r.path.startsWith("/ml/v1/text/chat"))!;
    expect(chat.path).toBe("/ml/v1/text/chat?version=2024-10-07");
    expect(chat.auth).toBe("Bearer tok-1");
    expect(JSON.parse(chat.body)).toMatchObject({ model_id: "ibm/granite-4-h-small", project_id: "proj-1" });
  });

  it("treats an empty list as nothing notable in a diff", async () => {
    reply = "[]";
    expect(await cardWriter().hiddenAssumption({ task: "t", intent: "i", patch: "@@" })).toBeNull();
  });
});
