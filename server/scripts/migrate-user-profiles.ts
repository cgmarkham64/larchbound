/**
 * One-time migration: copies existing User documents into the new UserProfile
 * collection, preserving avatarUrl. Uses the raw MongoDB collection so it does
 * not depend on the (soon-to-be-deleted) User model.
 *
 * Safe to run multiple times — upserts on sub.
 *
 * Run before deleting server/src/models/User.ts:
 *   cd server
 *   npx tsx scripts/migrate-user-profiles.ts
 */

import 'dotenv/config'
import mongoose from 'mongoose'
import { UserProfile } from '../src/models/UserProfile'

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/larchbound'

async function main() {
  await mongoose.connect(MONGODB_URI)

  const users = await mongoose.connection
    .collection('users')
    .find({})
    .toArray()

  console.log(`Migrating ${users.length} user(s) to UserProfile…`)

  for (const u of users) {
    await UserProfile.findOneAndUpdate(
      { sub: u.sub },
      { $set: { sub: u.sub, name: u.name, email: u.email, ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}) } },
      { upsert: true, new: true }
    )
    console.log(`  ${u.email} (${u.sub})`)
  }

  console.log('Done.')
  await mongoose.disconnect()
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})