import { describe, expect, it } from "vitest";

import { DEFAULT_ACCENT, chartAccent, contrast, onColor, readableOn, toOklch } from "./color";

describe("brand colour checks", () => {
  // Expected verdicts come from the dataviz validator (validate_palette.js).
  it.each([
    ["#2563EB", "light", true],
    ["#2563EB", "dark", true],
    ["#7C3AED", "light", true],
    ["#7C3AED", "dark", true],
    ["#0F766E", "light", false], // chroma 0.086 reads as gray
    ["#EAB308", "light", false], // L 0.795 outside the light band
    ["#EAB308", "dark", false],
    ["#1E3A8A", "light", false], // L 0.379 too dark
    ["#1E3A8A", "dark", false],
  ] as const)("chartAccent(%s, %s) passes=%s", (brand, mode, passes) => {
    expect(chartAccent(brand, mode)).toBe(passes ? brand : DEFAULT_ACCENT[mode]);
  });

  it("matches the validator's OKLCH measurements", () => {
    expect(toOklch("#0F766E").c).toBeCloseTo(0.086, 2);
    expect(toOklch("#EAB308").l).toBeCloseTo(0.795, 2);
    expect(toOklch("#1E3A8A").l).toBeCloseTo(0.379, 2);
  });

  it("picks readable text on filled brand colours", () => {
    expect(onColor("#2563EB")).toBe("#FFFFFF");
    expect(onColor("#FACC15")).toBe("#0B0B0B");
  });

  it("nudges link colours until they reach 4.5:1", () => {
    for (const [brand, mode] of [["#FACC15", "light"], ["#1E3A8A", "dark"], ["#7C3AED", "light"]] as const) {
      const surface = mode === "light" ? "#FCFCFB" : "#1A1A19";
      expect(contrast(readableOn(brand, mode), surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(readableOn("#2563EB", "light")).toBe("#2563EB");
  });

  it("rejects malformed input", () => {
    expect(chartAccent("red", "light")).toBe(DEFAULT_ACCENT.light);
  });
});
