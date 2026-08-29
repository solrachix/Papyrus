import { BlobReader, BlobWriter, ZipReader, type FileEntry } from "@zip.js/zip.js";
import {
  ComicArchive,
  comicMimeTypeForName,
  resolveComicSourceToBlob,
} from "@papyrus-sdk/engine-comic-core";
import { DocumentSource } from "@papyrus-sdk/types";

export async function openZipComicArchive(
  source: DocumentSource
): Promise<ComicArchive> {
  const blob = await resolveComicSourceToBlob(source);
  const reader = new ZipReader(new BlobReader(blob));

  try {
    const entries = await reader.getEntries();
    const files = entries.filter(
      (entry): entry is FileEntry => !entry.directory
    );

    return {
      entries: files.map((entry) => ({
        name: entry.filename,
        size: entry.uncompressedSize ?? 0,
        read: async () =>
          entry.getData(new BlobWriter(comicMimeTypeForName(entry.filename))),
      })),
      dispose: () => reader.close(),
    };
  } catch (error) {
    await reader.close();
    throw error;
  }
}
