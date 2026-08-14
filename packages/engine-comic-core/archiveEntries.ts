export type ComicArchiveEntry = {
  name: string;
  size: number;
  read(): Promise<Blob>;
};

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "svg",
  "webp",
]);

const isImageEntry = (entry: ComicArchiveEntry): boolean => {
  const normalizedName = entry.name.replaceAll("\\", "/");
  const fileName = normalizedName.split("/").pop() ?? "";
  if (!fileName || fileName.startsWith(".")) return false;

  const extension = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : undefined;
  return extension ? IMAGE_EXTENSIONS.has(extension) : false;
};

const naturalCompare = (left: string, right: string): number =>
  left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });

export const filterAndSortComicEntries = (
  entries: ComicArchiveEntry[]
): ComicArchiveEntry[] =>
  entries.filter(isImageEntry).sort((left, right) => {
    const normalizedLeft = left.name.replaceAll("\\", "/");
    const normalizedRight = right.name.replaceAll("\\", "/");
    return naturalCompare(normalizedLeft, normalizedRight);
  });
