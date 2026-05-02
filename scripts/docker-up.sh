#!/usr/bin/env bash
# Build and start Audient AI stack (from repo root: ./scripts/docker-up.sh)
set -euo pipefail
_me="${BASH_SOURCE[0]:-}"
if [[ -n "$_me" && -e "$_me" ]]; then
  ROOT="$(cd "$(dirname "$_me")/.." && pwd)"
else
  ROOT="$(pwd)"
fi
unset _me
cd "$ROOT"

if [[ ! -f backend/.env ]]; then
  echo "ERROR: backend/.env missing. Create it before running Docker."
  exit 1
fi

echo "Building images…"
docker compose build

echo "Starting services…"
docker compose up -d

echo ""
echo "Done. Check: docker compose ps"
echo "Logs:    docker compose logs -f"
echo "Open in browser (use your EC2 public IP or domain):"
echo "  http://YOUR_PUBLIC_IP/"
echo ""
echo "Ensure backend/.env has FRONTEND_URL and APP_URL matching that URL (e.g. http://13.210.144.218)."
