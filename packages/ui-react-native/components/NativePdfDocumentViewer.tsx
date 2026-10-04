import React from "react";
import { Platform } from "react-native";
import { resolveNativePdfViewerImplementation } from "./nativePdfViewerMode";
import DedicatedAndroidPdfViewer from "./DedicatedAndroidPdfViewer";
import DedicatedIosPdfViewer from "./DedicatedIosPdfViewer";
import type { DocumentEngine } from "@papyrus-sdk/types";

export {
  getDedicatedAndroidPdfEngineId as getNativePdfEngineId,
} from "./DedicatedAndroidPdfViewer";

type NativePdfDocumentViewerProps = {
  engine: DocumentEngine;
  maxPageWidth?: number;
};

export default function NativePdfDocumentViewer({
  engine,
  maxPageWidth,
}: NativePdfDocumentViewerProps) {
  const implementation = resolveNativePdfViewerImplementation(
    Platform.OS
  );

  if (implementation === "android") {
    return (
      <DedicatedAndroidPdfViewer
        engine={engine}
        maxPageWidth={maxPageWidth}
      />
    );
  }

  if (implementation === "ios") {
    return <DedicatedIosPdfViewer engine={engine} maxPageWidth={maxPageWidth} />;
  }

  return null;
}
