import fitz
import json

doc = fitz.open("attached_assets/Gesamtmietvertrag_Stadt_Seelze_1784580599715.pdf")
print(f"Seiten: {doc.page_count}")

all_text = []
for i in range(doc.page_count):
    page = doc[i]
    text = page.get_text()
    all_text.append(f"=== SEITE {i+1} ===\n{text}")

full = "\n".join(all_text)
print(full[:15000])
