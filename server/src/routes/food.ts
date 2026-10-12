import { Router } from 'express'
import { asyncRoute, HttpError } from '../utils/routeHelpers'
import { lookupFoodMacros } from '../services/foodMacrosService'
import { requireAiQuota, recordAiUsage } from '../services/aiUsageService'

const router = Router()

router.post('/macros', asyncRoute(async (req, res) => {
  await requireAiQuota(req.user.sub)

  const { name } = req.body as { name?: string }
  if (!name?.trim()) throw new HttpError(400, 'name is required')

  const result = await lookupFoodMacros(name.trim())
  await recordAiUsage(req.user.sub)
  res.json(result)
}))

export default router
