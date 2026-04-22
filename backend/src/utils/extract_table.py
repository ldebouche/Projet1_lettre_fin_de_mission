# -*- coding: utf-8 -*-
import pdfplumber
import json
import sys
import re
import os

sys.stdout.reconfigure(encoding="utf-8")
pdf_path = sys.argv[1]

TOC_DOTS_RE = re.compile(r"\.{5,}\s*\d+\s*$")  # sommaire: "...... 24"

def normalize_ape(raw: str) -> str:
    raw = raw.strip().upper()
    m = re.match(r"^(\d{2})\.(\d{2})([A-Z])", raw)
    if not m:
        return None
    return f"{m.group(1)}{m.group(2)}{m.group(3)}"

def clean_line(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return ""
    s = s.replace("➜", "-").replace("", "-").replace("•", "-")
    return s.strip()

def is_footer_or_noise(s: str) -> bool:
    if not s:
        return True
    if TOC_DOTS_RE.search(s):  # supprime aussi "Structure financière .... 24"
        return True
    if re.search(r"Analyses\s+sectorielles\s*-\s*CNOEC\s*\|", s, re.IGNORECASE):
        return True
    if re.match(r"^\|\s*\d+\s*$", s):  # ex "| 22"
        return True
    if re.search(r"\|\s*\d+\s*$", s):  # ex "Agence de voyages | 17"
        return True
    return False

# ========= Millésime: prendre dans le nom de fichier (analyse_2024 / 2025)
millesime = None
base = os.path.basename(pdf_path)
m = re.search(r"(19|20)\d{2}", base)
if m:
    millesime = int(m.group(0))

ape_codes = set()
full_text = ""

with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
        text = page.extract_text() or ""
        if text.strip():
            full_text += text + "\n"

        for mm in re.finditer(r"\b(\d{2}\.\d{2}[A-Z])[A-Z]?\d?\b", (text or "").upper()):
            code = normalize_ape(mm.group(1))
            if code:
                ape_codes.add(code)

lines = full_text.splitlines()

def next_non_empty_index(start: int):
    for k in range(start, len(lines)):
        if (lines[k] or "").strip():
            return k
    return None

# ========= Début perspectives: on cherche LA VRAIE section, pas le sommaire
start_idx = None
start_level = 0     # 2 pour 3.1 ; 1 pour 4 ; 0 sans num
start_major = None  # "3" si 3.1
start_num = None    # "3.1" ou "4"

for i in range(len(lines)):
    s = (lines[i] or "").strip()

    # Cas "3." seul puis ligne suivante "Les perspectives..."
    if re.match(r"^\d+\.\s*$", s) and i + 1 < len(lines):
        nxt = (lines[i + 1] or "").strip()
        if re.search(r"\bLes perspectives\b", nxt, re.IGNORECASE) and not TOC_DOTS_RE.search(nxt):
            # accepte uniquement si la ligne "Les perspectives" n'est pas un sommaire
            start_idx = i + 1
            start_level = 1
            start_num = s.strip().strip(".")
            break

    # Cas normal: ligne contenant "Les perspectives"
    if re.search(r"\bLes perspectives\b", s, re.IGNORECASE):
        # Rejette si c'est une ligne de sommaire (pointillés + page)
        if TOC_DOTS_RE.search(s):
            continue

        # Accepte si numéroté: 3.1. / 4. / 3.2. etc.
        mnum = re.match(r"^\s*(\d+)(?:\.(\d+))?\.\s*", s)
        if mnum:
            if mnum.group(2):
                start_level = 2
                start_major = mnum.group(1)
                start_num = f"{mnum.group(1)}.{mnum.group(2)}"
            else:
                start_level = 1
                start_num = mnum.group(1)
            start_idx = i
            break

        # (optionnel) si non numéroté, on accepte aussi mais c’est plus rare
        start_level = 0
        start_idx = i
        break

# ========= Fin perspectives: titre suivant du même niveau
end_idx = None
if start_idx is not None:
    for j in range(start_idx + 1, len(lines)):
        s = (lines[j] or "").strip()

        # stop au prochain sous-paragraphe du même chapitre majeur: 3.2. / 3.3.
        if start_level == 2 and start_major:
            if re.match(rf"^\s*{start_major}\.\d+\.\s+\S", s):
                end_idx = j
                break

        # stop au prochain chapitre majeur: 5. / 6.
        elif start_level == 1:
            if re.match(r"^\s*\d+\.\s+\S", s):
                # si c'est le même numéro (ex 4.) on ignore, sinon stop
                if not (start_num and re.match(rf"^\s*{start_num}\.\s+", s)):
                    end_idx = j
                    break

        # stop au prochain chapitre numéroté
        else:
            if re.match(r"^\s*\d+\.\s+\S", s):
                end_idx = j
                break

    block = lines[start_idx:end_idx] if end_idx else lines[start_idx:]

    cleaned = []
    for l in block:
        cl = clean_line(l)
        if is_footer_or_noise(cl):
            continue
        cleaned.append(cl)

    # Si tu ne veux pas garder la ligne de titre "3.1. Les perspectives ..."
    if cleaned and re.search(r"\bLes perspectives\b", cleaned[0], re.IGNORECASE):
        cleaned = cleaned[1:]

    commentaire = "\n".join(cleaned).strip()
else:
    commentaire = ""

if not ape_codes:
    ape_codes = {"UNKNOWN"}

output = {
    "millesime": millesime,
    "items": [{"code_ape": code, "commentaire": commentaire} for code in sorted(ape_codes)]
}

print(json.dumps(output, ensure_ascii=False))
