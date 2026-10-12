import { Router } from 'express'
import { asyncRoute } from '../utils/routeHelpers'
import { getAiUsageSummary } from '../services/aiUsageService'

const router = Router()

router.get('/', asyncRoute(async (req, res) => {
  res.json(await getAiUsageSummary(req.user.sub))
}))

export default router
