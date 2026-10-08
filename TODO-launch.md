# Launch TODO — Rename, AWS, Closed Beta

Goal: take the app public for a closed beta of up to ~20 invited friends, on AWS, for ≤$10/mo in infra cost, with a hard cap on AI spend and a way for beta testers to chip in. Also a resume-building exercise, so we're intentionally touching a handful of real AWS services rather than the single cheapest possible box — see the budget note below for where that tension shows up.

Pricing/free-tier figures below are current as of Oct 2026 research but AWS's Free Tier terms changed substantially in July 2025 (moved from "12 months free EC2" to a $100–200 account credit over 6 months) — **re-verify actual current pricing in the AWS Pricing Calculator at signup**, don't assume these numbers hold indefinitely.

---

## 1. Naming + domain

Renaming off "Ridgeline" because the namespace is taken everywhere. New direction: **Larch** (the conifer that goes gold and drops its needles every fall — distinctive, on-theme for a hiking app).

**Checked via RDAP on 2026-10-07 — all below were AVAILABLE as `.com`:**
- `larchtrek.com` — leans into trip-planning, probably the strongest fit
- `larchbound.com` — echoes "outward bound," adventurous
- `truelarch.com` — pun on "true north," distinctive
- `golarch.com` — short, app-like
- `larchpeak.com`

**Already taken:** `larchline.com`, `larchpath.com`, `larchridge.com` (all registered 2026, so other people landed on the same idea — re-verify before committing, availability changes).

No direct collisions found against existing apps/companies for LarchTrek, Larchbound, or GoLarch (a couple unrelated "Larch ___" companies exist — Larch Networks, Larch Agency, Larch Soft — none in the hiking/outdoors space).

- [ ] Pick final name from the list above (or a variant) — recommend **LarchTrek**
- [ ] Re-check domain availability right before buying (don't trust the above past a day or two)
- [ ] Register the domain at **Cloudflare** (registrar pricing is at-cost, ~$9–10/yr for `.com`, free WHOIS privacy) rather than Route 53 directly (~$12–14/yr all-in with the hosted zone) — saves a few dollars/year for identical functionality
- [ ] Create a **Route 53 public hosted zone** for the domain regardless of where it's registered ($0.50/mo) — this is what makes AWS (ACM, CloudFront) able to manage DNS for it
- [ ] At Cloudflare, point the domain's nameservers at the 4 NS records Route 53 gives you for the hosted zone (makes Route 53 authoritative for DNS; Cloudflare stays registrar-of-record only)
- [ ] Rename the repo/package: `package.json` name, README, `CLAUDE.md` title/references, `ridgeline-auth` localStorage key, Docker image/container names, any hardcoded "Ridgeline" strings in UI copy
- [ ] Decide whether to keep `ridgeline` as the GitHub repo name (cosmetic, low priority) or rename the repo too

---

## 2. Budget reality check

The main thing that would have threatened the $10/mo ceiling was **AWS's public IPv4 charge** (new since Feb 2024 — $0.005/hr, ~$3.65/mo, applies to *any* public IP attached to a plain EC2 instance, free-tier or not, after any promo window), on top of domain/DNS line items. One adjustment closes that gap, and since auth is now local JWT (not Keycloak — see §3), there's no RAM-pressure concern driving instance size either; this budget has real margin, not just a bare fit.

- **Use Lightsail instead of raw EC2 for compute.** Same underlying hardware, but Lightsail bundles a static public IP and a data transfer allowance into its flat price — it's explicitly exempted from the separate EC2 IPv4 charge. The $5/mo plan (1GB RAM, 2 vCPU, 40GB SSD, 2TB transfer) is comfortable for just the Node API (no JVM/Keycloak alongside it), with fewer moving parts to reason about (no separate EIP/EBS/data-transfer billing) — a good fit for an AWS beginner.
- **Frontend still moves off the compute box**, onto S3 + CloudFront, both because it's cheap/fast at the edge and because it's a legitimate second AWS service for the resume story even without Keycloak in the mix.

| Item | Est. cost/mo | Notes |
|---|---|---|
| Lightsail instance (API only) | $5.00 | 1GB plan; static IP + transfer bundled in; plenty of headroom for just Node |
| S3 (frontend static assets) | ~$0.10 | pennies at this traffic |
| CloudFront (frontend + `/api/*`) | ~$0.50 | low traffic, 20 users |
| Route 53 hosted zone | $0.50 | flat |
| Domain (amortized) | ~$0.85 | ~$10/yr at Cloudflare |
| MongoDB Atlas M0 | $0.00 | free tier, 512MB cap |
| CloudWatch (basic alarms) | ~$0.00–0.30 | within free tier at this scale |
| **Total** | **~$7–7.50/mo** | real margin under $10, not just a bare fit |

- [ ] Re-run this through the AWS Pricing Calculator before committing, with your actual region
- [ ] Set an **AWS Budgets** alert at $8 and $10 (free to configure) — covers AWS infra spend only, **not** the Anthropic API bill (see §5)

---

## 3. AWS architecture

**Auth decision: local JWT, not Keycloak, for v1.** Already built (`server/src/routes/localAuth.ts`), zero extra cost, no extra container, no RAM pressure on the instance. Reviewed separately for security fit at this scale (20 invited friends) — bcrypt + rate-limiting + algorithm-pinned verification are solid; the two real residual risks are the bearer token living in `localStorage` (XSS exposure, no `httpOnly` boundary) and no server-side revocation (a leaked token is live until it expires). Both are acceptable tradeoffs for a closed group of people you actually know, not for a genuinely public product. Keycloak remains a documented fast-follow (§7) once there's budget headroom and/or the beta outgrows "people I personally invited."

Compute (Lightsail, $5/mo plan):
- [ ] Docker Compose on the instance: `ridgeline-api` container only — **drop the local `mongodb` container** (→ Atlas) and **drop nginx-serving-frontend** (→ S3/CloudFront)
- [ ] Set `CORS_ORIGIN` to the real frontend domain (not localhost) in the prod env
- [ ] Confirm `KEYCLOAK_JWKS_URI` / `KEYCLOAK_ISSUER` stay **unset** in prod so `verifyToken()` takes the local HS256 path (per `server/src/middleware/auth.ts`)

Frontend + edge:
- [ ] Vite build → private S3 bucket, served via **CloudFront** with Origin Access Control (no public S3 URL)
- [ ] CloudFront behaviors: default → S3 (frontend), `/api/*` → Lightsail static IP as a custom HTTP origin (mirrors what `nginx.conf` already does today, just moved to the edge)
- [ ] Lock the Lightsail firewall down to only accept inbound on the API port from CloudFront's managed prefix list (plus SSH from your own IP) — the origin should never be reachable directly over plain HTTP from the open internet, since that's the one path where a bearer token could ever travel in cleartext
- [ ] Request an **ACM certificate** (us-east-1, free) for the apex + `www`, DNS-validated via the Route 53 hosted zone
- [ ] Route 53 ALIAS records: apex + `www` → frontend CloudFront distribution

Identity/access (do this first, before anything else):
- [ ] Create a non-root **IAM user** for yourself with MFA enabled; stop using the root account day-to-day (root stays only for billing/account-level actions)
- [ ] Give that user a scoped policy (Lightsail, S3, CloudFront, Route 53, ACM, Budgets, SSM) rather than `AdministratorAccess` once you know what you're actually touching

Secrets + config:
- [ ] Store `JWT_SECRET`, Atlas connection string, Anthropic API key in **SSM Parameter Store** (standard tier is free) — not Secrets Manager, which bills per secret per month
- [ ] Generate a fresh high-entropy `JWT_SECRET` for prod (don't reuse a local dev value) — this single secret can forge tokens for any user if it ever leaks, so treat it like one
- [x] `.env` / `.env.*` are now gitignored (`.env.example` stays tracked) — confirm `server/.env` was never previously committed in history if you want to be thorough

---

## 4. Database: MongoDB → Atlas

Atlas is wire-compatible with self-hosted MongoDB, so this is mostly a connection-string swap, not a code change.

- [ ] Create a free **M0** Atlas cluster (shared, 512MB storage cap — fine for text/metadata at 20 users, see photo caveat below)
- [ ] Create an Atlas DB user scoped to this app's database only
- [ ] **Network Access**: allowlist the Lightsail instance's static IP specifically — not `0.0.0.0/0` (M0 doesn't support VPC peering/private endpoints, so IP allowlisting is the only option, but scope it tight)
- [ ] Point `MONGODB_URI` at the Atlas connection string; no Mongoose/driver code changes needed
- [ ] If there's real data worth keeping in the current Docker `mongodb` container: `mongodump --uri <local> --gzip --archive=dump.gz` then `mongorestore --uri <atlas-uri> --gzip --archive=dump.gz` (brief write-downtime during the dump). If current data is disposable dev/test data, skip straight to pointing at Atlas.

**Flag for later:** the planned Photo Upload feature (per `TODO.md`) currently reads "store alongside the photo reference in MongoDB" — same pattern as the existing avatar upload, which stores images as base64 data URLs directly on the document. That's fine for one 5MB avatar per user, but doing the same for trip photos will blow through M0's 512MB cap fast and risks hitting MongoDB's 16MB-per-document BSON limit. Before building Photo Upload for real: store images in **S3**, keep only the S3 key/URL on the `Photo` document in Mongo.

---

## 5. AI usage caps (new work)

Three endpoints currently call Claude and cost real money per request: `journal-scan`, `trips/:id/permits/suggest`, `trips/:id/permits/lookup`. Need two independent layers, because AWS Budgets (§2) only watches AWS spend — it has no visibility into the Anthropic bill at all.

- [ ] **Anthropic Console backstop**: set a hard monthly spend limit on the workspace/API key directly in the Anthropic Console. This is the last line of defense if the app-level logic has a bug.
- [ ] **Per-user monthly quota**: new `AiUsage` collection (`{ sub, yearMonth, count }`), incremented atomically on each successful AI call, checked before calling Claude in all three routes; return 429 with a clear "AI quota reached for this month" message once a user hits their cap (pick a number — e.g. 20 calls/user/month — small enough to bound cost, generous enough not to annoy 20 friends)
- [ ] **Global monthly ceiling**: a second counter (estimated cost, or just raw call count across all users) with its own hard cap that disables all three AI endpoints app-wide once hit, independent of any single user's quota — protects against the aggregate even if every individual stays under their personal quota
- [ ] **Kill switch**: a flag in SSM Parameter Store (e.g. `ai-features-enabled`) checked at request time, so AI features can be disabled instantly without a redeploy if something runs away
- [ ] Surface remaining quota somewhere in the UI (even just a tooltip) so testers understand why a request might get rejected near month-end

---

## 6. Payments: Venmo + supporter tracking

- [ ] Add `isSupporter: boolean` to `UserProfile`
- [ ] Add a small "Support Larch[Trek]" section to `AccountDialog` with your Venmo link/QR and a one-line explainer
- [ ] No admin route for v1 — toggle `isSupporter` directly in the Atlas web UI when someone sends money. Twenty users is small enough that an admin UI would be pure overhead; revisit if the beta grows past casual manual tracking
- [ ] Frontend: small supporter badge next to name/avatar (e.g. in `IconRail` or `AccountDialog`) when `isSupporter` is true

---

## 7. Future upgrade: Keycloak / OIDC migration (deferred)

Not part of v1 — local JWT covers the threat model for a closed beta of invited friends (§3). Revisit if any of these become true: the beta opens up past people you personally vetted, you want social login, or there's enough budget headroom that Keycloak's RAM footprint (and the Postgres-vs-H2 durability question that comes with running it for real) stops being a meaningful tradeoff. When that day comes:

- [ ] Add a `keycloak` container back into the Docker Compose stack on the instance (will likely need to size the Lightsail plan up from $5 → $10/mo, 2GB, for comfortable headroom)
- [ ] Decide Postgres-backed Keycloak vs. dev-mode H2 at that point — with more budget, just run Postgres, skip the H2 durability risk entirely
- [ ] Create a prod realm + client in Keycloak for the domain (mirrors the existing local Docker Keycloak setup already documented in `CLAUDE.md`)
- [ ] Update the client's valid redirect URIs and web origins to `https://<domain>/*`
- [ ] Set `KEYCLOAK_JWKS_URI` / `KEYCLOAK_ISSUER` in prod env — this is what flips `verifyToken()` from HS256/local to RS256/Keycloak per the existing middleware, no other code change needed
- [ ] Migrate existing `LocalUser` accounts into Keycloak (or run both side-by-side during a transition window) so current beta testers don't lose access

---

## 8. Rollout order

Roughly the order that avoids backtracking:

1. IAM user + MFA, stop using root
2. Domain registration + Route 53 hosted zone + nameserver delegation
3. Atlas M0 cluster + migrate/point `MONGODB_URI`
4. Lightsail instance up, Docker Compose (API only) running, reachable by raw IP first
5. Fresh prod `JWT_SECRET` in SSM, `CORS_ORIGIN` set, firewall locked to CloudFront's prefix list
6. AI usage caps + kill switch shipped and tested *before* this goes anywhere near "friends can see this"
7. ACM cert + CloudFront (frontend + API behaviors) + Route 53 ALIAS records
8. Supporter flag + Venmo link in UI
9. AWS Budgets alert + Anthropic Console spend limit, both confirmed active
10. Invite the first couple of friends, watch it for a few days before inviting the rest
