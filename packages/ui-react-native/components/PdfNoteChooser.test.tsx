import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
vi.mock('react-native',async()=>{
 const React=await import('react');const View=({children}:any)=>React.createElement('div',null,children);
 return {View,Modal:View,Text:View,StyleSheet:{create:(s:any)=>s},FlatList:({data,renderItem}:any)=>React.createElement('div',null,data.map((item:any,index:number)=>React.createElement('div',{key:item.id},renderItem({item,index})))),Pressable:({children,onPress}:any)=>React.createElement('button',{onClick:onPress},children)};
});
import PdfNoteChooser from './PdfNoteChooser';
afterEach(cleanup);
it('keeps all five grouped notes accessible, including the last note and cancel',()=>{
 const select=vi.fn(),close=vi.fn();const notes=Array.from({length:5},(_,i)=>({id:String(i),noteContent:`body${i}`} as any));
 render(<PdfNoteChooser notes={notes} title="Notas" cancel="Cancelar" onSelect={select} onClose={close}/>);
 fireEvent.click(screen.getByText('5. body4'));expect(select).toHaveBeenCalledWith('4');fireEvent.click(screen.getByText('Cancelar'));expect(close).toHaveBeenCalled();
});
