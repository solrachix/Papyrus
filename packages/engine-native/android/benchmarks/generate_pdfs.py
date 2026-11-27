import fitz, random, io, sys
from PIL import Image
random.seed(7)
WORDS = "livro leitura página capítulo história personagem estante autor palavra tempo noite cidade caminho memória silêncio janela".split()
def text_pdf(path, pages):
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page(width=420, height=595)  # A5
        page.insert_text((40, 50), f"Capítulo {i // 20 + 1} - página {i + 1}", fontsize=14)
        y = 80
        for _ in range(34):
            line = " ".join(random.choice(WORDS) for _ in range(11))
            page.insert_text((40, y), line, fontsize=10)
            y += 14.5
    doc.save(path, deflate=True, garbage=3); doc.close()
def scanned_pdf(path, pages):
    # A full-page grayscale JPEG per page, like a scanner at ~150 dpi.
    doc = fitz.open()
    for i in range(pages):
        img = Image.effect_noise((1240, 1754), 38).point(lambda v: 255 if v > 150 else int(v * 0.6))
        buf = io.BytesIO(); img.save(buf, "JPEG", quality=70)
        page = doc.new_page(width=595, height=842)
        page.insert_image(page.rect, stream=buf.getvalue())
    doc.save(path, garbage=3); doc.close()
for n in (50, 300, 1000, 3000): text_pdf(f"texto-{n}.pdf", n)
for n in (100, 300): scanned_pdf(f"digitalizado-{n}.pdf", n)
