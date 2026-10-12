import { useAiUsage } from '../../hooks/useAiUsage'
import { Pill } from './Pill'

const LOW_REMAINING_THRESHOLD = 3

export function AiQuotaBadge({ className }: { className?: string }) {
  const { data } = useAiUsage()
  if (!data) return null

  const tone = data.remaining === 0 ? 'red' : data.remaining <= LOW_REMAINING_THRESHOLD ? 'amber' : ''

  return (
    <span className={className} title={`${data.used}/${data.limit} AI calls used this month`}>
      <Pill tone={tone}>{data.remaining} AI left</Pill>
    </span>
  )
}
