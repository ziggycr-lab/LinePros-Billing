# Deploy LinePros Billing on a DigitalOcean droplet

The app is a single Docker container: Express serves the API and the built React UI. SQLite lives on a Docker volume. **Secrets never go in Git.** They live only in a `chmod 600` `.env` file on the droplet.

## What is (and is not) committed

| In Git | On the droplet only |
| --- | --- |
| `.env.example` (placeholders) | `.env` with real secrets |
| Password **hash** generator (`deploy/hash-password.mjs`) | `LINEPROS_ADMIN_PASSWORD_HASH` |
| Compose / Dockerfile | SQLite data volume |

Do **not** commit, paste into chat, or check into Git:

- `.env`
- admin password (plaintext)
- `LINEPROS_SESSION_SECRET`
- SSH keys, DigitalOcean tokens, API keys

Preferred: generate the password hash **on your laptop** so the plaintext password never exists on the droplet.

## 0. On your laptop (before you SSH)

From the repo:

```bash
node deploy/hash-password.mjs
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep both outputs somewhere local (password manager). You will paste the hash and the hex secret into `.env` on the droplet — not the raw password.

Use a unique admin password of at least 12 characters. Do not reuse a password from GitHub, DigitalOcean, or email.

## 1. Create the droplet

Recommended:

- Ubuntu 24.04
- 1 GB RAM is enough
- Enable the DigitalOcean firewall (or UFW below)
- SSH key login only (disable password SSH in the DO UI if you can)

Do not put secrets in the droplet's user-data / cloud-init script.

## 2. First login and hardening

```bash
ssh root@YOUR_DROPLET_IP
apt-get update && apt-get install -y ufw fail2ban
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
# later, when you have HTTPS: ufw allow 443/tcp
ufw --force enable
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

## 3. Clone the app (public or private)

```bash
mkdir -p /opt/linepros
cd /opt/linepros
git clone https://github.com/ziggycr-lab/LinePros-Billing.git .
git checkout cursor/setup-dev-environment-933f
```

If the repo is private, use a **read-only deploy key** or a fine-grained token with `contents:read` only. Do not copy your personal SSH key onto the droplet. Do not put a GitHub token into `docker-compose.yml` or any committed file.

## 4. Create `.env` on the droplet

```bash
cd /opt/linepros
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in:

- `LINEPROS_ADMIN_USER` — username you will type on the login screen (not an email API key)
- `LINEPROS_ADMIN_PASSWORD_HASH` — the `scrypt$...` value from step 0
- `LINEPROS_SESSION_SECRET` — the 64-character hex from step 0

Leave `LINEPROS_ADMIN_PASSWORD` commented out. Leave `LINEPROS_AUTH=on`. Do not set `LINEPROS_AUTH=off` on a public IP.

Save and confirm permissions:

```bash
ls -l .env
# should be -rw------- (600), owned by root
```

## 5. Build and start

```bash
cd /opt/linepros
docker compose up -d --build
docker compose ps
curl -s http://127.0.0.1/api/health
```

Health should return `{"status":"ok",...}` and must not include passwords or secrets.

Open `http://YOUR_DROPLET_IP` in a browser. You should get the **Sign in** page. Customer and invoice APIs return `401` until you sign in.

## 6. Confirm secrets are not sitting in Git or world-readable files

```bash
# Git must not know about .env
git check-ignore -v .env
git status --short   # .env must not appear as untracked if you later commit from here — do not `git add .env`

# .env should not be readable by other users
stat -c '%a %n' .env

# Compose file should not contain the secret values
grep -E 'SESSION_SECRET|PASSWORD' docker-compose.yml
```

`git check-ignore` should report `.gitignore`. `stat` should show `600`. The compose `grep` should only match comments or env *names*, never the actual secret values.

## 7. Optional: seed demo data

Only if you want the fictional Ada/Grace demo invoices. Do **not** seed real customer data this way.

```bash
docker compose exec -e LINEPROS_DB_PATH=/data/billing.db app node server/src/seed.js
```

## Updates later

```bash
cd /opt/linepros
git pull
docker compose up -d --build
```

`.env` and the SQLite volume are not touched by `git pull`.

## HTTPS (when you have a domain)

Until HTTPS is on, the login password travels in cleartext over HTTP. Fine for a first smoke test from a trusted network; not fine for real billing data.

When you have a domain pointing at the droplet:

1. Put Caddy or nginx + Let's Encrypt in front.
2. Set `LINEPROS_SECURE_COOKIES=true` in `.env`.
3. `ufw allow 443/tcp` and `docker compose up -d`.

## What this setup deliberately does not do

- No DigitalOcean API token in the repo
- No SSH private keys in the repo or image
- No plaintext admin password required on the droplet (hash only)
- No database file in Git
- Production will not start if the session secret or password hash is missing
