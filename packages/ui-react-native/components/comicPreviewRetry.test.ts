import { describe, expect, it } from "vitest";

import {
  COMIC_PREVIEW_QUEUE_FULL_CODE,
  getComicPreviewWithRetry,
} from "./comicPreviewRetry";

function queueFullError(): Error & { code: string } {
  return Object.assign(new Error("preview queue full"), {
    code: COMIC_PREVIEW_QUEUE_FULL_CODE,
  });
}

describe("getComicPreviewWithRetry", () => {
  it("retries a saturated native queue until a preview is available", async () => {
    let attempts = 0;
    const delays: number[] = [];

    const result = await getComicPreviewWithRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw queueFullError();
        return "file:///thumbnail.jpg";
      },
      () => false,
      {
        baseDelayMs: 50,
        maxRetries: 4,
        wait: async (delayMs) => { delays.push(delayMs); },
      },
    );

    expect(result).toBe("file:///thumbnail.jpg");
    expect(attempts).toBe(3);
    expect(delays).toEqual([50, 100]);
  });

  it("does not retry a successful missing preview", async () => {
    let attempts = 0;
    const result = await getComicPreviewWithRetry(
      async () => { attempts += 1; return null; },
      () => false,
      { wait: async () => { throw new Error("unexpected wait"); } },
    );

    expect(result).toBeNull();
    expect(attempts).toBe(1);
  });

  it("stops retrying after the row is unmounted", async () => {
    let attempts = 0;
    let active = true;
    const result = await getComicPreviewWithRetry(
      async () => { attempts += 1; throw queueFullError(); },
      () => !active,
      {
        baseDelayMs: 50,
        maxRetries: 4,
        wait: async () => { active = false; },
      },
    );

    expect(result).toBeNull();
    expect(attempts).toBe(1);
  });

  it("does not retry permanent native failures", async () => {
    let attempts = 0;
    const result = await getComicPreviewWithRetry(
      async () => { attempts += 1; throw new Error("invalid page"); },
      () => false,
      { wait: async () => { throw new Error("unexpected wait"); } },
    );

    expect(result).toBeNull();
    expect(attempts).toBe(1);
  });
});
