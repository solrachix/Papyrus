cmake_minimum_required(VERSION 3.18.1)
project(papyrus_text)

option(PAPYRUS_OUTLINE_HOST_TESTS "Build host tests for the outline loader" OFF)

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
endif()

if(PAPYRUS_OUTLINE_HOST_TESTS)
  enable_testing()

  add_executable(papyrus_outline_loader_test
    papyrus_outline_loader.cpp
    papyrus_outline_loader_test.cpp
  )

  papyrus_set_cxx17(papyrus_outline_loader_test)
  add_test(NAME papyrus_outline_loader_test COMMAND papyrus_outline_loader_test)
endif()
