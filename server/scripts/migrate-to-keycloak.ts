/**
 * One-time migration: creates each MongoDB User in Keycloak, then rewrites every
 * document that stores the old local UUID (sub) to use the Keycloak-issued UUID.
 *
 * Documents updated: User, Trip (ownerSub + sharedWith[]), Loadout, GearItem,
 * Notification (toSub + fromSub).
 *
 * Idempotent: if a user already exists in Keycloak (matched by email) the script
 * reuses their existing UUID instead of creating a duplicate.
 *
 * Prerequisites:
 *   - Docker stack running: docker compose up
 *   - Realm "LarchBound" and client "larchbound-app" already created in Keycloak
 *
 * Run:
 *   cd server
 *   npx tsx scripts/migrate-to-keycloak.ts
 *
 * Override defaults with env vars:
 *   MONGODB_URI   (default: mongodb://localhost:27017/larchbound)
 *   KEYCLOAK_URL  (default: http://localhost:8080)
 *   KEYCLOAK_REALM (default: LarchBound)
 *   KEYCLOAK_ADMIN_USER (default: admin)
 *   KEYCLOAK_ADMIN_PASS (default: admin)
 */

import 'dotenv/config'
import mongoose from 'mongoose'
import { User } from '../src/models/User'
import { Trip } from '../src/models/Trip'
import { Loadout } from '../src/models/Loadout'
import { GearItem } from '../src/models/GearItem'
import { Notification } from '../src/models/Notification'

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/larchbound'
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? 'http://localhost:8080'
const REALM = process.env.KEYCLOAK_REALM ?? 'LarchBound'
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER ?? 'admin'
const ADMIN_PASS = process.env.KEYCLOAK_ADMIN_PASS ?? 'admin'

// ── Keycloak Admin API helpers ───────────────────────────────────────────────

async function getAdminToken(): Promise<string> {
  const res = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: ADMIN_USER,
      password: ADMIN_PASS,
    }),
  })
  if (!res.ok) throw new Error(`Failed to get admin token: ${res.status} ${await res.text()}`)
  const data = await res.json() as { access_token: string }
  return data.access_token
}

async function findKeycloakUserByEmail(token: string, email: string): Promise<string | null> {
  const res = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users?email=${encodeURIComponent(email)}&exact=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`User search failed: ${res.status} ${await res.text()}`)
  const users = await res.json() as Array<{ id: string; email: string }>
  return users.find(u => u.email.toLowerCase() === email.toLowerCase())?.id ?? null
}

async function createKeycloakUser(token: string, email: string, name: string): Promise<string> {
  const [firstName, ...rest] = name.trim().split(' ')
  const lastName = rest.join(' ') || ''

  const res = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM}/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: email,
      email,
      firstName,
      lastName,
      enabled: true,
      emailVerified: true,
      requiredActions: ['UPDATE_PASSWORD'],
    }),
  })
  if (!res.ok) throw new Error(`Create user failed: ${res.status} ${await res.text()}`)

  // The new user's ID is in the Location header: .../users/{id}
  const location = res.headers.get('Location') ?? ''
  const id = location.split('/').pop()
  if (!id) throw new Error(`Could not extract user ID from Location: ${location}`)
  return id
}

// ── MongoDB update helpers ───────────────────────────────────────────────────

async function rewriteSub(oldSub: string, newSub: string) {
  const [tripOwner, tripShared, loadout, gear, notifTo, notifFrom, user] = await Promise.all([
    Trip.updateMany({ ownerSub: oldSub }, { $set: { ownerSub: newSub } }),
    // sharedWith is a flat String array — use $set with arrayFilters
    Trip.updateMany(
      { sharedWith: oldSub },
      { $set: { 'sharedWith.$[el]': newSub } },
      { arrayFilters: [{ el: oldSub }] }
    ),
    Loadout.updateMany({ ownerSub: oldSub }, { $set: { ownerSub: newSub } }),
    GearItem.updateMany({ ownerSub: oldSub }, { $set: { ownerSub: newSub } }),
    Notification.updateMany({ toSub: oldSub }, { $set: { toSub: newSub } }),
    Notification.updateMany({ fromSub: oldSub }, { $set: { fromSub: newSub } }),
    User.updateOne({ sub: oldSub }, { $set: { sub: newSub } }),
  ])

  return {
    trips: tripOwner.modifiedCount + tripShared.modifiedCount,
    loadouts: loadout.modifiedCount,
    gear: gear.modifiedCount,
    notifications: notifTo.modifiedCount + notifFrom.modifiedCount,
    user: user.modifiedCount,
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Connecting to MongoDB…')
  await mongoose.connect(MONGODB_URI)

  const users = await User.find({}).lean()
  console.log(`Found ${users.length} user(s) to migrate.\n`)

  if (users.length === 0) {
    console.log('Nothing to do.')
    await mongoose.disconnect()
    return
  }

  console.log('Fetching Keycloak admin token…')
  const token = await getAdminToken()
  console.log('Token obtained.\n')

  let created = 0
  let reused = 0
  let skipped = 0

  for (const user of users) {
    process.stdout.write(`  ${user.email} (local sub: ${user.sub}) … `)

    let keycloakId = await findKeycloakUserByEmail(token, user.email)

    if (keycloakId) {
      process.stdout.write(`exists in Keycloak (${keycloakId})`)
      reused++
    } else {
      keycloakId = await createKeycloakUser(token, user.email, user.name)
      process.stdout.write(`created in Keycloak (${keycloakId})`)
      created++
    }

    if (keycloakId === user.sub) {
      console.log(' — sub unchanged, skipping DB update')
      skipped++
      continue
    }

    const counts = await rewriteSub(user.sub, keycloakId)
    console.log(
      ` — updated: user=${counts.user} trips=${counts.trips} loadouts=${counts.loadouts}` +
      ` gear=${counts.gear} notifications=${counts.notifications}`
    )
  }

  console.log(`\nDone. Created: ${created}, reused: ${reused}, sub unchanged: ${skipped}`)
  console.log('Users created in Keycloak will be prompted to set a new password on first login.')
  await mongoose.disconnect()
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})