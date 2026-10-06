/*
 * Macros for file64 functions.
 * Android does not support _FILE_OFFSET_BITS=64. Android API 21 and later
 * provide the corresponding file64 functions directly.
 */
#ifndef ARCHIVE_ANDROID_LF_H_INCLUDED
#define ARCHIVE_ANDROID_LF_H_INCLUDED

#if __ANDROID_API__ > 20
#include <dirent.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>
#include <sys/statvfs.h>
#include <sys/types.h>
#include <sys/vfs.h>

#define readdir readdir64
#define dirent dirent64
#define openat openat64
#define open open64
#define mkstemp mkstemp64
#define lseek lseek64
#define ftruncate ftruncate64
#define fstatat fstatat64
#define fstat fstat64
#define lstat lstat64
#define stat stat64
#define fstatvfs fstatvfs64
#define statvfs statvfs64
#define off_t off64_t
#define fstatfs fstatfs64
#define statfs statfs64
#endif

#endif /* ARCHIVE_ANDROID_LF_H_INCLUDED */
