export { clsx as cn } from 'clsx'

export const CREATOR_NAME = 'Ashique.Pilassery'

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
export const formatDate = (d?: string | null) => (d ? dateFmt.format(new Date(d)) : '—')

const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })
export const formatTime = (d: string) => timeFmt.format(new Date(d))

export const formatShort = (d: string) =>
  new Date(d).toDateString() === new Date().toDateString() ? formatTime(d) : formatDate(d)
