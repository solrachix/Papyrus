cmake_minimum_required(VERSION 3.18.1)
project(papyrus_text)

add_library(papyrus_text SHARED
  papyrus_text_search.cpp
  papyrus_outline.cpp
)

target_compile_options(papyrus_text PRIVATE -Wall -Werror)
set_target_properties(papyrus_text PROPERTIES
  CXX_STANDARD 17
  CXX_STANDARD_REQUIRED YES
)

find_library(log-lib log)
find_library(android-lib android)
find_library(dl-lib dl)

target_link_libraries(papyrus_text
  ${log-lib}
  ${android-lib}
  ${dl-lib}
)
