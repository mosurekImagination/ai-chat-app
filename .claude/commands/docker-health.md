---
description: Check health of all four Docker Compose services (frontend, backend, postgres, mailhog).
allowed_tools: ["Bash"]
---

Check the health of all Docker Compose services for the chat server.

```bash
docker compose ps
```

Then check each service individually:

```bash
# PostgreSQL — read username from docker-compose.yml, fall back to "postgres"
DB_USER=$(grep -A10 'image: postgres' docker-compose.yml 2>/dev/null | grep 'POSTGRES_USER' | head -1 | sed 's/.*POSTGRES_USER[=:] *//' | tr -d ' "' || echo "postgres")
docker compose exec postgres pg_isready -U "${DB_USER:-postgres}" 2>&1 && echo "postgres: OK" || echo "postgres: NOT READY"

# Backend — try actuator first, fall back to port check
curl -sf http://localhost:8080/actuator/health -o /dev/null 2>&1 \
  && echo "backend: OK (actuator)" \
  || (nc -z localhost 8080 2>/dev/null && echo "backend: RUNNING (no actuator)" || echo "backend: NOT READY")

# MailHog
curl -sf http://localhost:8025/api/v2/messages 2>&1 \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('mailhog: OK ('+str(d['total'])+' messages)')" 2>/dev/null \
  || echo "mailhog: NOT READY"

# Frontend
curl -sf http://localhost:3000 -o /dev/null 2>&1 && echo "frontend: OK" || echo "frontend: NOT READY"
```

Report a status table showing which services are healthy and which are not.

If postgres or backend are not ready, suggest:
```bash
docker compose up -d
sleep 10
```
Then run `/docker-health` again.
