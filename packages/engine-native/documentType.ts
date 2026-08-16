import type { DocumentSource, DocumentType } from "@papyrus-sdk/types";

const parseDataUri = (
  value: string
): { mime: string; isBase64: boolean; data: string } | null => {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(value);
  if (!match) return null;
  return {
    mime: match[1] ?? "",
    isBase64: Boolean(match[2]),
    data: match[3] ?? "",
  };
};

const typeFromExtension = (value: string): DocumentType | null => {
  const clean = value.split("?")[0].split("#")[0].toLowerCase();
  const extension = clean.includes(".")
    ? clean.split(".").pop()
    : undefined;

  if (extension === "epub") return "epub";
  if (extension === "txt") return "text";
  if (extension === "pdf") return "pdf";
  if (extension === "cbz" || extension === "cbr") return "comic";
  return null;
};

export const inferComicFormat = (source: DocumentSource): "cbz" | "cbr" => {
  const candidate =
    typeof source === "string"
      ? source
      : typeof source === "object" && source !== null && "uri" in source
      ? source.uri
      : "";
  const dataUri = parseDataUri(candidate);
  const mime = dataUri?.mime.toLowerCase() ?? "";
  if (mime.includes("rar") || /\.cbr(?:$|[?#])/i.test(candidate)) {
    return "cbr";
  }
  return "cbz";
};

export const inferDocumentType = (source: DocumentSource): DocumentType => {
  if (typeof source === "string") {
    const dataUri = parseDataUri(source);
    if (dataUri?.mime) {
      const mime = dataUri.mime.toLowerCase();
      if (mime.includes("epub")) return "epub";
      if (
        mime.includes("comicbook") ||
        mime.includes("zip") ||
        mime.includes("rar")
      ) {
        return "comic";
      }
      if (mime.includes("text")) return "text";
      if (mime.includes("pdf")) return "pdf";
    }

    return typeFromExtension(source) ?? "pdf";
  }

  if (typeof source === "object" && source !== null && "uri" in source) {
    return typeFromExtension(source.uri) ?? "pdf";
  }

  return "pdf";
};
