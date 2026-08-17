use std::io::{Cursor, Write};

use papyrus_cbz_rust::CbzCore;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

fn fixture() -> Vec<u8> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    writer.start_file("page-10.jpg", options).unwrap();
    writer.write_all(b"ten").unwrap();
    writer.start_file("page-2.jpg", options).unwrap();
    writer.write_all(b"two").unwrap();
    writer.start_file(".hidden.jpg", options).unwrap();
    writer.write_all(b"hidden").unwrap();
    writer.start_file("ComicInfo.xml", options).unwrap();
    writer.write_all(b"<ComicInfo />").unwrap();
    writer.start_file("notes.txt", options).unwrap();
    writer.write_all(b"not a page").unwrap();
    writer.finish().unwrap().into_inner()
}

#[test]
fn loads_only_image_pages_in_natural_order() {
    let core = CbzCore::load(&fixture()).unwrap();

    assert_eq!(core.page_count(), 2);
    assert_eq!(
        core.pages()
            .iter()
            .map(|page| page.name.as_str())
            .collect::<Vec<_>>(),
        vec!["page-2.jpg", "page-10.jpg"]
    );
}

#[test]
fn reads_page_bytes_by_zero_based_index() {
    let mut core = CbzCore::load(&fixture()).unwrap();

    assert_eq!(core.page_name(0).unwrap(), "page-2.jpg");
    assert_eq!(core.page_size(1).unwrap(), 3);
    assert_eq!(core.read_page(0).unwrap(), b"two");
    assert_eq!(core.read_page(1).unwrap(), b"ten");
    assert!(core.read_page(2).is_err());
}

#[test]
fn rejects_invalid_archive() {
    let error = CbzCore::load(b"not a zip").unwrap_err();

    assert!(error.to_string().contains("CBZ"));
}
