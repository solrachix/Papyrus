# Vendored libarchive subset

This source snapshot is libarchive **v3.8.9**, pinned to upstream commit
`27cbc7827172698143e440801fc0ba39ccb4f1f5` from
`https://github.com/libarchive/libarchive`.

Papyrus compiles only the read-side source subset listed in both
`android/src/main/cpp/CMakeLists.txt` and `PapyrusNativeEngine.podspec`.
The public C++ adapter in this directory filters comic archive entries,
orders them naturally, and extracts one selected image at a time to a bounded
cache. It does not write or modify archives.

The libarchive files retain their upstream notices. BLAKE2 reference source
files also carry the separate permissive notice in
`third_party_licenses/BLAKE2-NOTICE.txt`.
