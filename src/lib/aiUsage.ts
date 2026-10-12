import { api } from './api'

export interface AiUsageSummary {
  used: number
  limit: number
  remaining: number
  yearMonth: string
}

export async function fetchAiUsage(): Promise<AiUsageSummary> {
  const { data } = await api.get<AiUsageSummary>('/api/ai-usage')
  return data
}
