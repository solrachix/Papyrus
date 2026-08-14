import { Archive } from "libarchive.js";
import workerUrl from "libarchive.js/dist/worker-bundle.js?url";
import { CBREngine } from "@papyrus-sdk/engine-cbr";

export const createDemoCbrEngine = (): CBREngine => {
  Archive.init({ workerUrl });
  return new CBREngine();
};
