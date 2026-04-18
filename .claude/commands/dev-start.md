---
description: Fast dev loop — starts only postgres and mailhog in Docker, runs backend and frontend locally. No image builds required.
allowed_tools: ["Bash"]
---

Start the lightweight development environment. Use this during active development — much faster than full `docker compose up`.

## Step 1 — Start infrastructure services only

```bash
docker compose up -d postgres mailhog
```

Wait for postgres to be healthy:

```bash
until docker inspect project-starter-postgres-1 --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; do echo "waiting for postgres..."; sleep 2; done && echo "postgres: ready"
```

## Step 2 — Start backend locally

```bash
cd backend && ./gradlew bootRun --args='--spring.profiles.active=local' 2>&1 &
```

Wait for Spring Boot to finish starting:

```bash
until curl -sf http://localhost:8080/actuator/health 2>/dev/null | grep -q UP; do sleep 2; done && echo "backend: UP"
```

## Step 3 — Start frontend dev server

```bash
cd frontend && npm run dev 2>&1 &
```

## Result

| Service  | URL                        | Notes                        |
|----------|----------------------------|------------------------------|
| Frontend | http://localhost:5173       | Vite HMR — instant on save   |
| Backend  | http://localhost:8080       | Spring DevTools hot-reload   |
| Postgres | localhost:5433              | Docker, data persisted       |
| MailHog  | http://localhost:8025       | Docker, SMTP on :1025        |

## To stop

Kill the background processes and stop infrastructure:

```bash
pkill -f "bootRun" 2>/dev/null; pkill -f "vite" 2>/dev/null; docker compose stop postgres mailhog
```
