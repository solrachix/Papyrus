#ifndef PAPYRUS_ARCHIVE_CONFIG_H
#define PAPYRUS_ARCHIVE_CONFIG_H
#define __LIBARCHIVE_CONFIG_H_INCLUDED 1

/* Minimal POSIX configuration for the libarchive reader subset used by Papyrus. */
#define HAVE_INTTYPES_H 1
#define HAVE_STDINT_H 1
#define HAVE_SYS_TYPES_H 1
#define HAVE_SYS_STAT_H 1
#define HAVE_SYS_TIME_H 1
#define HAVE_TIME_H 1
#define HAVE_ERRNO_H 1
#define HAVE_LIMITS_H 1
#define HAVE_STDLIB_H 1
#define HAVE_STRING_H 1
#define HAVE_STRINGS_H 1
#define HAVE_WCHAR_H 1
#define HAVE_WCTYPE_H 1
#define HAVE_WCSCPY 1
#define HAVE_WCSLEN 1
#define HAVE_WMEMCMP 1
#define HAVE_CTYPE_H 1
#define HAVE_STDARG_H 1
#define HAVE_UNISTD_H 1
#define HAVE_FCNTL_H 1
#define HAVE_FCNTL 1
#define HAVE_FSEEKO 1
#define HAVE_FSTAT 1
#define HAVE_FSTATAT 1
#define HAVE_LSEEK 1
#define HAVE_OPEN 1
#define HAVE_READ 1
#define HAVE_CLOSE 1
#define HAVE_MEMMOVE 1
#define HAVE_STRDUP 1
#define HAVE_STRERROR 1
#define HAVE_GMTIME_R 1
#define HAVE_LOCALTIME_R 1
#define HAVE_MKSTEMP 1
#define HAVE_MKDIR 1
#define HAVE_STAT 1
#define HAVE_LSTAT 1
#define HAVE_ZLIB_H 1
#define HAVE_LIBZ 1
#include <stddef.h>
#include <wchar.h>
#include <wctype.h>
#define HAVE_DECL_SIZE_MAX 1
#define HAVE_DECL_SSIZE_MAX 1
#define HAVE_DECL_UINT32_MAX 1
#define HAVE_DECL_INT32_MAX 1
#define HAVE_DECL_INT32_MIN 1
#define HAVE_DECL_UINT64_MAX 1
#define HAVE_DECL_INT64_MAX 1
#define HAVE_DECL_INT64_MIN 1
#define HAVE_DECL_UINTMAX_MAX 1
#define HAVE_DECL_INTMAX_MAX 1
#define HAVE_DECL_INTMAX_MIN 1
#define HAVE_STRUCT_STAT_ST_BLKSIZE 1
#define HAVE_STRUCT_TM_TM_GMTOFF 1
#define SIZEOF_INT 4
#define SIZEOF_LONG 8
#define SIZEOF_LONG_LONG 8

#endif
