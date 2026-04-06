/** Objectif calorique journalier (kcal). */
export const DAILY_CALORIE_GOAL = 1700

const STORAGE_KEY = 'caltrack_journal_v1'

export type JournalEntry = {
  id: string
  calories: number
  label: string
  addedAt: string
}

export type JournalStore = {
  days: Record<string, JournalEntry[]>
}

function emptyStore(): JournalStore {
  return { days: {} }
}

export function loadJournal(): JournalStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const p = JSON.parse(raw) as JournalStore
    if (!p || typeof p !== 'object' || !p.days) return emptyStore()
    return p
  } catch {
    return emptyStore()
  }
}

export function saveJournal(store: JournalStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

/** Date locale au format YYYY-MM-DD (fuseau du navigateur). */
export function getTodayDateKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getDayEntries(
  store: JournalStore,
  dateKey: string,
): JournalEntry[] {
  return store.days[dateKey] ?? []
}

export function getDayTotal(store: JournalStore, dateKey: string): number {
  return getDayEntries(store, dateKey).reduce((s, e) => s + e.calories, 0)
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function addJournalEntry(
  store: JournalStore,
  dateKey: string,
  calories: number,
  label: string,
): JournalStore {
  const entry: JournalEntry = {
    id: newId(),
    calories: Math.round(calories),
    label: label.slice(0, 200),
    addedAt: new Date().toISOString(),
  }
  const prev = store.days[dateKey] ?? []
  return {
    days: {
      ...store.days,
      [dateKey]: [...prev, entry],
    },
  }
}

export function removeJournalEntry(
  store: JournalStore,
  dateKey: string,
  id: string,
): JournalStore {
  const prev = store.days[dateKey] ?? []
  const next = prev.filter((e) => e.id !== id)
  const days = { ...store.days }
  if (next.length === 0) delete days[dateKey]
  else days[dateKey] = next
  return { days }
}
