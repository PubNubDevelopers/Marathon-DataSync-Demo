import { notFound } from 'next/navigation'
import SupporterScreen from '@/components/SupporterScreen'
import { RACE_NAME, SLUG_PATTERN } from '@/lib/race'

export const metadata = { title: `${RACE_NAME} · cheer them on` }

export default async function SupporterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!SLUG_PATTERN.test(id)) notFound()
  return <SupporterScreen slug={id} />
}
