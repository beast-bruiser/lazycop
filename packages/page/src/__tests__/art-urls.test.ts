import { describe, it, expect } from "vitest";
import { ART_URLS } from "../art-urls.js";
import { artSources } from "../map-assets.js";

describe("art sources", () => {
  it("registers every image slot the page draws", () => {
    expect(Object.keys(ART_URLS).sort()).toEqual(["map", "portrait", "soldier", "unit"]);
  });

  it("tries the CDN URL first, then the local file", () => {
    const urls = { ...ART_URLS, map: " https://cdn.example.com/lazycop/map.png " };
    expect(artSources("map", urls)).toEqual(["https://cdn.example.com/lazycop/map.png", "/assets/map.png"]);
  });

  it("uses the local file alone when no URL is set", () => {
    expect(artSources("soldier", { ...ART_URLS, soldier: "" })).toEqual(["/assets/soldier.png"]);
  });
});
