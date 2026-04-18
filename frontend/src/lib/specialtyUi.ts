/**
 * UI copy and configuration keyed by doctor specialty.
 */
export type SpecialtyCode =
  | 'general_mbbs'
  | 'general_practice'
  | 'cardiology'
  | 'psychiatry'
  | 'paediatrics'

const LABELS: Record<SpecialtyCode, string> = {
  general_mbbs:     'General MBBS',
  general_practice: 'General Practice',
  cardiology:       'Cardiology',
  psychiatry:       'Psychiatry',
  paediatrics:      'Paediatrics',
}

const TAGLINES: Record<SpecialtyCode, string> = {
  general_mbbs:
    'Summaries and extraction prioritize broad triage, red flags, and practical follow-up.',
  general_practice:
    'Documentation tuned for first-contact care, chronic disease, and continuity.',
  cardiology:
    'AI emphasis on cardiac symptoms, risk factors, relevant tests, and medications.',
  psychiatry:
    'AI emphasis on mental status, safety, adherence, sleep, substance use, and psychosocial context.',
  paediatrics:
    'AI emphasis on age-appropriate history, growth/development, caregivers, and paediatric safety.',
}

const EMPTY_HINTS: Record<SpecialtyCode, string> = {
  general_mbbs:
    'Start a session — notes will follow a general clinical structure.',
  general_practice:
    'Start a session — notes will highlight outpatient continuity and prevention.',
  cardiology:
    'Start a session — notes will highlight cardiovascular history and plan.',
  psychiatry:
    'Start a session — notes will highlight mental health assessment and follow-up.',
  paediatrics:
    'Start a session — notes will highlight child-specific history and instructions.',
}

// What the AI actively extracts / looks for — shown in the dashboard focus panel
const FOCUS_AREAS: Record<SpecialtyCode, string[]> = {
  general_mbbs: [
    'Chief complaint & presenting illness',
    'Vital signs & red-flag symptoms',
    'Working diagnosis',
    'Medications & allergies',
    'Follow-up plan',
  ],
  general_practice: [
    'Reason for visit & chronic conditions',
    'Preventive care & screening gaps',
    'Medication reconciliation',
    'Patient goals & lifestyle factors',
    'Referral & continuity notes',
  ],
  cardiology: [
    'Cardiac symptoms (chest pain, dyspnoea, palpitations)',
    'CV risk factors (HTN, DM, smoking, family history)',
    'Relevant investigations (ECG, echo, labs)',
    'Current cardiac medications & doses',
    'Intervention history & follow-up plan',
  ],
  psychiatry: [
    'Mental status examination (MSE)',
    'Risk assessment (suicidality, self-harm, violence)',
    'Sleep, appetite & psychosocial stressors',
    'Medication adherence & side effects',
    'Safety plan & next review date',
  ],
  paediatrics: [
    'Age, weight, height & developmental milestones',
    'Caregiver-reported concerns',
    'Immunisation status',
    'Growth & nutrition',
    'Child-safety & caregiver instructions',
  ],
}

// Tailwind colour classes per specialty for accent decoration
export const SPECIALTY_ACCENT: Record<SpecialtyCode, { bg: string; text: string; border: string }> = {
  general_mbbs:     { bg: 'bg-brand-500/10',   text: 'text-brand-400',   border: 'border-brand-500/20'   },
  general_practice: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  cardiology:       { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20'     },
  psychiatry:       { bg: 'bg-violet-500/10',  text: 'text-violet-400',  border: 'border-violet-500/20'  },
  paediatrics:      { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20'   },
}

export function normalizeSpecialtyCode(raw: string | undefined | null): SpecialtyCode {
  const k = (raw || 'general_mbbs').trim().toLowerCase().replace(/\s+/g, '_')
  return k in LABELS ? (k as SpecialtyCode) : 'general_mbbs'
}

export function getSpecialtyUi(raw: string | undefined | null) {
  const code = normalizeSpecialtyCode(raw)
  return {
    code,
    label:      LABELS[code],
    tagline:    TAGLINES[code],
    emptyHint:  EMPTY_HINTS[code],
    focusAreas: FOCUS_AREAS[code],
    accent:     SPECIALTY_ACCENT[code],
  }
}
