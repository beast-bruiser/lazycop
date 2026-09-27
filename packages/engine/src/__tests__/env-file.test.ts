import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { envFilePath } from "../env.js";

describe("where the watsonx credentials are read from", () => {
  it("defaults to ~/.lazycop/.env, whatever the install location", () => {
    expect(envFilePath({}, "/home/dev")).toBe(join("/home/dev", ".lazycop", ".env"));
  });

  it("follows LAZYCOP_ENV_FILE when it is set", () => {
    expect(envFilePath({ LAZYCOP_ENV_FILE: "/secrets/lazycop.env" }, "/home/dev")).toBe("/secrets/lazycop.env");
  });

  it("ignores an empty LAZYCOP_ENV_FILE", () => {
    expect(envFilePath({ LAZYCOP_ENV_FILE: "" }, "/home/dev")).toBe(join("/home/dev", ".lazycop", ".env"));
  });
});
