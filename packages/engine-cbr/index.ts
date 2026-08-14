import { Archive } from "libarchive.js";

import {
  ComicArchive,
  ComicEngine,
  ComicEngineOptions,
  comicMimeTypeForName,
  resolveComicSourceToBlob,
} from "@papyrus-sdk/engine-comic-core";
import { DocumentSource } from "@papyrus-sdk/types";

type CbrFile = {
  file: {
    name: string;
    size: number;
    extract(): Promise<File>;
  };
  path?: string;
};

export class CBREngine extends ComicEngine {
  constructor(options?: ComicEngineOptions) {
    super(options);
  }

  protected async openArchive(source: DocumentSource): Promise<ComicArchive> {
    const blob = await resolveComicSourceToBlob(source);
    const file = new File([blob], "comic.cbr", {
      type: "application/vnd.comicbook-rar",
    });
    const archive = await Archive.open(file);

    try {
      const files = (await archive.getFilesArray()) as CbrFile[];
      const entries = files.map(({ file: compressedFile, path }) => ({
        name: path || compressedFile.name,
        size: compressedFile.size,
        read: async () => {
          const extracted = await compressedFile.extract();
          return new Blob([await extracted.arrayBuffer()], {
            type: comicMimeTypeForName(path || compressedFile.name),
          });
        },
      }));

      return {
        entries,
        dispose: () => archive.close(),
      };
    } catch (error) {
      await archive.close();
      throw error;
    }
  }
}

export { ComicEngine } from "@papyrus-sdk/engine-comic-core";
