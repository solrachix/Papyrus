import type {Annotation, AnnotationAnchor, AnnotationMarkupStyle} from "@papyrus-sdk/types";

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const rect = (value: any) => value && [value.x, value.y, value.width, value.height].every((n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) && value.x + value.width <= 1.000001 && value.y + value.height <= 1.000001;
export function validateAnnotationAnchor(value: unknown): value is AnnotationAnchor {
  if (!value || typeof value !== "object") return false;
  const a = value as any;
  if (a.version !== 1 || typeof a.quote !== "string" || a.quote.length > 100000) return false;
  for (const key of ["documentId", "documentVersion", "prefix", "suffix"]) if (a[key] !== undefined && (typeof a[key] !== "string" || a[key].length > 4096)) return false;
  if (a.kind === "text-range") return a.encoding === "utf-16" && integer(a.start) && integer(a.end) && a.end > a.start;
  if (a.kind === "epub-cfi") return typeof a.cfiRange === "string" && a.cfiRange.length <= 4096 && /^epubcfi\([^\n<>]+\)$/.test(a.cfiRange) && typeof a.href === "string" && a.href.length <= 4096 && !/^(javascript|data):/i.test(a.href) && (a.spineIndex === undefined || integer(a.spineIndex));
  if (a.kind === "pdf-geometry") return integer(a.pageIndex) && Array.isArray(a.rects) && a.rects.length > 0 && a.rects.length <= 2000 && a.rects.every(rect);
  return false;
}

const utf16Boundary = (text:string,offset:number) => !(offset>0 && offset<text.length && /[\uD800-\uDBFF]/.test(text[offset-1]) && /[\uDC00-\uDFFF]/.test(text[offset]));
/** Exact half-open UTF16 range first; recovery must be unique and contextual. */
export function resolveTextAnchorRange(text: string, anchor: AnnotationAnchor, documentId?: string): {start: number; end: number} | null {
  if (!validateAnnotationAnchor(anchor) || anchor.kind !== "text-range" || (documentId && anchor.documentId && documentId !== anchor.documentId)) return null;
  if (!anchor.quote) return null;
  if (anchor.end <= text.length && utf16Boundary(text,anchor.start) && utf16Boundary(text,anchor.end) && text.slice(anchor.start, anchor.end) === anchor.quote) return {start: anchor.start, end: anchor.end};
  let result: {start: number; end: number} | null = null;
  let start = text.indexOf(anchor.quote);
  while (start >= 0) {
    const end = start + anchor.quote.length;
    if (utf16Boundary(text,start) && utf16Boundary(text,end) && (!anchor.prefix || text.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix) && (!anchor.suffix || text.slice(end, end + anchor.suffix.length) === anchor.suffix)) {
      if (result) return null;
      result = {start, end};
    }
    start = text.indexOf(anchor.quote, start + 1);
  }
  return result;
}
export function getAnnotationNote(annotation: Annotation): string {
  return annotation.noteContent ?? ((annotation.type === "comment" || annotation.type === "text") ? annotation.content ?? "" : "");
}
export function getAnnotationMarkup(annotation: Annotation): AnnotationMarkupStyle {
  return annotation.markupStyle ?? (["highlight", "underline", "strikeout", "squiggly"].includes(annotation.type) ? annotation.type as AnnotationMarkupStyle : "none");
}
export function getAnnotationQuote(annotation: Annotation): string {
  return annotation.anchor?.quote ?? ((annotation.type !== "comment" && annotation.type !== "text") ? annotation.content ?? "" : "");
}
export function createContextualAnnotation(input: {id: string; anchor: AnnotationAnchor; pageIndex: number; style: AnnotationMarkupStyle; color: string; opacity?: number; note?: string; now?: number}): Annotation {
  if (!validateAnnotationAnchor(input.anchor)) throw new Error("Invalid annotation anchor");
  if (!input.id || input.id.length > 256 || !Number.isSafeInteger(input.pageIndex) || input.pageIndex < 0 || !["highlight","underline","strikeout","squiggly","none"].includes(input.style) || (input.opacity !== undefined && (!Number.isFinite(input.opacity) || input.opacity < 0 || input.opacity > 1)) || (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 50000))) throw new Error("Invalid annotation fields");
  const hasNote = input.note !== undefined;
  const rects = input.anchor.kind === "pdf-geometry" ? input.anchor.rects : [];
  const x = rects.length ? Math.min(...rects.map(r => r.x)) : 0;
  const y = rects.length ? Math.min(...rects.map(r => r.y)) : 0;
  const bounds = {x, y, width: rects.length ? Math.max(...rects.map(r => r.x+r.width))-x : 0, height: rects.length ? Math.max(...rects.map(r => r.y+r.height))-y : 0};
  return {id: input.id, type: hasNote ? "comment" : input.style === "none" ? "comment" : input.style, pageIndex: input.pageIndex,
    rect: bounds, anchor: input.anchor,
    textRange: input.anchor.kind === "text-range" ? {start: input.anchor.start, end: input.anchor.end} : undefined,
    rects: input.anchor.kind === "pdf-geometry" ? input.anchor.rects : undefined,
    markupStyle: input.style, noteContent: input.note, content: input.anchor.quote,
    color: input.color, opacity: input.opacity ?? 0.35, createdAt: input.now ?? Date.now()};
}

/** Legacy geometry/ranges are adapted only under a confirmed document format. */
export function adaptLegacyAnnotation(annotation: Annotation, format: 'pdf'|'text'|'epub'|'comic', documentId?: string): Annotation {
  if (annotation.anchor) return annotation;
  const quote = getAnnotationQuote(annotation);
  let anchor: AnnotationAnchor | undefined;
  if (format === 'pdf' && annotation.type !== 'ink') {
    const rects = annotation.rects?.length ? annotation.rects : [annotation.rect];
    const candidate = {version:1 as const,kind:'pdf-geometry' as const,pageIndex:annotation.pageIndex,rects,quote,documentId};
    if(validateAnnotationAnchor(candidate))anchor=candidate;
  }
  if(format==='text' && annotation.textRange && quote){
    const candidate={version:1 as const,kind:'text-range' as const,encoding:'utf-16' as const,...annotation.textRange,quote,documentId};
    if(validateAnnotationAnchor(candidate))anchor=candidate;
  }
  return anchor ? {...annotation,anchor} : annotation;
}
export function getAnnotationEditPatch(annotation:Annotation,note:string,style:AnnotationMarkupStyle,color:string):Partial<Annotation> {
  // content remains the original quote for legacy markup; old note bodies remain readable.
  return {noteContent:note,markupStyle:style,color,...(!annotation.anchor && (annotation.type==='comment'||annotation.type==='text')?{content:note}:{})};
}
