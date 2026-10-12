# LarchBound

An outdoor/hiking trip planning and logging app with a React frontend and Express/MongoDB backend.

## Tech Stack

### Frontend (`/src`)
- **Framework**: React 19 + TypeScript
- **Build**: Vite 8
- **Routing**: TanStack Router (code-based, auth guard via `_authenticated` layout route)
- **Data fetching**: TanStack Query + Axios
- **State**: Zustand (auth persisted to localStorage under key `larchbound-auth`)
- **Forms**: React Hook Form + Zod
- **Styling**: Tailwind CSS v4 — always prefer Tailwind utility classes over inline `style={{}}` props or custom CSS. Use `hover:`, `focus:`, `group`/`group-hover:` pseudo-classes instead of JS event handlers for style changes. Only use inline styles for truly dynamic/computed values (e.g. colors from variables/props) or SVG-specific attributes.
- **Type scale** — use the semantic Tailwind tokens defined in `@theme` in `src/index.css`. Do not use arbitrary `text-[Xpx]` classes for sizes that have a token:

  | Token          | Size | Use for |
  |----------------|------|---------|
  | `text-label`   | 11px | Section labels, metadata, tags, mono dividers |
  | `text-caption` | 12px | Buttons (`.btn-sm`), tooltips, tab labels |
  | `text-fine`    | 13px | Badges, chips, secondary UI |
  | `text-body-sm` | 14px | Form labels, secondary body, list items |
  | `text-body`    | 15px | Primary body text, descriptions |
  | `text-body-lg` | 16px | Prominent body text |
  | `text-sub`     | 18px | Sub-headings |
  | `text-h3`      | 20px | Section headings |
  | `text-h2`      | 22px | Panel / page-section headings |
  | `text-h1`      | 28px | Page titles |
  | `text-hero`    | 34px | Hero / brand text |

  **Minimum readable size is `text-label` (11px).** Exception: SVG inline `fontSize` in chart/map marker elements may go smaller only when intentionally decorative (e.g. a step number in a tiny map pin).
  Icon sizes: prefer the exported constants `ICON_XS` (10) through `ICON_XL` (22) from `src/components/icons.tsx` over raw pixel values.
- **One component per file** — each file exports one primary component. Extract sub-components, helpers, and types into their own files as soon as a file grows unwieldy (aim to keep files under ~400 lines). Co-locate tightly coupled helpers in a `componentName.helpers.ts` and types in `componentName.types.ts` alongside the component file.

### Backend (`/server`)
- **Runtime**: Node.js + Express 4
- **Database**: MongoDB 8 (local) via Mongoose
- **Language**: TypeScript compiled with tsx (dev) / tsc (prod)
- **API base**: `http://localhost:8000/api`

## Code Quality

These principles apply to all new code and refactors across the entire codebase (frontend and backend).

- **DRY** — if the same logic appears twice, extract it. Named helpers beat copy-paste every time. This applies to route boilerplate (try/catch, ownership checks, ObjectId validation) as much as UI logic.
- **No magic numbers or strings** — every non-obvious literal (numeric constants, repeated color values, conversion factors) must be a named constant at the top of the file or in a shared constants module.
- **Small, focused functions** — aim for under ~30 lines per function. If a function needs a comment to explain what each block does, those blocks should be separate functions.
- **Consistent abstraction levels** — a function should either orchestrate (call other functions) or implement (do low-level work), not both. Don't mix raw trig with high-level path logic in the same function body.
- **Type safety** — no unchecked `as` assertions. Use type guards or Zod schemas at system boundaries (JWT parsing, API responses, user input). Internal code that has already been validated can use type narrowing; it should never need `as never`.
- **Thin route handlers** — Express route handlers wire HTTP to business logic; they don't contain it. Any logic beyond a single DB call belongs in a service (`server/src/services/`) or utility (`server/src/utils/`).
- **Handle errors where they can occur** — every async DB call needs a try/catch. Don't leave handlers unwrapped because they "look simple".
- **Don't over-decompose to satisfy lint metrics** — `complexity`/`max-lines-per-function` warnings are a proxy for readability, not the goal itself. When resolving one, stop once comfortably under the threshold; don't keep splitting until a function hits zero warnings if that means extracting single-call-site one-liners or prop-drilling a simple form across three files. If a single-component refactor is trending past ~8-10 new files, pause and check in with the user before continuing — that's usually a sign the split is chasing the linter rather than tracking real conceptual boundaries.

## Commands

```bash
# Local dev (requires Homebrew MongoDB)
npm run dev      # Start Vite dev server (frontend only)
npm run build    # Type-check + build
npm run lint     # Run ESLint
npm run preview  # Preview production build
npm run api:dev  # Start Express API only
npm run dev:all  # Frontend + backend concurrently (localhost:5173 / :8000)
npm run mongodb:start  # Start mongodb-community@8.0 via Homebrew
npm run mongodb:stop   # Stop mongodb-community@8.0 via Homebrew

# Docker (full stack — frontend nginx :3000, API :8000, MongoDB, Keycloak :8080)
docker compose up --build   # Build images and start all services
docker compose up           # Start without rebuilding
docker compose down         # Stop all containers
docker compose down -v      # Stop and wipe volumes (clears DB)
```

## Project Structure

### Frontend
```
src/
  lib/            # api.ts (axios instance), auth.ts (login/register/avatar API calls),
                  #   gpx.ts, exif.ts, journalDays.ts, trips.ts (+ unshareTrip, leaveTrip),
                  #   users.ts (searchUsers by name/email, shareTrip),
                  #   notifications.ts (fetchNotifications, acceptInvite, declineInvite, markAllRead, dismissNotification),
                  #   plans.ts (createPlan, updatePlan, deletePlan — targets /api/trips; PlanRecord retired, uses Trip type),
                  #   utils.ts (initials, extractApiError — shared across components)
  routes/         # TanStack Router — __root.tsx, _authenticated.tsx, index.tsx, login.tsx, register.tsx,
                  #   map.tsx, photos.tsx, gear.tsx,
                  #   plan.tsx (validateSearch for ?id= param)
  pages/          # LoginPage, RegisterPage, HomePage, MapPage, PhotosPage, GearPage,
                  #   PlanPage (auto-creates a plan if no ?id= then renders PlanWizard)
  store/          # auth.ts (Zustand — token, user {id, email, name, avatarUrl}, updateUser, clearAuth)
  types/          # index.ts (Trip [+ ownerSub, sharedWith: {sub,name}[]], JournalDay [+ wildlife?, companions?],
                  #            AppNotification, Photo, GearItem, GearCategory, Loadout,
                  #            GpxTrack, GpxTrackEntry, Waypoint, WaypointType), auth.ts (User, AuthResponse)
  components/
    icons.tsx     # Shared SVG icon library for the whole app — import from here, never define icons inline.
                  #   Generic: IconCheck, IconPlus, IconX, IconSearch, IconList, IconLayers,
                  #     IconChevronLeft/Right (size param), IconArrowLeft/Right, IconSparkle, IconMap,
                  #     IconPackage, IconDroplets, IconPencil, IconLock, IconGear, IconBell (size param),
                  #     IconDownload, IconFile, IconCircle.
                  #   Waypoint/contextual (amber-colored): IconTent, IconMountain, IconWater, IconSun.
    journal/      # DaySelector.tsx, JournalSection.tsx (wildlife + companions panels;
                  #   companions always searches LarchBound users as you type; amber chip = user; auto-shares on save)
    layout/       # IconRail.tsx (nav rail + notification bell + account avatar + sign-out),
                  #   AccountDialog.tsx (edit name, change password, upload/remove avatar),
                  #   NotificationBell.tsx (badge + popover; accept/decline invites, dismiss, mark all read)
    map/          # MapTab.tsx, MapHelpers.tsx, MapEmptyState.tsx, WaypointIcon.tsx, leafletIcons.ts,
                  #   WaypointForm.tsx, WaypointChip.tsx, constants.ts
    plan/         # PlanWizard.tsx (loads plan from API, debounced autosave, saveState indicator;
                  #     accepts planId: string — PlanPage creates one if absent),
                  #   StageRail.tsx (left 280px rail), StageHeader.tsx (shared header + save indicator),
                  #   PlanOverview.tsx (2×3 stage card grid + critical path timeline),
                  #   Ring.tsx, Pill.tsx, JumpChip.tsx, ProgressBar.tsx, CheckItem.tsx (shared atoms),
                  #   types.ts (PlanMeta, PlanData + per-stage slices, StageBodyProps with plan/onChange),
                  #   constants.ts (STAGES metadata, createStages(), stageState()),
                  #   stages/ RouteStage.tsx ✅, WeatherStage.tsx ✅ (+ WmoConditionIcon.tsx; geocoding, climate normals,
                  #             10-day forecast, departure risk, 4-item checklist),
                  #           PermitsStage.tsx ✅, FoodStage.tsx ✅, GearStage.tsx ✅,
                  #           DepartStage.tsx ✅, JournalStage.tsx ✅
                  #   stages/permits/ — CriticalDatesCard.tsx, FreeformDialog.tsx (2-step type→details;
                  #     type-specific fields: URL, confirmation #, trailhead, zone builder per type),
                  #     PartnersCard.tsx, PermitAtoms.tsx (PermitTypeIcon, TypeChip, Field),
                  #     PermitCard.tsx (full layouts for all 9 types incl. hut/fishing/vehicle),
                  #     PermitsListView.tsx (scan banner + AI disclaimer consolidated; recreation.gov-only
                  #     Add button; domain badges replacing tier labels; non-bookable links dimmed),
                  #     permitsStage.constants.ts, permitsStage.types.ts, criticalDates.helpers.ts
    trip/         # TripDetail.tsx, TripHero.tsx (owner-gated Share/Delete; "Shared trip" badge for non-owners),
                  #   TripSidebar.tsx (search + filter popover: ownership, miles range, elev range, date range),
                  #   TripModal.tsx, TripRightPanel.tsx, ElevationProfile.tsx, GpxMapSection.tsx,
                  #   ShareDialog.tsx (People with access + Invite someone + utilities; optimistic collaborator list),
                  #   ConfirmDialog.tsx (reusable confirm modal base),
                  #   DeleteConfirm.tsx, LeaveConfirm.tsx (use ConfirmDialog)
    ui/           # HikerOverlay.tsx, MoonLoader.tsx (inline moon/mountain loading animation), sayings.ts
  hooks/          # useTrips.ts (+ useUnshareTrip, useLeaveTrip), useJournalDays.ts,
                  #   useNotifications.ts (useNotifications polls 30s, useAcceptInvite, useDeclineInvite, useMarkAllRead, useDismissNotification),
                  #   useDebounce.ts (generic debounce hook used in search inputs),
                  #   usePlans.ts (usePlans, usePlan, useCreatePlan, useUpdatePlan, useDeletePlan — all target /api/trips)
  router.tsx      # TanStack Router instance
```

### Backend
```
server/
  src/
    middleware/   # auth.ts (requireAuth — extracts Bearer JWT, populates req.user.sub/email/name;
                  #           verifyToken() uses JWKS/RS256 when KEYCLOAK_JWKS_URI is set, else JWT_SECRET/HS256)
    models/       # UserProfile.ts (sub, name, email, avatarUrl, preferences — upserted from JWT on every login),
                  #   Trip.ts (+ ownerSub, sharedWith[], status, planStages: Mixed), Loadout.ts (+ ownerSub),
                  #   GearItem.ts (+ ownerSub), JournalDay.ts (+ wildlife[], companions[]),
                  #   Notification.ts (toSub, fromSub, fromName, type, tripId, tripTitle, read, status),
                  #   AiUsage.ts (sub, yearMonth, count, tripId? — per-user rows + a GLOBAL_USAGE_SUB sentinel row for the global monthly ceiling)
    routes/       # auth.ts (register + login local-dev only; GET /me, PUT/DELETE /me/avatar, PUT /me/preferences),
                  #   trips.ts (+ POST /:id/permits/suggest, POST /:id/permits/lookup, POST /:id/permits/zone-product),
                  #   loadouts.ts, gearItems.ts, journalDays.ts, journalScan.ts,
                  #   users.ts (GET /search?q=), notifications.ts (GET, POST accept/decline, DELETE, PATCH read-all),
                  #   food.ts (POST /macros — AI-assisted macro lookup), aiUsage.ts (GET / — per-user quota summary)
    index.ts      # Express app, MongoDB connect; /api/auth public, all other routes behind requireAuth
  .env            # PORT=8000, MONGODB_URI, ANTHROPIC_API_KEY, JWT_SECRET, CORS_ORIGIN, AI_FEATURES_ENABLED
  .env.example    # committed template — copy to .env and fill in secrets
  Dockerfile      # multi-stage: tsc build → node:22-alpine runtime
```

### Docker
```
Dockerfile          # Frontend: node:22 Vite build → nginx:alpine; VITE_API_URL='' (relative paths)
server/Dockerfile   # Backend: tsc build → node:22-alpine; runs node dist/index.js
nginx.conf          # Serves SPA (try_files fallback) + reverse-proxies /api/* → larchbound-api:8000
docker compose.yml  # Four services on larchbound-net:
                    #   mongodb (mongo:8, named volume mongo-data)
                    #   keycloak (quay.io/keycloak/keycloak:26.0, start-dev, port 8080)
                    #   larchbound-api (env_file: server/.env, overrides MONGODB_URI + CORS_ORIGIN)
                    #   larchbound-frontend (nginx, port 3000)
```

### API Endpoints

**Auth (public)**
| Method     | Path                    | Description                                                                                  |
|------------|-------------------------|----------------------------------------------------------------------------------------------|
| POST       | `/api/auth/register`    | **Local dev only.** Create account — hashes password, stores UserProfile, returns signed 7-day JWT |
| POST       | `/api/auth/login`       | **Local dev only.** Verify credentials, return JWT + user (including `avatarUrl`)            |
| GET        | `/api/auth/me`          | Return current UserProfile (requires JWT); upserts name/email from token on each call        |
| PUT        | `/api/auth/me/avatar`       | Upload avatar as base64 data URL (max 5 MB); stores on UserProfile (requires JWT)        |
| DELETE     | `/api/auth/me/avatar`       | Remove avatar from UserProfile (requires JWT)                                             |
| PUT        | `/api/auth/me/preferences`  | Update user preferences (weatherTolerances, default times, units); lazily migrated on GET /me |

**Trips (all require JWT; scoped to ownerSub or sharedWith)**
| Method         | Path             | Description                                                                                                                                                                                                                                                                                                       |
|----------------|------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| GET/POST       | `/api/trips`     | List owned+shared trips / create trip (ownerSub set server-side)                                                                                                                                                                                                                                                  |
| GET/PUT/DELETE | `/api/trips/:id` | Read (owner or shared) / update (owner or shared) / delete (owner only). GET and PUT responses populate `sharedWith` as `{ sub, name }[]`. PUT accepts `gpxPlanned` and `gpxTracks`; non-owners cannot overwrite `sharedWith`. |
| POST           | `/api/trips/:id/share` | Send a collaboration invite notification to a user by `sub` (owner only); idempotent; does not add to `sharedWith` directly. |
| DELETE         | `/api/trips/:id/share/:sub` | Remove a collaborator (owner only); also cancels any pending invite notification for that user. |
| POST           | `/api/trips/:id/permits/suggest` | AI-powered permit resource scan — returns `{ links: PermitLink[] }` (url, title, description, tier) for the trip's route area. |
| POST           | `/api/trips/:id/permits/lookup`  | AI permit lookup by name — returns pre-filled permit fields (type, name, agency, url, criticalDates, confidence, verificationNote). |
| POST           | `/api/trips/:id/permits/zone-product` | AI pick of the correct recgov product for a detected zone-stay permit need. |

**Journal days (all require JWT; read gated by trip access, writes owner-only)**
| Method         | Path                        | Description                                           |
|----------------|-----------------------------|-------------------------------------------------------|
| GET/POST       | `/api/journal-days?tripId=` | List entries for a trip / create entry                |
| PUT/DELETE     | `/api/journal-days/:id`     | Update / delete a journal entry                       |

**Loadouts & gear (all require JWT; scoped to ownerSub)**
| Method         | Path                  | Description                                    |
|----------------|-----------------------|------------------------------------------------|
| GET/POST       | `/api/loadouts`       | List / create loadouts (populates items)       |
| GET/PUT/DELETE | `/api/loadouts/:id`   | Read / update / delete loadout                 |
| GET/POST       | `/api/gear-items`     | List / create gear items                       |
| GET/PUT/DELETE | `/api/gear-items/:id` | Read / update / delete gear item               |

**Users (all require JWT)**
| Method | Path                    | Description                                                                                                      |
|--------|-------------------------|------------------------------------------------------------------------------------------------------------------|
| GET    | `/api/users/search?q=`  | Search users by name or email (min 2 chars, case-insensitive, excludes caller, rate-limited 20 req/min). Returns up to 8 `{ sub, name }` results — email intentionally omitted. |

**Notifications (all require JWT)**
| Method | Path                            | Description                                                                                                   |
|--------|---------------------------------|---------------------------------------------------------------------------------------------------------------|
| GET    | `/api/notifications`            | List latest 50 notifications for the current user, newest first                                               |
| POST   | `/api/notifications/:id/accept` | Accept a pending trip invite — adds caller to `sharedWith`, notifies owner, marks notification read            |
| POST   | `/api/notifications/:id/decline`| Decline a pending trip invite — notifies owner, marks notification read                                        |
| DELETE | `/api/notifications/:id`        | Dismiss (delete) a notification                                                                                |
| PATCH  | `/api/notifications/read-all`   | Mark all non-pending notifications as read (called on panel open)                                              |

**Food (all require JWT)**
| Method | Path               | Description                                                                                    |
|--------|--------------------|--------------------------------------------------------------------------------------------------|
| POST   | `/api/food/macros` | AI-assisted nutrition lookup by food name — returns candidate `MacroResult[]` (kcal, protein, fat, carbs, weight, note) from USDA FDC, with Claude normalizing the query first. |

**AI usage (all require JWT)**
| Method | Path            | Description                                                                                      |
|--------|-----------------|----------------------------------------------------------------------------------------------------|
| GET    | `/api/ai-usage` | Current user's AI quota summary for the month — `{ used, limit, remaining, yearMonth }`. Backs the `AiQuotaBadge` shown near each AI-assisted action. |

**Other**
| Method | Path                | Description                                                                                                                   |
|--------|---------------------|-------------------------------------------------------------------------------------------------------------------------------|
| POST   | `/api/journal-scan` | AI-powered journal image scan — sends base64 image to Claude, returns structured JSON (title, body, milesCovered, elevationGainFt, tempLowF, tempHighF, weatherNotes) |


### Roadmap

See `TODO.md` for detailed task breakdowns. Feature direction:

- **Tests** — Vitest unit tests (`utils.ts`, filter predicates, `useDebounce`) + Playwright E2E golden paths (register → trip → share → journal).
- **Trip planning** *(all seven stages complete + persistence)* — Seven-stage wizard (`Route → Weather → Permits → Food → Gear → Depart → Journal`) fully built at `/plan` (`src/components/plan/`). Plans are persisted as `planStages` on the Trip model via `/api/trips` and autosaved (debounced 800 ms) on any stage change. `PlanPage` auto-creates a planning Trip on first visit and stores the ID in `?id=` search param. `StageHeader` shows live save state. Shared atoms: `Ring`, `Pill`, `JumpChip`, `ProgressBar`, `CheckItem`. Icons centralized in `src/components/icons.tsx`. Stage specs and known gaps in `TODO.md`. Flow: plan → execution → post-trip journal.
- **PDF export** — Trip report from Share dialog: hero stats, journal entries, GPX map, gear summary, photos. Dark amber/mono aesthetic via `@react-pdf/renderer` or print stylesheet.
- **Photo EXIF** — Parse EXIF client-side on upload (exifr): GPS coords, camera settings, timestamp. Store alongside photo in MongoDB.
- **Gear loadouts** — CRUD gear inventory; weight calculations in Zustand; link loadouts to trips.
- **Trip hero stats** — Add Weight Carried and Max Elevation as manual inputs on trip create; later derive from loadout and GPX.
- **Email invites** — Signed expiring invite tokens for share flow (Sendgrid/Resend); `/accept-invite` route.
- **Real-time collaboration** — Deconflicted/merged edits of trips and journal entries for multiple owners.
- **Global map** (`/map`) — All GPX tracks + planned routes across every trip; click to open trip/plan.
- **Photos** (`/photos`) — Grid of all photos across trips with metadata; full EXIF on click.
- **Gear** (`/gear`) — Gear inventory management; links to loadouts and weight calculations.

### Dev vs Docker

|                    | Local dev                                                                | Docker                                                                    |
|--------------------|--------------------------------------------------------------------------|---------------------------------------------------------------------------|
| Frontend           | http://localhost:5173 (Vite HMR)                                         | http://localhost:3000 (nginx)                                             |
| API                | http://localhost:8000 (absolute URL)                                     | relative paths, proxied by nginx → `larchbound-api:8000`                   |
| Auth               | JWT/HS256 via `JWT_SECRET`; `/login` + `/register` pages work            | Keycloak OIDC/PKCE via `keycloak-js`; login/register redirect to Keycloak |
| Token verification | `verifyToken()` uses `JWT_SECRET` (HS256) when `KEYCLOAK_JWKS_URI` unset | `verifyToken()` fetches JWKS from Keycloak and verifies RS256             |
| MongoDB            | Homebrew `mongodb-community@8.0`                                         | `mongodb` container with named volume `mongo-data`                        |
| Keycloak           | not running                                                              | http://localhost:8080 (admin / admin)                                     |

**Local dev auth** — `KEYCLOAK_JWKS_URI` and `KEYCLOAK_ISSUER` must be absent/commented out in `server/.env` (default in `.env.example`). The frontend detects no Keycloak config and falls back to the `/login` page with `POST /api/auth/login`.

**Docker/Keycloak first-time setup** — after `docker compose up --build`, visit http://localhost:8080, sign in as `admin/admin`, then:
1. Create realm `LarchBound`
2. Create client `larchbound-app` (OpenID Connect, public, PKCE S256 enabled)
3. Set valid redirect URIs to `http://localhost:3000/*` and web origins to `http://localhost:3000`

Subsequent `docker compose up` calls don't need the realm re-created if the `keycloak-data` volume persists.

### Production (AWS)

`https://larchbound.com` is live (closed beta). No CI/CD yet — all deploys are manual.

| Layer    | Service                          | Notes                                                                                                             |
|----------|-----------------------------------|---------------------------------------------------------------------------------------------------------------------|
| Frontend | S3 (private) + CloudFront         | OAC-only bucket access, no public S3 URL; distribution `E3MBP3XVUNPUJX`                                            |
| API      | Lightsail `larchbound-api` ($7/mo, static IP) | `docker-compose.prod.yml` (API container only — no local mongo/keycloak/nginx)                         |
| Database | MongoDB Atlas M0 (`larchbound-cluster`, us-east-1) | free tier, 512MB cap                                                                                  |
| DNS/certs| Route 53 + ACM (us-east-1)        | apex + `www` ALIAS → CloudFront; `api.larchbound.com` A record → Lightsail static IP (CloudFront's origin-domain field rejects a bare IP, needs a hostname) |
| Secrets  | SSM Parameter Store, `/larchbound/prod/*` | `JWT_SECRET`, `MONGODB_URI`, `CORS_ORIGIN`, `ORIGIN_VERIFY_SECRET` — pulled onto the box by `deploy/fetch-env.sh` |

- **Origin security**: Lightsail firewalls can't reference CloudFront's managed prefix list (that's an EC2/VPC Security Group feature). Port 8000 is open to the internet instead, gated by a shared-secret header: CloudFront attaches `X-Origin-Verify: <secret>` to every request it forwards; `requireOriginSecret` (`server/src/middleware/originVerify.ts`, wired in first in `server/src/index.ts`) 403s anything missing/mismatching it. No-ops when `ORIGIN_VERIFY_SECRET` is unset, so local dev and Docker Compose dev are unaffected.
- **Frontend deploy**: `deploy/deploy-frontend.sh` (run locally) — builds with `VITE_API_URL=` explicitly empty (axios → relative paths; a bare `npm run build` falls back to the hardcoded `http://localhost:8000` default), syncs `dist/` to S3, invalidates CloudFront.
- **API deploy**: `rsync -e "ssh -i ~/.ssh/LightsailDefaultKey-us-east-1.pem" server/ docker-compose.prod.yml ubuntu@<lightsail-ip>:~/larchbound/`, then on the box `docker compose -f docker-compose.prod.yml up --build -d`.
- Full launch plan and remaining pre-beta work (AI usage caps, supporter/Venmo, AWS Budgets) tracked in `TODO-launch.md`.

### Notes
- GET /api/loadouts/:id — automatically populates the full GearItem documents so the frontend doesn't need a second request
- GET /api/trips/:id — populates the full Loadout (but not the loadout's items — you'd need a second populate for that; we can address it when you hook up the frontend)
- Auth middleware is wired in — all API routes except `/api/auth` require a valid Bearer JWT. `req.user.sub` is available in every route handler.
- `CORS_ORIGIN` env var controls Express CORS allowed origin (defaults to `http://localhost:5173` for local dev; docker compose sets it to `http://localhost:3000`)
- In Docker, `VITE_API_URL` is built as empty string so axios uses relative paths; nginx proxies `/api/*` to `larchbound-api:8000` preserving the full path
- Find out if OnX Backcountry offer any integrations for personal app projects to import data and items from them, brainstorm ideas to integrate this app into theirs


