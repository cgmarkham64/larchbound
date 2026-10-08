/**
 * One-time migration: Plan documents → Trip documents
 *
 * Also migrates existing Trip.sharedWith entries from plain strings to
 * { sub, role } objects to match the updated schema.
 *
 * Run with: npx tsx server/scripts/migratePlans.ts
 *
 * Safe to inspect with --dry-run flag (prints what would be done, writes nothing).
 */

import 'dotenv/config'
import mongoose from 'mongoose'
import { Trip } from '../src/models/Trip'
import { Plan } from '../src/models/Plan'

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/larchbound'
const DRY_RUN = process.argv.includes('--dry-run')

// Best-effort parse of freeform date range strings like "Jun 1 – Jun 8, 2025"
function parseDateRange(dateRange: string, fallback: Date): { start: Date; end: Date } {
  const normalized = dateRange.replace(/[–—]/g, '-').trim()

  // "Mon DD - Mon DD, YYYY"
  const full = normalized.match(/([A-Za-z]+ \d+)\s*-\s*([A-Za-z]+ \d+),?\s*(\d{4})/)
  if (full) {
    const start = new Date(`${full[1]}, ${full[3]}`)
    const end   = new Date(`${full[2]}, ${full[3]}`)
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) return { start, end }
  }

  // "YYYY-MM-DD - YYYY-MM-DD"
  const iso = normalized.match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/)
  if (iso) {
    const start = new Date(iso[1])
    const end   = new Date(iso[2])
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) return { start, end }
  }

  return { start: fallback, end: fallback }
}

async function main() {
  await mongoose.connect(MONGODB_URI)
  console.log(`Connected to MongoDB${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`)

  // ── Step 1: Migrate Trip.sharedWith from [String] to [{ sub, role }] ─────────
  const rawTrips = await Trip.collection.find({}).toArray()
  let swMigrated = 0

  for (const trip of rawTrips) {
    const sw = trip.sharedWith as unknown[]
    if (!sw || sw.length === 0) continue
    if (typeof sw[0] === 'string') {
      const converted = (sw as string[]).map((sub) => ({ sub, role: 'edit' }))
      if (!DRY_RUN) {
        await Trip.collection.updateOne({ _id: trip._id }, { $set: { sharedWith: converted } })
      }
      console.log(`  Trip ${trip._id}: converted ${sw.length} sharedWith string(s) → objects`)
      swMigrated++
    }
  }
  console.log(`sharedWith migration: ${swMigrated} trip(s) updated`)

  // ── Step 2: Migrate Plan documents → Trip documents ──────────────────────────
  const plans = await Plan.collection.find({}).toArray()
  let plansMigrated = 0
  let plansSkipped  = 0

  for (const plan of plans) {
    const meta = (plan.meta ?? {}) as Record<string, unknown>
    const title    = (meta.title    as string | undefined) || 'Untitled Trip'
    const location = (meta.location as string | undefined) || ''
    const fallback = new Date(plan.createdAt as Date)
    const { start, end } = parseDateRange((meta.dateRange as string) ?? '', fallback)

    // Rough dedup: skip if a Trip already exists with same ownerSub + title + startDate
    const existing = await Trip.findOne({
      ownerSub:  plan.ownerSub,
      title,
      startDate: start,
    }).lean()

    if (existing) {
      console.log(`  Plan ${plan._id} ("${title}"): already migrated — skipping`)
      plansSkipped++
      continue
    }

    const tripData = {
      title,
      location,
      startDate:   start,
      endDate:     end,
      status:      'complete',
      planStages:  plan.stages ?? {},
      ownerSub:    plan.ownerSub,
      sharedWith:  [],
    }

    if (!DRY_RUN) {
      await Trip.create(tripData)
    }

    console.log(`  Plan ${plan._id} ("${title}"): ${DRY_RUN ? 'would create' : 'created'} Trip (${start.toDateString()} – ${end.toDateString()})`)
    plansMigrated++
  }

  console.log(`\nPlan migration: ${plansMigrated} migrated, ${plansSkipped} skipped`)
  console.log('Done.')
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})