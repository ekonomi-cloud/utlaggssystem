#!/bin/sh
# Startpunkt för behållaren.
#
# Volymen med databas, kvitton och PDF:er kan ägas av root, till exempel när den
# skapats av en tidigare version som körde som root. Appen kör som en egen
# användare och måste kunna skriva dit. Startar vi som root rättar vi därför
# ägandet och byter sedan till appanvändaren innan appen startar.
set -e

if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown -R utlagg:utlagg /app/data 2>/dev/null || true
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=utlagg --regid=utlagg --init-groups "$@"
  fi
  echo "[start] setpriv saknas, kör vidare som root" >&2
fi

exec "$@"
