# Cent

PostgreSQL self-hosted edition based on the original [glink25/Cent](https://github.com/glink25/Cent).

This version keeps the original frontend ledger model, IndexedDB local cache, sync scheduling, and analytics, while changing the default self-hosted path to:

- `Username/password registration and login`
- `Node.js API + PostgreSQL persistence`
- `Docker-based deployment`

The default deployment topology is `nginx + frontend + api + postgres`.

## Project Scope

Cent is still a ledger-focused accounting app centered around books, bills, categories, tags, budgets, and statistics.

This upgrade does not rewrite the bill business layer. Instead, it adds a PostgreSQL endpoint on top of the existing storage abstraction, so these capabilities remain intact:

- Multiple books
- Local IndexedDB cache
- Batch sync
- Collaborator support
- Image attachments
- Analytics, budgets, tags, and categories

## What Was Upgraded

### 1. Added a PostgreSQL backend

The backend lives in [`server/`](./server) and is responsible for:

- User registration and username/password login
- Book and membership management
- Bill and metadata persistence
- Attachment storage
- Automatic PostgreSQL schema initialization

Key files:

- [`server/index.mjs`](./server/index.mjs)
- [`server/db.mjs`](./server/db.mjs)
- [`server/repository.mjs`](./server/repository.mjs)
- [`server/auth.mjs`](./server/auth.mjs)

### 2. Added a PostgreSQL storage endpoint in the frontend

The frontend integrates PostgreSQL through the existing storage abstraction. Main files:

- [`src/api/endpoints/postgres/index.ts`](./src/api/endpoints/postgres/index.ts)
- [`src/api/endpoints/postgres/client.ts`](./src/api/endpoints/postgres/client.ts)
- [`src/api/endpoints/postgres/storage.ts`](./src/api/endpoints/postgres/storage.ts)
- [`src/api/endpoints/postgres/auth.ts`](./src/api/endpoints/postgres/auth.ts)

Local cache and sync state handling are still kept on the client side. PostgreSQL is used as the remote persistence layer.

### 3. Added username/password login entry points

The login page now supports:

- `Username/password login`
- `Register account`

Users can register, create a book, and start recording immediately.

### 4. Added first-class Docker deployment support

The project now includes:

- [`Dockerfile`](./Dockerfile)
- [`server/Dockerfile`](./server/Dockerfile)
- [`docker-compose.yml`](./docker-compose.yml)
- [`docker/nginx/default.conf`](./docker/nginx/default.conf)
- [`.dockerignore`](./.dockerignore)
- [`.env.docker.example`](./.env.docker.example)

## Directory Overview

```text
.
├─ src/                      # Frontend React + Vite code
├─ server/                   # Node.js + PostgreSQL API
├─ docker/nginx/             # Nginx reverse proxy config
├─ docs/                     # Extra docs
├─ Dockerfile                # Frontend production image
├─ server/Dockerfile         # Backend production image
└─ docker-compose.yml        # Default deployment orchestration
```

Additional docs:

- [`docs/postgresql-self-host.md`](./docs/postgresql-self-host.md)
- [`docs/postgresql-migration-todo.md`](./docs/postgresql-migration-todo.md)

## Local Development

### Requirements

- Node.js 20+
- pnpm
- PostgreSQL 15+

### Frontend environment variables

Copy [`.env.example`](./.env.example):

```bash
cp .env.example .env.local
```

Important defaults:

```env
VITE_POSTGRES_API_HOST="/api/postgres"
VITE_POSTGRES_PROXY_TARGET="http://127.0.0.1:8787"
```

This means:

- During local `vite dev`, `/api/postgres` is proxied to `127.0.0.1:8787`
- In Docker deployment, the frontend still uses `/api/postgres`, and Nginx forwards it to the API container

### Backend environment variables

Copy [`server/.env.example`](./server/.env.example):

```bash
cp server/.env.example server/.env
```

Then update the local PostgreSQL connection:

```env
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=replace-me
POSTGRES_DATABASE=cent
```

### Start locally

```bash
pnpm install
npm run server
pnpm dev
```

After startup:

- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:8787/api/postgres`

Open the login page and use `Register account` or `Username/password login` to enter the PostgreSQL flow.

## Docker Deployment

### Default architecture

`docker-compose.yml` starts three services:

- `postgres`: PostgreSQL container with data stored in the `postgres-data` volume
- `api`: Node.js API container for auth, books, bills, and attachments
- `web`: Nginx container serving the frontend and proxying `/api/postgres`

### Step 1: prepare environment variables

Copy the Docker env template:

```bash
cp .env.docker.example .env
```

At minimum, update these values:

```env
WEB_PORT=8080

POSTGRES_PASSWORD=replace-with-a-strong-postgres-password
POSTGRES_DATABASE=cent
POSTGRES_USER=cent

POSTGRES_API_AUTH_SECRET=replace-with-a-long-random-secret
POSTGRES_API_CORS_ORIGIN=http://localhost:8080
```

Notes:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DATABASE` are the shared database credentials for both `postgres` and `api`
- `docker-compose.yml` maps the same database name to `POSTGRES_DB` for the PostgreSQL container and `POSTGRES_DATABASE` for the API container
- `POSTGRES_API_AUTH_SECRET` must be replaced with a strong random string
- `POSTGRES_API_CORS_ORIGIN` must match the actual frontend address
- If you later use a domain name, update it here as well

### Step 2: build and start

```bash
docker compose up -d --build
```

Then open:

```text
http://localhost:8080
```

### Step 3: initialize the app

1. Open the homepage
2. Click `Register account`
3. Create the first user
4. Create a book
5. Start recording bills

### Common commands

Check service status:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f web
docker compose logs -f api
docker compose logs -f postgres
```

Stop services:

```bash
docker compose down
```

Remove containers and wipe database data:

```bash
docker compose down -v
```

`docker compose down -v` removes the PostgreSQL volume and is irreversible unless you have a backup.

## Production Recommendations

The default Docker setup is enough to boot the project, but for long-term use you should still:

- Use a domain and terminate HTTPS at Nginx or an upstream gateway
- Replace all default passwords and `POSTGRES_API_AUTH_SECRET`
- Back up the PostgreSQL volume regularly
- Move attachments to object storage later if attachment volume grows

## Updating After You Push to GitHub

Once this code is on GitHub, the server-side update path can stay simple:

```bash
git pull
docker compose up -d --build
```

If you only changed backend logic and did not modify frontend build variables, you can rebuild only the API:

```bash
docker compose up -d --build api
```

If you changed `VITE_*` variables, rebuild the `web` image as well:

```bash
docker compose up -d --build web
```

## Syncing with Upstream glink25/Cent

This repository was not originally created from a fork clone. Its upstream history was linked later with a non-destructive merge that preserved the current working tree, so future upstream updates can now use standard Git merges.

If you clone your own repository on another machine, add the upstream remote first:

```bash
git remote add upstream https://github.com/glink25/Cent.git
```

Recommended flow for syncing the upstream main branch:

```bash
git checkout main
git fetch upstream
git merge upstream/main
```

If merge conflicts happen, check these areas first:

- `server/`
- `src/api/endpoints/postgres/`
- `src/components/login/index.tsx`
- `src/components/settings/user.tsx`
- `Dockerfile`
- `server/Dockerfile`
- `docker-compose.yml`
- `docker/nginx/default.conf`
- `README.md`
- `README_EN.md`

After syncing, validate and push back to your own repository:

```bash
npm run lint
npm run build
git push origin main
```

If the server is already running the Docker deployment, then also run:

```bash
docker compose up -d --build
```

## What Has Been Verified

This version is validated with:

- `npm run lint`
- `npm run build`

## License

This fork continues to use the original license: `CC BY-NC-SA 4.0`

## Upstream Project

- Upstream: [glink25/Cent](https://github.com/glink25/Cent)
