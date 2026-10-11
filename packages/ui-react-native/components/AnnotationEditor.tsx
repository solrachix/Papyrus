import React, {useEffect, useRef, useState} from "react";
import {AccessibilityInfo, Alert, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from "react-native";
import {getAnnotationEditPatch, getAnnotationMarkup, getAnnotationNote, getAnnotationQuote, useViewerStore} from "@papyrus-sdk/core";
import type {AnnotationMarkupStyle} from "@papyrus-sdk/types";
import {getStrings} from "../mobileStrings";
import {deleteAnnotationAndClearSelection} from "./annotationDeletion";
import {IconClose, IconHighlight, IconUnderline, IconStrikeout, IconComment} from "../icons";
import {usePapyrusSafeAreaInsets} from "./PapyrusSafeArea";

const COLORS = ["#fbbf24", "#fb7185", "#60a5fa", "#34d399", "#c084fc"];
const AnnotationEditor: React.FC<{documentId?: string}> = ({documentId}) => {
  const {annotations,annotationDraft,clearAnnotationDraft,addAnnotation,selectedAnnotationId,updateAnnotation,removeAnnotation,setSelectedAnnotation,uiTheme,locale,accentColor} = useViewerStore();
  const annotation = annotationDraft?.id === selectedAnnotationId ? annotationDraft : annotations.find(a => a.id === selectedAnnotationId);
  const supported = annotation && annotation.type !== "ink" && (!documentId || !annotation.anchor?.documentId || annotation.anchor.documentId === documentId);
  const [editing,setEditing] = useState(false);
  const [draft,setDraft] = useState("");
  const [color,setColor] = useState(COLORS[0]);
  const [markup,setMarkup] = useState<AnnotationMarkupStyle>("none");
  const [reduceMotion,setReduceMotion] = useState(true);
  const progress = useRef(new Animated.Value(0)).current;
  const insets = usePapyrusSafeAreaInsets();
  const dark = uiTheme === "dark", t = getStrings(locale);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => {if(alive)setReduceMotion(enabled);});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged",setReduceMotion);
    return () => {alive=false;subscription.remove();};
  },[]);
  useEffect(() => {
    if(!annotation)return;
    setDraft(getAnnotationNote(annotation));setColor(annotation.color);setMarkup(getAnnotationMarkup(annotation));
    setEditing((annotation.type === "comment" || annotation.type === "text") && !getAnnotationNote(annotation));
  },[annotation?.id]);
  useEffect(() => {
    progress.setValue(reduceMotion?1:0);
    if(supported && !reduceMotion) Animated.timing(progress,{toValue:1,duration:200,useNativeDriver:true}).start();
    return () => {progress.stopAnimation();};
  },[selectedAnnotationId,reduceMotion,progress,supported]);
  if(!supported || !annotation)return null;
  const close = () => {
    const finish = () => {if(annotationDraft)clearAnnotationDraft();setSelectedAnnotation(null);};
    progress.stopAnimation();
    if(reduceMotion){finish();return;}
    Animated.timing(progress,{toValue:0,duration:180,useNativeDriver:true}).start(({finished})=>{if(finished)finish();});
  };
  const save = () => {
    const patch = getAnnotationEditPatch(annotation,draft,markup,color);
    if(annotationDraft){clearAnnotationDraft();addAnnotation({...annotation,...patch});}else updateAnnotation(annotation.id,patch);close();
  };
  const remove = () => Alert.alert(t.deleteAnnotation,t.deleteAnnotationConfirmation,[{text:t.cancel,style:"cancel"},{text:t.deleteAnnotation,style:"destructive",onPress:()=>deleteAnnotationAndClearSelection(annotation.id,removeAnnotation,setSelectedAnnotation)}]);
  const textStyle = {color:dark?"#f9fafb":"#111827"};
  const quote = getAnnotationQuote(annotation);
  return <Modal visible transparent animationType="none" onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios"?"padding":undefined} style={styles.host}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t.close} />
      <Animated.View accessibilityViewIsModal style={[styles.card,{backgroundColor:dark?"#17191f":"#fff",marginBottom:Math.max(16,insets.bottom),opacity:progress,transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[12,0]})}]}]}>
        <View style={styles.header}><Text style={[styles.title,textStyle]}>{editing?t.editNote:t.annotationNote}</Text><Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t.close} style={[styles.button, {borderRadius:22, backgroundColor:dark?"#242936":"#f1f5f9"}]}><IconClose size={20} color={textStyle.color}/></Pressable></View>
        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {quote?<Text style={[styles.quote,textStyle]} selectable>{quote}</Text>:null}
          {editing?<>
            <TextInput accessibilityLabel={t.editNote} value={draft} onChangeText={setDraft} multiline autoFocus placeholder={t.notePlaceholder} placeholderTextColor={dark?"#9ca3af":"#6b7280"} style={[styles.input,textStyle,{borderColor:dark?"#374151":"#d1d5db"}]} />
            <View style={styles.options}>{COLORS.map(value=><Pressable key={value} accessibilityRole="button" accessibilityLabel={`${t.annotationColor} ${value}`} accessibilityState={{selected:color===value}} onPress={()=>setColor(value)} style={[styles.color,{backgroundColor:value,borderColor:color===value?accentColor:"transparent"}]} />)}</View>
            <View style={styles.markupOptions}>{([
              ["highlight",t.annotationHighlight,IconHighlight],
              ["underline",t.annotationUnderline,IconUnderline],
              ["strikeout",t.annotationStrikeout,IconStrikeout],
              ["none",t.annotationIndicatorOnly,IconComment],
            ] as const).map(([style,label,Icon])=><Pressable key={style} onPress={()=>setMarkup(style)}
              accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:markup===style}}
              testID={`annotation-style-${style}`}
              style={[styles.markupButton,{backgroundColor:dark?"#242936":"#f1f5f9",borderColor:markup===style?accentColor:"transparent"}]}>
              <View accessible={false} importantForAccessibility="no-hide-descendants"><Icon size={22} color={markup===style?accentColor:textStyle.color}/></View>
              <Text style={[styles.markupLabel,textStyle]}>{style==="none"?(locale==="pt-BR"?"Indicador":"Indicator"):label}</Text>
            </Pressable>)}</View>
          </>:<Text style={[styles.note,textStyle]} selectable>{getAnnotationNote(annotation)||t.notePlaceholder}</Text>}
        </ScrollView>
        <View style={styles.actions}>
          {!annotationDraft && <Pressable onPress={remove} accessibilityRole="button" accessibilityLabel={t.deleteAnnotation} testID="annotation-delete-button" style={styles.button}><Text style={{color:dark?"#fda4af":"#be123c"}}>{t.deleteAnnotation}</Text></Pressable>}
          <View style={{flex:1}} />
          {editing?<><Pressable onPress={()=>{if(annotationDraft){close();return;}setDraft(getAnnotationNote(annotation));setColor(annotation.color);setMarkup(getAnnotationMarkup(annotation));setEditing(false);}} accessibilityRole="button" style={styles.button}><Text style={textStyle}>{t.cancel}</Text></Pressable><Pressable onPress={save} accessibilityRole="button" style={[styles.button,{backgroundColor:accentColor}]}><Text style={{color:"#fff"}}>{t.save}</Text></Pressable></>:<Pressable onPress={()=>setEditing(true)} accessibilityRole="button" style={styles.button}><Text style={textStyle}>{t.editNote}</Text></Pressable>}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
};
const styles = StyleSheet.create({host:{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(0,0,0,.18)",paddingHorizontal:12},card:{borderRadius:20,padding:16,maxHeight:"72%",elevation:12},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},title:{fontSize:17,fontWeight:"700"},content:{flexGrow:0},quote:{fontSize:14,lineHeight:21,borderLeftWidth:3,borderLeftColor:"#9ca3af",paddingLeft:10,marginVertical:12},note:{fontSize:16,lineHeight:24,paddingVertical:12},input:{minHeight:112,maxHeight:240,borderWidth:1,borderRadius:12,padding:12,fontSize:16,textAlignVertical:"top"},button:{minWidth:44,minHeight:44,paddingHorizontal:10,borderRadius:10,alignItems:"center",justifyContent:"center"},actions:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",marginTop:12},markupOptions:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:12},markupButton:{flex:1,minWidth:64,minHeight:64,borderWidth:1,borderRadius:12,paddingHorizontal:4,paddingVertical:8,alignItems:"center",justifyContent:"center",gap:6},markupLabel:{fontSize:11,lineHeight:15,textAlign:"center"},options:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:12},color:{width:44,height:44,borderRadius:22,borderWidth:3}});
export default AnnotationEditor;
