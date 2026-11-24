import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('react-native',async()=>{
 const React=await import('react');
 const View=({children,accessibilityLabel,testID}:any)=>React.createElement('div',{'aria-label':accessibilityLabel,'data-testid':testID},children);
 return {View,Text:({children}:any)=>React.createElement('span',null,children),StyleSheet:{create:(s:any)=>s,hairlineWidth:1},
  Pressable:({children,onPress,accessibilityLabel}:any)=>React.createElement('button',{onClick:onPress,'aria-label':accessibilityLabel},typeof children==='function'?children({pressed:false}):children)};
});
vi.mock('react-native-svg',()=>{const React=require('react');const C=(name:string)=>({children}:any)=>React.createElement(name,null,children);return {default:C('svg'),Circle:C('circle'),Defs:C('defs'),Ellipse:C('ellipse'),Line:C('line'),LinearGradient:C('lg'),Path:C('path'),Rect:C('rect'),Stop:C('stop')};});
import {EpubSelectionMenu} from './EpubSelectionMenu';
import {getReaderSheetPalette} from './readerSheetPresentation';
afterEach(cleanup);
const base={anchor:{x:100,y:400,width:80,height:20},container:{width:400,height:800},locale:'pt-BR' as const,palette:getReaderSheetPalette('light')};
describe('EPUB selection menu',()=>{
 it('shows five highlight colours and the Portuguese actions, dispatching the chosen one',()=>{
  const onHighlight=vi.fn(),onAction=vi.fn();
  render(<EpubSelectionMenu {...base} canConsult onHighlight={onHighlight} onAction={onAction}/>);
  expect(screen.getAllByRole('button',{name:/^Destacar:/})).toHaveLength(5);
  fireEvent.click(screen.getByRole('button',{name:'Destacar: Azul'}));expect(onHighlight).toHaveBeenCalledWith('#60a5fa');
  for(const [label,action] of [['Copiar','copy'],['Sublinhar','underline'],['Riscar','strikeout'],['Nota','note'],['Consultar','consult']]){
   fireEvent.click(screen.getByRole('button',{name:label}));expect(onAction).toHaveBeenLastCalledWith(action);
  }
 });
 it('hides Consultar when define is unavailable and renders nothing off-screen',()=>{
  const {rerender}=render(<EpubSelectionMenu {...base} canConsult={false} onHighlight={vi.fn()} onAction={vi.fn()}/>);
  expect(screen.queryByRole('button',{name:'Consultar'})).toBeNull();
  rerender(<EpubSelectionMenu {...base} anchor={{x:0,y:-300,width:10,height:10}} canConsult onHighlight={vi.fn()} onAction={vi.fn()}/>);
  expect(screen.queryByTestId('papyrus-epub-selection-menu')).toBeNull();
 });
});
