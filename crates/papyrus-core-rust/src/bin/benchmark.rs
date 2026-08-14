use std::{env, fs, time::Instant};

use papyrus_core_rust::PdfCore;

fn main() -> Result<(), String> {
    let path = env::args()
        .nth(1)
        .unwrap_or_else(|| "/tmp/papyrus-benchmark-1000.pdf".to_owned());
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;

    let started = Instant::now();
    let core = PdfCore::load(&bytes)?;
    let load_ms = started.elapsed().as_secs_f64() * 1000.0;

    let page = |number| {
        let started = Instant::now();
        let text = core.page_text(number)?;
        Ok::<_, String>((started.elapsed().as_secs_f64() * 1000.0, text.len()))
    };
    let first = page(1)?;
    let middle = page((core.page_count() / 2).max(1) as u32)?;
    let last = page(core.page_count() as u32)?;
    let cold_search_started = Instant::now();
    let hits = core.search("papyrus-benchmark")?;
    let cold_search_ms = cold_search_started.elapsed().as_secs_f64() * 1000.0;
    let warm_search_started = Instant::now();
    let warm_hits = core.search("papyrus-benchmark")?;
    let warm_search_ms = warm_search_started.elapsed().as_secs_f64() * 1000.0;

    println!(
        "{{\"inputPath\":\"{}\",\"bytes\":{},\"pages\":{},\"results\":[{{\"label\":\"load\",\"ms\":{:.2}}},{{\"label\":\"first_page_text\",\"ms\":{:.2},\"chars\":{}}},{{\"label\":\"middle_page_text\",\"ms\":{:.2},\"chars\":{}}},{{\"label\":\"last_page_text\",\"ms\":{:.2},\"chars\":{}}},{{\"label\":\"cold_search\",\"ms\":{:.2},\"pages\":{}}},{{\"label\":\"warm_search\",\"ms\":{:.2},\"pages\":{}}}]}}",
        path.replace('\\', "\\\\").replace('"', "\\\""),
        bytes.len(),
        core.page_count(),
        load_ms,
        first.0,
        first.1,
        middle.0,
        middle.1,
        last.0,
        last.1,
        cold_search_ms,
        hits.len(),
        warm_search_ms,
        warm_hits.len(),
    );

    Ok(())
}
