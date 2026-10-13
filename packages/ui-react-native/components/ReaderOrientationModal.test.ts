import { describe, expect, it, vi } from "vitest";
import { ReaderOrientationModal } from "./ReaderOrientationModal";

vi.mock("react-native", async () => {
  const React = await import("react");
  return {
    Modal: (props: Record<string, unknown>) => React.createElement("native-modal", props),
  };
});

describe("ReaderOrientationModal", () => {
  it("allows reader sheets and editors to stay in portrait or landscape", () => {
    const element = ReaderOrientationModal({
      visible: true,
      transparent: true,
      onRequestClose: () => undefined,
      children: null,
    });

    expect(element.props.supportedOrientations).toEqual([
      "portrait",
      "portrait-upside-down",
      "landscape-left",
      "landscape-right",
    ]);
  });
});
