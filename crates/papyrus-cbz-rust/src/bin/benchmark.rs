use std::env;
use std::fs;
use std::hint::black_box;
use std::sync::Arc;
use std::time::Instant;

use papyrus_cbz_rust::CbzCore;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

fn argument_value(name: &str, fallback: usize) -> usize {
    let mut arguments = env::args().skip(1);
    while let Some(argument) = arguments.next() {
        if argument == name {
            return arguments
                .next()
                .and_then(|value| value.parse().ok())
                .unwrap_or(fallback);
        }
    }
    fallback
}

fn median(samples: &[f64]) -> f64 {
    let mut sorted = samples.to_vec();
    sorted.sort_by(f64::total_cmp);
    sorted[sorted.len() / 2]
}

fn measure<F>(warmups: usize, iterations: usize, mut operation: F) -> Value
where
    F: FnMut(),
{
    for _ in 0..warmups {
        operation();
    }

    let mut samples = Vec::with_capacity(iterations);
    for _ in 0..iterations {
        let start = Instant::now();
        operation();
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
    }

    json!({
        "medianMs": median(&samples),
        "samplesMs": samples,
    })
}

fn sha256(chunks: &[Vec<u8>]) -> String {
    let mut hash = Sha256::new();
    for chunk in chunks {
        hash.update(chunk);
    }
    format!("{:x}", hash.finalize())
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hash = Sha256::new();
    hash.update(bytes);
    format!("{:x}", hash.finalize())
}

fn sha256_file(bytes: &[u8]) -> String {
    let mut hash = Sha256::new();
    hash.update(bytes);
    format!("{:x}", hash.finalize())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let fixture_path = env::args()
        .nth(1)
        .ok_or("uso: benchmark-cbz <arquivo.cbz> [--iterations 5] [--warmups 1]")?;
    let iterations = argument_value("--iterations", 5).max(1);
    let warmups = argument_value("--warmups", 1);
    let fixture: Arc<[u8]> = fs::read(&fixture_path)?.into();

    let load_list = measure(warmups, iterations, || {
        let core =
            CbzCore::load_shared(black_box(Arc::clone(&fixture))).expect("fixture CBZ inválido");
        black_box(core.page_count());
    });

    let mut core = CbzCore::load_shared(Arc::clone(&fixture))?;
    let page_count = core.page_count();
    if page_count == 0 {
        return Err("fixture sem páginas de imagem".into());
    }

    let indexes = [0, page_count / 2, page_count - 1];
    let mut extract = serde_json::Map::new();
    for (label, page_index) in [
        ("first", indexes[0]),
        ("middle", indexes[1]),
        ("last", indexes[2]),
    ] {
        let mut last_checksum = String::new();
        let result = measure(warmups, iterations, || {
            let bytes = core.read_page(page_index).expect("falha ao extrair página");
            last_checksum = sha256_bytes(&bytes);
            black_box(bytes);
        });
        extract.insert(
            label.to_string(),
            json!({
                "medianMs": result["medianMs"],
                "samplesMs": result["samplesMs"],
                "bytes": core.pages()[page_index].size,
                "sha256": last_checksum,
            }),
        );
    }

    let mut all_checksum = String::new();
    let all_pages = measure(warmups, iterations, || {
        let mut chunks = Vec::with_capacity(page_count);
        for page_index in 0..page_count {
            chunks.push(core.read_page(page_index).expect("falha ao extrair CBZ"));
        }
        all_checksum = sha256(&chunks);
        black_box(chunks);
    });

    println!(
        "{}",
        serde_json::to_string(&json!({
            "engine": "rust",
            "fixture": {
                "path": fixture_path,
                "bytes": fixture.len(),
                "sha256": sha256_file(&fixture),
            },
            "pages": page_count,
            "iterations": iterations,
            "warmups": warmups,
            "loadList": load_list,
            "extract": Value::Object(extract),
            "allPages": {
                "medianMs": all_pages["medianMs"],
                "samplesMs": all_pages["samplesMs"],
                "sha256": all_checksum,
            },
        }))?
    );

    Ok(())
}
