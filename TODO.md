# Ridgeline — TODO

---

See `TODO-launch.md` for the rename + AWS + closed-beta rollout plan (separate initiative from the feature work below).

---

## Active Work

### Trips + Plan Wizard Unification

Every trip in Ridgeline starts as a plan. The Plan Wizard IS how trips are created. The "Trip Log" becomes "Trips" — a unified list of everything from active plans through completed expeditions, each with a status chip. This work retires the old New Trip dialog and tightly couples the Plan model to the Trip model so journals, gear, and the wizard all share one record.

---


### Wizard Stage Gaps

All seven stages render with internal state. The items below are UI stubs, disconnected wiring, or hardcoded values that need real data before the wizard is production-ready.

**All stages**
- ⚠ `Stage.done / Stage.total` are wired for Route, Weather, Permits, and Food — Gear and Depart still need their checklists connected to `onProgress`.

**Stage 1 - Route** 
- On an out and back trip, the list of waypoints and water sources is a little off. I'd expect the water sources to appear twice in this case, in the order of encounter.

**Stage 2 — Weather** *(replaces Days; full stage to be built)*
- ℹ Sunrise/sunset times computed here should eventually feed the Depart one-pager's per-day schedule column.

**Stage 3 — Permits**
- ℹ Auto-populate `plan.food.bearCanNeed` from permit data instead of leaving it a manual toggle. Two tiers of reliability here:
  - **Zone-detected permits (Indian Peaks, Enchantments, Maroon Bells-Snowmass)** — `ZoneProps.bear_canister_required` (`src/lib/zoneGeometry.ts`) is ground truth from the digitized boundaries, not a guess. It's already surfaced today as a free-text line in `zoneWarnings` (`"$zone: bear canister required"`, `zoneGeometry.ts:228`) but isn't a structured field, so nothing can key off it reliably. Add a `bearCanisterRequired?: boolean` alongside `zoneWarnings` on the detection output / `PlanPermitEntry`, and when any active permit reports it, set `bearCanNeed: 'required'` — but only if the user hasn't already set the Food toggle manually, same non-destructive rule the zone-detection reconciliation already follows elsewhere.
  - **AI-looked-up permits (`lookupPermit` / `PermitLookupResult`, everything outside the three digitized areas)** — no equivalent ground truth exists; this would be an AI inference from web search. Add a `bearCanisterRequired?: 'yes' | 'no' | 'unclear'` (or similar) to the lookup JSON schema in `permitService.ts`, gated by the existing `confidence` field. Given it's a guess, only auto-set `bearCanNeed: 'recommended'` (never `'required'`) from this path, and only at high confidence — never silently overclaim a hard requirement from a web search.

**Stage 4 — Food**
- ⚠ `GearStage` right-rail still hardcodes `foodLb` (explicit "Stub — future: pull from Food stage state" comment) instead of pulling the real total from `plan.food` meal weights.
- ℹ No water planning in the stage, and no water-weight stat in Gear's right rail — by design. Water is planned qualitatively (dry-stretch awareness from Route segment `water: reliable | caches | dry`), not tracked to the ounce like food.

**Stage 5 — Gear**
- ⚠ "Add item" button in each `CategoryCard` footer is a stub — no dialog or inline input.
- ⚠ Food weight in the right-rail stats is hardcoded — not pulled from Food stage state.
- ⚠ The "locked" state is purely visual — the stage is always fully interactive. No actual dependency gate blocks editing.

**Stage 6 — Depart**
- ⚠ "+ Contact" button is a stub — no way to add or edit emergency contacts.
- ⚠ "Download" button for pending map layers fakes completion (local state only).
- ⚠ "PDF" export button is a stub.
- ⚠ "Set" reminder toggle updates local state only — no calendar or notification system is called.
- ⚠ One-pager preview party, entry/exit, and InReach fields are hardcoded strings — not pulled from plan data.

**Stage 7 — Journal**
- ⚠ No right rail — days completed count, photo count, and nudge to add entries near the `complete` transition are not yet shown.
- ⚠ No in-stage navigation to other plan stages — users need to use the stage rail to cross-reference route, days, or permits while journaling. Consider JumpChip links at the top of the Journal stage.
- ⚠ Photo attachments per journal entry are not yet implemented (coming as part of the broader Photo Upload feature).

**Open questions**
- **Real permit data**: auto-suggestions use a static mock. Backend needs a service `{route, dates, party_size}` → ranked permit candidates with confidence scores. Consider Claude AI assist.
- **One-pager PDF**: production needs server-side Puppeteer or a templating layer.
- **Mobile**: wizard shell needs a tabbed/drawer treatment under ~900px.

---

## Planned Features

### Tests

**Unit tests (Vitest)**
- `src/lib/utils.ts` — `initials()` (empty string, undefined, single-word, multi-word), `extractApiError()` (typed API error, plain Error, null)
- Sidebar filter predicates — date overlap logic, min/max range edge cases, ownership filtering
- `useDebounce` hook — value updates only after delay, cancels on rapid changes

**E2E tests (Playwright)**
- Register → login → create trip → view trip
- Share trip → accept invite as second user → view shared trip
- Add journal entry → save → verify persistence
- Leave trip / delete trip

### Photo Upload + EXIF
Use `exifr` to parse EXIF in the browser before uploading. Extract GPS coordinates, camera settings, and timestamp client-side. Store alongside the photo reference in MongoDB.

### PDF Export (Trip Report)
Export as PDF from the Share dialog and from the Depart stage one-pager:
- Library: `@react-pdf/renderer` or a print stylesheet
- Content: trip hero (title, location, dates, stats), journal entries (each day with conditions grid + narrative), GPX map screenshot or SVG export, gear loadout weight summary, photos with EXIF metadata
- Style: match the dark amber/mono aesthetic of the app

### Email Invite Flow
Replace the current in-app notification invite with a signed email link:
1. Generate a `crypto.randomUUID()` token stored on the trip + expiry timestamp when the owner shares
2. Email the token to the invitee (Sendgrid or Resend)
3. Add `POST /api/trips/:id/accept?token=` — verify token + expiry, add caller to `sharedWith`, clear the token
4. Add `/accept-invite` frontend route — reads token from URL, calls endpoint, redirects to trip on success

### Real-time Collaboration
Allow simultaneous and deconflicted/merged edits of a trip and its journal entries by multiple owners. Requires a conflict resolution strategy (last-write-wins, OT, or CRDTs).

### Trip Hero Stats — Weight Carried + Max Elevation
Add Weight Carried and Max Elevation as manual input fields when creating/editing a trip. Surface them in the hero stat strip. Future: derive Weight from the linked loadout and Max Elevation from the GPX track.

### Journal Day Hover Text
Add a tooltip to each day button in DaySelector showing the entry title if one exists, or a prompt to write one if it doesn't.

### AI Features (Claude API)

**Food suggestions** — (1) autopopulate per-day kcal from food selections entered in the meal grid; (2) recommend foods for each meal slot based on expected calorie needs (mileage, elevation gain, tough-day flags from Route segments). Endpoint: `POST /api/plan/food-suggest`.

### Bear Canister Improvements
- **Auto-set the Food stage's need flag**: see the `plan.food.bearCanNeed` item under Wizard Stage Gaps → Stage 3 — Permits for the concrete plan (zone-detected ground truth vs. AI-inferred).
- **Permit cross-reference**: flag hard-sided vs soft-sided canister mismatches between the Gear stage's selected model (`plan.gear.selectedCanId`) and permit requirements from the Permits stage (SEKI requires hard-sided; Ursack approved at some but not others). Show amber warning inline on the affected permit card.
- **Rental info**: allow selecting "renting for this trip" with pickup/return location. Surface in Permits stage and Depart checklist.
- **Regulatory agencies**: note which agency approves which canister for Grizzly country (Inter Agency Grizzly Bear Committee and others). Surface when selecting a canister.

---

## Pages (not yet built)

### Global Map (`/map`)
Display all GPX tracks and planned routes across every trip on a single map. Clicking a track opens the associated trip or plan detail. App already uses Leaflet — use that for zone and route rendering.

### Photos (`/photos`)
Collage/grid of all photos across all trips with basic metadata (trip name, date, GPS coords). Clicking a photo navigates to its trip or shows full EXIF metadata in a panel.

### Gear (`/gear`)
Full gear inventory system:
- System catalog of all gear across Ridgeline users, de-duplicated and AI-augmented (verify weight/specs from manufacturer sites).
- Users build loadouts from the system catalog; gear not in the catalog gets added to it.
- Loadouts selectable per trip; modifiable on a trip-by-trip basis (ask user whether changes update the base loadout or stay trip-specific).
- Loadouts editable from both the `/gear` page and the Gear stage in the Plan Wizard.
- First Aid needs its own section inside of loadouts that is perhaps handled a little differently from the rest of the Gear. Medications and such should be private to the user. Expiration dates should be tracked if applicable. Putting a 'construction date' of sorts on the whole first aid kit would be useful to remind people to check their supplies.

---

## Ideas / Research

- Selective retroactive stage unlock: allow users to unlock individual planning stages after `on-trail` for corrections (e.g., gear changes mid-trip). Discourage but don't block. Start with the all-or-nothing "Back to planning" escape hatch in Phase 5, then refine.
- **Route stage — autopopulate segments from GPX**
  - When a planned GPX is uploaded, offer to split it into segments automatically using waypoints or named track segments from the file. User could review and accept/edit the suggested splits rather than entering each segment by hand.
  - Initially could be an even division of the route by number of days.
  - Grow into AI driven suggestions based on the initial with things like treelines, possible water spots based on topography, proximity to trail, and map info (i.e. known creeks), and flatness (again driven by map topography and proximity to trail)
  - Place waypoints on map for possible water sources.
  - Populate journal map tab with the Route map data.
- **Route stage** — Exposure auto calculation based on canopy coverage vs. mileage without water vs. altitude vs. treacherousness of trail (are we on the side of a cliff?)
- **User Preferences** — Give user ability to adjust their own Shenandoah hardness scale via user settings - not all users will be the same and we can probably leverage fitness data alongside this in the future to give a better idea of difficulty
- **Route stage** — When user is entering wake, on-trail, and camp-by times on a segment in the Route stage, give feedback if their schedule is IMPOSSIBLE, TOUGH, ACHIEVABLE (the sweet spot), or EASY for the day. Tie into the TOUGH chips that already exist. Average hike speed is 2 mph. Factor in climbs slowing down and descents speeding up.
- **User Profile** — Certifications and associations tracker - possibly link to things like NOLS, CAIC, Sierra Club, etc.
- **User Profile** — Investigate OnX Backcountry integration options for personal app projects — import tracks, waypoints, or gear lists.
- **User Profile** — Investigate Garmin API integration — Vo2 max as a metric to inform trip difficulty rating / user readiness.
- **User Preferences** Badass mode for User settings. Button that overrides all weather warnings/tolerances with a warning message that it's doing so. Also let people know to tag the app on Instagram with whatever pictures they take if they enter full badass mode.
- The src/components/plan/stages folder has gotten rather unruly. Clean it up based on which stage the file is used in by putting them in relevant directories. The /src/components/plan directory files might make sense in a 'commons' folder under the same parent directory.
- **Proactive notifications for Permit stage** — Text/email reminders when key dates are approaching (permit apply-open, booking opens, weather window), weather becomes available, or final steps need completion before departure. Permit critical dates would need a `notifyDaysBefore` field and a notification-opt-in on `CriticalDatesCard`; scheduled backend job dispatches via Sendgrid (email) or Twilio (SMS).
- **Route stage** — Stop flood of requests for water info!! We will get flagged for this eventually and its generally not professional
- **Route stage** Polish annotate checkbox step so it's clear that you must add that info to each segment on the trip. It's not clear right now.
- **Backend lint cleanup (low priority)** — 8 `max-lines-per-function`/`complexity` ESLint warnings remain, all in `server/` (route handlers/scripts, not yet touched by the frontend decomposition sweep — service functions/smaller helpers is the right pattern here, not hooks/subcomponents): `server/scripts/migratePlans.ts` (`main`, 57 lines + complexity 16), `server/src/utils/crudFactory.ts` (`makeOwnerCrudRouter`, 39 lines, plus an unused `eslint-disable` directive to remove), `server/src/services/scanService.ts` (`scanJournalImage`, 43 lines), `server/src/services/permitService.ts` (`lookupPermit`, 39 lines), `server/scripts/migrate-to-keycloak.ts` (`main`, 42 lines), `server/scripts/remove-stale-route-checklist-items.ts` (`main`, 31 lines, 1 over — quick win). Confirm current line numbers with `npm run lint` before starting, they may have drifted.

---

## Done

- **Plan Wizard shell** — `/plan` route, `StageRail`, `StageHeader`, `PlanOverview` (2×3 card grid + critical path), six stage stubs, `PlanWizard` managing view/stage state.
- **Shared atoms** — `Ring`, `Pill`, `JumpChip`, `ProgressBar`, `CheckItem` in `src/components/plan/`.
- **Shared icons** — `src/components/icons.tsx` consolidates all SVG icon functions app-wide; duplicate inline icons removed from stages, layout, journal, and map components.
- **Stage 1 — Route** — MapTopo SVG, ElevationProfile chart, segments table with JumpChip to Days, locked banner, right rail (checklist + partners + source files).
- **Stage 2 — Days** *(superseded)* — original stat strip, day list with exposure pills, selected-day detail, and empty-state built; `onChange` + `onProgress` wired. Stage is being replaced by Weather: exposure / water / tough-day / pass metadata moves to Route segments; time targets defer to the Depart one-pager; `DaysStage.tsx` and the `days` slice in `PlanData` to be removed once Weather is in place.
- **Stage 3 — Permits** — list view, two-step `FreeformDialog`, permit-free state, `canEdit` enforced, `onProgress` wired. All hardcoded SHR demo data removed; critical dates, detection banner, and party size derived from live data. Permit editing via pre-populated dialog. `PartnersCard` embedded in right rail with confirm-party flow. AI permit lookup (Claude-backed `lookupPermit`): pre-fills name, agency, URL, critical dates, and confidence/verification banner; `HikerOverlay` with permit-specific sayings shown during lookup. Dead code removed: map view, `SuggestionRow.tsx`, unused constants. `FreeformDialog` type-specific fields: booking URL, confirmation # (lottery/reservation), trailhead (selfissue), zone-per-night builder (zonenights). `PermitCard` layouts for hut (check-in date + nights), fishing (license # + expiry), vehicle (pass type + pass #). Scanned permit links: domain badge replaces tier label; recreation.gov links get an Add button (AI lookup flow); other agencies dimmed with no Add button. AI disclaimer consolidated into detection banner.
- **Stage 4 — Food** — daily targets, click-to-edit meal grid with ref-guarded blur (stale-closure fix), resupply card. Layout matches Stages 1–3 (no more right-side gap). `onProgress` wired correctly (5-item checklist, matching `constants.ts` `total: 5`; previously mismatched against a stale 6). Meal rows auto-seed from trip start/end dates. `ResupplySection` is fully dynamic — add/edit/remove stops synced to route `resupply` waypoints (which already render on the Route stage map alongside water/camp waypoints); ship/hold-address fields, shipped/unconfirmed status. Per-meal item editing via `DayMealDialog`: add/remove items per slot, qty, full macros, per-item oz/g weight, AI-assisted macro lookup (`POST /api/food/macros`, Claude-backed `foodMacrosService`), and "copy to days" (supersedes the old bulk-edit stub). Right-rail kcal/food-weight totals derive from real meal state. "Heads up" banner is dynamic, pulling tough (`hard: true`) days from Route segments. Per-day calorie targets auto-suggest from route mileage/elevation gain with a tough-day multiplier (`estimateDayKcalTarget` in `FoodStage.tsx`) — days without a manual calories target fall back to the suggested value for over/under-target flagging in the grid, tough days get a highlighted day badge, and the Daily Targets card surfaces a one-click "use" hint with the route-derived average. Water planning intentionally not carried forward (see Wizard Stage Gaps) — the sub-label was changed from "Calories & H₂O" to "Calories & resupply" to match. Bear canister split by concern: Food now just flags need (`BearCanNeedCard` — not needed / recommended / required, `plan.food.bearCanNeed`) with a JumpChip to Gear; the actual model picker (`BearCanCard`, unchanged UI) moved to the Gear stage (`plan.gear.selectedCanId`/`customCanName`), where its weight now counts toward the loadout's base weight instead of sitting inert. `GearStage` reads `plan.food.selectedCanId` as a one-time legacy fallback for trips started before the move.
- **Stage 5 — Gear** — hold banner, four interactive category cards (Shelter / Kitchen / Worn / Safety+Nav), live weight stats, unlock checklist.
- **Stage 6 — Depart** — reminders, emergency contacts, offline maps cards, one-pager preview (pulls day rows from plan data), take-it-with-you checklist.
- **Plan persistence** — `Plan` Mongoose model, `/api/plans` CRUD (GET list, POST, GET/:id, PUT/:id, DELETE/:id; ObjectId validation; owner-scoped). Frontend: `src/lib/plans.ts`, `src/hooks/usePlans.ts`. `PlanPage` auto-creates a plan on first visit and stores ID in `?id=` search param.
- **Autosave** — `StageBodyProps.onChange` callback; Permits, Food, Gear, Depart stages fire it on state changes (isMounted + onChangeRef pattern; StrictMode-safe cleanup). `PlanWizard` debounces 800 ms and PUTs to `/api/plans/:id`. `StageHeader` shows live saved / saving… / unsaved indicator.
- **Autopopulate** — `PlanData` type + per-stage slices in `plan/types.ts`. All stages accept `plan?: PlanData` and seed their `useState` initializers from it. `PlanWizard` passes the loaded plan down; new plans start blank.
- **`MOCK_TRIP` replaced** — `StageHeader` and `StageRail` read from `savedPlan.meta`; `EMPTY_META` is shown for new plans.
- **Unification Phase 1** — Renamed "Trip Log" → "Trips" in nav rail. Added `status` field to Trip model (`planning/ready/on-trail/wrap-up/complete`, default `complete`). Added `status` to frontend `Trip` type. Tone-coded Pill chips on trip cards in sidebar. Status multi-select filter added to filter popover.
- **Unification Phase 2** — Added `planStages` (Mixed) to Trip model. `sharedWith` migrated from `[String]` to `[{sub, role}]`; `role` field added to Notification model; accept-invite uses stored role. `ShareDialog` now has a "Can edit / Can view" role toggle when inviting; role badge shown next to each collaborator. `src/lib/plans.ts` and `src/hooks/usePlans.ts` retargeted to `/api/trips`; `PlanRecord` type retired in favour of `Trip`. `PlanWizard` reads `planStages` and derives header metadata from Trip top-level fields. `PlanPage` pops `TripSetupDialog` (title/location/dates) immediately after a new planning trip is created. Migration script at `server/scripts/migratePlans.ts` handles `sharedWith` string→object conversion and Plan→Trip backfill with date parsing. `/api/plans` route stays live until migration is verified (Phase 2 step 6 deferred).
- **Unification Phase 3** — `TripModal.tsx` deleted. "New trip" button and empty-state CTA both navigate to `/plan` (auto-creates planning Trip). `planning`/`ready` trips in the sidebar navigate to the wizard on click; `complete`/`on-trail`/`wrap-up` keep opening `TripDetail`. Edit button on all trip cards navigates to the wizard. `?stage=<n>` search param added to `/plan` route; `PlanWizard` opens at the specified stage (1-indexed) on mount, defaulting to overview. `StageRail` trip-identity header gains a pencil button that opens `TripSetupDialog` pre-populated with current title/location/dates for in-wizard editing.
- **Unification Phase 4** — All Sierra High Route mock data guarded: `RouteStage` partners, `DaysStage` days, `PermitsStage` permits + suggestions, `GearStage` unlockChecklist, `DepartStage` reminders/contacts/mapLayers/checklist — all now start empty for real plans and fall back to demo data only when `plan === undefined`. Empty-state prompts added: `FoodStage` meal grid and `GearStage` category list. Amber nudge banner added to `DaysStage` empty state explaining the Journal dependency.
- **Unification Phase 5** — Owner-only status lifecycle UI in `StageHeader` and `PlanOverview`: forward button (amber, `← Planning` neutral) advances `planning → ready → on-trail → wrap-up → complete`; `← Planning` escape hatch with confirm dialog resets to `planning` from any status. `useUpdatePlan` body accepts `status`; `onSuccess` invalidates both plan detail and trips list. `TripSidebar` sort updated to urgency order (`on-trail`/`wrap-up` first, `planning`/`ready` by departure asc, `complete` by end date desc).
- **Unification Phase 6** — Stage 7 · Journal wired in. `JournalStage` renders lock banner for `planning`/`ready`; mounts `JournalSection` at `on-trail`+. `JournalSection` gains `readOnly` prop (fieldset-disabled inputs + view-only banner) for read-access collaborators. `PlanWizard` fetches journal entries and intercepts the `complete` status transition with an amber nudge dialog when zero entries exist ("Add entries" jumps to Stage 7, "Complete anyway" proceeds). `canEdit` derived from owner/edit-role and passed to all stage bodies. Stages 1–5 read-only locking deferred. Stage 7 gaps (right rail, in-stage nav, photo attachments) logged in Wizard Stage Gaps.
- **Wizard Stage Gaps** — Segments CRUD (add/edit/delete via dialog), live checklist with `onProgress` wired to stage rail, real partners from `sharedWith`, inline partner invite panel, map placeholder pending Leaflet + GPX.
- **Route stage map + GPX** — Replaced map placeholder with live Leaflet map (CARTO dark tiles, dashed planned-route polyline, start/end markers). GPX import via button and drag-and-drop onto the map card; replace and remove supported. `ElevationProfile` card wired below the map. Source files section derives from `trip.gpxPlanned` / `gpxTracks` with computed distance; per-file download button reconstructs and saves a valid `.gpx` from stored coordinates.
- **Backend cleanup — route helpers** — `server/src/utils/routeHelpers.ts` introduces `HttpError`, `asyncRoute`, `requireOwner`, and `formatUserResponse`. Every route handler now wrapped in `asyncRoute` (fixes previously unprotected handlers in `loadouts.ts`, `gearItems.ts`, `journalDays.ts`, `journalScan.ts`, notifications GET/DELETE/patch). Ownership guards replaced with `requireOwner` throughout. `signToken` extracted locally in `localAuth.ts`. `journalDays.ts` `sharedWith` access check fixed to handle both string and `{sub,role}` entries.
- **User time defaults** — `TimePreference` / `UserPreferences` types; `preferences` field on `UserProfile` with lazy migration in `GET /me`; `PUT /me/preferences` with manual validation; `resolveTimePreference` helper; Route stage `triggerSunFetch` reads from auth store instead of hardcoded offsets; Account dialog "Default times" section with relative (anchor + signed offset) and fixed (HH:MM) modes.
- **Backend cleanup — service extraction + dedup** — `server/src/services/tripService.ts` centralises trip access logic (`normalizeShared`, `canRead`, `populateTripUsers`, `fetchTripForRead/Write`); `scanService.ts` moves the Claude API call, size validation, and JSON parse out of the route. `utils/objectId.ts` exports `validObjectId`; `utils/crudFactory.ts` exports `makeOwnerCrudRouter` — `loadouts.ts` and `gearItems.ts` each collapse to 3 lines. Backend Code Cleanup section fully resolved.
- **User units settings** — User setting addition for English vs. Metric units of measure. Temps should be able to be viewed in Farenheit or Celsius and distance in miles or kilometers.
- **Indian Peaks zone-permit auto-detection** — Digitized IPW zone boundaries (`src/data/ipw_zones.json`) and dependency-free point-in-polygon matching (`src/lib/zoneGeometry.ts`) so camps falling inside a mapped zone get their `zonenights` permit auto-created instead of relying on AI web search alone. AI call (`pickZoneProduct`) picks the right recreation.gov product (full-season/3-day/large-group) and writes the copy from geometry-derived facts. Detection re-runs whenever the route's camp nights change, reconciling stale auto-detected permits against the current route, with a manual "Re-detect zones" fallback and a visible error state on AI failure. Party size computed server-side from `trip.sharedWith`. Route map overlays zone boundaries (`ZonesOverlay`) when a route is near Indian Peaks.
- **Enchantments zone-permit auto-detection** — Generalized the IPW zone-detection/overlay pipeline to a second wilderness area: 5 lottery zones (`src/data/enchantments_zones.json`). `ZoneProps.recgov` loosened to a generic key/value map since lottery (Enchantments) and quota (IPW) areas use different recreation.gov product shapes. `buildLotteryProduct` builds the permit deterministically for lottery areas — no AI product pick needed since there's no per-trip judgment call. Zone-stay detection also surfaces dogs-allowed, group-size, and core-permit-covers-multiple-zones warnings.
- **Maroon Bells-Snowmass zone-permit auto-detection** — Third wilderness area: 9 advance-reservation zones plus a wilderness-boundary feature, introducing a "partial coverage" model (`src/data/mbsw_zones.json`). `derivePermitNeeds` now splits camps into bookable `needs` vs. `selfRegister` stays (`permit_required: false`) instead of treating every zone hit as a booking. `buildAdvanceReservationProduct` builds MBSW's single-product permit directly (bypassing the AI pick, same rationale as lottery areas); `buildSelfRegisterPermit` reuses the existing `selfissue` permit type for trailhead-registration-only camps — no new UI needed. `ZonesOverlay` renders the wilderness boundary as a thin dashed outline instead of a filled zone so it doesn't visually compete with the small bookable zones inside it.
- **Resupply box label PDF** — "Generate label" on each resupply stop now downloads a real PDF (`@react-pdf/renderer`, dynamically imported so the ~1.3MB lib stays out of the main bundle — split into its own `react-pdf.browser` chunk) via `downloadResupplyLabel` in `resupplyLabel.helpers.ts`. Label content: trip title, stop name, box number + day range, ship-by date, hold address, and a packing list aggregated from that box's planned meal items (`itemsInDayRange` — also now shared with `SegmentStrip`'s totals) with kcal/weight totals. `holdAddress` changed from a single-line input to a multi-line textarea; a "Use AT hiker-box format" quick-fill (visible only when the account has a name) seeds `c/o {hiker name}\nP.O. Box \n, ` matching the AT hostel-mail-drop convention — freeform after that, so any resupply format (post office general delivery, ranger station, etc.) still works. Generate button disabled with a tooltip until an address is entered.
