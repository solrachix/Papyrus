#pragma once

#include <cstddef>
#include <cstdint>
#include <limits>

namespace {
inline bool papyrus_comic_set_dimensions(std::uint64_t width, std::uint64_t height,
                                        int *out_width, int *out_height) {
  if (width == 0 || height == 0 || width > static_cast<std::uint64_t>(std::numeric_limits<int>::max()) ||
      height > static_cast<std::uint64_t>(std::numeric_limits<int>::max()) || width > 20000 || height > 20000 ||
      width * height > 80000000ULL) return false;
  if (out_width) *out_width = static_cast<int>(width);
  if (out_height) *out_height = static_cast<int>(height);
  return true;
}

inline std::uint32_t papyrus_comic_read_u24_le(const std::uint8_t *bytes) {
  return static_cast<std::uint32_t>(bytes[0]) |
      (static_cast<std::uint32_t>(bytes[1]) << 8) |
      (static_cast<std::uint32_t>(bytes[2]) << 16);
}

inline bool papyrus_comic_parse_jpeg(const std::uint8_t *bytes, std::size_t size,
                                     int *width, int *height) {
  if (size < 2 || bytes[0] != 0xff || bytes[1] != 0xd8) return false;
  std::size_t offset = 2;
  while (offset < size) {
    if (bytes[offset] != 0xff) return false;
    while (offset < size && bytes[offset] == 0xff) ++offset;
    if (offset >= size) return false;
    const std::uint8_t marker = bytes[offset++];
    if (marker == 0x00) continue;
    if (marker == 0xd9 || marker == 0xda) return false;
    if (marker == 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > size) return false;

    const std::size_t segment_length = (static_cast<std::size_t>(bytes[offset]) << 8) | bytes[offset + 1];
    if (segment_length < 2) return false;
    const bool start_of_frame =
        (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (start_of_frame) {
      if (segment_length < 8 || offset + segment_length > size) return false;
      const std::uint64_t parsed_height = (static_cast<std::uint16_t>(bytes[offset + 3]) << 8) | bytes[offset + 4];
      const std::uint64_t parsed_width = (static_cast<std::uint16_t>(bytes[offset + 5]) << 8) | bytes[offset + 6];
      return papyrus_comic_set_dimensions(parsed_width, parsed_height, width, height);
    }
    if (segment_length > size - offset) return false;
    offset += segment_length;
  }
  return false;
}
} // namespace

inline bool papyrus_comic_parse_image_dimensions(const std::uint8_t *bytes, std::size_t size,
                                                  int *width, int *height) {
  if (!bytes) return false;

  static constexpr std::uint8_t kPngSignature[] = {0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a};
  if (size >= 24) {
    bool png_signature = true;
    for (std::size_t i = 0; i < sizeof(kPngSignature); ++i) png_signature = png_signature && bytes[i] == kPngSignature[i];
    if (png_signature && bytes[12] == 'I' && bytes[13] == 'H' && bytes[14] == 'D' && bytes[15] == 'R') {
      const std::uint64_t parsed_width = (static_cast<std::uint32_t>(bytes[16]) << 24) |
          (static_cast<std::uint32_t>(bytes[17]) << 16) | (static_cast<std::uint32_t>(bytes[18]) << 8) | bytes[19];
      const std::uint64_t parsed_height = (static_cast<std::uint32_t>(bytes[20]) << 24) |
          (static_cast<std::uint32_t>(bytes[21]) << 16) | (static_cast<std::uint32_t>(bytes[22]) << 8) | bytes[23];
      return papyrus_comic_set_dimensions(parsed_width, parsed_height, width, height);
    }
  }

  if (size >= 10 && bytes[0] == 'G' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == '8' &&
      (bytes[4] == '7' || bytes[4] == '9') && bytes[5] == 'a') {
    const std::uint64_t parsed_width = static_cast<std::uint16_t>(bytes[6] | (bytes[7] << 8));
    const std::uint64_t parsed_height = static_cast<std::uint16_t>(bytes[8] | (bytes[9] << 8));
    return papyrus_comic_set_dimensions(parsed_width, parsed_height, width, height);
  }

  if (size >= 30 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F' &&
      bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
    if (bytes[12] == 'V' && bytes[13] == 'P' && bytes[14] == '8' && bytes[15] == 'X') {
      return papyrus_comic_set_dimensions(1ULL + papyrus_comic_read_u24_le(bytes + 24),
                                          1ULL + papyrus_comic_read_u24_le(bytes + 27), width, height);
    }
    if (bytes[12] == 'V' && bytes[13] == 'P' && bytes[14] == '8' && bytes[15] == ' ') {
      if (bytes[23] != 0x9d || bytes[24] != 0x01 || bytes[25] != 0x2a) return false;
      const std::uint64_t parsed_width = ((bytes[27] & 0x3f) << 8) | bytes[26];
      const std::uint64_t parsed_height = ((bytes[29] & 0x3f) << 8) | bytes[28];
      return papyrus_comic_set_dimensions(parsed_width, parsed_height, width, height);
    }
  }
  if (size >= 25 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F' &&
      bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P' &&
      bytes[12] == 'V' && bytes[13] == 'P' && bytes[14] == '8' && bytes[15] == 'L' && bytes[20] == 0x2f) {
    const std::uint64_t parsed_width = 1ULL + bytes[21] + (static_cast<std::uint64_t>(bytes[22] & 0x3f) << 8);
    const std::uint64_t parsed_height = 1ULL + (bytes[22] >> 6) + (static_cast<std::uint64_t>(bytes[23]) << 2) +
        (static_cast<std::uint64_t>(bytes[24] & 0x0f) << 10);
    return papyrus_comic_set_dimensions(parsed_width, parsed_height, width, height);
  }

  return papyrus_comic_parse_jpeg(bytes, size, width, height);
}
