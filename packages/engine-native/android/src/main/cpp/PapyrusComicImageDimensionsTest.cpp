#include "PapyrusComicImageDimensions.h"

#include <cassert>
#include <cstdint>
#include <vector>

namespace {
void appendJpegSegment(std::vector<std::uint8_t> &bytes, std::uint8_t marker,
                       const std::vector<std::uint8_t> &payload) {
  bytes.push_back(0xff);
  bytes.push_back(marker);
  const std::uint16_t length = static_cast<std::uint16_t>(payload.size() + 2);
  bytes.push_back(static_cast<std::uint8_t>(length >> 8));
  bytes.push_back(static_cast<std::uint8_t>(length & 0xff));
  bytes.insert(bytes.end(), payload.begin(), payload.end());
}
}

int main() {
  int width = 0;
  int height = 0;

  std::vector<std::uint8_t> jpeg = {0xff, 0xd8};
  appendJpegSegment(jpeg, 0xe0, {0x4a, 0x46, 0x49, 0x46, 0x00});
  appendJpegSegment(jpeg, 0xc0, {0x08, 0x0c, 0xbf, 0x09, 0xf6, 0x03, 0x01, 0x11, 0x00,
                                 0x02, 0x11, 0x00, 0x03, 0x11, 0x00});
  assert(papyrus_comic_parse_image_dimensions(jpeg.data(), jpeg.size(), &width, &height));
  assert(width == 2550);
  assert(height == 3263);

  const std::vector<std::uint8_t> png = {
      0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 'I', 'H', 'D', 'R',
      0x00, 0x00, 0x05, 0xdc, 0x00, 0x00, 0x07, 0x80};
  assert(papyrus_comic_parse_image_dimensions(png.data(), png.size(), &width, &height));
  assert(width == 1500);
  assert(height == 1920);

  const std::vector<std::uint8_t> gif = {'G', 'I', 'F', '8', '9', 'a', 0x20, 0x03, 0x80, 0x07};
  assert(papyrus_comic_parse_image_dimensions(gif.data(), gif.size(), &width, &height));
  assert(width == 800);
  assert(height == 1920);

  assert(!papyrus_comic_parse_image_dimensions(png.data(), 12, &width, &height));
  const std::vector<std::uint8_t> unknown = {'n', 'o', 't', ' ', 'i', 'm', 'a', 'g', 'e'};
  assert(!papyrus_comic_parse_image_dimensions(unknown.data(), unknown.size(), &width, &height));
  return 0;
}
