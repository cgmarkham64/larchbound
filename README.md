# LarchBound

An outdoor and hiking trip planning and logging app. Plan trips through a seven-stage wizard (route, weather, permits, food, gear, departure, journal), log completed trips, import GPX tracks, manage gear loadouts, and browse photos — all in one place.

---

## Tech Stack

**Frontend** (`/src`)
- React 19 + TypeScript
- Vite 8
- TanStack Router — code-based routing with auth-guard layout route
- TanStack Query — server state, caching, and mutations
- Axios — HTTP client with JWT interceptor
- Zustand — auth state, persisted to `localStorage`
- React Hook Form + Zod — forms and validation
- Tailwind CSS v4

**Backend** (`/server`)
- Node.js + Express 4
- MongoDB 8 via Mongoose
- TypeScript compiled with `tsx` (dev) / `tsc` (prod)

---

## Getting Started

### Docker (recommended)

Spins up the full stack — frontend (nginx), API, MongoDB, and Keycloak — in one command.

**Auth:** Keycloak handles login via OIDC/PKCE. The app redirects to Keycloak at http://localhost:8080 instead of using the built-in login page. API tokens are RS256 JWTs verified via Keycloak's JWKS endpoint.

**Prerequisites:** Docker + Docker Compose

```bash
# Copy and fill in secrets
cp server/.env.example server/.env

# Build images and start all services
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000 |
| Keycloak admin | http://localhost:8080 (admin / admin) |

**First-time Keycloak setup** (only needed once — persists across restarts as long as the `keycloak-data` volume exists):
1. Visit http://localhost:8080, sign in as `admin / admin`
2. Create realm: `LarchBound`
3. Create client: `larchbound-app` (OpenID Connect, public, PKCE S256 enabled)
4. Set valid redirect URIs to `http://localhost:3000/*` and web origins to `http://localhost:3000`

To stop: `docker compose down`  
To wipe volumes (clears the database and Keycloak realm): `docker compose down -v`

---

### Local Development

**Auth:** Uses the built-in login page (`/login`) with JWT/HS256 tokens signed by `JWT_SECRET`. No Keycloak required — leave `KEYCLOAK_JWKS_URI` and `KEYCLOAK_ISSUER` commented out in `server/.env` (the default).

**Prerequisites:** Node.js 20+, MongoDB Community 8.0

```bash
# Install MongoDB via Homebrew (first time only)
brew tap mongodb/brew
brew install mongodb-community@8.0

# Install dependencies
npm install
cd server && npm install && cd ..

# Copy and fill in secrets (keep KEYCLOAK_* lines commented out)
cp server/.env.example server/.env

# Start MongoDB, then run frontend + backend
npm run mongodb:start
npm run dev:all
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:8000 |

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server (frontend only) |
| `npm run api:dev` | Start the Express API server (backend only) |
| `npm run dev:all` | Run frontend and backend concurrently |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |
| `npm run mongodb:start` | Start MongoDB via Homebrew services |
| `npm run mongodb:stop` | Stop MongoDB via Homebrew services |

---

## Project Structure

```
larchbound/
├── src/                        # Frontend
│   ├── components/
│   │   ├── journal/            # DaySelector, JournalSection
│   │   ├── layout/             # IconRail, AccountDialog, NotificationBell
│   │   ├── map/                # MapTab, WaypointForm, WaypointChip, leafletIcons
│   │   ├── plan/               # PlanWizard, StageRail, StageHeader, PlanOverview,
│   │   │                       #   Ring, Pill, JumpChip, ProgressBar, CheckItem
│   │   │   └── stages/         # RouteStage ✅, WeatherStage ✅, PermitsStage ✅,
│   │   │                       #   FoodStage ✅, GearStage ✅, DepartStage ✅, JournalStage ✅
│   │   ├── trip/               # TripSidebar, TripDetail, ShareDialog, ConfirmDialog
│   │   └── ui/                 # HikerOverlay, MoonLoader
│   ├── hooks/                  # useTrips, useJournalDays, useNotifications, useDebounce, usePlans
│   ├── lib/                    # api.ts (axios), auth.ts, trips.ts, plans.ts, users.ts, notifications.ts, permits.ts, utils.ts
│   ├── pages/                  # HomePage, MapPage, PhotosPage, GearPage, PlanPage, LoginPage, RegisterPage
│   ├── routes/                 # TanStack Router route definitions
│   ├── store/                  # auth.ts (Zustand)
│   └── types/                  # Trip, JournalDay, GearItem, Loadout, Photo, Notification
│
├── server/                     # Backend
│   ├── Dockerfile
│   ├── .env.example
│   └── src/
│       ├── middleware/         # requireAuth (JWT → Keycloak-ready)
│       ├── models/             # Trip (+ planStages), JournalDay, UserProfile, Loadout, GearItem, Notification
│       └── routes/             # trips (+ permit suggest/lookup), journalDays, loadouts, gearItems, users, notifications, auth
│
├── Dockerfile                  # Frontend — Node build → nginx
├── docker compose.yml          # Full stack: frontend, API, MongoDB, Keycloak
└── nginx.conf                  # SPA routing + /api proxy to backend container
```

---

## API

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account, returns JWT |
| POST | `/api/auth/login` | Verify credentials, return JWT |
| GET / PUT | `/api/auth/me` | Get or update current user profile |
| PUT / DELETE | `/api/auth/me/avatar` | Upload or remove avatar |
| PUT | `/api/auth/me/preferences` | Update user preferences (weather tolerances, default times, units) |
| GET / POST | `/api/trips` | List owned+shared trips / create trip |
| GET / PUT / DELETE | `/api/trips/:id` | Read / update / delete trip |
| POST | `/api/trips/:id/share` | Send collaboration invite |
| DELETE | `/api/trips/:id/share/:sub` | Remove collaborator |
| POST | `/api/trips/:id/permits/suggest` | AI scan — returns permit resource links for the trip area |
| POST | `/api/trips/:id/permits/lookup` | AI lookup — returns pre-filled permit fields by name |
| GET / POST | `/api/journal-days?tripId=` | List / create journal entries for a trip |
| PUT / DELETE | `/api/journal-days/:id` | Update / delete a journal entry |
| GET / POST | `/api/loadouts` | List / create loadouts |
| GET / PUT / DELETE | `/api/loadouts/:id` | Read / update / delete loadout |
| GET / POST | `/api/gear-items` | List / create gear items |
| GET / PUT / DELETE | `/api/gear-items/:id` | Read / update / delete gear item |
| GET | `/api/users/search?q=` | Search users by name or email |
| GET | `/api/notifications` | List notifications for current user |
| POST | `/api/notifications/:id/accept` | Accept a trip invite |
| POST | `/api/notifications/:id/decline` | Decline a trip invite |
| DELETE | `/api/notifications/:id` | Dismiss a notification |
| PATCH | `/api/notifications/read-all` | Mark all non-pending notifications as read |
| POST | `/api/journal-scan` | AI scan of a journal image → structured JSON (title, body, mileage, elevation, temps, weather) |