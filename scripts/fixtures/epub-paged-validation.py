"""Synthetic EPUB: long chapters, links, table, image and RTL appendix. No copyrighted text."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
output=Path(__file__).resolve().parents[2]/'examples/mobile/assets/epub-paged-validation.epub'
with ZipFile(output,'w',compression=ZIP_DEFLATED) as z:
 z.writestr('mimetype','application/epub+zip',compress_type=ZIP_STORED)
 z.writestr('META-INF/container.xml','<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
 manifest='<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
 for chapter in range(1,4):
  manifest+=f'<item id="c{chapter}" href="chapter{chapter}.xhtml" media-type="application/xhtml+xml"/>'
  paragraphs=''.join(f'<p>Trecho {chapter}.{n:03}: Esta é uma página de validação do leitor EPUB. A localização deve permanecer neste texto ao mudar a fonte, abrir uma nota e alternar o modo de leitura. O gesto horizontal avança uma página visual do mesmo capítulo. A leitura continua com a interface oculta até outro toque.</p>' for n in range(1,81))
  extras='<p><a href="chapter2.xhtml">Link interno: capítulo 2</a></p><table><tr><td>Coluna A</td><td>Coluna B</td></tr></table><p dir="rtl">هذا نص لاختبار اتجاه القراءة</p>'
  z.writestr(f'OEBPS/chapter{chapter}.xhtml',f'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capítulo {chapter}</title><style>body{{line-height:1.5}} p{{margin:0 0 1em}} img,table{{max-width:100%}}</style></head><body><h1>Capítulo {chapter}</h1>{paragraphs}{extras}</body></html>')
 z.writestr('OEBPS/nav.xhtml','<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Conteúdo</title></head><body><nav epub:type="toc"><ol>'+''.join(f'<li><a href="chapter{n}.xhtml">Capítulo {n}</a></li>' for n in range(1,4))+'</ol></nav></body></html>')
 z.writestr('OEBPS/content.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">papyrus-synthetic-epub-v2</dc:identifier><dc:title>EPUB 2.0 — Validação sintética</dc:title><dc:language>pt-BR</dc:language><meta property="dcterms:modified">2026-10-10T00:00:00Z</meta></metadata><manifest>'+manifest+'</manifest><spine>'+''.join(f'<itemref idref="c{n}"/>' for n in range(1,4))+'</spine></package>')
print(output)
