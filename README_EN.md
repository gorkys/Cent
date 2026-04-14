# Cent

Cent is a PostgreSQL self-hosted edition built on top of [glink25/Cent](https://github.com/glink25/Cent). It keeps the original ledger experience, IndexedDB local cache, and sync model, while adding account management, server-side persistence, and a production-friendly Docker deployment path.

## Key Features

- Books, categories, tags, budgets, and analytics
- IndexedDB local cache with sync workflow
- PostgreSQL persistence with automatic schema initialization
- Username/password registration and login
- First registered user becomes `admin`
- Admin-managed users and public registration toggle
- Docker deployment with `postgres + api + web`

## What Changed from Upstream

Compared with [glink25/Cent](https://github.com/glink25/Cent), this edition adds:

- a Node.js backend in `server/`
- PostgreSQL persistence
- frontend PostgreSQL endpoint integration
- account registration and login flow
- a production-ready Docker Compose setup

## Deployment Topology

The default production stack contains 3 services:

- `postgres` for durable storage
- `api` for auth, books, bills, attachments, and user management
- `web` for static assets and proxying `/api/postgres` to the internal API

Only the `web` service is exposed to the host by default. Your outer reverse proxy only needs to target `127.0.0.1:3458`.

## Quick Start

The root [`docker-compose.yml`](./docker-compose.yml) is already simplified for production use. In most cases, you only need to change these values:

```env
WEB_PORT=3458
POSTGRES_PASSWORD=<postgres-password>
POSTGRES_API_AUTH_SECRET=<auth-secret>
```

### Use the repository default compose

Copy [`.env.docker.example`](./.env.docker.example) to `.env`:

```bash
cp .env.docker.example .env
```

Replace the values wrapped in angle brackets, then start:

```bash
docker compose up -d
```

Open:

- Web: `http://localhost:3458`
- Same-origin API health: `http://localhost:3458/api/postgres/health`

### Minimal copy-ready compose

The following example matches the repository topology and uses `<...>` placeholders everywhere you need to make changes:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: cent
      POSTGRES_PASSWORD: <postgres-password>
      POSTGRES_DB: cent
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "pg_isready -h 127.0.0.1 -p 5432 -U $$POSTGRES_USER -d $$POSTGRES_DB",
        ]
      interval: 10s
      timeout: 5s
      retries: 20
      start_period: 30s

  api:
    image: gorkys/cent-api:latest
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      POSTGRES_API_AUTH_SECRET: <auth-secret>
      POSTGRES_HOST: postgres
      POSTGRES_USER: cent
      POSTGRES_PASSWORD: <postgres-password>
      POSTGRES_DATABASE: cent
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3459/api/postgres/health').then((response)=>{if(!response.ok)process.exit(1);}).catch(()=>process.exit(1))",
        ]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 20s

  web:
    image: gorkys/cent:latest
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    ports:
      - "<web-port>:80"

volumes:
  postgres-data:
```

If you do not need a custom port, set `<web-port>` to `3458`.

## Initialization

After the stack starts:

1. Open the homepage
2. Click `Register account`
3. Create the first user
4. The first registered user becomes `admin`
5. Create a book and start using the app

## Admin and Registration Model

- the first registered user becomes admin automatically
- admins can create, update, and delete users from the UI
- admins can enable or disable public registration at runtime
- the login page automatically shows or hides the registration entry

Users do not need to manually enter the PostgreSQL API URL in Docker deployment.

## Local Development

### Requirements

- Node.js 20+
- pnpm
- PostgreSQL 15+

### Frontend env

Copy [`.env.example`](./.env.example):

```bash
cp .env.example .env.local
```

Key defaults:

```env
VITE_POSTGRES_API_HOST="/api/postgres"
VITE_POSTGRES_PROXY_TARGET="http://127.0.0.1:3459"
```

### Backend env

Copy [`server/.env.example`](./server/.env.example):

```bash
cp server/.env.example server/.env
```

Minimal example:

```env
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<postgres-password>
POSTGRES_DATABASE=cent
```

### Start development

```bash
pnpm install
npm run server
pnpm dev
```

Default endpoints:

- Web: `http://localhost:5173`
- API: `http://127.0.0.1:3459/api/postgres`

## Operations

Check status:

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

Stop services and delete the database volume:

```bash
docker compose down -v
```

`docker compose down -v` removes the PostgreSQL volume, so make sure you have a backup first.

## Repository Layout

```text
.
├─ src/                      # React + Vite frontend
├─ server/                   # Node.js + PostgreSQL API
├─ docker/nginx/             # Nginx config inside the web container
├─ docs/                     # Additional documentation
├─ Dockerfile                # Frontend image build
├─ server/Dockerfile         # Backend image build
└─ docker-compose.yml        # Default production compose
```

Extra docs:

- [`docs/postgresql-self-host.md`](./docs/postgresql-self-host.md)
- [`docs/postgresql-migration-todo.md`](./docs/postgresql-migration-todo.md)

## Syncing with Upstream

To keep syncing with [glink25/Cent](https://github.com/glink25/Cent):

```bash
git checkout main
git fetch upstream
git merge upstream/main
```

Validate after merging:

```bash
npm run lint
npm run build
```

## License and Upstream

- License: `CC BY-NC-SA 4.0`
- Upstream: [glink25/Cent](https://github.com/glink25/Cent)
