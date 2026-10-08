/**
 * One-time migration: remove stale partner checklist items from route stage.
 *
 * "Partners added" and "Partners reviewed" were removed from the Route stage
 * checklist when Partners was moved to the Permits stage. Plans saved before
 * that change still carry these items in stages.route.checklist.
 *
 * Run with:  npx tsx server/scripts/remove-stale-route-checklist-items.ts
 * Dry run:   npx tsx server/scripts/remove-stale-route-checklist-items.ts --dry-run
 */

import 'dotenv/config'
import mongoose from 'mongoose'
import { Plan } from '../src/models/Plan'

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/larchbound'
const DRY_RUN    = process.argv.includes('--dry-run')

const STALE_ITEMS = ['Partners added', 'Partners reviewed']

const staleFilter = {
  'stages.route.checklist': {
    $elemMatch: { text: { $in: STALE_ITEMS } },
  },
}

async function main() {
  await mongoose.connect(MONGODB_URI)
  console.log(`Connected to MongoDB${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`)

  const affected = await Plan.collection.countDocuments(staleFilter)
  console.log(`Plans with stale checklist items: ${affected}`)

  if (affected === 0) {
    console.log('Nothing to do.')
    await mongoose.disconnect()
    return
  }

  if (DRY_RUN) {
    const plans = await Plan.collection
      .find(staleFilter, { projection: { _id: 1, ownerSub: 1, 'meta.title': 1, 'stages.route.checklist': 1 } })
      .toArray()

    for (const plan of plans) {
      const stale = (plan.stages?.route?.checklist ?? [])
        .filter((c: { text: string }) => STALE_ITEMS.includes(c.text))
        .map((c: { text: string }) => c.text)
      console.log(`  Plan ${plan._id} ("${plan.meta?.title ?? 'Untitled'}"): would remove [${stale.join(', ')}]`)
    }

    console.log(`\nDry run complete — ${affected} plan(s) would be updated. Re-run without --dry-run to apply.`)
    await mongoose.disconnect()
    return
  }

  const result = await Plan.collection.updateMany(
    staleFilter,
    { $pull: { 'stages.route.checklist': { text: { $in: STALE_ITEMS } } } as never },
  )

  console.log(`Updated ${result.modifiedCount} plan(s). Done.`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
