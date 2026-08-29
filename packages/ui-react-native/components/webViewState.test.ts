import { describe, expect, it } from "vitest";
import { parseWebViewInteraction, parseWebViewState } from "./webViewState";

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

describe("parseWebViewInteraction", () => {
  it("extracts continuous WebView scroll offsets", () => {
    expect(
      parseWebViewInteraction(
        JSON.stringify({
          type: "event",
          name: "VIEWER_SCROLL",
          payload: { offsetY: 240 },
        })
      )
    ).toEqual({ kind: "scroll", offsetY: 240 });
  });

  it("recognizes a content tap and ignores unrelated events", () => {
    expect(
      parseWebViewInteraction(
        JSON.stringify({ type: "event", name: "VIEWER_TAP", payload: {} })
      )
    ).toEqual({ kind: "tap" });
    expect(parseWebViewInteraction(JSON.stringify({ type: "ready" }))).toBeNull();
  });
});
