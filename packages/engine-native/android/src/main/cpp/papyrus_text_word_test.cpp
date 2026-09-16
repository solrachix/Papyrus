#include "papyrus_text_word.h"

#include <iostream>
#include <vector>

namespace {

int failures = 0;

void ExpectTrue(bool value, const char *name) {
  if (!value) {
    std::cerr << "FAIL: " << name << std::endl;
    failures += 1;
  }
}

void ExpectRange(const std::vector<char16_t> &text, int index, int expectedStart,
                 int expectedEnd, const char *name) {
  const auto range = papyrus::ResolveWordRange(text, index);
  if (range.first != expectedStart || range.second != expectedEnd) {
    std::cerr << "FAIL: " << name << " expected [" << expectedStart << ", "
              << expectedEnd << ") got [" << range.first << ", " << range.second
              << ")" << std::endl;
    failures += 1;
  }
}

}  // namespace

int main() {
  ExpectTrue(papyrus::IsWordCharacter(u'a'), "ascii letter");
  ExpectTrue(papyrus::IsWordCharacter(u'Z'), "ascii upper");
  ExpectTrue(papyrus::IsWordCharacter(u'7'), "digit");
  ExpectTrue(papyrus::IsWordCharacter(0x00E7), "c-cedilla");
  ExpectTrue(papyrus::IsWordCharacter(0x00E3), "a-tilde");
  ExpectTrue(papyrus::IsWordCharacter(u'\''), "apostrophe");
  ExpectTrue(papyrus::IsWordCharacter(0x2019), "curly apostrophe");
  ExpectTrue(papyrus::IsWordCharacter(u'-'), "hyphen");
  ExpectTrue(!papyrus::IsWordCharacter(u' '), "space is not a word char");
  ExpectTrue(!papyrus::IsWordCharacter(u'.'), "dot is not a word char");
  ExpectTrue(!papyrus::IsWordCharacter(u'\n'), "newline is not a word char");

  const std::vector<char16_t> simple = {u'd', u'i', u'n', u'a'};
  ExpectRange(simple, 0, 0, 4, "word from first char");
  ExpectRange(simple, 3, 0, 4, "word from last char");
  ExpectRange(simple, -1, -1, -1, "out of bounds start");
  ExpectRange(simple, 4, 4, 4, "out of bounds end");

  const std::vector<char16_t> accented = {u'c', u'o', u'm', u'p', u'i',
                                          u'l', u'a', 0x00E7, 0x00E3, u'o'};
  ExpectRange(accented, 7, 0, 10, "accented word");

  const std::vector<char16_t> hyphenated = {u'j', u'u', u's', u't', u'-',
                                            u'i', u'n', u'-', u't', u'i',
                                            u'm', u'e'};
  ExpectRange(hyphenated, 5, 0, 12, "hyphenated word");
  ExpectRange(hyphenated, 4, 0, 12, "hyphen is word char");

  const std::vector<char16_t> apostrophe = {u'l', u'\'', 0x00E9, u't'};
  ExpectRange(apostrophe, 1, 0, 4, "apostrophe joins the word");

  const std::vector<char16_t> sentence = {u'a', u' ', u'b', u'.', u'c'};
  ExpectRange(sentence, 1, 1, 1, "space yields empty range");
  ExpectRange(sentence, 3, 3, 3, "dot yields empty range");

  if (failures > 0) {
    std::cerr << failures << " failure(s)" << std::endl;
    return 1;
  }
  std::cout << "papyrus_text_word_test: OK" << std::endl;
  return 0;
}
