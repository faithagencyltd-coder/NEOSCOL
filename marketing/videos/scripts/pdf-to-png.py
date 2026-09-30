"""Rend la première page de chaque PDF de pdf/ en image public/captures/doc-*.png."""
import glob, os
import pymupdf

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
for f in glob.glob(os.path.join(root, "pdf", "*.pdf")):
    page = pymupdf.open(f)[0]
    name = os.path.splitext(os.path.basename(f))[0]
    page.get_pixmap(dpi=200).save(os.path.join(root, "public", "captures", f"doc-{name}.png"))
    print(name)
