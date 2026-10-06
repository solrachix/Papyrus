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
  onTextSelected?: (payload: { text: string; pageIndex: number }) => void;
  onDefineSelection?: (payload: { text: string; pageIndex: number }) => void;
  defineSelectionMode?: "selection" | "single-word";
};

export default function NativePdfDocumentViewer({
  engine,
  maxPageWidth,
  onTextSelected,
  onDefineSelection,
  defineSelectionMode,
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
    return (
      <DedicatedIosPdfViewer
        engine={engine}
        maxPageWidth={maxPageWidth}
        onTextSelected={onTextSelected}
        onDefineSelection={onDefineSelection}
        defineSelectionMode={defineSelectionMode}
      />
    );
  }

  return null;
}
