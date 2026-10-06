import type { ComicReadingDirection } from "@papyrus-sdk/types";

export type NativeComicEntry = { name: string; size: number };

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif"]);

const compareNatural = (left: string, right: string): number => {
  const a = left.toLocaleLowerCase("en-US");
  const b = right.toLocaleLowerCase("en-US");
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (/\d/.test(a[i]) && /\d/.test(b[j])) {
      const startA = i;
      const startB = j;
      let endA = i;
      let endB = j;
      while (endA < a.length && /\d/.test(a[endA])) endA += 1;
      while (endB < b.length && /\d/.test(b[endB])) endB += 1;
      const rawA = a.slice(startA, endA);
      const rawB = b.slice(startB, endB);
      const numberA = rawA.replace(/^0+/, "") || "0";
      const numberB = rawB.replace(/^0+/, "") || "0";
      if (numberA.length !== numberB.length) return numberA.length - numberB.length;
      const numberDelta = numberA.localeCompare(numberB);
      if (numberDelta !== 0) return numberDelta;
      const widthDelta = rawA.length - rawB.length;
      if (widthDelta !== 0) return widthDelta;
      i = endA;
      j = endB;
      continue;
    }
    const delta = a.charCodeAt(i) - b.charCodeAt(j);
    if (delta !== 0) return delta;
    i += 1;
    j += 1;
  }
  return a.length - b.length || left.localeCompare(right);
};

export const filterAndSortNativeComicEntries = (
  entries: NativeComicEntry[],
  supportsWebP: boolean,
): NativeComicEntry[] => {
  const extensions = new Set(IMAGE_EXTENSIONS);
  if (supportsWebP) extensions.add("webp");
  return entries
    .filter((entry) => {
      const normalized = entry.name.replaceAll("\\", "/");
      const parts = normalized.split("/");
      const fileName = parts.at(-1) ?? "";
      const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
      return (
        fileName.length > 0 &&
        !parts.some((part) => part.startsWith(".")) &&
        !parts.some((part) => part.toLowerCase() === "__macosx") &&
        entry.size >= 0 &&
        entry.size <= 64 * 1024 * 1024 &&
        extensions.has(extension)
      );
    })
    .sort((left, right) => compareNatural(
      left.name.replaceAll("\\", "/"),
      right.name.replaceAll("\\", "/"),
    ));
};

export const logicalToVisualComicIndex = (
  logicalIndex: number,
  pageCount: number,
  direction: ComicReadingDirection,
): number => {
  if (pageCount <= 0) return 0;
  const safeIndex = Math.max(0, Math.min(Math.max(0, pageCount - 1), Math.floor(logicalIndex)));
  return direction === "rtl" ? pageCount - 1 - safeIndex : safeIndex;
};

type CacheEntry<T> = { value: T; bytes: number; used: number };

/** Small, byte-bounded LRU policy shared by tests and native view adapters. */
export class NativeComicLruCache<T> {
  private readonly entries = new Map<number, CacheEntry<T>>();
  private usedClock = 0;
  private bytes = 0;

  constructor(readonly byteBudget = 64 * 1024 * 1024) {}

  get sizeBytes(): number { return this.bytes; }
  get size(): number { return this.entries.size; }

  get(index: number): T | undefined {
    const entry = this.entries.get(index);
    if (!entry) return undefined;
    entry.used = ++this.usedClock;
    return entry.value;
  }

  set(index: number, value: T, bytes: number): void {
    const safeBytes = Math.max(0, Math.floor(Number.isFinite(bytes) ? bytes : 0));
    const previous = this.entries.get(index);
    if (previous) this.bytes -= previous.bytes;
    if (safeBytes > this.byteBudget) {
      this.entries.delete(index);
      return;
    }
    this.entries.set(index, { value, bytes: safeBytes, used: ++this.usedClock });
    this.bytes += safeBytes;
    this.evict();
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
    this.usedClock = 0;
  }

  private evict(): void {
    while (this.bytes > this.byteBudget) {
      let oldestIndex: number | undefined;
      let oldestUsed = Number.POSITIVE_INFINITY;
      for (const [index, entry] of this.entries) {
        if (entry.used < oldestUsed) {
          oldestIndex = index;
          oldestUsed = entry.used;
        }
      }
      if (oldestIndex === undefined) return;
      const removed = this.entries.get(oldestIndex);
      this.entries.delete(oldestIndex);
      if (removed) this.bytes -= removed.bytes;
    }
  }
}
