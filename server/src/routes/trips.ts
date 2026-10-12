import { Router } from 'express'
import { Trip } from '../models/Trip'
import { UserProfile } from '../models/UserProfile'
import { JournalDay } from '../models/JournalDay'
import { Notification } from '../models/Notification'
import { asyncRoute, requireOwner, HttpError } from '../utils/routeHelpers'
import { normalizeShared, canRead, populateTripUsers, fetchTripForRead, partySizeFor, TripLean, SharedEntry } from '../services/tripService'
import { suggestPermits, lookupPermit, pickZoneProduct } from '../services/permitService'
import type { PermitLink, ZoneProductInput } from '../services/permitService'
import { validObjectId } from '../utils/objectId'
import { requireAiQuota, recordAiUsage } from '../services/aiUsageService'

const router = Router()

router.param('id', (req, res, next, id) => {
  if (!validObjectId(id)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  next()
})

router.get('/', asyncRoute(async (req, res) => {
  const sub = req.user.sub
  const trips = await Trip.find({
    $or: [{ ownerSub: sub }, { 'sharedWith.sub': sub }],
  })
    .populate('loadoutId')
    .lean()
  const populated = await Promise.all(trips.map(populateTripUsers))
  res.json(populated)
}))

router.get('/:id', asyncRoute(async (req, res) => {
  const trip = await fetchTripForRead(req.params.id as string, req.user.sub, 'loadoutId')
  res.json(await populateTripUsers(trip))
}))

router.post('/', asyncRoute(async (req, res) => {
  const trip = await Trip.create({ ...req.body, ownerSub: req.user.sub, sharedWith: [] })
  res.status(201).json(trip)
}))

router.put('/:id', asyncRoute(async (req, res) => {
  const trip = await Trip.findById(req.params.id)
  if (!trip) throw new HttpError(404, 'Not found')
  if (!canRead(trip, req.user.sub)) throw new HttpError(403, 'Forbidden')

  // Separate Mixed array fields — Mongoose's set() recursively casts array
  // elements and mangles nested GeoJSON { type } keys. Write them directly
  // via the MongoDB driver instead.
  const { gpxTracks, waypoints, ...rest } = req.body as Record<string, unknown>

  delete rest.ownerSub
  if (trip.ownerSub !== req.user.sub) delete rest.sharedWith

  trip.set(rest)
  if ('gpxPlanned' in rest) trip.markModified('gpxPlanned')
  if ('planStages' in rest) trip.markModified('planStages')
  await trip.save()

  const directUpdate: Record<string, unknown> = {}
  if ('gpxTracks' in req.body) directUpdate.gpxTracks = gpxTracks
  if ('waypoints' in req.body) directUpdate.waypoints = waypoints
  if (Object.keys(directUpdate).length > 0) {
    await Trip.collection.updateOne({ _id: trip._id }, { $set: directUpdate })
  }

  const result = await Trip.findById(trip._id).populate('loadoutId').lean()
  if (!result) throw new HttpError(500, 'Internal server error')
  res.json(await populateTripUsers(result as TripLean))
}))

router.post('/:id/share', asyncRoute(async (req, res) => {
  const trip = await Trip.findById(req.params.id)
  if (!trip) throw new HttpError(404, 'Not found')
  requireOwner(trip.ownerSub, req.user.sub)

  const { sub, role = 'edit' } = req.body
  if (!sub) throw new HttpError(400, 'sub required')
  if (!['read', 'edit'].includes(role)) throw new HttpError(400, 'role must be read or edit')
  if (sub === req.user.sub) throw new HttpError(400, 'Cannot share with yourself')

  const target = await UserProfile.findOne({ sub }).lean()
  if (!target) throw new HttpError(404, 'User not found')

  const alreadyShared = normalizeShared(trip.sharedWith as Array<SharedEntry | string>).some((e) => e.sub === sub)
  if (alreadyShared) return res.json({ ok: true, name: target.name })

  const existing = await Notification.findOne({
    toSub: sub, fromSub: req.user.sub, tripId: trip._id.toString(),
    type: 'trip_share_invite', status: 'pending',
  })
  if (!existing) {
    await Notification.create({
      toSub: sub,
      fromSub: req.user.sub,
      fromName: req.user.name,
      type: 'trip_share_invite',
      tripId: trip._id.toString(),
      tripTitle: trip.title,
      role,
    })
  }

  res.json({ ok: true, name: target.name })
}))

router.delete('/:id/leave', asyncRoute(async (req, res) => {
  const trip = await Trip.findById(req.params.id)
  if (!trip) throw new HttpError(404, 'Not found')
  if (trip.ownerSub === req.user.sub) throw new HttpError(400, 'Owner cannot leave their own trip')
  const shared = normalizeShared(trip.sharedWith as Array<SharedEntry | string>)
  if (!shared.some((e) => e.sub === req.user.sub)) throw new HttpError(400, 'Not a collaborator')

  await Trip.collection.updateOne({ _id: trip._id }, { $pull: { sharedWith: { sub: req.user.sub } } } as never)
  res.status(204).send()
}))

router.delete('/:id/share/:sub', asyncRoute(async (req, res) => {
  const trip = await Trip.findById(req.params.id)
  if (!trip) throw new HttpError(404, 'Not found')
  requireOwner(trip.ownerSub, req.user.sub)

  await Trip.collection.updateOne({ _id: trip._id }, { $pull: { sharedWith: { sub: req.params.sub } } } as never)

  // Cancel any pending invite so the removed user can't accept it after revocation
  await Notification.deleteMany({
    toSub: req.params.sub,
    tripId: req.params.id,
    type: 'trip_share_invite',
    status: 'pending',
  })

  res.status(204).send()
}))

router.delete('/:id', asyncRoute(async (req, res) => {
  const trip = await Trip.findById(req.params.id)
  if (!trip) throw new HttpError(404, 'Not found')
  requireOwner(trip.ownerSub, req.user.sub)
  await trip.deleteOne()
  await JournalDay.deleteMany({ tripId: req.params.id })
  res.status(204).send()
}))

// ─── Permit suggestion ────────────────────────────────────────────────────────

router.post('/:id/permits/suggest', asyncRoute(async (req, res) => {
  await requireAiQuota(req.user.sub)

  const trip = await fetchTripForRead(req.params.id as string, req.user.sub)
  const partySize = partySizeFor(trip)

  const gpxPlanned = trip.gpxPlanned as { coordinates?: [number, number, number][] } | undefined

  const result = await suggestPermits({
    title:     trip.title as string | undefined,
    location:  trip.location as string | undefined,
    startDate: (trip.startDate as Date | undefined)?.toString(),
    endDate:   (trip.endDate as Date | undefined)?.toString(),
    partySize,
    gpxCoords: gpxPlanned?.coordinates,
  })

  await recordAiUsage(req.user.sub, req.params.id as string)
  res.json(result)
}))

router.post('/:id/permits/lookup', asyncRoute(async (req, res) => {
  await requireAiQuota(req.user.sub)

  const trip = await fetchTripForRead(req.params.id as string, req.user.sub)

  const { permitName, links = [] } = req.body as { permitName?: string; links?: PermitLink[] }
  if (!permitName?.trim()) throw new HttpError(400, 'permitName is required')
  const partySize = partySizeFor(trip)

  const result = await lookupPermit(permitName.trim(), {
    title:     trip.title as string | undefined,
    location:  trip.location as string | undefined,
    startDate: (trip.startDate as Date | undefined)?.toString(),
    endDate:   (trip.endDate as Date | undefined)?.toString(),
    partySize,
  }, links)

  await recordAiUsage(req.user.sub, req.params.id as string)
  res.json(result)
}))

router.post('/:id/permits/zone-product', asyncRoute(async (req, res) => {
  await requireAiQuota(req.user.sub)

  const trip = await fetchTripForRead(req.params.id as string, req.user.sub)

  const input = req.body as ZoneProductInput
  if (!input?.zoneName || !input?.recgov) throw new HttpError(400, 'zoneName and recgov are required')
  const partySize = partySizeFor(trip)

  const result = await pickZoneProduct(input, partySize)
  await recordAiUsage(req.user.sub, req.params.id as string)
  res.json(result)
}))

export default router