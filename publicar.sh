#!/usr/bin/env bash
# Sobe o código para o GitHub e carrega os dados no Supabase. Rode no Terminal do Mac:
#   cd ~/dev/ita/Artifact2-TRA-46 && ./publicar.sh
set -euo pipefail
cd "$(dirname "$0")"

if grep -q "^DATABASE_URL=.*SUA_SENHA" web/.env.local 2>/dev/null; then
  echo "Troque SUA_SENHA pela senha do banco em web/.env.local e rode de novo."; exit 1
fi

# 1. código no GitHub (henrillima/Artifact2-TRA-46)
if [ ! -d .git ]; then git init -q; fi
git add -A
git commit -qm "ARTEF2: previsão e cenários de tarifas aéreas (Next.js + Supabase, pipeline Python)" || true
git branch -M main
git remote get-url origin >/dev/null 2>&1 || git remote add origin git@github-pessoal:henrillima/Artifact2-TRA-46.git
git push -u origin main

# 2. dados no Supabase
cd web
npm install --no-fund --no-audit
npm run carregar
