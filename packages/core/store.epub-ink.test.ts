import {afterEach,beforeEach,describe,expect,it} from "vitest";
import {PapyrusEventType,type Annotation} from "@papyrus-sdk/types";
import {papyrusEvents,useViewerStore} from "./index";

const ink=(id="epub-ink-1"):Annotation=>({
 id,type:"ink",pageIndex:1,
 rect:{x:0.1,y:0.2,width:0.3,height:0.1},
 path:[{x:0.1,y:0.2},{x:0.4,y:0.3}],
 color:"#2563eb",createdAt:10,
 anchor:{version:1,kind:"epub-cfi",cfiRange:"epubcfi(/6/2!/4/2:0)",href:"chapter.xhtml",quote:"a",documentId:"edition-1"},
 epubInk:{version:1,kind:"epub-ink",documentId:"edition-1",segments:[{href:"chapter.xhtml",spineIndex:0,points:[
  {cfiRange:"epubcfi(/6/2!/4/2:0)",quote:"a",x:0,y:0},
  {cfiRange:"epubcfi(/6/2!/4/2:1)",quote:"b",x:0.5,y:0},
 ]}]},
});

const unsubs:Array<()=>void>=[];
afterEach(()=>{for(const unsubscribe of unsubs.splice(0))unsubscribe();});
beforeEach(()=>useViewerStore.setState({annotations:[],annotationUndoStack:[],annotationRedoStack:[],selectedAnnotationId:null}));

describe("EPUB ink persistence history",()=>{
 it("emits delete/create when undo and redo restore a complete EPUB ink annotation",()=>{
  const created:Annotation[]=[];const deleted:string[]=[];
  unsubs.push(papyrusEvents.on(PapyrusEventType.ANNOTATION_CREATED,payload=>created.push(payload.annotation)));
  unsubs.push(papyrusEvents.on(PapyrusEventType.ANNOTATION_DELETED,payload=>deleted.push(payload.annotationId)));
  const annotation=ink();
  useViewerStore.getState().addAnnotation(annotation);
  useViewerStore.getState().undoAnnotations();
  expect(useViewerStore.getState().annotations).toEqual([]);
  expect(deleted).toEqual([annotation.id]);
  useViewerStore.getState().redoAnnotations();
  expect(useViewerStore.getState().annotations).toEqual([annotation]);
  expect(created.map(item=>item.epubInk)).toEqual([annotation.epubInk,annotation.epubInk]);
 });

 it("emits updated snapshots when undo/redo changes a persisted note or drawing",()=>{
  const updated:Annotation[]=[];
  unsubs.push(papyrusEvents.on(PapyrusEventType.ANNOTATION_UPDATED,payload=>updated.push(payload.annotation)));
  const original=ink();
  useViewerStore.getState().addAnnotation(original);
  useViewerStore.getState().updateAnnotation(original.id,{color:"#f97316"});
  updated.length=0;
  useViewerStore.getState().undoAnnotations();
  useViewerStore.getState().redoAnnotations();
  expect(updated.map(item=>item.color)).toEqual(["#2563eb","#f97316"]);
  expect(updated.every(item=>item.epubInk?.kind==="epub-ink")).toBe(true);
 });
});
