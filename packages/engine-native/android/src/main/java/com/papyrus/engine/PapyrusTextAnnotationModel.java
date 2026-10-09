package com.papyrus.engine;

/** Source UTF16 offsets; never normalizes CRLF, combining marks or surrogate pairs. */
public final class PapyrusTextAnnotationModel {
  private PapyrusTextAnnotationModel() {}
  private static boolean boundary(String text,int offset) {
    return offset>=0 && offset<=text.length() && !(offset>0 && offset<text.length() && Character.isHighSurrogate(text.charAt(offset-1)) && Character.isLowSurrogate(text.charAt(offset)));
  }
  public static int[] resolve(String text,int start,int end,String quote,String prefix,String suffix) {
    if(text==null || quote==null || quote.isEmpty())return null;
    if(start>=0 && end>start && end<=text.length() && boundary(text,start) && boundary(text,end) && text.substring(start,end).equals(quote))return new int[]{start,end};
    int[] match=null;
    for(int offset=text.indexOf(quote);offset>=0;offset=text.indexOf(quote,offset+1)) {
      int finish=offset+quote.length();
      if(!boundary(text,offset) || !boundary(text,finish))continue;
      if(prefix!=null && !prefix.isEmpty() && !text.substring(Math.max(0,offset-prefix.length()),offset).equals(prefix))continue;
      if(suffix!=null && !suffix.isEmpty() && !text.substring(finish,Math.min(text.length(),finish+suffix.length())).equals(suffix))continue;
      if(match!=null)return null;match=new int[]{offset,finish};
    }
    return match;
  }
}
