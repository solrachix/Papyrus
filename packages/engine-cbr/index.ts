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
  private readonly workerUrl?: string | URL;

  constructor(options: CBREngineOptions = {}) {
    super(options);
    this.workerUrl = options.workerUrl;
  }

  protected async openArchive(source: DocumentSource): Promise<ComicArchive> {
    const blob = await resolveComicSourceToBlob(source);
    const file = new File([blob], "comic.cbr", {
      type: "application/vnd.comicbook-rar",
    });
    Archive.init({ workerUrl: this.workerUrl });
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

export type CBREngineOptions = ComicEngineOptions & {
  /** URL emitted/copied by the application for libarchive.js' web worker. */
  workerUrl?: string | URL;
};

export { ComicEngine } from "@papyrus-sdk/engine-comic-core";
