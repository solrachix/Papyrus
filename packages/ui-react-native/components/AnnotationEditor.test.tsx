import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createContextualAnnotation,useViewerStore} from '@papyrus-sdk/core';
const alerts=vi.hoisted(()=>({confirm:null as null|(()=>void),timing:vi.fn()}));
vi.mock('react-native',async()=>{
 const React=await import('react');
 const View=({children}:any)=>React.createElement('div',null,children);
 class Value {constructor(public value:number){}setValue(n:number){this.value=n;}stopAnimation(){}interpolate(){return 0;}}
 return {View,Text:({children}:any)=>React.createElement('span',null,children),ScrollView:View,KeyboardAvoidingView:View,Modal:View,
  Pressable:({children,onPress,accessibilityLabel,accessibilityState,testID}:any)=>React.createElement('button',{'aria-label':accessibilityLabel,onClick:onPress,'data-testid':testID,'aria-pressed':accessibilityState?.selected},children),
  TextInput:({value,onChangeText,accessibilityLabel}:any)=>React.createElement('textarea',{'aria-label':accessibilityLabel,value,onChange:(e:any)=>onChangeText(e.target.value)}),
  StyleSheet:{create:(s:any)=>s,absoluteFill:{}},Platform:{OS:'android'},Alert:{alert:(_a:any,_b:any,buttons:any)=>{alerts.confirm=buttons.find((b:any)=>b.style==='destructive')?.onPress;}},
  Animated:{Value,View,timing:(_value:any,config:any)=>({start:(cb?:any)=>{alerts.timing(config);cb?.({finished:true});}})},
  AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove:()=>{}})}};
});
vi.mock('./PapyrusSafeArea',()=>({usePapyrusSafeAreaInsets:()=>({top:0,bottom:34,left:0,right:0})}));
vi.mock('../icons',()=>Object.fromEntries(['IconClose','IconHighlight','IconUnderline','IconStrikeout','IconComment'].map(name=>[name,()=>React.createElement('svg',{'data-testid':name})])));
import AnnotationEditor from './AnnotationEditor';
const baseline=useViewerStore.getInitialState();
const note=()=>createContextualAnnotation({id:'one',pageIndex:0,anchor:{version:1,kind:'text-range',encoding:'utf-16',start:0,end:5,quote:'quote'},style:'underline',note:'body',color:'#fbbf24',now:1});
beforeEach(()=>{useViewerStore.setState({...baseline,locale:'pt-BR',annotations:[],selectedAnnotationId:null,annotationDraft:null},true);alerts.confirm=null;});afterEach(()=>{cleanup();useViewerStore.setState(baseline,true);});
it('opens quote and body without navigating, edits same ID and closes on save',async()=>{
 useViewerStore.setState({annotations:[note()],selectedAnnotationId:'one',currentTextOffset:50});render(<AnnotationEditor/>);
 expect(screen.getByText('quote')).toBeTruthy();expect(screen.getByText('body')).toBeTruthy();fireEvent.click(screen.getByText('Editar nota'));
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'edited body'}});fireEvent.click(screen.getByText('Salvar'));await act(async()=>{});
 expect(useViewerStore.getState().annotations).toHaveLength(1);expect(useViewerStore.getState().annotations[0]).toMatchObject({id:'one',noteContent:'edited body',content:'quote',markupStyle:'underline'});expect(useViewerStore.getState().selectedAnnotationId).toBeNull();expect(useViewerStore.getState().currentTextOffset).toBe(50);
});
it('canceling a new contextual note does not persist any annotation',async()=>{useViewerStore.getState().beginAnnotationDraft({...note(),noteContent:''});render(<AnnotationEditor/>);fireEvent.click(screen.getByText('Cancelar'));await act(async()=>{});expect(useViewerStore.getState().annotations).toEqual([]);expect(useViewerStore.getState().annotationDraft).toBeNull();});
it('requires confirmation before delete and preserves undo',async()=>{useViewerStore.setState({annotations:[note()],selectedAnnotationId:'one'});render(<AnnotationEditor/>);fireEvent.click(screen.getByTestId('annotation-delete-button'));expect(useViewerStore.getState().annotations).toHaveLength(1);act(()=>alerts.confirm?.());expect(useViewerStore.getState().annotations).toEqual([]);act(()=>useViewerStore.getState().undoAnnotations());expect(useViewerStore.getState().annotations[0].id).toBe('one');});

it('shows four named icon actions and marks only the chosen style active',async()=>{
 useViewerStore.getState().beginAnnotationDraft({...note(),noteContent:''});render(<AnnotationEditor/>);
 for(const style of ['highlight','underline','strikeout','none'])expect(screen.getByTestId('annotation-style-'+style).querySelector('svg')).toBeTruthy();
 expect(screen.getByTestId('annotation-style-underline').getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(screen.getByTestId('annotation-style-strikeout'));
 expect(screen.getByTestId('annotation-style-strikeout').getAttribute('aria-pressed')).toBe('true');
 expect(screen.getByTestId('annotation-style-underline').getAttribute('aria-pressed')).toBe('false');
 expect(screen.getByRole('button',{name:'Somente indicador'})).toBeTruthy();
 await act(async()=>{});
});
