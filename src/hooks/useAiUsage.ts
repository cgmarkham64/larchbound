import { useQuery } from '@tanstack/react-query'
import { fetchAiUsage } from '../lib/aiUsage'
import { useAuthStore } from '../store/auth'

const STALE_TIME_MS = 60_000

export function useAiUsage() {
  const sub = useAuthStore((s) => s.user?.id)
  return useQuery({
    queryKey: ['ai-usage', sub],
    queryFn: fetchAiUsage,
    enabled: !!sub,
    staleTime: STALE_TIME_MS,
  })
}
