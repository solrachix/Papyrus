import {it,expect} from 'vitest';
import {contextualizePdfAnnotation} from './annotationCreation';
import type {Annotation} from '@papyrus-sdk/types';
const selection:Annotation={id:'one',pageIndex:4,type:'comment',rect:{x:.1,y:.2,width:.3,height:.05},rects:[{x:.1,y:.2,width:.3,height:.05},{x:.1,y:.3,width:.2,height:.05}],content:'quoted text',color:'#fbbf24',opacity:.35,createdAt:1};
it('PDF note retains one ID, exact lines and quote separate from body',()=>{const a=contextualizePdfAnnotation(selection,'file');expect(a.id).toBe('one');expect(a.anchor).toMatchObject({kind:'pdf-geometry',documentId:'file',pageIndex:4,quote:'quoted text',rects:selection.rects});expect(a.noteContent).toBe('');expect(a.markupStyle).toBe('highlight');expect(a.rect.height).toBeCloseTo(.15);});
it('free point notes and ink do not fabricate a text anchor',()=>{expect(contextualizePdfAnnotation({...selection,content:'',rects:undefined},'file').anchor).toBeUndefined();expect(contextualizePdfAnnotation({...selection,type:'ink'},'file').anchor).toBeUndefined();});
