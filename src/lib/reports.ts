import type { ReportKind } from './types'

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'misinformation', label: 'False information' },
  { value: 'other', label: 'Something else' },
] as const

export const reportReasonLabel = (value: string) => REPORT_REASONS.find((r) => r.value === value)?.label ?? value

export const REPORT_KINDS: ReportKind[] = ['post', 'story', 'user']
