import {describe, expect, it} from "vitest";
import {resolveTextAnchorRange, validateAnnotationAnchor, validateEpubInkData, getAnnotationNote, getAnnotationMarkup, createContextualAnnotation,adaptLegacyAnnotation,getAnnotationEditPatch} from "./annotationAnchors";

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

describe('EPUB ink sidecar compatibility',()=>{
 const cfi='epubcfi(/6/2!/4/2:0)';
 const data={version:1,kind:'epub-ink',documentId:'edition-1',segments:[{href:'chapter.xhtml',spineIndex:0,points:[{cfiRange:cfi,quote:'a',x:0.2,y:0.1},{cfiRange:'epubcfi(/6/2!/4/2:1)',quote:'b',x:0.5,y:-0.1}]}]};
 it('validates bounded per-glyph segments',()=>{
  expect(validateEpubInkData(data)).toBe(true);
  expect(validateEpubInkData({...data,preset:'highlight'})).toBe(true);
  expect(validateEpubInkData({...data,preset:'eraser'})).toBe(false);
  expect(validateEpubInkData({...data,segments:[{...data.segments[0],href:'javascript:alert(1)'}]})).toBe(false);
  expect(validateEpubInkData({...data,segments:[{...data.segments[0],points:[{...data.segments[0].points[0],cfiRange:'bad'},data.segments[0].points[1]]}]})).toBe(false);
  expect(validateEpubInkData({...data,segments:[{...data.segments[0],points:[{...data.segments[0].points[0],x:Infinity},data.segments[0].points[1]]}]})).toBe(false);
  expect(validateEpubInkData({...data,segments:[{...data.segments[0],points:[{...data.segments[0].points[0],x:4},data.segments[0].points[1]]}]})).toBe(false);
 });
 it('caps total points and preserves EPUB ink through generic JSON and old ink fields',()=>{
  const points=Array.from({length:513},(_,index)=>({cfiRange:cfi,quote:'a',x:0,y:0}));
  expect(validateEpubInkData({...data,segments:[{href:'chapter.xhtml',points}]})).toBe(false);
  const annotation={id:'ink-1',type:'ink' as const,pageIndex:1,rect:{x:0.1,y:0.2,width:0.3,height:0.1},path:[{x:0.1,y:0.2},{x:0.4,y:0.3}],color:'#2563eb',createdAt:1,anchor:{version:1,kind:'epub-cfi' as const,cfiRange:cfi,href:'chapter.xhtml',quote:'a',documentId:'edition-1'},epubInk:data};
  const restored=JSON.parse(JSON.stringify(annotation));
  expect(validateAnnotationAnchor(restored.anchor)).toBe(true);
  expect(validateEpubInkData(restored.epubInk)).toBe(true);
  expect(restored.epubInk).toEqual(data);
  // An older ink consumer can ignore epubInk and still render its static preview.
  expect({type:restored.type,rect:restored.rect,path:restored.path}).toEqual({type:'ink',rect:annotation.rect,path:annotation.path});
 });
});
