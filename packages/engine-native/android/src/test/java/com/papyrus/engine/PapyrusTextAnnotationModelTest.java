package com.papyrus.engine;
import org.junit.Test;
import static org.junit.Assert.*;
public class PapyrusTextAnnotationModelTest {
  @Test public void preservesUtf16AndCombiningMarks() {
    assertArrayEquals(new int[]{1,3}, PapyrusTextAnnotationModel.resolve("A😀 e\u0301\r\nend",1,3,"😀",null,null));
    assertArrayEquals(new int[]{4,6}, PapyrusTextAnnotationModel.resolve("A😀 e\u0301\r\nend",4,6,"e\u0301",null,null));
  }
  @Test public void recoversUniqueContextAfterContentChanges() {
    assertArrayEquals(new int[]{4,8}, PapyrusTextAnnotationModel.resolve("new word end",99,103,"word","new "," end"));
  }
  @Test public void refusesAmbiguousMissingAndEmptyQuotes() {
    assertNull(PapyrusTextAnnotationModel.resolve("word and word",99,103,"word",null,null));
    assertNull(PapyrusTextAnnotationModel.resolve("word",0,2,"missing",null,null));
    assertNull(PapyrusTextAnnotationModel.resolve("word",0,2,"",null,null));
    assertNull(PapyrusTextAnnotationModel.resolve("aaaa",99,101,"aa",null,null));
  }
  @Test public void contextDisambiguatesWithoutTruncatingAtBoundary() {
    assertArrayEquals(new int[]{9,13}, PapyrusTextAnnotationModel.resolve("word and word",99,103,"word","and ",null));
    assertNull(PapyrusTextAnnotationModel.resolve("word",99,103,"word","missing ",null));
  }
  @Test public void rejectsSplitSurrogates() {
    assertNull(PapyrusTextAnnotationModel.resolve("A😀B",1,2,"\uD83D",null,null));
    assertNull(PapyrusTextAnnotationModel.resolve("A😀B",2,3,"\uDE00",null,null));
  }
}
