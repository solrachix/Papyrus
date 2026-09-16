#include "papyrus_text_word.h"

namespace papyrus {

bool IsWordCharacter(char16_t value) {
  if (value >= u'0' && value <= u'9') return true;
  if (value >= u'A' && value <= u'Z') return true;
  if (value >= u'a' && value <= u'z') return true;
  if (value == u'\'' || value == 0x2019) return true;
  if (value == u'-') return true;
  if (value >= 0x00C0 && value <= 0x00D6) return true;
  if (value >= 0x00D8 && value <= 0x00F6) return true;
  if (value >= 0x00F8 && value <= 0x00FF) return true;
  if (value >= 0x0100 && value <= 0x017F) return true;
  return false;
}

std::pair<int, int> ResolveWordRange(const std::vector<char16_t> &text,
                                     int index) {
  const int size = static_cast<int>(text.size());
  if (index < 0 || index >= size) return {index, index};
  if (!IsWordCharacter(text[index])) return {index, index};

  int start = index;
  while (start > 0 && IsWordCharacter(text[start - 1])) start -= 1;

  int end = index + 1;
  while (end < size && IsWordCharacter(text[end])) end += 1;

  return {start, end};
}

}  // namespace papyrus
