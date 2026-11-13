#!/usr/bin/env bash
# Refaz tudo: .zip da ANAC em raw/ -> dados/banco/*.csv
set -euo pipefail
cd "$(dirname "$0")/src"
python3 agregar.py ../raw
python3 analises.py ../raw          # análises do ARTEF1 para a base completa -> web/public/analises/index.html
python3 series.py
python3 previsao.py
python3 econometria.py
python3 padroes.py
python3 exportar.py
echo "Pronto. Agora: cd web && npm run carregar"
