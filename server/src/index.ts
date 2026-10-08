import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import authRouter from './routes/auth'
import localAuthRouter from './routes/localAuth'
import gearItemsRouter from './routes/gearItems'
import journalDaysRouter from './routes/journalDays'
import journalScanRouter from './routes/journalScan'
import loadoutsRouter from './routes/loadouts'
import tripsRouter from './routes/trips'
import usersRouter from './routes/users'
import notificationsRouter from './routes/notifications'
import plansRouter from './routes/plans'
import foodRouter from './routes/food'
import { requireAuth } from './middleware/auth'

const DEFAULT_PORT = 8000

const app = express()
const PORT = process.env.PORT ?? DEFAULT_PORT
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/larchbound'

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json({ limit: '10mb' }))

// Local dev: register + login routes (only active when KEYCLOAK_JWKS_URI is not set)
if (!process.env.KEYCLOAK_JWKS_URI) {
  app.use('/api/auth', localAuthRouter)
}

// Auth profile routes — login/register handled by Keycloak in Docker
app.use('/api/auth', requireAuth, authRouter)

// Protected routes — all require a valid JWT
app.use('/api/gear-items', requireAuth, gearItemsRouter)
app.use('/api/journal-days', requireAuth, journalDaysRouter)
app.use('/api/journal-scan', requireAuth, journalScanRouter)
app.use('/api/loadouts', requireAuth, loadoutsRouter)
app.use('/api/trips', requireAuth, tripsRouter)
app.use('/api/users', requireAuth, usersRouter)
app.use('/api/notifications', requireAuth, notificationsRouter)
app.use('/api/plans', requireAuth, plansRouter)
app.use('/api/food', requireAuth, foodRouter)

app.get('/health', (_req, res) => res.json({ ok: true }))

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected')
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`))
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err)
    process.exit(1)
  })
