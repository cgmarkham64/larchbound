import { AiUsage, GLOBAL_USAGE_SUB } from '../models/AiUsage'
import { HttpError } from '../utils/routeHelpers'

export const PER_USER_MONTHLY_LIMIT = 20
export const GLOBAL_MONTHLY_LIMIT = 200

const HTTP_TOO_MANY_REQUESTS = 429
const YEAR_MONTH_LENGTH = 7 // 'YYYY-MM'.length

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, YEAR_MONTH_LENGTH)
}

function aiFeaturesEnabled(): boolean {
  return process.env.AI_FEATURES_ENABLED !== 'false'
}

export async function requireAiQuota(sub: string): Promise<void> {
  if (!aiFeaturesEnabled()) {
    throw new HttpError(503, 'AI features are temporarily unavailable.')
  }

  const yearMonth = currentYearMonth()
  const [userDoc, globalDoc] = await Promise.all([
    AiUsage.findOne({ sub, yearMonth }).lean(),
    AiUsage.findOne({ sub: GLOBAL_USAGE_SUB, yearMonth }).lean(),
  ])

  if ((userDoc?.count ?? 0) >= PER_USER_MONTHLY_LIMIT) {
    throw new HttpError(
      HTTP_TOO_MANY_REQUESTS,
      `You've used all ${PER_USER_MONTHLY_LIMIT} AI calls for this month. Resets next month.`
    )
  }

  if ((globalDoc?.count ?? 0) >= GLOBAL_MONTHLY_LIMIT) {
    throw new HttpError(
      HTTP_TOO_MANY_REQUESTS,
      "LarchBound's shared AI quota for this month is used up — check back next month."
    )
  }
}

export async function recordAiUsage(sub: string, tripId?: string): Promise<void> {
  const yearMonth = currentYearMonth()
  await Promise.all([
    AiUsage.findOneAndUpdate(
      { sub, yearMonth },
      { $inc: { count: 1 }, $set: { tripId: tripId ?? null } },
      { upsert: true }
    ),
    AiUsage.findOneAndUpdate(
      { sub: GLOBAL_USAGE_SUB, yearMonth },
      { $inc: { count: 1 } },
      { upsert: true }
    ),
  ])
}

export interface AiUsageSummary {
  used: number
  limit: number
  remaining: number
  yearMonth: string
}

export async function getAiUsageSummary(sub: string): Promise<AiUsageSummary> {
  const yearMonth = currentYearMonth()
  const doc = await AiUsage.findOne({ sub, yearMonth }).lean()
  const used = doc?.count ?? 0
  return {
    used,
    limit: PER_USER_MONTHLY_LIMIT,
    remaining: Math.max(0, PER_USER_MONTHLY_LIMIT - used),
    yearMonth,
  }
}
