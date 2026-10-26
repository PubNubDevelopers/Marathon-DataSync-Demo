import { notFound } from 'next/navigation'
import RunnerScreen from '@/components/RunnerScreen'
import { RACE_NAME, SLUG_PATTERN } from '@/lib/race'

export const metadata = { title: `${RACE_NAME} · your race` }

export default async function RunnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!SLUG_PATTERN.test(id)) notFound()
  return <RunnerScreen slug={id} />
}
