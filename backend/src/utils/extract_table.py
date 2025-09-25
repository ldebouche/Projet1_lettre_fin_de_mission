# -*- coding: utf-8 -*-
import pdfplumber
import json
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')

pdf_path = sys.argv[1]

def clean_table(table):
    cleaned = []
    for row in table:
        if not row:
            continue
        row = [str(c).strip() for c in row if c and str(c).strip()]
        if not row:
            continue
        cleaned.append(row)
    return cleaned

result = None
code_ape = None
millesime = None
perspectives = []

with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
        text = page.extract_text() or ""
        lines = text.split("\n")

        match_year = re.search(r"Données\s+(\d{4})", text)
        if match_year:
            millesime = int(match_year.group(1))

        match_ape = re.search(r"code\s+([0-9]{2}\.[0-9]{2}[A-Z]?)", text)
        if match_ape:
            code_ape = match_ape.group(1).replace(".", "")

        capture = False
        for line in lines:
            if line.strip().startswith("3.1."):
                capture = True
            if capture:
                if re.match(r"^\d+\.\d+", line.strip()) and not line.strip().startswith("3.1."):
                    capture = False
                    break
                perspectives.append(line)

        tables = page.extract_tables()
        for table in tables:
            if not table:
                continue
            if any("Répartition selon le chiffre" in (cell or "") for row in table for cell in (row or [])):
                result = clean_table(table)
                break
        if result:
            break

perspectives_text = " ".join(perspectives).strip()

output = {
    "code_ape": code_ape,
    "millesime": millesime,
    "headers": ["Libellé", "Global", "Tranche 1", "Tranche 2", "Tranche 3", "Tranche 4", "Tranche 5"],
    "rows": []
}

if result:
    for r in result:
        if r[0].startswith("Répartition") or r[0].startswith("Données") or r[0].startswith("d’affaires en %") or r[0].startswith("Source"):
            continue
        r[0] = re.sub(r"(\D)\d+$", r"\1", r[0]).strip()

        cleaned = [r[0]]
        if len(r) > 7:
            while len(cleaned) < 7:
                prev = None
                for v in r[1:]:
                    if v != prev: 
                        cleaned.append(v)
                    prev = v
        else :
            cleaned.extend(r[1:])

        output["rows"].append(cleaned)

output["rows"].append(['Commentaire', None, None, None, None, None, None, perspectives_text])

print(json.dumps(output, ensure_ascii=False))
