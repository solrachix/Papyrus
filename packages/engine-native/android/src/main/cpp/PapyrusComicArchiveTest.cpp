#include "PapyrusComicArchive.h"

#include <cassert>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

namespace {
void append_u16(std::vector<unsigned char> &bytes, std::uint16_t value) {
  bytes.push_back(static_cast<unsigned char>(value & 0xff));
  bytes.push_back(static_cast<unsigned char>((value >> 8) & 0xff));
}

void append_u32(std::vector<unsigned char> &bytes, std::uint32_t value) {
  append_u16(bytes, static_cast<std::uint16_t>(value & 0xffff));
  append_u16(bytes, static_cast<std::uint16_t>((value >> 16) & 0xffff));
}

std::uint32_t zip_crc32(const std::vector<unsigned char> &bytes) {
  std::uint32_t crc = 0xffffffffU;
  for (unsigned char byte : bytes) {
    crc ^= byte;
    for (int bit = 0; bit < 8; ++bit) crc = (crc >> 1) ^ (0xedb88320U & (0U - (crc & 1U)));
  }
  return ~crc;
}

void append_zip_entry(std::vector<unsigned char> &zip,
                      const std::string &name,
                      const std::vector<unsigned char> &data,
                      std::uint32_t *local_offset) {
  *local_offset = static_cast<std::uint32_t>(zip.size());
  const std::uint32_t crc = zip_crc32(data);
  append_u32(zip, 0x04034b50U);
  append_u16(zip, 20); append_u16(zip, 0); append_u16(zip, 0);
  append_u16(zip, 0); append_u16(zip, 0);
  append_u32(zip, crc); append_u32(zip, static_cast<std::uint32_t>(data.size()));
  append_u32(zip, static_cast<std::uint32_t>(data.size()));
  append_u16(zip, static_cast<std::uint16_t>(name.size())); append_u16(zip, 0);
  zip.insert(zip.end(), name.begin(), name.end());
  zip.insert(zip.end(), data.begin(), data.end());
}

void append_central_entry(std::vector<unsigned char> &zip,
                          const std::string &name,
                          const std::vector<unsigned char> &data,
                          std::uint32_t local_offset) {
  append_u32(zip, 0x02014b50U);
  append_u16(zip, 20); append_u16(zip, 20); append_u16(zip, 0); append_u16(zip, 0);
  append_u16(zip, 0); append_u16(zip, 0);
  append_u32(zip, zip_crc32(data)); append_u32(zip, static_cast<std::uint32_t>(data.size()));
  append_u32(zip, static_cast<std::uint32_t>(data.size()));
  append_u16(zip, static_cast<std::uint16_t>(name.size())); append_u16(zip, 0);
  append_u16(zip, 0); append_u16(zip, 0); append_u16(zip, 0); append_u32(zip, 0);
  append_u32(zip, local_offset);
  zip.insert(zip.end(), name.begin(), name.end());
}

std::vector<unsigned char> png_header(std::uint32_t width, std::uint32_t height) {
  return {0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 'I', 'H', 'D', 'R',
          static_cast<unsigned char>(width >> 24), static_cast<unsigned char>(width >> 16),
          static_cast<unsigned char>(width >> 8), static_cast<unsigned char>(width),
          static_cast<unsigned char>(height >> 24), static_cast<unsigned char>(height >> 16),
          static_cast<unsigned char>(height >> 8), static_cast<unsigned char>(height)};
}

std::filesystem::path make_dimensions_archive(const std::filesystem::path &directory) {
  struct Entry { std::string name; std::vector<unsigned char> data; std::uint32_t local_offset; };
  std::vector<Entry> entries = {
      {"page10.png", png_header(320, 480), 0},
      {"page2.png", png_header(1500, 1920), 0},
  };
  std::vector<unsigned char> zip;
  for (Entry &entry : entries) append_zip_entry(zip, entry.name, entry.data, &entry.local_offset);
  const std::uint32_t central_offset = static_cast<std::uint32_t>(zip.size());
  for (const Entry &entry : entries) append_central_entry(zip, entry.name, entry.data, entry.local_offset);
  const std::uint32_t central_size = static_cast<std::uint32_t>(zip.size()) - central_offset;
  append_u32(zip, 0x06054b50U);
  append_u16(zip, 0); append_u16(zip, 0); append_u16(zip, static_cast<std::uint16_t>(entries.size()));
  append_u16(zip, static_cast<std::uint16_t>(entries.size())); append_u32(zip, central_size);
  append_u32(zip, central_offset); append_u16(zip, 0);
  const std::filesystem::path path = directory / "papyrus-comic-dimensions-test.cbz";
  std::ofstream output(path, std::ios::binary | std::ios::trunc);
  output.write(reinterpret_cast<const char *>(zip.data()), static_cast<std::streamsize>(zip.size()));
  return path;
}
}

int main(int argc, char **argv) {
  assert(argc >= 2);
  const std::filesystem::path archive_path(argv[1]);
  const std::filesystem::path cache_dir = std::filesystem::temp_directory_path() / "papyrus-comic-archive-test";
  std::error_code ignored;
  std::filesystem::remove_all(cache_dir, ignored);

  int count = 0;
  char error[512] = {};
  assert(papyrus_comic_open("test-engine", 1, archive_path.string().c_str(), cache_dir.string().c_str(), &count, error, sizeof(error)) == 1);
  assert(count == 2);
  int page_width = 0;
  int page_height = 0;
  assert(!papyrus_comic_get_page_dimensions("test-engine", 1, 0, &page_width, &page_height));

  char path[1024] = {};
  assert(papyrus_comic_extract_page("test-engine", 1, 0, path, sizeof(path), error, sizeof(error)) == 1);
  std::ifstream first(path, std::ios::binary);
  const std::string first_bytes((std::istreambuf_iterator<char>(first)), std::istreambuf_iterator<char>());
  assert(first_bytes == "page-2");

  int next_count = 0;
  assert(papyrus_comic_open("test-engine", 2, archive_path.string().c_str(), cache_dir.string().c_str(), &next_count, error, sizeof(error)) == 1);
  assert(next_count == count);
  assert(papyrus_comic_extract_page("test-engine", 1, 1, path, sizeof(path), error, sizeof(error)) == 1);

  assert(papyrus_comic_extract_page("test-engine", 1, 1, path, sizeof(path), error, sizeof(error)) == 1);
  std::ifstream second(path, std::ios::binary);
  const std::string second_bytes((std::istreambuf_iterator<char>(second)), std::istreambuf_iterator<char>());
  assert(second_bytes == "page-10");

  papyrus_comic_close("test-engine", 1);
  assert(papyrus_comic_extract_page("test-engine", 1, 0, path, sizeof(path), error, sizeof(error)) == 0);
  assert(papyrus_comic_extract_page("test-engine", 2, 0, path, sizeof(path), error, sizeof(error)) == 1);
  papyrus_comic_close_engine("test-engine");
  assert(papyrus_comic_extract_page("test-engine", 2, 0, path, sizeof(path), error, sizeof(error)) == 0);

  const std::filesystem::path corrupt_path = cache_dir.parent_path() / "papyrus-corrupt-comic.cbz";
  {
    std::ofstream corrupt(corrupt_path, std::ios::binary);
    corrupt << "not a zip or rar archive";
  }
  count = 0;
  assert(papyrus_comic_open("test-corrupt", 1, corrupt_path.string().c_str(), cache_dir.string().c_str(), &count, error, sizeof(error)) == 0);
  assert(count == 0);
  std::filesystem::remove(corrupt_path, ignored);

  const std::filesystem::path dimensions_path = make_dimensions_archive(cache_dir.parent_path());
  int dimensions_count = 0;
  assert(papyrus_comic_open("test-dimensions", 1, dimensions_path.string().c_str(), cache_dir.string().c_str(),
                            &dimensions_count, error, sizeof(error)) == 1);
  assert(dimensions_count == 2);
  assert(papyrus_comic_get_page_dimensions("test-dimensions", 1, 0, &page_width, &page_height));
  assert(page_width == 1500 && page_height == 1920);
  assert(papyrus_comic_get_page_dimensions("test-dimensions", 1, 1, &page_width, &page_height));
  assert(page_width == 320 && page_height == 480);
  papyrus_comic_close_engine("test-dimensions");
  std::filesystem::remove(dimensions_path, ignored);

  if (argc > 2) {
    int real_count = 0;
    const std::filesystem::path real_archive(argv[2]);
    assert(papyrus_comic_open("test-real-cbr", 1, real_archive.string().c_str(), cache_dir.string().c_str(),
                              &real_count, error, sizeof(error)) == 1);
    int indexed_count = 0;
    for (int page = 0; page < real_count; ++page) {
      if (papyrus_comic_get_page_dimensions("test-real-cbr", 1, page, &page_width, &page_height)) {
        ++indexed_count;
        if (page < 5) std::cout << "page " << page << " dimensions=" << page_width << 'x' << page_height << '\n';
      }
    }
    std::cout << "real CBR pages=" << real_count << " with indexed dimensions=" << indexed_count << '\n';
    assert(real_count > 0 && indexed_count > 0);
    papyrus_comic_close_engine("test-real-cbr");
  }
  std::filesystem::remove_all(cache_dir, ignored);
  return 0;
}
