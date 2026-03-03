#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Pivot Quick Start ==="
echo ""

# 1. Copy .env.example → .env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[+] Created .env from .env.example"
else
  echo "[=] .env already exists, skipping copy"
fi

# 2. Set DATABASE_URL for docker-compose PostgreSQL
if ! grep -q "^DATABASE_URL=postgresql://" .env; then
  sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://pivot:pivot_dev_password@localhost:5432/pivot|' .env
  echo "[+] Set DATABASE_URL to docker-compose PostgreSQL"
fi

# 3. Enable demo mode
if ! grep -q "^DEMO_MODE=true" .env; then
  sed -i 's|^# DEMO_MODE=true|DEMO_MODE=true|' .env
  echo "[+] Enabled DEMO_MODE"
fi

# 4. Generate BETTER_AUTH_SECRET if empty
if grep -q "^BETTER_AUTH_SECRET=$" .env; then
  SECRET=$(openssl rand -base64 32)
  sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=${SECRET}|" .env
  echo "[+] Generated BETTER_AUTH_SECRET"
fi

# 5. Install dependencies
echo ""
echo "Installing dependencies..."
bun install

# 6. Run database migrations
echo ""
echo "Running database migrations..."
bun run db:migrate

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Start the development server with:"
echo "  bun run dev"
echo ""
echo "Then open http://localhost:3000"
echo "Demo accounts: admin@demo.com / analyst@demo.com / viewer@demo.com"
echo "Password: demo1234"
echo ""
