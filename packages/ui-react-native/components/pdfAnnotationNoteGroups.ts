import type {Annotation} from '@papyrus-sdk/types';
export function getNearbyPdfNotes(annotations:Annotation[],id:string):Annotation[]{
 const selected=annotations.find(a=>a.id===id);
 const isNote=(a:Annotation)=>a.noteContent!==undefined||a.type==='comment'||a.type==='text';
 if(!selected||!isNote(selected))return selected?[selected]:[];
 const point=(a:Annotation)=>{const r=a.rects?.[a.rects.length-1]??a.rect;return {x:r.x+r.width,y:r.y};};
 const p=point(selected);
 return annotations.filter(a=>isNote(a)&&a.pageIndex===selected.pageIndex&&Math.abs(point(a).x-p.x)<0.035&&Math.abs(point(a).y-p.y)<0.035);
}
