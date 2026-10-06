package com.papyrus.engine;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.text.BreakIterator;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

final class PapyrusNativeTextModel {
  static final class Range {
    final int start;
    final int end;
    Range(int start, int end) { this.start = start; this.end = end; }
  }

  static final class SearchMatch {
    final int start;
    final int end;
    final String text;
    final int matchIndex;
    SearchMatch(int start, int end, String text, int matchIndex) {
      this.start = start; this.end = end; this.text = text; this.matchIndex = matchIndex;
    }
  }

  static final class MappingSegment {
    final int normalizedStart;
    int normalizedLength;
    final int sourceStart;
    int sourceEnd;
    final boolean linear;

    MappingSegment(int normalizedStart, int normalizedLength, int sourceStart, int sourceEnd, boolean linear) {
      this.normalizedStart = normalizedStart;
      this.normalizedLength = normalizedLength;
      this.sourceStart = sourceStart;
      this.sourceEnd = sourceEnd;
      this.linear = linear;
    }
  }

  static final class Normalized {
    final String value;
    final List<MappingSegment> ranges;
    Normalized(String value, List<MappingSegment> ranges) { this.value = value; this.ranges = ranges; }
  }

  private PapyrusNativeTextModel() {}

  static String decode(byte[] bytes) throws CharacterCodingException {
    if (bytes.length >= 4 && ((u(bytes[0]) == 0xff && u(bytes[1]) == 0xfe && bytes[2] == 0 && bytes[3] == 0) ||
        (bytes[0] == 0 && bytes[1] == 0 && u(bytes[2]) == 0xfe && u(bytes[3]) == 0xff))) {
      throw new IllegalArgumentException("UTF-32 text is not supported");
    }
    int offset = 0;
    Charset charset = StandardCharsets.UTF_8;
    if (bytes.length >= 2 && u(bytes[0]) == 0xff && u(bytes[1]) == 0xfe) {
      charset = StandardCharsets.UTF_16LE;
      offset = 2;
    } else if (bytes.length >= 2 && u(bytes[0]) == 0xfe && u(bytes[1]) == 0xff) {
      charset = StandardCharsets.UTF_16BE;
      offset = 2;
    } else if (bytes.length >= 3 && u(bytes[0]) == 0xef && u(bytes[1]) == 0xbb && u(bytes[2]) == 0xbf) {
      offset = 3;
    }
    if ((charset == StandardCharsets.UTF_16LE || charset == StandardCharsets.UTF_16BE) && (bytes.length - offset) % 2 != 0) {
      throw new IllegalArgumentException("Incomplete UTF-16 code unit");
    }
    return charset.newDecoder()
      .onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT)
      .decode(ByteBuffer.wrap(bytes, offset, bytes.length - offset)).toString();
  }

  static List<SearchMatch> search(String text, String query) {
    String normalizedQuery = normalize(query).value;
    if (normalizedQuery.isEmpty()) return java.util.Collections.emptyList();
    Normalized source = normalize(text);
    List<SearchMatch> matches = new ArrayList<>();
    int cursor = 0;
    while (cursor < source.value.length() && matches.size() < 10000) {
      int found = source.value.indexOf(normalizedQuery, cursor);
      if (found < 0) break;
      Range first = sourceRangeAt(source.ranges, found);
      Range last = sourceRangeAt(source.ranges, found + normalizedQuery.length() - 1);
      if (last.end > first.start) {
        matches.add(new SearchMatch(first.start, last.end, text.substring(first.start, last.end), matches.size()));
      }
      cursor = found + 1;
    }
    return matches;
  }

  static Normalized normalize(String source) {
    StringBuilder output = new StringBuilder();
    List<MappingSegment> ranges = new ArrayList<>();
    BreakIterator iterator = BreakIterator.getCharacterInstance(Locale.ROOT);
    iterator.setText(source);
    Range pendingWhitespace = null;
    int start = iterator.first();
    for (int end = iterator.next(); end != BreakIterator.DONE; start = end, end = iterator.next()) {
      String cluster = source.substring(start, end);
      String folded = fold(cluster);
      if (!folded.isEmpty() && isWhitespace(folded)) {
        pendingWhitespace = pendingWhitespace == null ? new Range(start, end) : new Range(pendingWhitespace.start, end);
      } else if (!folded.isEmpty()) {
        if (pendingWhitespace != null && output.length() > 0) {
          int normalizedStart = output.length();
          output.append(' ');
          appendMappingSegment(ranges, normalizedStart, 1, pendingWhitespace.start, pendingWhitespace.end);
        }
        pendingWhitespace = null;
        int normalizedStart = output.length();
        output.append(folded);
        appendMappingSegment(ranges, normalizedStart, folded.length(), start, end);
      }
    }
    if (pendingWhitespace != null && output.length() > 0) {
      int normalizedStart = output.length();
      output.append(' ');
      appendMappingSegment(ranges, normalizedStart, 1, pendingWhitespace.start, pendingWhitespace.end);
    }
    return new Normalized(output.toString(), ranges);
  }

  private static void appendMappingSegment(List<MappingSegment> segments, int normalizedStart,
      int normalizedLength, int sourceStart, int sourceEnd) {
    boolean linear = normalizedLength == 1 && sourceEnd - sourceStart == 1;
    if (linear && !segments.isEmpty()) {
      MappingSegment previous = segments.get(segments.size() - 1);
      if (previous.linear && previous.normalizedStart + previous.normalizedLength == normalizedStart &&
          previous.sourceEnd == sourceStart) {
        previous.normalizedLength++;
        previous.sourceEnd = sourceEnd;
        return;
      }
    }
    segments.add(new MappingSegment(normalizedStart, normalizedLength, sourceStart, sourceEnd, linear));
  }

  private static Range sourceRangeAt(List<MappingSegment> segments, int normalizedOffset) {
    int low = 0;
    int high = segments.size() - 1;
    while (low <= high) {
      int middle = (low + high) >>> 1;
      MappingSegment segment = segments.get(middle);
      if (normalizedOffset < segment.normalizedStart) {
        high = middle - 1;
      } else if (normalizedOffset >= segment.normalizedStart + segment.normalizedLength) {
        low = middle + 1;
      } else if (segment.linear) {
        int sourceOffset = segment.sourceStart + normalizedOffset - segment.normalizedStart;
        return new Range(sourceOffset, sourceOffset + 1);
      } else {
        return new Range(segment.sourceStart, segment.sourceEnd);
      }
    }
    return new Range(0, 0);
  }

  private static String fold(String value) {
    String decomposed = Normalizer.normalize(value, Normalizer.Form.NFD).toLowerCase(Locale.ROOT);
    StringBuilder result = new StringBuilder();
    for (int i = 0; i < decomposed.length();) {
      int codePoint = decomposed.codePointAt(i);
      int type = Character.getType(codePoint);
      if (type != Character.NON_SPACING_MARK && type != Character.COMBINING_SPACING_MARK && type != Character.ENCLOSING_MARK) {
        result.appendCodePoint(codePoint);
      }
      i += Character.charCount(codePoint);
    }
    return result.toString();
  }

  private static boolean isWhitespace(String value) {
    for (int i = 0; i < value.length();) {
      int codePoint = value.codePointAt(i);
      if (!Character.isWhitespace(codePoint) && !Character.isSpaceChar(codePoint)) return false;
      i += Character.charCount(codePoint);
    }
    return true;
  }

  private static int u(byte value) { return value & 0xff; }
}
