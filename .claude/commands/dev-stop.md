---
description: Stop the fast dev loop — kills local backend and frontend processes, stops infra containers.
allowed_tools: ["Bash"]
---

Stop all background processes started by /dev-start.

## Kill backend and frontend

```bash
pkill -f "bootRun" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
```

## Stop infrastructure containers

```bash
docker compose stop postgres mailhog
```

```bash
echo "Dev environment stopped."
```
