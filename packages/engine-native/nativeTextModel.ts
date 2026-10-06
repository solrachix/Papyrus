export type TextRange = { start: number; end: number };

type NormalizedText = {
  value: string;
  sourceRanges: TextRange[];
};

const decodeWith = (bytes: Uint8Array, encoding: string): string => {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid text encoding (${encoding}): ${message}`);
  }
};

export const decodeTextBytes = (input: Uint8Array): string => {
  const bytes = input;
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0 && bytes[3] === 0) ||
      (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff))
  ) {
    throw new Error("Invalid text encoding: UTF-32 is not supported");
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decodeWith(bytes.subarray(2), "utf-16le");
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = new Uint8Array(bytes.length - 2);
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1];
      swapped[index - 1] = bytes[index];
    }
    if ((bytes.length - 2) % 2 !== 0) {
      throw new Error("Invalid text encoding: incomplete UTF-16BE code unit");
    }
    return decodeWith(swapped, "utf-16le");
  }

  const utf8 = bytes.length >= 3 &&
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
    ? bytes.subarray(3)
    : bytes;
  return decodeWith(utf8, "utf-8");
};

const isMark = (value: string): boolean => /\p{M}/u.test(value);

const normalizeWithSourceRanges = (source: string): NormalizedText => {
  let value = "";
  const sourceRanges: TextRange[] = [];
  let pendingSpace: TextRange | null = null;

  for (let offset = 0; offset < source.length;) {
    const start = offset;
    let codePoint = source.codePointAt(offset);
    if (codePoint === undefined) break;
    let cluster = String.fromCodePoint(codePoint);
    offset += cluster.length;

    while (offset < source.length) {
      codePoint = source.codePointAt(offset);
      if (codePoint === undefined) break;
      const next = String.fromCodePoint(codePoint);
      if (!isMark(next)) break;
      cluster += next;
      offset += next.length;
    }

    const end = offset;
    const normalized = cluster
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase();

    if (!normalized) continue;
    if (/^\s+$/u.test(normalized)) {
      if (pendingSpace) pendingSpace.end = end;
      else pendingSpace = { start, end };
      continue;
    }

    if (pendingSpace && value.length > 0) {
      value += " ";
      sourceRanges.push(pendingSpace);
    }
    pendingSpace = null;

    value += normalized;
    for (let index = 0; index < normalized.length; index += 1) {
      sourceRanges.push({ start, end });
    }
  }

  if (pendingSpace && value.length > 0) {
    value += " ";
    sourceRanges.push(pendingSpace);
  }

  return { value, sourceRanges };
};

const normalizeQuery = (query: string): string =>
  query
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();

export const findTextRanges = (source: string, query: string): TextRange[] => {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  const normalizedSource = normalizeWithSourceRanges(source);
  const matches: TextRange[] = [];
  let matchAt = normalizedSource.value.indexOf(normalizedQuery);
  while (matchAt !== -1) {
    const first = normalizedSource.sourceRanges[matchAt];
    const last = normalizedSource.sourceRanges[
      matchAt + normalizedQuery.length - 1
    ];
    if (first && last) {
      matches.push({ start: first.start, end: last.end });
    }
    matchAt = normalizedSource.value.indexOf(
      normalizedQuery,
      matchAt + 1
    );
  }
  return matches;
};

export const clampTextOffset = (offset: number, textLength: number): number => {
  const max = Math.max(0, Math.floor(Number.isFinite(textLength) ? textLength : 0));
  return Math.max(0, Math.min(max, Math.floor(Number.isFinite(offset) ? offset : 0)));
};

export const textOffsetProgress = (offset: number, textLength: number): number =>
  textLength > 0 ? clampTextOffset(offset, textLength) / textLength : 0;
