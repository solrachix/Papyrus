import {beforeEach,describe,it,expect} from 'vitest';
import {useViewerStore} from './store';
import type {Annotation} from '@papyrus-sdk/types';
const annotation:Annotation={id:'draft',type:'comment',pageIndex:0,rect:{x:0,y:0,width:0,height:0},color:'#fbbf24',createdAt:1,noteContent:'',markupStyle:'highlight'};
describe('contextual note draft',()=>{
 beforeEach(()=>useViewerStore.setState(useViewerStore.getInitialState(),true));
 it('does not persist a note before save and cancels without losing previous notes',()=>{const store=useViewerStore.getState();store.addAnnotation({...annotation,id:'old',noteContent:'kept'});store.beginAnnotationDraft(annotation);expect(useViewerStore.getState().annotations.map(a=>a.id)).toEqual(['old']);store.clearAnnotationDraft();expect(useViewerStore.getState().annotations[0].noteContent).toBe('kept');expect(useViewerStore.getState().selectedAnnotationId).toBeNull();});
 it('commits the same ID when saving and undo restores the prior snapshot',()=>{const store=useViewerStore.getState();store.beginAnnotationDraft(annotation);store.clearAnnotationDraft();store.addAnnotation({...annotation,noteContent:'saved'});expect(useViewerStore.getState().annotations[0].id).toBe('draft');store.undoAnnotations();expect(useViewerStore.getState().annotations).toEqual([]);});
 it('repeated text navigation sends distinct requests even to the same offset',()=>{const store=useViewerStore.getState();store.setDocumentState({textLength:100});store.triggerScrollToTextOffset(4);const first=useViewerStore.getState().textNavigationRequest;store.triggerScrollToTextOffset(4);expect(useViewerStore.getState().textNavigationRequest?.nonce).toBe((first?.nonce??0)+1);});
});
