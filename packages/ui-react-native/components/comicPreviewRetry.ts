export const COMIC_PREVIEW_QUEUE_FULL_CODE = "E_COMIC_PREVIEW_QUEUE_FULL";

type ComicPreviewRetryOptions = {
  baseDelayMs?: number;
  maxRetries?: number;
  wait?: (delayMs: number) => Promise<void>;
};

const defaultWait = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

function isQueueFullError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === COMIC_PREVIEW_QUEUE_FULL_CODE
  );
}

export async function getComicPreviewWithRetry(
  request: () => Promise<string | null>,
  isCancelled: () => boolean,
  options: ComicPreviewRetryOptions = {},
): Promise<string | null> {
  const baseDelayMs = Math.max(1, options.baseDelayMs ?? 150);
  const maxRetries = Math.max(0, options.maxRetries ?? 12);
  const wait = options.wait ?? defaultWait;

  for (let retry = 0; ; retry += 1) {
    if (isCancelled()) return null;
    try {
      return await request();
    } catch (error) {
      if (isCancelled() || !isQueueFullError(error) || retry >= maxRetries) {
        return null;
      }
      await wait(Math.min(baseDelayMs * 2 ** retry, 1200));
    }
  }
}
