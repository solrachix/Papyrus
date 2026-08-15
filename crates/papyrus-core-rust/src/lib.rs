use std::collections::{BTreeMap, HashMap};
use std::sync::OnceLock;

use lopdf::Document;
use serde::Serialize;

const MAX_PAGE_CONTENT_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SearchHit {
    pub page_number: u32,
    pub matches: usize,
}

struct SearchData {
    page_texts: BTreeMap<u32, String>,
    search_index: HashMap<String, BTreeMap<u32, usize>>,
}

pub struct PdfCore {
    document: Document,
    search_data: OnceLock<Result<SearchData, String>>,
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
}

impl PdfCore {
    pub fn load(bytes: &[u8]) -> Result<Self, String> {
        let document = Document::load_mem(bytes).map_err(|error| error.to_string())?;
        Ok(Self {
            document,
            search_data: OnceLock::new(),
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
        let normalized_query = query.trim().to_lowercase();
        if normalized_query.is_empty() {
            return Ok(Vec::new());
        }

        let data = self.get_search_data()?;
        if let Some(indexed_pages) = data.search_index.get(&normalized_query) {
            return Ok(indexed_pages
                .iter()
                .map(|(&page_number, &matches)| SearchHit {
                    page_number,
                    matches,
                })
                .collect());
        }

        let mut hits = Vec::new();
        for (&page_number, text) in &data.page_texts {
            let matches = text.to_lowercase().match_indices(&normalized_query).count();
            if matches > 0 {
                hits.push(SearchHit {
                    page_number,
                    matches,
                });
            }
        }
        Ok(hits)
    }

    fn get_search_data(&self) -> Result<&SearchData, String> {
        match self
            .search_data
            .get_or_init(|| Self::build_search_data(&self.document))
        {
            Ok(data) => Ok(data),
            Err(error) => Err(error.clone()),
        }
    }

    fn build_search_data(document: &Document) -> Result<SearchData, String> {
        let mut page_texts = BTreeMap::new();
        let mut search_index: HashMap<String, BTreeMap<u32, usize>> = HashMap::new();

        for page_number in document.get_pages().keys().copied() {
            let text = document
                .extract_text_with_limit(&[page_number], MAX_PAGE_CONTENT_BYTES)
                .map_err(|error| error.to_string())?;
            for token in tokenize(&text.to_lowercase()) {
                let pages = search_index.entry(token).or_default();
                *pages.entry(page_number).or_default() += 1;
            }
            page_texts.insert(page_number, text);
        }

        Ok(SearchData {
            page_texts,
            search_index,
        })
    }

    #[cfg(test)]
    fn has_search_index(&self) -> bool {
        self.search_data.get().is_some()
    }

    #[cfg(test)]
    fn indexed_page_count(&self) -> usize {
        self.search_data
            .get()
            .and_then(|result| result.as_ref().ok())
            .map(|data| data.page_texts.len())
            .unwrap_or(0)
    }
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

fn tokenize(text: &str) -> impl Iterator<Item = String> + '_ {
    text.split(|character: char| !(character.is_alphanumeric() || character == '-'))
        .filter(|token| !token.is_empty())
        .map(str::to_owned)
}
