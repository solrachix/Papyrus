#ifndef PAPYRUS_TEXT_WORD_H
#define PAPYRUS_TEXT_WORD_H

#include <cstdint>
#include <utility>
#include <vector>

namespace papyrus {

bool IsWordCharacter(char16_t value);

// Returns [start, end) of the word that contains |index|. When |index| is out
// of bounds or not a word character, returns {index, index}.
std::pair<int, int> ResolveWordRange(const std::vector<char16_t> &text,
                                     int index);

}  // namespace papyrus

#endif  // PAPYRUS_TEXT_WORD_H
