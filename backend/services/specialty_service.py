"""
Specialty-aware prompting helpers.

Each guidance block tells the LLM:
  - What fields to prioritise for this specialty
  - How to populate Disease, AdditionalNotes, EmotionalState
  - Terminology / tone preferences
  - What follow-up gaps to look for

Used in: extract_service.py, patient_facing_service.py
"""
from __future__ import annotations

from models.user import SPECIALTY_CHOICES

# ── Extraction guidance (injected into EXTRACT_PROMPT and _FOLLOWUP_PROMPT) ──

_SPECIALTY_GUIDANCE: dict[str, str] = {

    "general_mbbs": (
        "Doctor is a General MBBS clinician (broad OPD / acute care).\n"
        "PRIORITY FIELDS: Presenting complaint (use patient's exact words where possible), "
        "vital-sign clues (BP / HR / temp / SpO2 if mentioned), red flags (chest pain, dyspnoea, "
        "altered consciousness, severe headache), comorbidities, current medications, allergies.\n"
        "DISEASE field: concise diagnosis or working impression "
        "(e.g. 'Acute URTI', 'Suspected UTI', 'Poorly controlled Type 2 DM').\n"
        "ADDITIONAL NOTES: medications with dose/frequency if stated, symptom duration and onset, "
        "known allergies, investigations ordered, referrals issued, safety-netting advice given "
        "(when to return / seek emergency care).\n"
        "EMOTIONAL STATE: note if patient appears distressed, anxious, tearful, or in pain — "
        "use brief clinical language (e.g. 'Anxious, cooperative', 'In pain but communicative').\n"
        "FOLLOW-UP GAPS to flag: unmonitored vitals, pending investigations, unresolved symptoms, "
        "medication not yet confirmed.\n"
        "AVOID: repeating the diagnosis verbatim in Additional Notes."
    ),

    "general_practice": (
        "Doctor is in General Practice (primary care / family medicine).\n"
        "PRIORITY FIELDS: Reason for visit, status of chronic conditions (DM, HTN, dyslipidaemia, "
        "asthma, COPD — is it controlled or deteriorating?), medication changes or adherence issues, "
        "lifestyle factors (smoking, alcohol, exercise, diet, weight), preventive care due "
        "(immunisations, cervical smear, diabetic foot check, BP check, colorectal screening).\n"
        "DISEASE field: active problem or managed chronic condition "
        "(e.g. 'Hypertension — routine review', 'Type 2 DM — suboptimal control', "
        "'Acute-on-chronic lower back pain').\n"
        "ADDITIONAL NOTES: what changed since last visit, new symptoms, social or family context "
        "relevant to management (carer stress, housing, employment), any investigations or referrals "
        "organised, lifestyle advice given, medications started / stopped / titrated.\n"
        "EMOTIONAL STATE: patient's mood, stress, or wellbeing — especially relevant in primary care "
        "(e.g. 'Low mood reported', 'Stressed — family circumstances', 'Euthymic').\n"
        "FOLLOW-UP GAPS: chronic disease monitoring overdue, lifestyle goal set but not reviewed, "
        "pending specialist referral outcome.\n"
        "AVOID: excessive clinical jargon — prefer clear GP-note phrasing."
    ),

    "cardiology": (
        "Doctor is a Cardiologist (specialist cardiac care).\n"
        "PRIORITY FIELDS:\n"
        "  • Symptoms: chest pain (character, radiation, exertion vs rest, duration, diaphoresis), "
        "dyspnoea (NYHA functional class cues — stairs, flat walking, at rest), palpitations "
        "(onset, duration, regular vs irregular, presyncope), syncope / pre-syncope.\n"
        "  • Risk factors: hypertension, diabetes, hyperlipidaemia, smoking, obesity, "
        "family history of premature CAD.\n"
        "  • Cardiac history: prior MI, PCI / stenting, CABG, atrial fibrillation, heart failure, "
        "valvular disease, device (pacemaker / ICD / CRT).\n"
        "  • Medications: anticoagulants (DOAC / warfarin + INR if mentioned), antiplatelets, "
        "beta-blockers, ACE-I / ARB, diuretics, statins — note doses if stated.\n"
        "DISEASE field: specific cardiac diagnosis or impression "
        "(e.g. 'Stable angina — CCS Class II', 'Paroxysmal AF — rate controlled', "
        "'Heart failure with reduced EF — NYHA II', 'Post-STEMI follow-up — 6 weeks').\n"
        "ADDITIONAL NOTES: relevant investigations (ECG findings, echo parameters, troponin, "
        "BNP / NT-proBNP, lipid panel, renal function if mentioned), haemodynamic observations "
        "(BP / HR / SpO2 at visit), exercise tolerance, device check outcomes, medication changes.\n"
        "EMOTIONAL STATE: cardiac patients commonly have health anxiety or depression; note "
        "if present (e.g. 'Anxious about symptoms', 'Reassured after explanation', "
        "'Depressed — referred to liaison').\n"
        "FOLLOW-UP GAPS: unmonitored risk factors, pending echo / stress test / Holter, "
        "medication titration not yet completed, device follow-up overdue."
    ),

    "psychiatry": (
        "Doctor is a Psychiatrist (mental health specialist).\n"
        "PRIORITY FIELDS:\n"
        "  • Mood: depressed / elevated / mixed / euthymic — severity, duration, diurnal variation.\n"
        "  • Anxiety: GAD, panic attacks, phobias, OCD features, PTSD cues — frequency and impact.\n"
        "  • Psychotic symptoms: hallucinations (type, modality), delusions, thought disorder, "
        "ideas of reference, passivity phenomena.\n"
        "  • Manic / hypomanic indicators: reduced sleep need, grandiosity, pressured speech, "
        "increased goal-directed activity, reckless behaviour.\n"
        "  • Risk: suicidal ideation (passive / active / plan / intent / means), self-harm "
        "(method, frequency, last episode), aggression or harm-to-others risk — MUST document "
        "explicitly and clearly if mentioned at all.\n"
        "  • Sleep, appetite, weight, energy, concentration.\n"
        "  • Substance use: type, frequency, last use, impact on mental state.\n"
        "  • Adherence: current psychotropics, side-effect burden, reason for any non-adherence.\n"
        "  • Psychosocial: employment, relationships, housing, recent stressors, protective factors.\n"
        "DISEASE field: psychiatric diagnosis or clinical formulation "
        "(e.g. 'Major depressive episode — moderate severity', 'Schizophrenia — stable on depot', "
        "'Bipolar I — mixed episode', 'Generalised anxiety disorder', 'PTSD').\n"
        "ADDITIONAL NOTES: Mental Status Exam cues if described (appearance, behaviour, speech rate "
        "and tone, observed affect, cognitive function, insight, judgement), current psychotropic "
        "medications and adherence, formulation of current triggers, protective factors, risk level "
        "(low / medium / high as stated or implied), safeguarding concerns.\n"
        "EMOTIONAL STATE: use observed clinical affect — e.g. 'Dysphoric with restricted range', "
        "'Irritable, pressured speech, elevated', 'Euthymic, good insight', 'Blunted affect'.\n"
        "LANGUAGE: Use professional, non-stigmatising clinical formulations. Do not editorialise. "
        "Never use terms like 'manipulative' or 'attention-seeking'. "
        "Risk documentation must be factual and explicit.\n"
        "FOLLOW-UP GAPS: risk status not formally reassessed, medication change not yet reviewed, "
        "therapy referral pending, social care or safeguarding action outstanding."
    ),

    "paediatrics": (
        "Doctor is a Paediatrician (child healthcare — newborn through adolescence).\n"
        "PRIORITY FIELDS:\n"
        "  • Child's age: ESSENTIAL — include in Disease field; affects every clinical decision.\n"
        "  • Caregiver-reported history: always note who is giving the history (mother, father, "
        "other carer) as it frames reliability.\n"
        "  • Presenting illness: fever (duration, peak temperature, antipyretic response), rash "
        "(distribution, blanching), feeding tolerance, vomiting / diarrhoea (frequency, blood), "
        "hydration status (tears, wet nappies, fontanelle if infant), activity level, irritability.\n"
        "  • Development: milestones if mentioned (speech, motor, social/emotional) — note any "
        "regression or parental concern.\n"
        "  • Growth: weight, height, head circumference if mentioned — especially in infants.\n"
        "  • Immunisation status: up to date / overdue / refused.\n"
        "  • School / behavioural / social issues if part of presenting complaint.\n"
        "DISEASE field: paediatric diagnosis including child's age "
        "(e.g. 'Viral URTI — 3-year-old', 'Febrile seizure, first presentation — 18-month-old', "
        "'Faltering growth — 9-month-old', 'ADHD — 7-year-old, newly diagnosed').\n"
        "ADDITIONAL NOTES: hydration and feeding assessment, red-flag symptoms for age group "
        "(bulging fontanelle, petechial / purpuric rash, signs of dehydration, high-pitched cry, "
        "grunting respiration), medications with weight-based dosing ONLY if explicitly stated by "
        "clinician, safety-netting advice given (when to return / attend ED), caregiver education.\n"
        "EMOTIONAL STATE: child's demeanour (e.g. 'Playful and interactive', 'Inconsolable', "
        "'Lethargic but rousable') AND caregiver anxiety level if noteworthy.\n"
        "LANGUAGE: Frame clinical notes from caregiver perspective where relevant. "
        "Always include child's age in the Disease field for audit clarity.\n"
        "FOLLOW-UP GAPS: weight recheck not scheduled, developmental review outstanding, "
        "vaccination catch-up not arranged, specialist referral pending, investigation result awaited."
    ),
}


# ── Patient-facing tone guidance (injected into patient_facing_service.py) ───

_PATIENT_FACING_GUIDANCE: dict[str, str] = {
    "general_mbbs": (
        "Write for a general adult patient. Use everyday language. "
        "Focus on what was found, what the patient needs to do, and when to seek help."
    ),
    "general_practice": (
        "Focus on self-care actions the patient can take at home, when to return, "
        "and any lifestyle changes discussed. Acknowledge any chronic conditions warmly "
        "without being alarmist."
    ),
    "cardiology": (
        "Emphasise what the patient can actively do: take medications as prescribed, "
        "the importance of the activity level discussed, dietary advice given. "
        "Include clear, simple warning signs to act on urgently "
        "(chest pain, severe breathlessness, palpitations with dizziness, fainting). "
        "Do not use abbreviations like NYHA, AF, or EF without briefly explaining them."
    ),
    "psychiatry": (
        "Write with warmth, care, and zero stigma. Do not label or reproduce any psychiatric "
        "diagnosis name in the patient copy unless the doctor used that exact term directly with "
        "the patient. Focus on wellbeing, practical self-care strategies discussed, "
        "any support or resources mentioned, and 'who to contact if you're struggling' — "
        "include a general reminder to reach out to the clinic or a crisis line if needed. "
        "Never reproduce risk assessment language in the patient-facing copy."
    ),
    "paediatrics": (
        "Address the parent or caregiver directly throughout — use 'your child' phrasing. "
        "Keep language simple and reassuring. Emphasise: when and why to return to the doctor, "
        "hydration and feeding reminders, and any dosing instructions ONLY if the doctor "
        "explicitly stated them. Mention red-flag signs in plain language (e.g. 'if your child "
        "develops a rash that does not fade when you press it, go to the emergency department')."
    ),
}


# ── Public API ────────────────────────────────────────────────────────────────

def normalize_specialty(raw: str | None) -> str:
    if not raw:
        return "general_mbbs"
    key = str(raw).strip().lower().replace(" ", "_")
    return key if key in SPECIALTY_CHOICES else "general_mbbs"


def specialty_prompt_block(raw: str | None) -> str:
    """Return the full extraction guidance block for a specialty."""
    key = normalize_specialty(raw)
    return (
        f"Specialty: {key}\n"
        f"Guidance:\n{_SPECIALTY_GUIDANCE.get(key, _SPECIALTY_GUIDANCE['general_mbbs'])}"
    )


def patient_facing_tone_block(raw: str | None) -> str:
    """Return the patient-facing tone guidance for a specialty."""
    key = normalize_specialty(raw)
    return _PATIENT_FACING_GUIDANCE.get(key, _PATIENT_FACING_GUIDANCE["general_mbbs"])
