import {
  ComicArchive,
  ComicEngine,
  ComicEngineOptions,
} from "@papyrus-sdk/engine-comic-core";
import { DocumentSource } from "@papyrus-sdk/types";
import { openZipComicArchive } from "./zipArchive";

export class CBZEngine extends ComicEngine {
  constructor(options?: ComicEngineOptions) {
    super(options);
  }

  protected async openArchive(source: DocumentSource): Promise<ComicArchive> {
    return openZipComicArchive(source);
  }
}

export { ComicEngine } from "@papyrus-sdk/engine-comic-core";
export { openZipComicArchive } from "./zipArchive";
