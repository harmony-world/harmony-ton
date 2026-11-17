import { describe, expect, it } from "vitest";
import { donorStatusFor } from "../services/user-stats.js";

describe("donorStatusFor", () => {
  it("returns none for zero", () => {
    expect(donorStatusFor(0)).toBe("none");
  });

  it("returns sprout for small positive amount", () => {
    expect(donorStatusFor(1)).toBe("sprout");
    expect(donorStatusFor(49.99)).toBe("sprout");
  });

  it("returns helper at $50", () => {
    expect(donorStatusFor(50)).toBe("helper");
    expect(donorStatusFor(199.99)).toBe("helper");
  });

  it("returns benefactor at $200", () => {
    expect(donorStatusFor(200)).toBe("benefactor");
    expect(donorStatusFor(499.99)).toBe("benefactor");
  });

  it("returns patron at $500", () => {
    expect(donorStatusFor(500)).toBe("patron");
    expect(donorStatusFor(999.99)).toBe("patron");
  });

  it("returns guardian at $1000+", () => {
    expect(donorStatusFor(1000)).toBe("guardian");
    expect(donorStatusFor(50000)).toBe("guardian");
  });
});
