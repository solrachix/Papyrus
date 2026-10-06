#pragma once

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

int papyrus_comic_open(const char *engine_id,
                       int generation,
                       const char *archive_path,
                       const char *cache_dir,
                       int *page_count,
                       char *error_buffer,
                       size_t error_buffer_size);

int papyrus_comic_extract_page(const char *engine_id,
                               int generation,
                               int page_index,
                               char *output_path,
                               size_t output_path_size,
                               char *error_buffer,
                               size_t error_buffer_size);

void papyrus_comic_close(const char *engine_id, int generation);
void papyrus_comic_close_engine(const char *engine_id);

#ifdef __cplusplus
}
#endif
