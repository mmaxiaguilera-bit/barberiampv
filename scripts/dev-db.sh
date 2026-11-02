#!/usr/bin/env bash
# Comandos de base de datos SOLO para el proyecto de pruebas (mvp-barber-dev).
# Se niega a correr si la CLI está vinculada a cualquier otro proyecto.
set -euo pipefail
cd "$(dirname "$0")/.."

DEV_REF="oxapiokwxziphfpktnah"
LINKED_REF="$(cat supabase/.temp/project-ref 2>/dev/null || true)"
if [ "$LINKED_REF" != "$DEV_REF" ]; then
  echo "ABORTADO: la CLI está vinculada a '${LINKED_REF:-ninguno}', no al proyecto de pruebas ($DEV_REF)." >&2
  echo "Ejecutá: supabase link --project-ref $DEV_REF" >&2
  exit 1
fi

case "${1:-}" in
  push)  supabase db push ;;
  seed)  supabase db query --linked -f supabase/dev/seed.sql ;;
  reset) supabase db query --linked -f supabase/dev/reset.sql && supabase db query --linked -f supabase/dev/seed.sql ;;
  test)  supabase db query --linked -f supabase/tests/loyalty.test.sql ;;
  types) supabase gen types typescript --linked --schema public > src/integrations/supabase/types.ts ;;
  *) echo "Uso: scripts/dev-db.sh {push|seed|reset|test|types}" >&2; exit 1 ;;
esac
