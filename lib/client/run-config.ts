'use client'

// What the start page hands to the runner page. Kept in localStorage per runner,
// so a reload of the runner page resumes the same run.
export type RunConfig = {
  name: string
  bib: string
  mode: 'gps' | 'sim'
  secret: string
  startedAt?: number
}

const key = (slug: string) => `race.run.${slug}`

export function loadRunConfig(slug: string): RunConfig | null {
  try {
    return JSON.parse(localStorage.getItem(key(slug)) ?? 'null')
  } catch {
    return null
  }
}

export function saveRunConfig(slug: string, config: RunConfig) {
  localStorage.setItem(key(slug), JSON.stringify(config))
}
