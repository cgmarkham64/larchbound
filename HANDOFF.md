# Handoff — LarchBound launch, 2026-10-11

Picking this back up? Read `TODO-launch.md` for the full plan — this file is just "where exactly did we stop and what's the very next action."

## Done

- **Naming + domain** (§1) — fully done. Renamed Ridgeline → LarchBound across the codebase (package names, docker names, UI copy, cache keys, GPX export tag). `larchbound.com` registered via Route 53, DNS delegation confirmed propagated. GitHub repo renamed too.
- **IAM** (§3) — non-root IAM user created, MFA on both root and the IAM user, signed in as the IAM user day-to-day. Currently on `AdministratorAccess` (deliberately deferred tightening to a scoped policy until the service list stabilizes — see §3 checklist).
- **Atlas** (§4) — `larchbound-cluster` (M0, free, AWS us-east-1) is up. DB user created. Network Access now allowlists the Lightsail box's static IP (`54.86.40.205/32`) only — temporary dev-laptop entry removed.
- **Compute (§3) — fully deployed.** Lightsail instance `larchbound-api` (Ubuntu 24.04 LTS, OS-only, $7/mo plan — note: HANDOFF previously said $5, that was wrong/stale, confirmed $7 on console 2026-10-09) is live with static IP `larchbound-api-ip` = `54.86.40.205`. Firewall: port 8000 open only to current dev laptop IP (temporary, until CloudFront exists). Docker + docker-compose-v2 installed. `server/` + `docker-compose.prod.yml` synced via `rsync` (not `scp` — `scp -r` ignores `.gitignore`/`.dockerignore` and drags `node_modules`/`dist` along, which is slow and pointless since the Dockerfile builds fresh from source). `server/.env` hand-written on the box with a fresh prod `JWT_SECRET` and the real Atlas connection string. Container up via `docker compose -f docker-compose.prod.yml up --build -d`; logs confirmed `MongoDB connected` → `API running on http://localhost:8000`. External health check from laptop: `curl http://54.86.40.205:8000/health` → `{"ok":true}`.
- **SSM Parameter Store (§3 secrets) — done, end-to-end verified 2026-10-11.** 3 params live under `/larchbound/prod/` in **us-east-1** (`JWT_SECRET` + `MONGODB_URI` as SecureString, `CORS_ORIGIN` as plain String). Customer-managed IAM policy `larchbound-ssm-reader-policy` scoped to `ssm:GetParameter`/`GetParameters` on `arn:aws:ssm:us-east-1:<account-id>:parameter/larchbound/prod/*` plus `kms:Decrypt` on `alias/aws/ssm`, attached to a dedicated programmatic-access IAM user `larchbound-api-ssm-reader`. AWS CLI v2 installed on the box (official installer, not the apt `awscli` package — see gotcha below), `aws configure` done with that user's access key. `deploy/fetch-env.sh` (committed in-repo) regenerates `server/.env` on the box from the 3 params; ran it, then `docker compose -f docker-compose.prod.yml up -d --force-recreate`; logs confirmed `MongoDB connected` again. Policy template lives at `deploy/ssm-reader-policy.json` (account-ID placeholder, fill in before pasting into IAM console).

## Not started yet

**Remaining SSM cleanup (small, do before moving on)**: clear the box's shell history (`history -c`, then `grep -i -e jwt -e mongodb ~/.bash_history` to confirm nothing's left — the real `JWT_SECRET`/`MONGODB_URI` were hand-typed into nano earlier in the compute-deploy session and may still be sitting in plaintext history). Not yet confirmed done as of this handoff.

**Next up: Frontend + edge (S3/CloudFront/ACM)** — per §3/§8 step 7:
- Vite build → private S3 bucket, served via CloudFront with Origin Access Control (no public S3 URL)
- CloudFront behaviors: default → S3 (frontend), `/api/*` → Lightsail static IP as a custom HTTP origin
- Once CloudFront exists, lock the Lightsail firewall to only accept inbound on port 8000 from CloudFront's managed prefix list (currently it's "my IP only" — see §3 note on this being the one path where a bearer token could travel in cleartext)
- ACM certificate (us-east-1, free) for apex + `www`, DNS-validated via the Route 53 hosted zone
- Route 53 ALIAS records: apex + `www` → frontend CloudFront distribution

**After Frontend + edge**: AI usage caps (§5 — must exist before any friends get invited), then supporter/Venmo (§6), then AWS Budgets + Anthropic Console spend limit (§8 step 9), then actually invite people.

**CI/CD from GitHub (raised mid-deploy, not yet planned in detail)** — today's deploy was a manual one-time bootstrap (rsync source + build on box). For GitHub Actions later, the clean path is: Actions builds the Docker image and pushes to GHCR (free, and Actions already has repo checkout so no deploy-key problem on the *build* side), then a deploy step SSHs into this same Lightsail box and runs `docker compose pull && up -d` instead of rebuilding from source. Only new requirement: this box's SSH private key (`~/.ssh/LightsailDefaultKey-us-east-1.pem`) stored as a GitHub Actions secret. Nothing done today blocks this — just hasn't been designed/built yet.

## Things worth remembering (new this session)

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
