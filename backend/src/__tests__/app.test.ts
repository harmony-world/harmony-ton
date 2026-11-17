import { afterEach, describe, expect, it } from "vitest";
import { buildCorsOriginOption, parseCorsOrigins } from "../app.js";

const ORIGINAL_ENV = {
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  NODE_ENV: process.env.NODE_ENV,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("CORS config", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("parses comma-separated allowed origins", () => {
    expect(parseCorsOrigins("https://a.example, https://b.example ,,")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("uses explicit CORS_ORIGIN whitelist", () => {
    process.env.CORS_ORIGIN = "https://app.example,https://t.me";
    process.env.NODE_ENV = "production";

    expect(buildCorsOriginOption()).toEqual(["https://app.example", "https://t.me"]);
  });

  it("does not allow arbitrary browser origins in production without CORS_ORIGIN", () => {
    delete process.env.CORS_ORIGIN;
    process.env.NODE_ENV = "production";

    const origin = buildCorsOriginOption();
    expect(typeof origin).toBe("function");

    let allowed: boolean | undefined;
    (origin as (value: string | undefined, cb: (err: Error | null, allow: string | boolean | RegExp | Array<string | boolean | RegExp>) => void) => void)(
      "https://evil.example",
      (_err, allow) => {
        allowed = Boolean(allow);
      },
    );

    expect(allowed).toBe(false);
  });
});
