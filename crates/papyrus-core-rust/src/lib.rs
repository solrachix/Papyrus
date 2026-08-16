use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};

use lopdf::Document;
use serde::Serialize;

const MAX_PAGE_CONTENT_BYTES: usize = 8 * 1024 * 1024;
const MAX_SEARCH_CACHE_ENTRIES: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SearchHit {
    pub page_number: u32,
    pub matches: usize,
}

struct SearchData {
    normalized_page_texts: BTreeMap<u32, String>,
}

pub struct PdfCore {
    document: Document,
    search_data: OnceLock<SearchData>,
    search_cache: Mutex<BTreeMap<String, Vec<SearchHit>>>,
}

#[cfg(test)]
mod tests {
    use super::PdfCore;

    #[test]
    fn builds_search_index_on_first_search() {
        let bytes = std::fs::read("../../examples/web/assets/tracemonkey-pldi-09.pdf")
            .expect("sample PDF should exist");
        let core = PdfCore::load(&bytes).expect("sample PDF should load");

        assert!(!core.has_search_index());
        core.search("the").expect("search should work");
        assert!(core.has_search_index());
        assert_eq!(core.indexed_page_count(), core.page_count());
    }

    #[test]
    fn skips_pages_that_fail_text_extraction() {
        let data = PdfCore::build_search_data_from_pages([1, 2, 3], |page_number| {
            if page_number == 2 {
                Err("page too large".to_owned())
            } else {
                Ok(format!("page {page_number}"))
            }
        });

        assert_eq!(data.normalized_page_texts.len(), 2);
        assert!(!data.normalized_page_texts.contains_key(&2));
    }

    #[test]
    fn normalizes_case_and_whitespace_for_search() {
        assert_eq!(super::normalize_search_text(" Foo\n  BAR "), "foo bar");
    }

    #[test]
    fn bounds_search_query_cache() {
        let bytes = std::fs::read("../../examples/web/assets/tracemonkey-pldi-09.pdf")
            .expect("sample PDF should exist");
        let core = PdfCore::load(&bytes).expect("sample PDF should load");

        for query_number in 0..64 {
            core.search(&format!("query-{query_number}"))
                .expect("search should work");
        }

        let cache_size = core
            .search_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .len();
        assert!(cache_size <= super::MAX_SEARCH_CACHE_ENTRIES);
    }
}

impl PdfCore {
    pub fn load(bytes: &[u8]) -> Result<Self, String> {
        let document = Document::load_mem(bytes).map_err(|error| error.to_string())?;
        Ok(Self {
            document,
            search_data: OnceLock::new(),
            search_cache: Mutex::new(BTreeMap::new()),
        })
    }

    pub fn page_count(&self) -> usize {
        self.document.get_pages().len()
    }

    pub fn page_text(&self, page_number: u32) -> Result<String, String> {
        self.document
            .extract_text_with_limit(&[page_number], MAX_PAGE_CONTENT_BYTES)
            .map_err(|error| error.to_string())
    }

    pub fn search(&self, query: &str) -> Result<Vec<SearchHit>, String> {
        let normalized_query = normalize_search_text(query);
        if normalized_query.is_empty() {
            return Ok(Vec::new());
        }

        let mut search_cache = self
            .search_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(cached_hits) = search_cache.get(&normalized_query).cloned() {
            return Ok(cached_hits);
        }

        let data = self.get_search_data();
        let mut hits = Vec::new();
        for (&page_number, normalized_text) in &data.normalized_page_texts {
            let matches = normalized_text.match_indices(&normalized_query).count();
            if matches > 0 {
                hits.push(SearchHit {
                    page_number,
                    matches,
                });
            }
        }
        if search_cache.len() >= MAX_SEARCH_CACHE_ENTRIES {
            if let Some(oldest_query) = search_cache.keys().next().cloned() {
                search_cache.remove(&oldest_query);
            }
        }
        search_cache.insert(normalized_query, hits.clone());
        Ok(hits)
    }

    fn get_search_data(&self) -> &SearchData {
        self.search_data
            .get_or_init(|| Self::build_search_data(&self.document))
    }

    fn build_search_data(document: &Document) -> SearchData {
        Self::build_search_data_from_pages(document.get_pages().keys().copied(), |page_number| {
            document
                .extract_text_with_limit(&[page_number], MAX_PAGE_CONTENT_BYTES)
                .map_err(|error| error.to_string())
        })
    }

    fn build_search_data_from_pages<I, F>(
        page_numbers: I,
        mut extract_text: F,
    ) -> SearchData
    where
        I: IntoIterator<Item = u32>,
        F: FnMut(u32) -> Result<String, String>,
    {
        let mut normalized_page_texts = BTreeMap::new();
        for page_number in page_numbers {
            if let Ok(text) = extract_text(page_number) {
                normalized_page_texts.insert(page_number, normalize_search_text(&text));
            }
        }
        SearchData { normalized_page_texts }
    }

    #[cfg(test)]
    fn has_search_index(&self) -> bool {
        self.search_data.get().is_some()
    }

    #[cfg(test)]
    fn indexed_page_count(&self) -> usize {
        self.search_data
            .get()
            .map(|data| data.normalized_page_texts.len())
            .unwrap_or(0)
    }
}

fn normalize_search_text(value: &str) -> String {
    value
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::PdfCore;
    use serde_wasm_bindgen::to_value;
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    pub struct WasmPdfCore {
        inner: PdfCore,
    }

    #[wasm_bindgen]
    impl WasmPdfCore {
        #[wasm_bindgen(constructor)]
        pub fn new(bytes: &[u8]) -> Result<WasmPdfCore, JsValue> {
            PdfCore::load(bytes)
                .map(|inner| WasmPdfCore { inner })
                .map_err(|error| JsValue::from_str(&error))
        }

        pub fn page_count(&self) -> usize {
            self.inner.page_count()
        }

        pub fn page_text(&self, page_number: u32) -> Result<String, JsValue> {
            self.inner
                .page_text(page_number)
                .map_err(|error| JsValue::from_str(&error))
        }

        pub fn search(&self, query: &str) -> Result<JsValue, JsValue> {
            let hits = self
                .inner
                .search(query)
                .map_err(|error| JsValue::from_str(&error))?;
            to_value(&hits).map_err(|error| JsValue::from_str(&error.to_string()))
        }
    }
}
