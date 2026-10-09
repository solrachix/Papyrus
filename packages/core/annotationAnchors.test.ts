import {describe, expect, it} from "vitest";
import {resolveTextAnchorRange, validateAnnotationAnchor, getAnnotationNote, getAnnotationMarkup, createContextualAnnotation,adaptLegacyAnnotation,getAnnotationEditPatch} from "./annotationAnchors";

describe("contextual annotation anchors", () => {
  it("keeps UTF16 offsets including surrogate pairs without normalizing content", () => {
    const text = "A😀 e\u0301\r\nfrase final";
    const anchor = {kind: "text-range", version: 1, start: 1, end: 3, encoding: "utf-16", quote: "😀", prefix: "A", suffix: " e\u0301"} as const;
    expect(resolveTextAnchorRange(text, anchor)).toEqual({start: 1, end: 3});
  });
  it("recovers only a unique contextual match and never guesses an ambiguous quote", () => {
    const anchor = {kind: "text-range", version: 1, start: 0, end: 3, encoding: "utf-16", quote: "sol", prefix: "", suffix: ""} as const;
    expect(resolveTextAnchorRange("novo sol", anchor)).toEqual({start: 5, end: 8});
    expect(resolveTextAnchorRange("sol e sol", {...anchor, start: 99, end: 102})).toBeNull();
    expect(resolveTextAnchorRange("sol e sol", {...anchor, start: 99, end: 102, prefix: "e "})).toEqual({start: 6, end: 9});
  });
  it("rejects invalid geometry, offsets and document identity", () => {
    expect(validateAnnotationAnchor({kind: "text-range", version: 1, start: -1, end: 2, encoding: "utf-16", quote: "hi"})).toBe(false);
    expect(validateAnnotationAnchor({kind: "epub-cfi", version: 1, cfiRange: "javascript:bad", href: "x", quote: "hi"})).toBe(false);
    expect(resolveTextAnchorRange("hi", {kind: "text-range", version: 1, start: 0, end: 2, encoding: "utf-16", quote: "hi", documentId: "other"}, "current")).toBeNull();
  });
  it("keeps note and markup under one ID and reads legacy notes", () => {
    const annotation = createContextualAnnotation({id: "one", anchor: {kind: "text-range", version: 1, start: 0, end: 4, encoding: "utf-16", quote: "text"}, pageIndex: 0, style: "underline", color: "#ff0000", note: "my note", now: 10});
    expect(annotation.id).toBe("one");
    expect(annotation.content).toBe("text");
    expect(getAnnotationNote(annotation)).toBe("my note");
    expect(getAnnotationMarkup(annotation)).toBe("underline");
    expect(getAnnotationNote({...annotation, noteContent: undefined, content: "old note"})).toBe("old note");
  });
});

it("preserves quote when adding a note to legacy markup",()=>{const old={id:"a",type:"highlight" as const,pageIndex:0,rect:{x:.1,y:.2,width:.3,height:.1},color:"#fbbf24",content:"quote",createdAt:1};const updated={...old,...getAnnotationEditPatch(old,"body","underline","#60a5fa")};expect(updated.content).toBe("quote");expect(getAnnotationNote(updated)).toBe("body");expect(adaptLegacyAnnotation(old,"pdf","file").anchor?.kind).toBe("pdf-geometry");expect(adaptLegacyAnnotation(old,"epub","file").anchor).toBeUndefined();});
it('rejects half an emoji even when persisted quote matches that half',()=>{expect(resolveTextAnchorRange('A😀B',{version:1,kind:'text-range',encoding:'utf-16',start:1,end:2,quote:'\uD83D'})).toBeNull();});
