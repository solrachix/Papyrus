use std::cmp::Ordering;
use std::fmt::{Display, Formatter};
use std::io::{Cursor, Read};
use std::sync::Arc;

use zip::ZipArchive;

const IMAGE_EXTENSIONS: [&str; 6] = ["jpg", "jpeg", "png", "gif", "svg", "webp"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CbzPage {
    pub name: String,
    pub size: u64,
    archive_index: usize,
}

#[derive(Debug)]
pub struct CbzCore {
    archive: ZipArchive<Cursor<Arc<[u8]>>>,
    pages: Vec<CbzPage>,
}

#[derive(Debug)]
pub struct CbzError(String);

impl Display for CbzError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for CbzError {}

impl CbzCore {
    pub fn load(bytes: &[u8]) -> Result<Self, CbzError> {
        Self::load_shared(Arc::from(bytes))
    }

    pub fn load_shared(bytes: Arc<[u8]>) -> Result<Self, CbzError> {
        let mut archive = ZipArchive::new(Cursor::new(bytes))
            .map_err(|error| CbzError(format!("falha ao abrir CBZ: {error}")))?;
        let mut pages = Vec::new();

        for archive_index in 0..archive.len() {
            let entry = archive
                .by_index(archive_index)
                .map_err(|error| CbzError(format!("falha ao listar CBZ: {error}")))?;
            if entry.is_dir() {
                continue;
            }

            let normalized_name = entry.name().replace('\\', "/");
            if !is_image_name(&normalized_name) {
                continue;
            }

            pages.push(CbzPage {
                name: normalized_name,
                size: entry.size(),
                archive_index,
            });
        }

        pages.sort_by(|left, right| natural_compare(&left.name, &right.name));

        Ok(Self { archive, pages })
    }

    pub fn page_count(&self) -> usize {
        self.pages.len()
    }

    pub fn pages(&self) -> &[CbzPage] {
        &self.pages
    }

    pub fn page_name(&self, page_index: usize) -> Result<&str, CbzError> {
        self.pages
            .get(page_index)
            .map(|page| page.name.as_str())
            .ok_or_else(|| {
                CbzError(format!(
                    "página CBZ fora do intervalo: {} (total {})",
                    page_index,
                    self.pages.len()
                ))
            })
    }

    pub fn page_size(&self, page_index: usize) -> Result<u64, CbzError> {
        self.pages
            .get(page_index)
            .map(|page| page.size)
            .ok_or_else(|| {
                CbzError(format!(
                    "página CBZ fora do intervalo: {} (total {})",
                    page_index,
                    self.pages.len()
                ))
            })
    }

    pub fn read_page(&mut self, page_index: usize) -> Result<Vec<u8>, CbzError> {
        let page = self.pages.get(page_index).ok_or_else(|| {
            CbzError(format!(
                "página CBZ fora do intervalo: {} (total {})",
                page_index,
                self.pages.len()
            ))
        })?;
        let mut entry = self
            .archive
            .by_index(page.archive_index)
            .map_err(|error| CbzError(format!("falha ao ler página CBZ: {error}")))?;
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry
            .read_to_end(&mut bytes)
            .map_err(|error| CbzError(format!("falha ao extrair página CBZ: {error}")))?;
        Ok(bytes)
    }
}

fn is_image_name(name: &str) -> bool {
    let file_name = name.rsplit('/').next().unwrap_or_default();
    if file_name.is_empty() || file_name.starts_with('.') {
        return false;
    }

    file_name
        .rsplit_once('.')
        .map(|(_, extension)| {
            IMAGE_EXTENSIONS
                .iter()
                .any(|candidate| extension.eq_ignore_ascii_case(candidate))
        })
        .unwrap_or(false)
}

fn natural_compare(left: &str, right: &str) -> Ordering {
    let left = left.as_bytes();
    let right = right.as_bytes();
    let mut left_index = 0;
    let mut right_index = 0;

    while left_index < left.len() && right_index < right.len() {
        let left_is_digit = left[left_index].is_ascii_digit();
        let right_is_digit = right[right_index].is_ascii_digit();
        if left_is_digit && right_is_digit {
            let left_start = left_index;
            let right_start = right_index;
            while left_index < left.len() && left[left_index].is_ascii_digit() {
                left_index += 1;
            }
            while right_index < right.len() && right[right_index].is_ascii_digit() {
                right_index += 1;
            }

            let left_digits = trim_leading_zeroes(&left[left_start..left_index]);
            let right_digits = trim_leading_zeroes(&right[right_start..right_index]);
            let numeric_order = left_digits
                .len()
                .cmp(&right_digits.len())
                .then_with(|| left_digits.cmp(right_digits));
            if numeric_order != Ordering::Equal {
                return numeric_order;
            }
            continue;
        }

        let order = left[left_index]
            .to_ascii_lowercase()
            .cmp(&right[right_index].to_ascii_lowercase());
        if order != Ordering::Equal {
            return order;
        }
        left_index += 1;
        right_index += 1;
    }

    left.len().cmp(&right.len())
}

fn trim_leading_zeroes(value: &[u8]) -> &[u8] {
    let first_non_zero = value
        .iter()
        .position(|byte| *byte != b'0')
        .unwrap_or(value.len().saturating_sub(1));
    &value[first_non_zero..]
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use wasm_bindgen::prelude::*;

    use super::CbzCore;

    #[wasm_bindgen]
    pub struct WasmCbzCore {
        core: CbzCore,
    }

    #[wasm_bindgen]
    impl WasmCbzCore {
        #[wasm_bindgen(constructor)]
        pub fn new(bytes: &[u8]) -> Result<WasmCbzCore, JsValue> {
            CbzCore::load(bytes)
                .map(|core| WasmCbzCore { core })
                .map_err(|error| JsValue::from_str(&error.to_string()))
        }

        pub fn page_count(&self) -> usize {
            self.core.page_count()
        }

        pub fn page_name(&self, page_index: usize) -> Result<String, JsValue> {
            self.core
                .page_name(page_index)
                .map(str::to_owned)
                .map_err(|error| JsValue::from_str(&error.to_string()))
        }

        pub fn page_size(&self, page_index: usize) -> Result<u64, JsValue> {
            self.core
                .page_size(page_index)
                .map_err(|error| JsValue::from_str(&error.to_string()))
        }

        pub fn read_page(&mut self, page_index: usize) -> Result<Vec<u8>, JsValue> {
            self.core
                .read_page(page_index)
                .map_err(|error| JsValue::from_str(&error.to_string()))
        }
    }
}
