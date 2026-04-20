#!/usr/bin/env bash
# Stop all local dev services started by the fast dev loop.
# Run this before `docker compose up -d` to free port 8080 and 5173.

echo "Stopping backend (bootRun)..."
pkill -f "bootRun" 2>/dev/null && echo "  killed" || echo "  not running"

echo "Stopping frontend (vite)..."
pkill -f "vite" 2>/dev/null && echo "  killed" || echo "  not running"

echo "Stopping infrastructure (postgres, mailhog)..."
docker compose stop postgres mailhog

echo "Done — ports 8080 and 5173 are free."
