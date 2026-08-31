// @vitest-environment node

import { File } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("File", File);

const archiveApi = vi.hoisted(() => ({
  init: vi.fn(),
  open: vi.fn(),
}));

vi.mock("libarchive.js", () => ({ Archive: archiveApi }));

import { CBREngine } from "./index";

class TestableCBREngine extends CBREngine {
  openArchiveForTest(source: Blob) {
    return this.openArchive(source);
  }
}

const createArchiveSource = () =>
  new Blob([new Uint8Array([0x52, 0x61, 0x72, 0x21])]);

const createFiles = () => [
  {
    path: "chapter/page-10.png",
    file: {
      name: "page-10.png",
      size: 4,
      extract: vi.fn(async () => new File([new Uint8Array([1])], "page-10.png")),
    },
  },
  {
    file: {
      name: "page-2.jpg",
      size: 4,
      extract: vi.fn(async () => new File([new Uint8Array([2])], "page-2.jpg")),
    },
  },
  {
    path: "ComicInfo.xml",
    file: {
      name: "ComicInfo.xml",
      size: 4,
      extract: vi.fn(async () => new File([new Uint8Array([3])], "ComicInfo.xml")),
    },
  },
];

describe("CBREngine", () => {
  beforeEach(() => {
    archiveApi.init.mockReset();
    archiveApi.open.mockReset();
  });

  it("initializes libarchive and preserves archive paths as entry names", async () => {
    const close = vi.fn();
    archiveApi.open.mockResolvedValue({
      getFilesArray: vi.fn(async () => createFiles()),
      close,
    });
    const engine = new TestableCBREngine({
      workerUrl: "/assets/worker-bundle.js",
    });

    const archive = await engine.openArchiveForTest(createArchiveSource());

    expect(archiveApi.init).toHaveBeenCalledWith({
      workerUrl: "/assets/worker-bundle.js",
    });
    expect(archive.entries.map((entry) => entry.name)).toEqual([
      "chapter/page-10.png",
      "page-2.jpg",
      "ComicInfo.xml",
    ]);
    await archive.dispose?.();
    expect(close).toHaveBeenCalledOnce();
  });

  it("filters image entries and closes the archive when destroyed", async () => {
    const close = vi.fn();
    archiveApi.open.mockResolvedValue({
      getFilesArray: vi.fn(async () => createFiles()),
      close,
    });
    const engine = new CBREngine();

    await engine.load(createArchiveSource());

    expect(engine.getPageCount()).toBe(2);
    engine.destroy();
    expect(close).toHaveBeenCalledOnce();
  });
});
