export type Session = {
  id: string
  title: string
  date: string
  summary: string
  tags: string[]
}

export type TranscriptLine = {
  id: string
  speaker: string
  text: string
  time: string
}

export type Summary = {
  essence: string
  actionItems: string[]
  decisions: string[]
  entities: string[]
}

export const sessions: Session[] = [
  {
    id: '1',
    title: 'Healthcare intake interview',
    date: '2025-10-01',
    summary: 'Discussed symptoms, medical history, and follow-up tests.',
    tags: ['Healthcare', 'Intake', 'Follow-up']
  },
  {
    id: '2',
    title: 'Legal discovery call',
    date: '2025-09-28',
    summary: 'Outlined discovery scope, deadlines, and document requests.',
    tags: ['Legal', 'Discovery']
  },
  {
    id: '3',
    title: 'Quarterly business review',
    date: '2025-09-24',
    summary: 'KPI review, roadmap updates, and budget alignment.',
    tags: ['Business', 'QBR']
  }
]

export const transcript: TranscriptLine[] = [
  { id: 't1', speaker: 'Speaker A', time: '00:00:04', text: 'Thanks everyone for joining. Let’s kick off with goals.' },
  { id: 't2', speaker: 'Speaker B', time: '00:00:10', text: 'Primary goal is to finalize the rollout plan and responsibilities.' },
  { id: 't3', speaker: 'Speaker A', time: '00:01:02', text: 'We should clarify the timeline and risks before sign-off.' },
]

export const mockSummary: Summary = {
  essence: 'The team aligned on rollout goals, clarified timelines, and flagged risks.',
  actionItems: ['Draft rollout plan', 'Confirm owners', 'Schedule training'],
  decisions: ['Target launch in two weeks', 'Weekly checkpoints every Tuesday'],
  entities: ['Project Orion', 'North America Region', 'Training Team']
}


