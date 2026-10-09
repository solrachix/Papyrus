import React from 'react';
import {FlatList,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {getAnnotationNote,getAnnotationQuote} from '@papyrus-sdk/core';
import type {Annotation} from '@papyrus-sdk/types';
export default function PdfNoteChooser({notes,title,cancel,onSelect,onClose}:{notes:Annotation[];title:string;cancel:string;onSelect:(id:string)=>void;onClose:()=>void}){
 return <Modal visible={notes.length>1} transparent animationType="none" onRequestClose={onClose}>
  <View style={styles.backdrop}><View style={styles.sheet} accessibilityViewIsModal>
   <Text style={styles.title}>{title}</Text>
   <FlatList data={notes} keyExtractor={a=>a.id} renderItem={({item,index})=><Pressable accessibilityRole="button" style={styles.row} onPress={()=>onSelect(item.id)}><Text>{index+1}. {getAnnotationNote(item)||getAnnotationQuote(item)}</Text></Pressable>}/>
   <Pressable accessibilityRole="button" style={styles.row} onPress={onClose}><Text>{cancel}</Text></Pressable>
  </View></View>
 </Modal>;
}
const styles=StyleSheet.create({backdrop:{flex:1,backgroundColor:'#0008',justifyContent:'center',padding:24},sheet:{backgroundColor:'#fff',borderRadius:16,padding:16,maxHeight:'75%'},title:{fontSize:18,fontWeight:'600',marginBottom:12},row:{minHeight:44,padding:12}});
