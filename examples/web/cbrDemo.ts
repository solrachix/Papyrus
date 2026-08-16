import workerUrl from "libarchive.js/dist/worker-bundle.js?url";
import { CBREngine } from "@papyrus-sdk/engine-cbr";

export const createDemoCbrEngine = (): CBREngine => {
  return new CBREngine({ workerUrl });
};
