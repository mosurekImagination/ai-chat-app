---
description: Tail Docker Compose logs. Pass a service name to filter (e.g. /logs backend).
allowed_tools: ["Bash"]
---

Tail Docker Compose logs for debugging.

If $ARGUMENTS contains a service name (e.g. "backend", "postgres", "mailhog", "frontend"), tail logs for that service only:

```bash
docker compose logs -f --tail=100 $ARGUMENTS
```

If no argument was given, tail all services:

```bash
docker compose logs -f --tail=50
```

Stop tailing with Ctrl+C. Report any ERROR or WARN lines that stand out.
