package com.papyrus.engine;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public final class PapyrusNativeTextModelTest {
  @Test public void decodesUtf8BomAndUtf16() throws Exception {
    assertEquals("Olá", PapyrusNativeTextModel.decode(new byte[] {(byte) 0xef, (byte) 0xbb, (byte) 0xbf, 'O', 'l', (byte) 0xc3, (byte) 0xa1}));
    byte[] littleEndian = "A😀Z".getBytes(StandardCharsets.UTF_16LE);
    byte[] littleWithBom = new byte[littleEndian.length + 2];
    littleWithBom[0] = (byte) 0xff;
    littleWithBom[1] = (byte) 0xfe;
    System.arraycopy(littleEndian, 0, littleWithBom, 2, littleEndian.length);
    assertEquals("A😀Z", PapyrusNativeTextModel.decode(littleWithBom));
    byte[] bigEndian = "Olá".getBytes(StandardCharsets.UTF_16BE);
    byte[] bigWithBom = new byte[bigEndian.length + 2];
    bigWithBom[0] = (byte) 0xfe;
    bigWithBom[1] = (byte) 0xff;
    System.arraycopy(bigEndian, 0, bigWithBom, 2, bigEndian.length);
    assertEquals("Olá", PapyrusNativeTextModel.decode(bigWithBom));
  }

  @Test public void rejectsMalformedUtf8AndUtf32() {
    assertThrows(Exception.class, () -> PapyrusNativeTextModel.decode(new byte[] {(byte) 0xc3, 0x28}));
    assertThrows(IllegalArgumentException.class, () -> PapyrusNativeTextModel.decode(new byte[] {(byte) 0xff, (byte) 0xfe, 0, 0}));
  }

  @Test public void searchReturnsUtf16OffsetsThroughNormalization() {
    String text = "😀  CAFÉ\n  café e\u0301";
    List<PapyrusNativeTextModel.SearchMatch> results = PapyrusNativeTextModel.search(text, "cafe");
    assertEquals(2, results.size());
    assertEquals("CAFÉ", results.get(0).text);
    assertEquals("café", results.get(1).text);
    assertEquals(4, results.get(0).start);
    assertEquals(8, results.get(0).end);
  }

  @Test public void coalescesOrdinaryTextIntoCompactSearchMappingRuns() {
    char[] chars = new char[1_000_000];
    Arrays.fill(chars, 'a');
    PapyrusNativeTextModel.Normalized normalized = PapyrusNativeTextModel.normalize(new String(chars));
    assertEquals(1, normalized.ranges.size());
  }
}
