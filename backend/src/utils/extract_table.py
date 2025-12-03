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
output_tranches = []
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
                continue
            if capture:
                if re.match(r"^\d+\.\d+", line.strip()):
                    capture = False
                    break
                cleaned_line = line.replace("➜", "-").replace("", "-").strip()
                perspectives.append(cleaned_line)

        if "Tranche 1" in text and "Tranche 5" in text and not output_tranches:
            words = page.extract_words()

            # Regroupement des mots par lignes selon la coordonnée Y
            lines_by_y = {}
            for w in words:
                y = round(w["top"], 1)
                lines_by_y.setdefault(y, []).append(w["text"])

            for y, words_in_line in lines_by_y.items():
                line = " ".join(words_in_line)

                # On cherche la ligne qui contient les "≤"
                if "≤" not in line:
                    continue

                # On reconstruit les tranches :
                # ex: ["≤","41","582","≤","61","835", ...]
                groups = []
                current = []

                for token in words_in_line:
                    if "≤" in token:  # début d’une nouvelle tranche
                        if current:
                            groups.append(" ".join(current))
                        current = [token]
                    else:
                        if current:      # on est dans une tranche en cours
                            current.append(token)

                if current:
                    groups.append(" ".join(current))

                # Ne garder que les groupes qui contiennent des chiffres
                groups = [g.strip() for g in groups if re.search(r"\d", g)]

                if len(groups) >= 5:
                    groups = groups[:5]
                    output_tranches = ["", groups[0], groups[1], groups[2], groups[3], groups[4]]
                    break

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

output["rows"].append(['Tranches', output_tranches[0], output_tranches[1], output_tranches[2], output_tranches[3], output_tranches[4], output_tranches[5], None])

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
