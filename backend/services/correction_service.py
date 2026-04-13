"""
Post-processing medical term correction service.

Applies a regex-based lookup table to fix common Whisper mis-spellings of
medical terms: drug names, clinical vocabulary, and abbreviations.

Applied in whisper_service.py to each segment's text after transcription.
O(len(rules) × len(text)) — negligible vs. Groq API latency.
"""
import re
from typing import List, Tuple

# ── Rules: (pattern, replacement) ────────────────────────────────────────────
# Listed longest/most-specific first to avoid partial-match interference.
# All patterns are compiled with re.IGNORECASE.
_RULES: List[Tuple[str, str]] = [

    # ── Drug names ─────────────────────────────────────────────────────────
    # metformin
    (r'\bmet\s+form[ie][nm]\b',                  'metformin'),
    (r'\bmetphorm[ei][nm]\b',                   'metformin'),
    (r'\bmetform[ie]ne?\b',                     'metformin'),
    (r'\bmet[fp]orm[ie][nm]\b',                 'metformin'),
    # lisinopril
    (r'\blice?\s+in\s+april\b',                 'lisinopril'),
    (r'\blis[ei]nopril\b',                      'lisinopril'),
    (r'\blas[ei]nopril\b',                      'lisinopril'),
    # warfarin
    (r'\bwar\s*ph?[ae]rin\b',                   'warfarin'),
    (r'\bwor?f[ae]rin\b',                       'warfarin'),
    (r'\bwarf[ae]rine?\b',                      'warfarin'),
    # clopidogrel
    (r'\bclop\s+idol\s+grill\b',               'clopidogrel'),
    (r'\bclop[ie]d[ao]gr[ae]l\b',              'clopidogrel'),
    (r'\bclopidagrel\b',                        'clopidogrel'),
    # atorvastatin
    (r'\bator[vw]astatin\b',                    'atorvastatin'),
    # amoxicillin
    (r'\bamox[iy]c[iy]ll?[ie]n\b',             'amoxicillin'),
    (r'\bamoxycillin\b',                        'amoxicillin'),
    # omeprazole / pantoprazole
    (r'\bom[ea]praz[ao]le?\b',                  'omeprazole'),
    (r'\bpant[ao]praz[ao]le?\b',               'pantoprazole'),
    # paracetamol
    (r'\bpara[cs]etam[ao]le?\b',               'paracetamol'),
    (r'\bparassetamol\b',                       'paracetamol'),
    # aspirin
    (r'\basp[ei]r[ei]n\b',                      'aspirin'),
    (r'\base?p[ie]n\b',                         'aspirin'),
    # ibuprofen
    (r'\bibu?prof[ae]n\b',                      'ibuprofen'),
    # metoprolol
    (r'\bmet[ao]pr[ao]lol\b',                   'metoprolol'),
    # amlodipine
    (r'\bamlod[ie]p[ie]ne?\b',                  'amlodipine'),
    # furosemide
    (r'\bfuros[ae]m[ie]de?\b',                  'furosemide'),
    (r'\bfrus[ae]m[ie]de?\b',                   'furosemide'),
    # insulin
    (r'\binsullin\b',                           'insulin'),
    (r'\binsulene\b',                           'insulin'),
    # prednisolone / prednisone
    (r'\bprednis[ao]lone?\b',                   'prednisolone'),
    (r'\bprednis[ao]ne?\b',                     'prednisone'),
    # azithromycin
    (r'\bazithrom[iy]c[ie]n\b',                'azithromycin'),
    (r'\bz[- ]?pak\b',                         'azithromycin (Z-Pack)'),
    # ciprofloxacin
    (r'\bciproflox[ae]c[ie]n\b',               'ciprofloxacin'),
    (r'\bcipro\b',                              'ciprofloxacin'),

    # ── Clinical / diagnostic terms ────────────────────────────────────────
    # diabetes mellitus (compound first)
    (r'\bdiab[ae]t[ae]s\s+mel+[il]t[uy]s\b',  'diabetes mellitus'),
    (r'\bdiab[ae]t[ei][cs]\b',                  'diabetes'),
    # hypertension
    (r'\bhy[pb]ertens[iy][ao]n\b',             'hypertension'),
    (r'\bhypertenshun\b',                       'hypertension'),
    # prescription
    (r'\bper\s*scrip[tp]ion\b',                'prescription'),
    (r'\bpri?[sc]r?iption\b',                  'prescription'),
    # creatinine
    (r'\bcreat[ai]n[ie]ne?\b',                 'creatinine'),
    (r'\bcreatanine\b',                         'creatinine'),
    # haemoglobin / hemoglobin
    (r'\bh[ae]emoglobin\b',                    'hemoglobin'),
    # HbA1c (various spacing/casing)
    (r'\bh\s*b\s*a\s*1\s*c\b',                'HbA1c'),
    (r'\bhba\s*1\s*c\b',                       'HbA1c'),
    # tachycardia / bradycardia
    (r'\btachy?cardia\b',                      'tachycardia'),
    (r'\bbrady?cardia\b',                      'bradycardia'),
    # hypertrophy
    (r'\bhypertrofy\b',                        'hypertrophy'),
    # myocardial infarction
    (r'\bmyo[ck]ardial\s+infar[ck]tion\b',    'myocardial infarction'),
    # angioplasty
    (r'\bangioplasty\b',                       'angioplasty'),

    # ── Abbreviations — normalise to uppercase ─────────────────────────────
    (r'\b(ecg|ekg)\b',                         'ECG'),
    (r'\b(mri)\b',                             'MRI'),
    (r'\b(ct\s+scan)\b',                       'CT scan'),
    (r'\b(cbc)\b',                             'CBC'),
    (r'\b(bp)\b',                              'BP'),
    (r'\b(hr)\b',                              'HR'),
    (r'\b(bmi)\b',                             'BMI'),
    (r'\b(icu)\b',                             'ICU'),
    (r'\b(er|ed)\b',                           lambda m: m.group().upper()),
]

# Pre-compile once at import time
_COMPILED: List[Tuple[re.Pattern, object]] = [
    (re.compile(pat, re.IGNORECASE), rep)
    for pat, rep in _RULES
]


def correct_text(text: str) -> str:
    """
    Apply all medical-term correction rules to a single text string.
    Returns the corrected string (unchanged if no rule matches).
    """
    for pattern, replacement in _COMPILED:
        text = pattern.sub(replacement, text)  # type: ignore[arg-type]
    return text
