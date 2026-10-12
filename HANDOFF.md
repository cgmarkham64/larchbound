# Handoff — LarchBound launch, 2026-10-12

Picking this back up? Read `TODO-launch.md` for the full plan — this file is just "where exactly did we stop and what's the very next action."

## Done

- **Naming + domain** (§1) — fully done. Renamed Ridgeline → LarchBound across the codebase (package names, docker names, UI copy, cache keys, GPX export tag). `larchbound.com` registered via Route 53, DNS delegation confirmed propagated. GitHub repo renamed too.
- **IAM** (§3) — non-root IAM user created, MFA on both root and the IAM user, signed in as the IAM user day-to-day. Currently on `AdministratorAccess` (deliberately deferred tightening to a scoped policy until the service list stabilizes — see §3 checklist).
- **Atlas** (§4) — `larchbound-cluster` (M0, free, AWS us-east-1) is up. DB user created. Network Access now allowlists the Lightsail box's static IP (`54.86.40.205/32`) only — temporary dev-laptop entry removed.
- **Compute (§3) — fully deployed.** Lightsail instance `larchbound-api` (Ubuntu 24.04 LTS, OS-only, $7/mo plan — note: HANDOFF previously said $5, that was wrong/stale, confirmed $7 on console 2026-10-09) is live with static IP `larchbound-api-ip` = `54.86.40.205`. Docker + docker-compose-v2 installed. `server/` + `docker-compose.prod.yml` synced via `rsync` (not `scp` — `scp -r` ignores `.gitignore`/`.dockerignore` and drags `node_modules`/`dist` along, which is slow and pointless since the Dockerfile builds fresh from source). Container up via `docker compose -f docker-compose.prod.yml up --build -d`; logs confirmed `MongoDB connected` → `API running on http://localhost:8000`. Firewall port 8000 is now **open to Anywhere** (see origin-verify entry below for why that's safe) — no longer IP-restricted.
- **SSM Parameter Store (§3 secrets) — done, end-to-end verified 2026-10-11.** 4 params live under `/larchbound/prod/` in **us-east-1** (`JWT_SECRET`, `MONGODB_URI`, `ORIGIN_VERIFY_SECRET` as SecureString; `CORS_ORIGIN` as plain String). Customer-managed IAM policy `larchbound-ssm-reader-policy` scoped to `ssm:GetParameter`/`GetParameters` on `arn:aws:ssm:us-east-1:<account-id>:parameter/larchbound/prod/*` plus `kms:Decrypt` on `alias/aws/ssm`, attached to a dedicated programmatic-access IAM user `larchbound-api-ssm-reader`. AWS CLI v2 installed on the box (official installer, not the apt `awscli` package — see gotcha below), `aws configure` done with that user's access key. `deploy/fetch-env.sh` (committed in-repo) regenerates `server/.env` on the box from the params. Policy template lives at `deploy/ssm-reader-policy.json` (account-ID placeholder, fill in before pasting into IAM console).
- **Frontend + edge (§3/§8 step 7) — done, confirmed working end-to-end 2026-10-12 (successful registration through the live site).**
  - S3 bucket `larchbound-frontend-<account-id>-us-east-1-an` (private, block-all-public-access), CloudFront distribution `E3MBP3XVUNPUJX` in front of it via Origin Access Control.
  - ACM cert for `larchbound.com` + `www.larchbound.com` issued (us-east-1, DNS-validated via Route 53 — note ACM's "Create records in Route 53" button has to be clicked per domain, doesn't happen automatically just by requesting).
  - Second CloudFront origin `api.larchbound.com:8000` (a plain Route 53 A record → the Lightsail static IP — CloudFront's origin-domain field rejected a bare IP in the console, wanted a hostname) with an `/api/*` behavior: HTTPS-only viewer protocol, all HTTP methods allowed, caching disabled, `AllViewer` origin request policy (so the `Authorization` header reaches Express).
  - Custom error responses (403 + 404 → `/index.html`, 200) so TanStack Router's client-side routes survive a page refresh.
  - Route 53 ALIAS records (apex + `www`) → the CloudFront distribution.
  - `deploy/deploy-frontend.sh` (committed in-repo): builds with `VITE_API_URL=` explicitly empty (so axios uses relative paths instead of defaulting to `http://localhost:8000` — same fix the Docker build already had via `ARG VITE_API_URL=`), syncs `dist/` to S3, invalidates CloudFront.
  - **Plan deviation, worth remembering**: Lightsail's firewall does **not** support referencing CloudFront's managed prefix list (that's an EC2/VPC Security Group feature). Discovered when the API returned a 504 through CloudFront because the firewall was still IP-restricted to the dev laptop. Real fix: port 8000 open to Anywhere, but CloudFront attaches a custom header (`X-Origin-Verify: <secret>`) to every request it forwards to the API origin; `server/src/middleware/originVerify.ts` (first middleware in `server/src/index.ts`) 403s anything missing/mismatching it. No-ops when `ORIGIN_VERIFY_SECRET` is unset, so local dev and Docker Compose dev are unaffected. Secret stored as the 4th SSM param above.

## Not started yet

**Remaining SSM cleanup (small, still not confirmed done)**: clear the box's shell history (`history -c`, then `grep -i -e jwt -e mongodb ~/.bash_history`) — the real `JWT_SECRET`/`MONGODB_URI` were hand-typed into nano earlier in the compute-deploy session and may still be sitting in plaintext history.

**Next up: AI usage caps (§5)** — must exist *before* any friends get invited, per §8 step 6:
- Anthropic Console: hard monthly spend limit on the workspace/API key (backstop, independent of app logic)
- New `AiUsage` collection (`{ sub, yearMonth, count }`), checked/incremented in `journal-scan`, `trips/:id/permits/suggest`, `trips/:id/permits/lookup` — 429 once a user hits their monthly quota
- A second, global monthly ceiling across all users, independent of individual quotas
- Kill switch: an SSM flag (e.g. `ai-features-enabled`) checked at request time so AI features can be disabled instantly without a redeploy
- Surface remaining quota somewhere in the UI

**After AI usage caps**: supporter/Venmo (§6), then AWS Budgets + Anthropic Console spend limit (§8 step 9), then actually invite people.

**CI/CD from GitHub (raised mid-deploy, not yet planned in detail)** — deploys so far have been manual (`rsync` + build on box for the API, `deploy/deploy-frontend.sh` from the laptop for the frontend). For GitHub Actions later, the clean path for the API is: Actions builds the Docker image and pushes to GHCR, then a deploy step SSHs into the Lightsail box and runs `docker compose pull && up -d` instead of rebuilding from source. Only new requirement: the box's SSH private key as a GitHub Actions secret. Nothing done so far blocks this — just hasn't been designed/built yet.

## Things worth remembering (new this session, 2026-10-12)

- **User preference: hands AWS/cloud CLI commands over for the user to run themselves**, rather than the assistant running them via Bash — explicitly stated goal is understanding the mechanism, not just caution. Applies to `aws configure`, `brew install`, deploy scripts, etc. Doesn't apply to local repo-only commands (git, npm, file edits).
- **CloudFront's origin-domain field won't take a bare IP in the console** — point it at a real hostname instead (we added a plain Route 53 A record, `api.larchbound.com` → the Lightsail static IP, and used that).
- **Lightsail firewall has no managed-prefix-list support** — that's an EC2/VPC Security Group concept. The shared-secret-header pattern (`X-Origin-Verify`) is the correct substitute AWS documents for exactly this "custom HTTP origin, no prefix list" situation.
- **`npm run build` locally ≠ the Docker build** for `VITE_API_URL` — the Dockerfile explicitly sets it empty via `ARG`; a bare local `npm run build` falls back to the hardcoded `http://localhost:8000` default in `src/lib/api.ts`. Any non-Docker production build needs `VITE_API_URL= npm run build` (or equivalent) explicitly.
- **ACM DNS validation needs its "Create records in Route 53" button actually clicked** per domain name on the certificate's validation page — requesting the cert alone doesn't create the CNAME records, and "Pending validation" with no corresponding record in the Route 53 hosted zone is the tell.
- **Homebrew hanging on a `cmake` source build for `awscli`** on an older/Intel Mac — skip Homebrew entirely, use AWS's official universal `.pkg` installer instead (works on both Intel and Apple Silicon, no build step).
- `deploy/deploy-frontend.sh` and `server/src/middleware/originVerify.ts` are now committed in-repo alongside the existing `deploy/ssm-reader-policy.json` and `deploy/fetch-env.sh`.

## Things worth remembering (from the SSM session)

- **scp vs rsync for deploys**: always exclude `node_modules`/`dist` — `scp -r` has no `.gitignore` awareness. `rsync -avz --exclude node_modules --exclude dist` is both faster and resumable.
- **Lightsail $7/mo plan**, not $5 — pricing in AWS console as of 2026-10-09 differs from what was originally written here; go by the console, not old notes.
- **Atlas connection string placeholders**: the `xxxxx` shard suffix in example connection strings is literally a placeholder, not something Atlas generates as-is — copy the real string from Atlas → Connect → Drivers every time, don't hand-type it from memory.
- **Browser-based Lightsail SSH console + Safari**: clipboard paste is flaky. Prefer native `ssh -i ~/.ssh/LightsailDefaultKey-us-east-1.pem ubuntu@<ip>` from Terminal.app once the default key is downloaded — avoids mistyped `.env` files from manual retyping.
- **AWS console region selector shows "Global" + regions look "disabled" on global-service pages** (IAM, Billing, Organizations, Route 53, CloudFront) — that's normal, region switching just doesn't apply there. Don't try to pick a region from one of those pages; navigate to the actual regional service (e.g. search "Systems Manager") first, then use its region selector.
- **Easy to create SSM params in the wrong region** (we created the first batch in `us-west-2` by accident, had to delete and redo in `us-east-1`) — always double check the region selector reads `us-east-1` before creating params, since that's hardcoded into the IAM policy ARN, the Lightsail box, and the Atlas cluster.
- **Ubuntu 24.04's apt `awscli` package has no installation candidate** — use the official AWS CLI v2 installer instead (`curl .../awscli-exe-linux-x86_64.zip` → `unzip` → `sudo ./aws/install`), not `apt install awscli`.
- **`rsync` to the Lightsail box needs the key passed explicitly** — bare `rsync -avz file ubuntu@<ip>:path` fails with `Permission denied (publickey)` because it doesn't know to use the Lightsail key. Needs `-e "ssh -i ~/.ssh/LightsailDefaultKey-us-east-1.pem"`.

- **scp vs rsync for deploys**: always exclude `node_modules`/`dist` — `scp -r` has no `.gitignore` awareness. `rsync -avz --exclude node_modules --exclude dist` is both faster and resumable.
- **Lightsail $7/mo plan**, not $5 — pricing in AWS console as of 2026-10-09 differs from what was originally written here; go by the console, not old notes.
- **Atlas connection string placeholders**: the `xxxxx` shard suffix in example connection strings is literally a placeholder, not something Atlas generates as-is — copy the real string from Atlas → Connect → Drivers every time, don't hand-type it from memory.
- **Browser-based Lightsail SSH console + Safari**: clipboard paste is flaky. Prefer native `ssh -i ~/.ssh/LightsailDefaultKey-us-east-1.pem ubuntu@<ip>` from Terminal.app once the default key is downloaded — avoids mistyped `.env` files from manual retyping.
- **AWS console region selector shows "Global" + regions look "disabled" on global-service pages** (IAM, Billing, Organizations, Route 53, CloudFront) — that's normal, region switching just doesn't apply there. Don't try to pick a region from one of those pages; navigate to the actual regional service (e.g. search "Systems Manager") first, then use its region selector.
- **Easy to create SSM params in the wrong region** (we created the first batch in `us-west-2` by accident, had to delete and redo in `us-east-1`) — always double check the region selector reads `us-east-1` before creating params, since that's hardcoded into the IAM policy ARN, the Lightsail box, and the Atlas cluster.
- **Ubuntu 24.04's apt `awscli` package has no installation candidate** — use the official AWS CLI v2 installer instead (`curl .../awscli-exe-linux-x86_64.zip` → `unzip` → `sudo ./aws/install`), not `apt install awscli`.
- **`rsync` to the Lightsail box needs the key passed explicitly** — bare `rsync -avz file ubuntu@<ip>:path` fails with `Permission denied (publickey)` because it doesn't know to use the Lightsail key. Needs `-e "ssh -i ~/.ssh/LightsailDefaultKey-us-east-1.pem"`.
- `deploy/ssm-reader-policy.json` and `deploy/fetch-env.sh` are now committed in-repo as reusable templates for this flow (no secrets in either file).

## Things worth remembering

- **Lightsail, not raw EC2** — deliberate choice to dodge AWS's $0.005/hr public-IPv4 charge, which Lightsail's bundled static IP is exempt from.
- **Local JWT, not Keycloak, for v1** — already reviewed for security fit at 20-user beta scale (§3 has the writeup). Keycloak is a documented fast-follow in §7, not abandoned.
- **Atlas IP-allowlist gotcha we actually hit**: a Mac on a dual-stack network can issue outbound connections over IPv6 even when the allowlist only has an IPv4 entry, which looks identical to a stale/wrong IP. Worth remembering if Lightsail's connection to Atlas ever behaves the same way (less likely on a cloud box, but not impossible).
- `mongoose.connect()` failing is fatal in `server/src/index.ts` — the container will crash-loop, not boot-then-error, if `MONGODB_URI` is wrong or Atlas's allowlist doesn't include the box's IP yet. That's *why* step 3 above (fixing the allowlist) has to happen before step 8 (booting the container).
- Local `server/.env` currently has real Atlas credentials in it from testing — it's gitignored, that's fine, but the prod `JWT_SECRET` must be freshly generated, not copied from here.
