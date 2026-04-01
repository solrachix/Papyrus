import { describe, expect, it } from "vitest";
import { isSidebarBoundDestination } from "./mobileShell";

describe("ReadingShell sidebar-bound destinations", () => {
  it("keeps search out of the sidebar-bound destinations", () => {
    expect(isSidebarBoundDestination("search")).toBe(false);
  });

  ["pages", "contents", "progress", "notes"].forEach((destination) => {
    it(`treats ${destination} as sidebar-bound`, () => {
      expect(isSidebarBoundDestination(destination as any)).toBe(true);
    });
  });
});
