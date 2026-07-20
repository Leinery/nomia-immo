import fitz
doc = fitz.open("attached_assets/Gesamtmietvertrag_Stadt_Seelze_1784580599715.pdf")
print(f"Seiten: {doc.page_count}")
# Render first 6 pages at zoom 2
for i in range(min(6, doc.page_count)):
    page = doc[i]
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    pix.save(f".agents/outputs/page_{i+1:02d}.png")
    print(f"Seite {i+1} gerendert: {pix.width}x{pix.height}")
