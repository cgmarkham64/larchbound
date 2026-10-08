# Handoff — LarchBound launch, 2026-10-08

Picking this back up? Read `TODO-launch.md` for the full plan — this file is just "where exactly did we stop and what's the very next action."

## Done

- **Naming + domain** (§1) — fully done. Renamed Ridgeline → LarchBound across the codebase (package names, docker names, UI copy, cache keys, GPX export tag). `larchbound.com` registered via Route 53, DNS delegation confirmed propagated. GitHub repo renamed too.
- **IAM** (§3) — non-root IAM user created, MFA on both root and the IAM user, signed in as the IAM user day-to-day. Currently on `AdministratorAccess` (deliberately deferred tightening to a scoped policy until the service list stabilizes — see §3 checklist).
- **Atlas** (§4) — `larchbound-cluster` (M0, free, AWS us-east-1) is up. DB user created. Connection tested successfully from local dev (`MongoDB connected` confirmed). The one open item: Network Access currently allowlists a temporary dev IP, not a final entry — gets replaced with Lightsail's static IP in the very next step below.
- `docker-compose.prod.yml` exists in the repo root — API-only service for the Lightsail box (no mongodb/keycloak/frontend). Committed, not yet deployed anywhere.

## Not started yet

**Compute (§3)** — this is the very next thing. Lightsail instance hasn't been created. Walkthrough already worked out (not yet executed):

1. Create Lightsail instance: Ubuntu 24.04 LTS, OS-only blueprint, **$5/mo plan** (the one with IPv4 included, not the $3.50 IPv6-only one). Name it `larchbound-api`.
2. Attach a static IP (`larchbound-api-ip`).
3. **Atlas → Network Access**: add that static IP, remove the temporary dev-laptop entry.
4. Lightsail **Networking → Firewall**: add Custom TCP port 8000, source restricted to "My IP" (temporary — gets replaced by CloudFront's managed prefix list once CloudFront exists; never leave it open to Anywhere).
5. SSH in via Lightsail's browser terminal, `sudo apt install -y docker.io docker-compose-v2`, add user to `docker` group.
6. Copy `server/` + `docker-compose.prod.yml` to the box (`scp -r server docker-compose.prod.yml ubuntu@<static-ip>:~/larchbound/` — simpler than git since the repo's private and this avoids setting up a PAT/deploy key on the box).
7. Create `server/.env` **on the box** (never commit this): `PORT=8000`, a **fresh** `JWT_SECRET` (don't reuse the local dev one), `MONGODB_URI` (Atlas string, real password), `CORS_ORIGIN=https://larchbound.com`. Leave `KEYCLOAK_JWKS_URI`/`KEYCLOAK_ISSUER` out entirely. `ANTHROPIC_API_KEY` can wait for §5.
8. `docker compose -f docker-compose.prod.yml up --build -d`, then `docker compose -f docker-compose.prod.yml logs -f larchbound-api` — look for `MongoDB connected` then `API running on http://localhost:8000`. That log line is the real proof Atlas connectivity works from the box, not just that the container started.
9. From your laptop: `curl http://<static-ip>:8000/health` → expect `{"ok":true}`.

**After Compute**: Secrets + config properly into SSM Parameter Store (right now the plan is a manually-typed `.env` on the box as a bootstrap — SSM is the real destination per §3), then Frontend + edge (S3/CloudFront/ACM), then AI usage caps (§5 — must exist before any friends get invited), then supporter/Venmo (§6), then AWS Budgets + Anthropic Console spend limit (§8 step 9), then actually invite people.

## Things worth remembering

- **Lightsail, not raw EC2** — deliberate choice to dodge AWS's $0.005/hr public-IPv4 charge, which Lightsail's bundled static IP is exempt from.
- **Local JWT, not Keycloak, for v1** — already reviewed for security fit at 20-user beta scale (§3 has the writeup). Keycloak is a documented fast-follow in §7, not abandoned.
- **Atlas IP-allowlist gotcha we actually hit**: a Mac on a dual-stack network can issue outbound connections over IPv6 even when the allowlist only has an IPv4 entry, which looks identical to a stale/wrong IP. Worth remembering if Lightsail's connection to Atlas ever behaves the same way (less likely on a cloud box, but not impossible).
- `mongoose.connect()` failing is fatal in `server/src/index.ts` — the container will crash-loop, not boot-then-error, if `MONGODB_URI` is wrong or Atlas's allowlist doesn't include the box's IP yet. That's *why* step 3 above (fixing the allowlist) has to happen before step 8 (booting the container).
- Local `server/.env` currently has real Atlas credentials in it from testing — it's gitignored, that's fine, but the prod `JWT_SECRET` must be freshly generated, not copied from here.
