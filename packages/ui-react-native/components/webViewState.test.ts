import { describe, expect, it } from "vitest";
import { parseWebViewState } from "./webViewState";

describe("parseWebViewState", () => {
  it("extracts the current page from a runtime state message", () => {
    expect(
      parseWebViewState(
        JSON.stringify({
          type: "state",
          payload: { currentPage: 4, pageCount: 12 },
        })
      )
    ).toEqual({ currentPage: 4, pageCount: 12 });
  });

  it("ignores malformed and non-state messages", () => {
    expect(parseWebViewState("not-json")).toBeNull();
    expect(parseWebViewState(JSON.stringify({ type: "ready" }))).toBeNull();
    expect(
      parseWebViewState(
        JSON.stringify({ type: "state", payload: { currentPage: 0 } })
      )
    ).toBeNull();
  });
});
