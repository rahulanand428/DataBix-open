import { describe, expect, it } from "vitest";

import { formatBytes, formatCompact, formatDate, formatDuration, formatRelative } from "./format";

describe("formatting", () => {
  it("compacts only from ten thousand up", () => {
    expect(formatCompact(1284)).toMatch(/1.284/);
    expect(formatCompact(12_900)).toMatch(/12.9K/);
    expect(formatCompact(null)).toBe("—");
  });

  it("formats ISO dates in UTC so they never shift a day", () => {
    expect(formatDate("2026-04-01")).toMatch(/2026/);
    expect(formatDate("2026-04-01")).toMatch(/1/);
  });

  it("formats sizes, durations and relative times", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toMatch(/2 KB/);
    expect(formatDuration(450)).toBe("450 ms");
    expect(formatRelative(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5 min ago");
    expect(formatRelative(null)).toBe("never");
  });
});
