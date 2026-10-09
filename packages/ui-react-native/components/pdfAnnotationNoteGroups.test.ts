import {describe,it,expect} from 'vitest';
import {getNearbyPdfNotes} from './pdfAnnotationNoteGroups';
const note=(id:string,y:number,pageIndex=0):any=>({id,pageIndex,type:'comment',rect:{x:.2,y,width:.1,height:.02},noteContent:id});
describe('PDF note collisions',()=>{
 it('offers nearby notes with independent IDs and excludes other pages',()=>{expect(getNearbyPdfNotes([note('a',.1),note('b',.11),note('c',.5),note('d',.1,1)],'a').map(a=>a.id)).toEqual(['a','b']);});
 it('keeps ordinary markup taps independent',()=>{expect(getNearbyPdfNotes([{...note('a',.1),type:'highlight',noteContent:undefined},note('b',.1)],'a').map(a=>a.id)).toEqual(['a']);});
});
