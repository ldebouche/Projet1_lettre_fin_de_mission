import pdfplumber
import json
import sys
import re

def extract_sorties(pdf_path):
    results = []

    with pdfplumber.open(pdf_path) as pdf:
        all_lines = []

        for page in pdf.pages:
            words = page.extract_words(
                keep_blank_chars=False,
                use_text_flow=True,
                horizontal_ltr=True
            )

            # Regroupe chaque ligne par leur coordonnée Y
            lines_by_y = {}
            for w in words:
                y = round(w["top"], 1)
                if y not in lines_by_y:
                    lines_by_y[y] = []
                lines_by_y[y].append(w)

            # Trie chaque ligne par X
            for y in sorted(lines_by_y.keys()):
                line = sorted(lines_by_y[y], key=lambda x: x["x0"])
                text = " ".join([w["text"] for w in line]).strip()
                all_lines.append(text)
        
    totalGeneral = extract_cumul_tous_comptes(all_lines)

    # Nettoyage basique
    clean = []
    for l in all_lines:
        if any([
            l.startswith("ISACOMPTA"), 
            l.startswith("IMMOBILISATIONS"),
            l.startswith("CC "),
            l.startswith("Page ")
        ]):
            continue
        if "CUMUL DES SORTIES" in l:
            break
        if l.strip():
            clean.append(l.strip())
            
    # Regrouper en blocs d'immobilisations
    blocs = []
    current = []

    start_regex = re.compile(r"^\d+\s+.*\d{2}/\d{2}/\d{2}")

    for line in clean:
        if start_regex.match(line):
            if current:
                blocs.append(current)
            current = [line]
        else:
            if current:
                current.append(line)

    if current:
        blocs.append(current)

    # Extraction finale
    for bloc in blocs:
        first = bloc[0]

        # libelle
        m = re.match(r"^\d+\s+(.+?)\d{2}/\d{2}/\d{2}", first)
        libelle = m.group(1).strip() if m else first

        # date acquisition
        date_acq = None
        for i, line in enumerate(bloc):
            if "Achat" in line:
                # cherche une date dans cette ligne ou 2 suivantes
                for j in range(i, min(i+3, len(bloc))):
                    d = re.findall(r"\d{2}/\d{2}/\d{2}", bloc[j])
                    if d:
                        date_acq = d[0]
                        break
                break

        # motif
        motif = None
        motif_idx = None
        for i, line in enumerate(bloc):
            if "Vente" in line:
                motif = "Vente"
                motif_idx = i
                break
            if "Mise au Rebut" in line:
                motif = "Mise au Rebut - HS"
                motif_idx = i
                break

        if motif is None:
            continue

        # montant
        montant = "0,00"
        if motif == "Vente":
            # La ligne juste avant "Vente"
            if motif_idx > 0:
                last_line = bloc[motif_idx - 1]
            else:
                last_line = ""

            # Tous les nombres type xx,xx dans cette ligne
            nums = re.findall(r"\d[\d\s]*,\d{2}", last_line)

            if len(nums) == 1:
                montant = nums[0]
            elif len(nums) >= 2:
                # On prend toujours le dernier montant
                montant = nums[-1]

            # Nettoyage final : enlever les espaces dans les milliers
            montant = montant.replace(" ", "")

            # Reformater proprement "x xxx,xx"
            if "," in montant:
                int_part, dec = montant.split(",")
                int_part = f"{int(int_part):,}".replace(",", " ")
                montant = f"{int_part},{dec}"
        result = {
            "libelle": libelle,
            "date": date_acq,
            "motif": motif,
            "montant": montant
        }
        results.append(result)

    return { "results": results, "totalGeneral": totalGeneral }

def extract_cumul_tous_comptes(all_lines):
    for i, line in enumerate(all_lines):
        if "CUMUL TOUS COMPTES" in line:

            # On cherche dans les 10 lignes suivantes la ligne "Sorties ..."
            for j in range(i+1, min(i+10, len(all_lines))):
                l2 = all_lines[j]

                if l2.startswith("Sorties") and re.search(r"\d+,\d{2}", l2):
                    # extraire TOUS les montants
                    nums = re.findall(r"\d[\d\s]*,\d{2}", l2)

                    return nums[2].replace(" ", "") if len(nums) >= 3 else None

    return None


if __name__ == "__main__":
    pdf_path = sys.argv[1]
    data = extract_sorties(pdf_path)
    results = data["results"]
    totalGeneral = data["totalGeneral"]
    print(json.dumps({ "lignes": results, "totalGeneral": totalGeneral}, ensure_ascii=False))
