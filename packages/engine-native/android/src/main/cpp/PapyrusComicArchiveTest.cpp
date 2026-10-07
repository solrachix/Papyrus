#include "PapyrusComicArchive.h"

#include <cassert>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>

int main(int argc, char **argv) {
  assert(argc == 2);
  const std::filesystem::path archive_path(argv[1]);
  const std::filesystem::path cache_dir = std::filesystem::temp_directory_path() / "papyrus-comic-archive-test";
  std::error_code ignored;
  std::filesystem::remove_all(cache_dir, ignored);

  int count = 0;
  char error[512] = {};
  assert(papyrus_comic_open("test-engine", 1, archive_path.string().c_str(), cache_dir.string().c_str(), &count, error, sizeof(error)) == 1);
  assert(count == 2);

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
  std::filesystem::remove_all(cache_dir, ignored);
  return 0;
}
