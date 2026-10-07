require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'PapyrusNativeEngine'
  s.version      = package['version']
  s.summary      = 'Papyrus Native Engine (PDFKit)'
  s.homepage     = 'https://solrachix.github.io/Papyrus/'
  s.license      = { :type => 'MIT' }
  s.author       = { 'Papyrus SDK' => 'https://github.com/solrachix/Papyrus' }
  s.platforms    = { :ios => '13.0' }
  s.source       = { :git => 'https://github.com/solrachix/Papyrus.git', :tag => s.version.to_s }
  archive_sources = %w[
    archive_acl.c archive_blake2s_ref.c archive_blake2sp_ref.c archive_check_magic.c
    archive_cryptor.c archive_digest.c archive_entry.c archive_entry_copy_stat.c
    archive_entry_link_resolver.c archive_entry_sparse.c archive_entry_strmode.c
    archive_entry_xattr.c archive_hmac.c archive_options.c archive_pack_dev.c
    archive_pathmatch.c archive_ppmd7.c archive_ppmd8.c archive_random.c archive_rb.c
    archive_read.c archive_read_add_passphrase.c archive_read_append_filter.c
    archive_read_data_into_fd.c archive_read_open_fd.c archive_read_open_file.c
    archive_read_open_filename.c archive_read_open_memory.c archive_read_set_format.c
    archive_read_set_options.c archive_read_support_filter_none.c
    archive_read_support_format_empty.c archive_read_support_format_rar.c
    archive_read_support_format_rar5.c archive_read_support_format_zip.c
    archive_string.c archive_string_sprintf.c archive_time.c archive_util.c
    archive_version_details.c archive_virtual.c
  ]
  s.source_files = [
    'ios/**/*.{h,m,mm,swift}',
    'vendor/libarchive/PapyrusComicArchive.{h,cpp}',
    'vendor/libarchive/config/PapyrusArchiveConfig.h',
    'vendor/libarchive/libarchive/*.h',
  ] + archive_sources.map { |file| "vendor/libarchive/libarchive/#{file}" }
  s.frameworks = 'PDFKit', 'PencilKit'
  s.libraries = 'z'
  s.requires_arc = true
  s.swift_version = '5.0'
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/vendor/libarchive" "$(PODS_TARGET_SRCROOT)/vendor/libarchive/libarchive" "$(PODS_TARGET_SRCROOT)/vendor/libarchive/config"',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) PLATFORM_CONFIG_H=\\"PapyrusArchiveConfig.h\\"',
  }

  s.dependency 'React-Core'
end
