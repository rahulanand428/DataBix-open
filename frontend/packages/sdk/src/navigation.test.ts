import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./navigation";

const ORIGIN = "https://databix.example";

describe("safeRedirectPath", () => {
  it.each([
    ["/explorer?symbol=ABB", "/explorer?symbol=ABB"],
    ["/symbols/M%26M#chart", "/symbols/M%26M#chart"],
  ])("keeps same-origin path %s", (value, expected) => {
    expect(safeRedirectPath(value, ORIGIN)).toBe(expected);
  });

  it.each([
    null,
    "",
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "/%09/evil.example",
    "/%0a/evil.example",
    "/%2F/evil.example",
    "/%5Cevil.example",
    "\t//evil.example",
    "javascript:alert(1)",
    "/login?next=/overview",
  ])("rejects %s", (value) => {
    expect(safeRedirectPath(value, ORIGIN)).toBe("/overview");
  });
});
