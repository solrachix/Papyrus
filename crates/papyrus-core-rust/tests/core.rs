use papyrus_core_rust::PdfCore;

#[test]
fn loads_pages_and_extracts_text_from_a_pdf() {
    let bytes = std::fs::read("../../examples/web/assets/tracemonkey-pldi-09.pdf")
        .expect("sample PDF should exist");
    let core = PdfCore::load(&bytes).expect("sample PDF should load");

    assert_eq!(core.page_count(), 14);
    assert!(!core
        .page_text(1)
        .expect("page text should extract")
        .is_empty());
}

#[test]
fn searches_text_and_returns_page_numbers() {
    let bytes = std::fs::read("../../examples/web/assets/tracemonkey-pldi-09.pdf")
        .expect("sample PDF should exist");
    let core = PdfCore::load(&bytes).expect("sample PDF should load");

    let hits = core.search("the").expect("search should work");

    assert!(!hits.is_empty());
    assert!(hits.iter().all(|hit| hit.page_number >= 1));
}
