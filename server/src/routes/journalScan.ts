import { Router } from 'express'
import { asyncRoute, HttpError } from '../utils/routeHelpers'
import { scanJournalImage, ScanParseError } from '../services/scanService'
import { requireAiQuota, recordAiUsage } from '../services/aiUsageService'

const router = Router()

router.post('/', asyncRoute(async (req, res) => {
  await requireAiQuota(req.user.sub)

  const { imageBase64, mediaType } = req.body as { imageBase64?: string; mediaType?: string }
  if (!imageBase64) throw new HttpError(400, 'imageBase64 is required')

  try {
    const result = await scanJournalImage(imageBase64, mediaType)
    await recordAiUsage(req.user.sub)
    res.json(result)
  } catch (err) {
    if (err instanceof ScanParseError) {
      await recordAiUsage(req.user.sub)
      return res.status(422).json({ error: err.message, raw: err.raw })
    }
    throw err
  }
}))

export default router
