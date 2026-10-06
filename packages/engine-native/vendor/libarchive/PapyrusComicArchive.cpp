#include "PapyrusComicArchive.h"

#include <archive.h>
#include <archive_entry.h>

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <functional>
#include <limits>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace fs = std::filesystem;

namespace {
constexpr std::uint64_t kMaximumEntryBytes = 64ULL * 1024ULL * 1024ULL;
// Reserve 16 MiB for downsampled thumbnails; page files plus thumbnails stay within 96 MiB.
constexpr std::uint64_t kMaximumExtractedPageCacheBytes = 80ULL * 1024ULL * 1024ULL;
constexpr std::size_t kMaximumEntries = 50000;
constexpr std::size_t kMaximumArchiveEntries = 200000;
constexpr std::size_t kIoBlockSize = 64 * 1024;

struct ComicPage {
  std::string name;
  std::string normalized_name;
  std::uint64_t declared_size = 0;
  std::size_t archive_ordinal = 0;
};

struct ComicDocument {
  std::string engine_id;
  int generation = 0;
  fs::path archive_path;
  fs::path cache_dir;
  std::vector<ComicPage> pages;
  std::mutex lock;
};

std::mutex g_documents_lock;
std::mutex g_cache_lock;
std::unordered_map<std::string, std::shared_ptr<ComicDocument>> g_documents;

std::string key_for(const char *engine_id, int generation) {
  return std::string(engine_id ? engine_id : "") + ":" + std::to_string(generation);
}

void write_error(char *buffer, std::size_t size, const std::string &message) {
  if (!buffer || size == 0) return;
  const std::size_t length = std::min(size - 1, message.size());
  std::copy(message.begin(), message.begin() + length, buffer);
  buffer[length] = '\0';
}

std::string normalize_path(std::string path) {
  std::replace(path.begin(), path.end(), '\\', '/');
  return path;
}

bool is_supported_image(const std::string &path) {
  const std::string normalized = normalize_path(path);
  const std::size_t slash = normalized.find_last_of('/');
  const std::string name = normalized.substr(slash == std::string::npos ? 0 : slash + 1);
  if (name.empty() || name[0] == '.') return false;

  std::size_t start = 0;
  while (start < normalized.size()) {
    const std::size_t end = normalized.find('/', start);
    const std::string part = normalized.substr(start, end == std::string::npos ? std::string::npos : end - start);
    std::string lower_part = part;
    std::transform(lower_part.begin(), lower_part.end(), lower_part.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    if (part.empty() || part[0] == '.' || lower_part == "__macosx") return false;
    if (end == std::string::npos) break;
    start = end + 1;
  }

  const std::size_t dot = name.find_last_of('.');
  if (dot == std::string::npos || dot + 1 >= name.size()) return false;
  std::string extension = name.substr(dot + 1);
  std::transform(extension.begin(), extension.end(), extension.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  const bool common_image = extension == "jpg" || extension == "jpeg" || extension == "png" || extension == "gif";
#if defined(__APPLE__)
  return common_image;
#else
  return common_image || extension == "webp";
#endif
}

int compare_digit_runs(const std::string &a, std::size_t &i, const std::string &b, std::size_t &j) {
  const std::size_t start_a = i;
  const std::size_t start_b = j;
  while (i < a.size() && a[i] == '0') ++i;
  while (j < b.size() && b[j] == '0') ++j;
  const std::size_t significant_a = i;
  const std::size_t significant_b = j;
  while (i < a.size() && std::isdigit(static_cast<unsigned char>(a[i]))) ++i;
  while (j < b.size() && std::isdigit(static_cast<unsigned char>(b[j]))) ++j;
  const std::size_t length_a = i - significant_a;
  const std::size_t length_b = j - significant_b;
  if (length_a != length_b) return length_a < length_b ? -1 : 1;
  const int number_compare = a.compare(significant_a, length_a, b, significant_b, length_b);
  if (number_compare != 0) return number_compare < 0 ? -1 : 1;
  const std::size_t width_a = i - start_a;
  const std::size_t width_b = j - start_b;
  return width_a == width_b ? 0 : (width_a < width_b ? -1 : 1);
}

bool natural_less(const ComicPage &left, const ComicPage &right) {
  const std::string &a = left.normalized_name;
  const std::string &b = right.normalized_name;
  std::size_t i = 0, j = 0;
  while (i < a.size() && j < b.size()) {
    const unsigned char ca = static_cast<unsigned char>(a[i]);
    const unsigned char cb = static_cast<unsigned char>(b[j]);
    if (std::isdigit(ca) && std::isdigit(cb)) {
      const int comparison = compare_digit_runs(a, i, b, j);
      if (comparison != 0) return comparison < 0;
      continue;
    }
    const unsigned char lower_a = static_cast<unsigned char>(std::tolower(ca));
    const unsigned char lower_b = static_cast<unsigned char>(std::tolower(cb));
    if (lower_a != lower_b) return lower_a < lower_b;
    ++i;
    ++j;
  }
  if (a.size() != b.size()) return a.size() < b.size();
  return left.name < right.name;
}

struct ArchiveDeleter {
  void operator()(archive *reader) const { if (reader) archive_read_free(reader); }
};
using Reader = std::unique_ptr<archive, ArchiveDeleter>;

Reader new_reader(std::string &error) {
  Reader reader(archive_read_new());
  if (!reader) {
    error = "Unable to allocate archive reader";
    return nullptr;
  }
  archive_read_support_filter_none(reader.get());
  archive_read_support_format_zip(reader.get());
  archive_read_support_format_rar(reader.get());
  archive_read_support_format_rar5(reader.get());
  return reader;
}

std::shared_ptr<ComicDocument> find_document(const char *engine_id, int generation) {
  std::lock_guard<std::mutex> guard(g_documents_lock);
  const auto found = g_documents.find(key_for(engine_id, generation));
  return found == g_documents.end() ? nullptr : found->second;
}

void prune_disk_cache(const fs::path &directory, const fs::path &preserve) {
  std::lock_guard<std::mutex> cache_guard(g_cache_lock);
  std::error_code error;
  if (!fs::exists(directory, error)) return;
  struct CacheFile { fs::path path; std::uint64_t size; fs::file_time_type time; };
  std::vector<CacheFile> files;
  std::uint64_t total = 0;
  for (const auto &item : fs::directory_iterator(directory, error)) {
    if (error || !item.is_regular_file()) continue;
    const std::string name = item.path().filename().string();
    if (name.find("papyrus-comic-page-") != 0) continue;
    const std::uint64_t size = item.file_size(error);
    if (error) { error.clear(); continue; }
    total += size;
    files.push_back({item.path(), size, item.last_write_time(error)});
    if (error) error.clear();
  }
  std::sort(files.begin(), files.end(), [](const CacheFile &a, const CacheFile &b) { return a.time < b.time; });
  for (const auto &file : files) {
    if (total <= kMaximumExtractedPageCacheBytes) break;
    if (file.path == preserve) continue;
    if (fs::remove(file.path, error)) total -= file.size;
    error.clear();
  }
}
} // namespace

extern "C" int papyrus_comic_open(const char *engine_id,
                                  int generation,
                                  const char *archive_path,
                                  const char *cache_dir,
                                  int *page_count,
                                  char *error_buffer,
                                  size_t error_buffer_size) {
  if (!engine_id || !*engine_id || !archive_path || !cache_dir) {
    write_error(error_buffer, error_buffer_size, "Missing comic archive identity or path");
    return 0;
  }
  auto document = std::make_shared<ComicDocument>();
  document->engine_id = engine_id;
  document->generation = generation;
  document->archive_path = archive_path;
  document->cache_dir = cache_dir;

  std::string message;
  Reader reader = new_reader(message);
  if (!reader || archive_read_open_filename(reader.get(), archive_path, kIoBlockSize) != ARCHIVE_OK) {
    write_error(error_buffer, error_buffer_size, reader ? archive_error_string(reader.get()) : message);
    return 0;
  }

  archive_entry *entry = nullptr;
  std::size_t ordinal = 0;
  for (;;) {
    const int status = archive_read_next_header(reader.get(), &entry);
    if (status == ARCHIVE_EOF) break;
    if (status != ARCHIVE_OK && status != ARCHIVE_WARN) {
      const char *archive_error = archive_error_string(reader.get());
      write_error(error_buffer, error_buffer_size, archive_error ? archive_error : "Corrupt comic archive");
      return 0;
    }
    const char *raw_name = archive_entry_pathname_utf8(entry);
    if (!raw_name) raw_name = archive_entry_pathname(entry);
    const std::string name = raw_name ? normalize_path(raw_name) : std::string();
    const la_int64_t declared_size = archive_entry_size(entry);
    if (archive_entry_filetype(entry) == AE_IFREG && !archive_entry_symlink(entry) &&
        !archive_entry_hardlink(entry) && is_supported_image(name) &&
        declared_size >= 0 && static_cast<std::uint64_t>(declared_size) <= kMaximumEntryBytes) {
      document->pages.push_back({name, name, static_cast<std::uint64_t>(declared_size), ordinal});
      if (document->pages.size() > kMaximumEntries) {
        write_error(error_buffer, error_buffer_size, "Comic archive has too many page entries");
        return 0;
      }
    }
    archive_read_data_skip(reader.get());
    ++ordinal;
    if (ordinal > kMaximumArchiveEntries) {
      write_error(error_buffer, error_buffer_size, "Comic archive has too many entries");
      return 0;
    }
  }
  if (document->pages.empty()) {
    write_error(error_buffer, error_buffer_size, "Comic archive contains no supported image pages");
    return 0;
  }
  std::stable_sort(document->pages.begin(), document->pages.end(), natural_less);
  std::error_code error;
  fs::create_directories(document->cache_dir, error);
  if (error) {
    write_error(error_buffer, error_buffer_size, "Unable to create comic page cache");
    return 0;
  }
  {
    std::lock_guard<std::mutex> guard(g_documents_lock);
    const std::string key = key_for(engine_id, generation);
    g_documents[key] = document;
  }
  if (page_count) *page_count = static_cast<int>(document->pages.size());
  return 1;
}

extern "C" int papyrus_comic_extract_page(const char *engine_id,
                                          int generation,
                                          int page_index,
                                          char *output_path,
                                          size_t output_path_size,
                                          char *error_buffer,
                                          size_t error_buffer_size) {
  auto document = find_document(engine_id, generation);
  if (!document || page_index < 0 || static_cast<std::size_t>(page_index) >= document->pages.size()) {
    write_error(error_buffer, error_buffer_size, "Comic page is unavailable");
    return 0;
  }
  std::lock_guard<std::mutex> guard(document->lock);
  const ComicPage &page = document->pages[static_cast<std::size_t>(page_index)];
  std::string extension = fs::path(page.name).extension().string();
  std::string filename = "papyrus-comic-page-" + std::to_string(std::hash<std::string>{}(document->engine_id)) +
    "-" + std::to_string(generation) + "-" + std::to_string(page_index) + extension;
  fs::path destination = document->cache_dir / filename;
  std::error_code filesystem_error;
  if (fs::is_regular_file(destination, filesystem_error) && fs::file_size(destination, filesystem_error) <= kMaximumEntryBytes) {
    fs::last_write_time(destination, fs::file_time_type::clock::now(), filesystem_error);
    const std::string value = destination.string();
    if (output_path && value.size() + 1 <= output_path_size) {
      std::copy(value.begin(), value.end(), output_path);
      output_path[value.size()] = '\0';
      return 1;
    }
    write_error(error_buffer, error_buffer_size, "Output path buffer is too small");
    return 0;
  }

  std::string message;
  Reader reader = new_reader(message);
  if (!reader || archive_read_open_filename(reader.get(), document->archive_path.string().c_str(), kIoBlockSize) != ARCHIVE_OK) {
    write_error(error_buffer, error_buffer_size, reader ? archive_error_string(reader.get()) : message);
    return 0;
  }
  archive_entry *entry = nullptr;
  std::size_t ordinal = 0;
  while (ordinal <= page.archive_ordinal) {
    const int status = archive_read_next_header(reader.get(), &entry);
    if (status != ARCHIVE_OK && status != ARCHIVE_WARN) {
      const char *archive_error = archive_error_string(reader.get());
      write_error(error_buffer, error_buffer_size, archive_error ? archive_error : "Unable to read comic page entry");
      return 0;
    }
    if (ordinal < page.archive_ordinal) {
      archive_read_data_skip(reader.get());
      ++ordinal;
      continue;
    }
    if (archive_entry_is_encrypted(entry) == 1) {
      write_error(error_buffer, error_buffer_size, "Encrypted comic pages are not supported");
      return 0;
    }
    std::ofstream output(destination, std::ios::binary | std::ios::trunc);
    if (!output) {
      write_error(error_buffer, error_buffer_size, "Unable to create comic page cache file");
      return 0;
    }
    char buffer[kIoBlockSize];
    std::uint64_t total = 0;
    for (;;) {
      const la_ssize_t count = archive_read_data(reader.get(), buffer, sizeof(buffer));
      if (count == 0) break;
      if (count < 0) {
        output.close();
        fs::remove(destination, filesystem_error);
        const char *archive_error = archive_error_string(reader.get());
        write_error(error_buffer, error_buffer_size, archive_error ? archive_error : "Unable to extract comic page");
        return 0;
      }
      total += static_cast<std::uint64_t>(count);
      if (total > kMaximumEntryBytes) {
        output.close();
        fs::remove(destination, filesystem_error);
        write_error(error_buffer, error_buffer_size, "Comic page exceeds the 64 MiB size limit");
        return 0;
      }
      output.write(buffer, count);
      if (!output) {
        output.close();
        fs::remove(destination, filesystem_error);
        write_error(error_buffer, error_buffer_size, "Failed while caching comic page");
        return 0;
      }
    }
    output.close();
    break;
  }

  prune_disk_cache(document->cache_dir, destination);
  const std::string value = destination.string();
  if (!output_path || value.size() + 1 > output_path_size) {
    write_error(error_buffer, error_buffer_size, "Output path buffer is too small");
    return 0;
  }
  std::copy(value.begin(), value.end(), output_path);
  output_path[value.size()] = '\0';
  return 1;
}

extern "C" void papyrus_comic_close(const char *engine_id, int generation) {
  if (!engine_id) return;
  std::lock_guard<std::mutex> guard(g_documents_lock);
  g_documents.erase(key_for(engine_id, generation));
}

extern "C" void papyrus_comic_close_engine(const char *engine_id) {
  if (!engine_id) return;
  std::lock_guard<std::mutex> guard(g_documents_lock);
  for (auto iterator = g_documents.begin(); iterator != g_documents.end();) {
    if (iterator->second->engine_id == engine_id) iterator = g_documents.erase(iterator);
    else ++iterator;
  }
}
