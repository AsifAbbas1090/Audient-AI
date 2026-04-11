export type Session = {
  id:           string
  title:        string
  date:         string
  summary:      string
  tags:         string[]
  status:       'complete' | 'processing' | 'failed'
  duration:     number   // seconds
  speakerCount: number
  disease?:     string
  language:     string
}

export type TranscriptLine = {
  id:      string
  speaker: string
  text:    string
  time:    string
}

export type Summary = {
  essence:     string
  actionItems: string[]
  decisions:   string[]
  entities:    string[]
}

export const sessions: Session[] = [
  {
    id:           '1',
    title:        'Patient Intake — Viral Fever',
    date:         '2026-04-10T09:15:00',
    summary:      'Patient reported 3-week fever peaking at 37.8°C with night sweats. Doctor ordered CBC and prescribed paracetamol 500mg.',
    tags:         ['Healthcare', 'Intake'],
    status:       'complete',
    duration:     742,
    speakerCount: 2,
    disease:      'Viral Fever',
    language:     'Urdu → English',
  },
  {
    id:           '2',
    title:        'Follow-up — Type 2 Diabetes',
    date:         '2026-04-09T14:30:00',
    summary:      'HbA1c reviewed at 7.4%. Metformin dose adjusted. Patient advised on diet and 30-minute daily exercise routine.',
    tags:         ['Healthcare', 'Follow-up'],
    status:       'complete',
    duration:     518,
    speakerCount: 2,
    disease:      'Type 2 Diabetes',
    language:     'English',
  },
  {
    id:           '3',
    title:        'Legal Discovery Interview',
    date:         '2026-04-08T11:00:00',
    summary:      'Outlined discovery scope, deadlines for document submissions, and witness deposition schedule for Q2.',
    tags:         ['Legal', 'Discovery'],
    status:       'complete',
    duration:     1240,
    speakerCount: 2,
    language:     'English',
  },
  {
    id:           '4',
    title:        'Cardiology Consultation',
    date:         '2026-04-07T10:00:00',
    summary:      'ECG showed mild ST depression. Echo scheduled. Patient placed on low-dose aspirin and beta blockers pending further tests.',
    tags:         ['Healthcare', 'Cardiology'],
    status:       'complete',
    duration:     893,
    speakerCount: 2,
    disease:      'Hypertension',
    language:     'Arabic → English',
  },
  {
    id:           '5',
    title:        'Research Interview — Sleep Disorders',
    date:         '2026-04-06T15:45:00',
    summary:      'Subject reported chronic insomnia averaging 4 hours per night. Discussed sleep hygiene, screen exposure, and melatonin supplementation.',
    tags:         ['Research', 'Sleep'],
    status:       'complete',
    duration:     634,
    speakerCount: 2,
    language:     'English',
  },
  {
    id:           '6',
    title:        'Psychiatric Assessment',
    date:         '2026-04-05T09:00:00',
    summary:      'GAD-7 score of 14. Patient described persistent anxiety and work-related stress. CBT sessions recommended alongside SSRI evaluation.',
    tags:         ['Healthcare', 'Psychiatry'],
    status:       'processing',
    duration:     1105,
    speakerCount: 2,
    disease:      'Generalized Anxiety',
    language:     'English',
  },
  {
    id:           '7',
    title:        'Business Strategy Review',
    date:         '2026-04-04T13:00:00',
    summary:      'Q1 KPIs reviewed, roadmap for product expansion discussed, and budget allocation for engineering team approved.',
    tags:         ['Business', 'Strategy'],
    status:       'complete',
    duration:     2145,
    speakerCount: 2,
    language:     'English',
  },
  {
    id:           '8',
    title:        'Pediatrics — Asthma Review',
    date:         '2026-04-03T08:30:00',
    summary:      'Salbutamol inhaler technique corrected. Peak flow readings improved. Advised to avoid dust exposure and keep reliever inhaler accessible.',
    tags:         ['Healthcare', 'Pediatrics'],
    status:       'failed',
    duration:     0,
    speakerCount: 2,
    disease:      'Asthma',
    language:     'Urdu → English',
  },
]

export const transcript: TranscriptLine[] = [
  { id: 't1', speaker: 'Doctor',  time: '00:00', text: 'Good morning. What brings you in today?' },
  { id: 't2', speaker: 'Patient', time: '00:07', text: 'I have had a fever for about three weeks now. It gets worse at night.' },
  { id: 't3', speaker: 'Doctor',  time: '00:18', text: 'Any chills or night sweats accompanying the fever?' },
  { id: 't4', speaker: 'Patient', time: '00:24', text: 'Yes, night sweats mainly. The temperature peaks around 37.8°C.' },
  { id: 't5', speaker: 'Doctor',  time: '00:35', text: 'Have you taken any medication so far?' },
  { id: 't6', speaker: 'Patient', time: '00:40', text: 'Only paracetamol when it gets too high. It helps temporarily.' },
  { id: 't7', speaker: 'Doctor',  time: '00:50', text: 'I will order a CBC to rule out infection. In the meantime continue paracetamol 500mg every 8 hours.' },
]

export const mockSummary: Summary = {
  essence:     'Patient presents with 3-week viral fever, night sweats, and temperature of 37.8°C. CBC ordered. Paracetamol 500mg prescribed every 8 hours.',
  actionItems: ['Complete CBC blood test', 'Return in 5 days with results', 'Monitor temperature twice daily'],
  decisions:   ['Paracetamol 500mg every 8 hours', 'CBC to rule out bacterial infection'],
  entities:    ['Paracetamol 500mg', 'CBC', 'Viral Fever', '37.8°C'],
}
