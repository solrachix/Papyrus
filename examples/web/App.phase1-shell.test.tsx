import React from "react";
import renderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@papyrus-sdk/engine-pdfjs", () => ({
  PDFJSEngine: class {
    async load() {}
    getPageCount() {
      return 12;
    }
    getCurrentPage() {
      return 1;
    }
    goToPage() {}
    setZoom() {}
    getZoom() {
      return 1;
    }
    rotate() {}
    getRotation() {
      return 0;
    }
    async renderPage() {}
    async renderTextLayer() {}
    async getTextContent() {
      return [];
    }
    async getPageDimensions() {
      return { width: 800, height: 1200 };
    }
    async getOutline() {
      return [];
    }
    async getPageIndex() {
      return null;
    }
    destroy() {}
  },
}));

vi.mock("@papyrus-sdk/engine-epub", () => ({
  EPUBEngine: class {
    async load() {}
    getPageCount() {
      return 12;
    }
    getCurrentPage() {
      return 1;
    }
    goToPage() {}
    setZoom() {}
    getZoom() {
      return 1;
    }
    rotate() {}
    getRotation() {
      return 0;
    }
    async renderPage() {}
    async renderTextLayer() {}
    async getTextContent() {
      return [];
    }
    async getPageDimensions() {
      return { width: 800, height: 1200 };
    }
    async getOutline() {
      return [];
    }
    async getPageIndex() {
      return null;
    }
    destroy() {}
  },
}));

vi.mock("@papyrus-sdk/engine-text", () => ({
  TextEngine: class {
    async load() {}
    getPageCount() {
      return 12;
    }
    getCurrentPage() {
      return 1;
    }
    goToPage() {}
    setZoom() {}
    getZoom() {
      return 1;
    }
    rotate() {}
    getRotation() {
      return 0;
    }
    async renderPage() {}
    async renderTextLayer() {}
    async getTextContent() {
      return [];
    }
    async getPageDimensions() {
      return { width: 800, height: 1200 };
    }
    async getOutline() {
      return [];
    }
    async getPageIndex() {
      return null;
    }
    destroy() {}
  },
}));

vi.mock("@papyrus-sdk/ui-react", () => ({
  Topbar: () => <div data-testid="papyrus-topbar" />,
  SidebarLeft: () => <div data-testid="papyrus-sidebar-left" />,
  SidebarRight: () => <div data-testid="papyrus-sidebar-right" />,
  Viewer: () => <div data-testid="papyrus-viewer" />,
  ReadingShell: () => <div data-testid="papyrus-reading-shell" />,
}));

import App from "./App";

describe("web legacy reader wiring", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/render");
  });

  it("renders the legacy web layout instead of the reading shell", async () => {
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<App />);
      await Promise.resolve();
    });

    expect(() =>
      tree!.root.findByProps({ "data-testid": "papyrus-reading-shell" })
    ).toThrow();
    expect(
      tree!.root.findByProps({ "data-testid": "papyrus-topbar" })
    ).toBeTruthy();
    expect(
      tree!.root.findByProps({ "data-testid": "papyrus-sidebar-left" })
    ).toBeTruthy();
    expect(
      tree!.root.findByProps({ "data-testid": "papyrus-viewer" })
    ).toBeTruthy();
    expect(
      tree!.root.findByProps({ "data-testid": "papyrus-sidebar-right" })
    ).toBeTruthy();
  });
});
