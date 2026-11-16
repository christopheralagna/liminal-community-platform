import { afterEach, expect, it, vi } from "vitest";
import config from "../../next.config.mjs";

afterEach(() => vi.unstubAllEnvs());
it("defaults every Vercel route to noindex, with an explicit reversible opt-in", async () => {
  vi.stubEnv("VERCEL", "1"); vi.stubEnv("TEMPORARY_SITE_NOINDEX", undefined);
  expect(await config.headers!()).toEqual([{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]);
  vi.stubEnv("TEMPORARY_SITE_NOINDEX", "false");
  expect(await config.headers!()).toEqual([]);
});
it("supports isolated local header verification without changing normal development", async () => {
  vi.stubEnv("VERCEL", undefined); vi.stubEnv("TEMPORARY_SITE_NOINDEX", undefined);
  expect(await config.headers!()).toEqual([]);
  vi.stubEnv("TEMPORARY_SITE_NOINDEX", "true");
  expect(await config.headers!()).toHaveLength(1);
});
