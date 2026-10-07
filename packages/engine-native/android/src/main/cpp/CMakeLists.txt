cmake_minimum_required(VERSION 3.18.1)
project(papyrus_text)

option(PAPYRUS_OUTLINE_HOST_TESTS "Build host tests for the outline loader" OFF)
option(PAPYRUS_COMIC_ARCHIVE_HOST_TESTS "Build host tests for the comic archive reader" OFF)
# Alias geral para todos os testes C++ puros (inclui o outline loader).
option(PAPYRUS_CPP_HOST_TESTS "Build all pure C++ host tests" OFF)

function(papyrus_set_cxx17 target_name)
  set_target_properties(${target_name} PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED YES
  )
endfunction()

if(ANDROID)
  add_library(papyrus_text SHARED
    papyrus_text_search.cpp
    papyrus_outline.cpp
    papyrus_outline_loader.cpp
    papyrus_text_word.cpp
  )

  papyrus_set_cxx17(papyrus_text)
  target_compile_options(papyrus_text PRIVATE -Wall -Werror)
  target_link_options(papyrus_text PRIVATE "-Wl,-z,max-page-size=16384")

  find_library(log-lib log)
  find_library(android-lib android)
  find_library(dl-lib dl)

  target_link_libraries(papyrus_text
    ${log-lib}
    ${android-lib}
    ${dl-lib}
  )

  set(PAPYRUS_LIBARCHIVE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../vendor/libarchive)
  set(PAPYRUS_LIBARCHIVE_SOURCES
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_acl.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_check_magic.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_cryptor.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_digest.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_entry.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_entry_copy_stat.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_entry_link_resolver.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_entry_sparse.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_entry_strmode.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_entry_xattr.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_blake2sp_ref.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_blake2s_ref.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_hmac.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_options.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_pack_dev.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_pathmatch.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_ppmd7.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_ppmd8.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_random.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_rb.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_add_passphrase.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_append_filter.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_data_into_fd.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_open_fd.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_open_file.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_open_filename.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_open_memory.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_set_format.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_set_options.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_support_filter_none.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_support_format_empty.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_support_format_rar.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_support_format_rar5.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_support_format_zip.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_string.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_string_sprintf.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_time.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_util.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_version_details.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_virtual.c
  )

  add_library(papyrus_archive STATIC ${PAPYRUS_LIBARCHIVE_SOURCES})
  find_library(z-lib z)
  set_target_properties(papyrus_archive PROPERTIES POSITION_INDEPENDENT_CODE ON)
  target_compile_definitions(papyrus_archive PRIVATE PLATFORM_CONFIG_H=\"PapyrusArchiveConfig.h\")
  target_include_directories(papyrus_archive PUBLIC
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive
    ${PAPYRUS_LIBARCHIVE_DIR}/config
  )
  target_link_libraries(papyrus_archive PUBLIC ${log-lib} ${z-lib})

  add_library(papyrus_comic SHARED
    ${PAPYRUS_LIBARCHIVE_DIR}/PapyrusComicArchive.cpp
    PapyrusComicArchiveJni.cpp
  )
  papyrus_set_cxx17(papyrus_comic)
  target_compile_options(papyrus_comic PRIVATE -Wall -Werror)
  target_link_options(papyrus_comic PRIVATE "-Wl,-z,max-page-size=16384")
  target_include_directories(papyrus_comic PRIVATE
    ${PAPYRUS_LIBARCHIVE_DIR}
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive
    ${PAPYRUS_LIBARCHIVE_DIR}/config
  )
  target_link_libraries(papyrus_comic papyrus_archive ${z-lib} ${log-lib})
endif()

if(PAPYRUS_OUTLINE_HOST_TESTS OR PAPYRUS_CPP_HOST_TESTS)
  enable_testing()

  add_executable(papyrus_outline_loader_test
    papyrus_outline_loader.cpp
    papyrus_outline_loader_test.cpp
  )

  papyrus_set_cxx17(papyrus_outline_loader_test)
  add_test(NAME papyrus_outline_loader_test COMMAND papyrus_outline_loader_test)

  add_executable(papyrus_text_word_test
    papyrus_text_word.cpp
    papyrus_text_word_test.cpp
  )

  papyrus_set_cxx17(papyrus_text_word_test)
  add_test(NAME papyrus_text_word_test COMMAND papyrus_text_word_test)
endif()

if(PAPYRUS_COMIC_ARCHIVE_HOST_TESTS)
  enable_testing()
  find_package(ZLIB REQUIRED)
  set(PAPYRUS_LIBARCHIVE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../vendor/libarchive)
  set(PAPYRUS_LIBARCHIVE_SOURCES
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_acl.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_check_magic.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_cryptor.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_digest.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_entry.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_entry_copy_stat.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_entry_link_resolver.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_entry_sparse.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_entry_strmode.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_entry_xattr.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_blake2sp_ref.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_blake2s_ref.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_hmac.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_options.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_pack_dev.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_pathmatch.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_ppmd7.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_ppmd8.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_random.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_rb.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_add_passphrase.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_append_filter.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_data_into_fd.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_open_fd.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_open_file.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_open_filename.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_open_memory.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_set_format.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_set_options.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_support_filter_none.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_support_format_empty.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_support_format_rar.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_support_format_rar5.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_read_support_format_zip.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_string.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_string_sprintf.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_time.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_util.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_version_details.c
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive/archive_virtual.c
  )
  add_library(papyrus_archive_host STATIC ${PAPYRUS_LIBARCHIVE_SOURCES})
  set_target_properties(papyrus_archive_host PROPERTIES POSITION_INDEPENDENT_CODE ON)
  target_compile_definitions(papyrus_archive_host PRIVATE PLATFORM_CONFIG_H=\"PapyrusArchiveConfig.h\")
  target_include_directories(papyrus_archive_host PUBLIC
    ${PAPYRUS_LIBARCHIVE_DIR}/libarchive
    ${PAPYRUS_LIBARCHIVE_DIR}/config
  )
  target_link_libraries(papyrus_archive_host PUBLIC ZLIB::ZLIB)
  add_executable(papyrus_comic_archive_test
    ${PAPYRUS_LIBARCHIVE_DIR}/PapyrusComicArchive.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/PapyrusComicArchiveTest.cpp
  )
  papyrus_set_cxx17(papyrus_comic_archive_test)
  target_compile_options(papyrus_comic_archive_test PRIVATE -Wall -Wextra -Werror)
  target_include_directories(papyrus_comic_archive_test PRIVATE ${PAPYRUS_LIBARCHIVE_DIR})
  target_link_libraries(papyrus_comic_archive_test PRIVATE papyrus_archive_host)
  add_test(NAME papyrus_comic_archive_test COMMAND papyrus_comic_archive_test
    ${CMAKE_CURRENT_SOURCE_DIR}/../../test/fixtures/native-comic.cbz)
endif()
