use std::collections::{BTreeMap, VecDeque};
use std::sync::{Mutex, OnceLock};

use lopdf::Document;
use serde::Serialize;

const MAX_PAGE_CONTENT_BYTES: usize = 8 * 1024 * 1024;
const MAX_SEARCH_CACHE_ENTRIES: usize = 32;
const MAX_SEARCH_TEXT_CACHE_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SearchHit {
    pub page_number: u32,
    pub matches: usize,
}

struct SearchData {
    normalized_page_texts: BTreeMap<u32, String>,
}

struct PageTextCache {
    texts: BTreeMap<u32, String>,
    order: VecDeque<u32>,
    total_bytes: usize,
}

impl PageTextCache {
    fn new() -> Self {
        Self {
            texts: BTreeMap::new(),
            order: VecDeque::new(),
            total_bytes: 0,
        }
    }

    fn get(&mut self, page_number: u32) -> Option<String> {
        let text = self.texts.get(&page_number).cloned()?;
        self.touch(page_number);
        Some(text)
    }

    fn insert(&mut self, page_number: u32, text: String) {
        if let Some(previous) = self.texts.remove(&page_number) {
            self.total_bytes = self.total_bytes.saturating_sub(previous.len());
            self.order.retain(|entry| *entry != page_number);
        }

        self.total_bytes += text.len();
        self.texts.insert(page_number, text);
        self.order.push_back(page_number);

        while self.total_bytes > MAX_SEARCH_TEXT_CACHE_BYTES {
            let Some(oldest_page) = self.order.pop_front() else {
                break;
            };
            if let Some(oldest_text) = self.texts.remove(&oldest_page) {
                self.total_bytes = self.total_bytes.saturating_sub(oldest_text.len());
            }
        }
    }

    fn touch(&mut self, page_number: u32) {
        self.order.retain(|entry| *entry != page_number);
        self.order.push_back(page_number);
    }
}

struct SearchCache {
    hits: BTreeMap<String, Vec<SearchHit>>,
    order: VecDeque<String>,
}

impl SearchCache {
    fn new() -> Self {
        Self {
            hits: BTreeMap::new(),
            order: VecDeque::new(),
        }
    }

    fn get(&mut self, query: &str) -> Option<Vec<SearchHit>> {
        let hits = self.hits.get(query).cloned()?;
        self.touch(query);
        Some(hits)
    }

    fn insert(&mut self, query: String, hits: Vec<SearchHit>) {
        self.hits.insert(query.clone(), hits);
        self.touch(&query);
        while self.hits.len() > MAX_SEARCH_CACHE_ENTRIES {
            let Some(oldest_query) = self.order.pop_front() else {
                break;
            };
            self.hits.remove(&oldest_query);
        }
    }

    fn touch(&mut self, query: &str) {
        self.order.retain(|entry| entry != query);
        self.order.push_back(query.to_owned());
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.hits.len()
    }

    #[cfg(test)]
    fn contains_key(&self, query: &str) -> bool {
        self.hits.contains_key(query)
    }
}

pub struct PdfCore {
    document: Document,
    search_data: OnceLock<SearchData>,
    search_cache: Mutex<SearchCache>,
    page_text_cache: Mutex<PageTextCache>,
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

    #[test]
    fn paged_search_does_not_build_the_full_index() {
        let bytes = std::fs::read("../../examples/web/assets/tracemonkey-pldi-09.pdf")
            .expect("sample PDF should exist");
        let core = PdfCore::load(&bytes).expect("sample PDF should load");

        core.search_page(1, "the").expect("page search should work");

        assert!(!core.has_search_index());
    }

    #[test]
    fn evicts_the_least_recently_used_search_query() {
        let bytes = std::fs::read("../../examples/web/assets/tracemonkey-pldi-09.pdf")
            .expect("sample PDF should exist");
        let core = PdfCore::load(&bytes).expect("sample PDF should load");

        for query_number in 0..super::MAX_SEARCH_CACHE_ENTRIES {
            core.search(&format!("query-{query_number}"))
                .expect("search should work");
        }
        core.search("query-0").expect("cached search should work");
        core.search("query-new").expect("search should work");

        let cache = core
            .search_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        assert!(cache.contains_key("query-0"));
        assert!(!cache.contains_key("query-1"));
    }
}

impl PdfCore {
    pub fn load(bytes: &[u8]) -> Result<Self, String> {
        let document = Document::load_mem(bytes).map_err(|error| error.to_string())?;
        Ok(Self {
            document,
            search_data: OnceLock::new(),
            search_cache: Mutex::new(SearchCache::new()),
            page_text_cache: Mutex::new(PageTextCache::new()),
        })
    }

    pub fn page_count(&self) -> usize {
        self.document.get_pages().len()
    }

    pub fn page_text(&self, page_number: u32) -> Result<String, String> {
        if let Some(text) = self
            .page_text_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(page_number)
        {
            return Ok(text);
        }

        let text = self
            .document
            .extract_text_with_limit(&[page_number], MAX_PAGE_CONTENT_BYTES)
            .map_err(|error| error.to_string())?;
        self.page_text_cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(page_number, text.clone());
        Ok(text)
    }

    pub fn search_page_text(&self, page_number: u32) -> Result<String, String> {
        self.page_text(page_number)
    }

    pub fn search_page(&self, page_number: u32, query: &str) -> Result<Option<SearchHit>, String> {
        let normalized_query = normalize_search_text(query);
        if normalized_query.is_empty() {
            return Ok(None);
        }

        let text = self.page_text(page_number)?;
        let matches = normalize_search_text(&text)
            .match_indices(&normalized_query)
            .count();
        if matches == 0 {
            return Ok(None);
        }

        Ok(Some(SearchHit {
            page_number,
            matches,
        }))
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
        if let Some(cached_hits) = search_cache.get(&normalized_query) {
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
        search_cache.insert(normalized_query, hits.clone());
        Ok(hits)
    }

    fn get_search_data(&self) -> &SearchData {
        self.search_data.get_or_init(|| self.build_search_data())
    }

    fn build_search_data(&self) -> SearchData {
        Self::build_search_data_from_pages(
            self.document.get_pages().keys().copied(),
            |page_number| self.page_text(page_number),
        )
    }

    fn build_search_data_from_pages<I, F>(page_numbers: I, mut extract_text: F) -> SearchData
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
        SearchData {
            normalized_page_texts,
        }
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

        pub fn search_page_text(&self, page_number: u32) -> Result<String, JsValue> {
            self.inner
                .search_page_text(page_number)
                .map_err(|error| JsValue::from_str(&error))
        }

        pub fn search_page(&self, page_number: u32, query: &str) -> Result<JsValue, JsValue> {
            let hit = self
                .inner
                .search_page(page_number, query)
                .map_err(|error| JsValue::from_str(&error))?;
            to_value(&hit).map_err(|error| JsValue::from_str(&error.to_string()))
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
