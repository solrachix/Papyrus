import { describe, expect, it } from "vitest";
import {
  isComicImageName,
  sortComicPageNames,
} from "./comicRuntime";

describe("mobile comic runtime helpers", () => {
  it("keeps only supported comic image entries", () => {
    expect(isComicImageName("pages/001.jpg")).toBe(true);
    expect(isComicImageName("pages/002.webp")).toBe(true);
    expect(isComicImageName("pages/readme.txt")).toBe(false);
    expect(isComicImageName("pages/")).toBe(false);
  });

  it("sorts page names naturally", () => {
    expect(
      sortComicPageNames(["page-10.jpg", "page-2.jpg", "page-1.jpg"])
    ).toEqual(["page-1.jpg", "page-2.jpg", "page-10.jpg"]);
  });
});
