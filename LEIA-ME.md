# ARTEF2 · TRA-46 · Grupo 02 — previsão e cenários de tarifas aéreas

Site com previsão da tarifa média, choque de custos (QAV e câmbio), simulação de fusões (HHI e guia do CADE)
e choques de demanda, em cima dos microdados de tarifas domésticas da ANAC. O ARTEF1 (dashboard do Karbage)
é a base: mesma limpeza, mesmos totais.

```
artef2/
├── LEIA-ME.md            este arquivo
├── requirements.txt      bibliotecas Python do processamento
├── rodar_pipeline.sh     refaz tudo, dos .zip da ANAC até os CSV do banco
├── raw/                  (você cria) os .zip anuais da ANAC, um por ano
├── ext/                  séries externas já prontas: IPCA, PTAX, querosene (FRED), QAV (AvDataBr), aeroportos
├── src/                  processamento em Python (agregação, previsão, econometria, segmentos, exportação)
├── dados/banco/          CSVs prontos para o banco (já vêm gerados com jan/2015 a set/2026)
└── web/                  o site (Next.js) e o esquema do banco (web/supabase/schema.sql)
```

## 1. Colocar o site no ar (sem rodar Python)

Os CSVs de `dados/banco/` já estão prontos, então dá para publicar direto.

**a) Supabase** (supabase.com, conta pessoal)

1. New project → nome `tra46-artef2`, região *South America (São Paulo)*. Guarde a senha do banco.
2. Project Settings → API: copie a **Project URL** e a **anon / publishable key**.
3. Botão **Connect** (topo da página) → *Session pooler* → copie a URI. Ela tem a cara
   `postgresql://postgres.XXXX:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`.
   Use essa e não a "Direct connection", que só funciona em rede com IPv6.

**b) Configurar e carregar** (Node 18 ou mais novo)

```bash
cd web
cp .env.example .env.local      # e preencha as três linhas com o que copiou acima
npm install
npm run carregar                # cria as tabelas e sobe os dados (uns 2 a 5 minutos)
npm run dev                     # abre em http://localhost:3000 para conferir
```

A senha só fica no `.env.local`, que não vai para o git nem para a Vercel.

**c) Vercel**

```bash
npm i -g vercel
vercel login
cd web
vercel                          # aceite os padrões; framework Next.js
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel --prod
```

Não cadastre o `DATABASE_URL` na Vercel: o site só lê com a chave pública.

## 2. Refazer o processamento (por exemplo, quando sair mês novo da ANAC)

1. Ponha os `.zip` anuais da ANAC em `raw/` (o SAS da ANAC, sas.anac.gov.br, gera um `.zip`
   por ano com os CSV `AAAAMM.CSV` de cada mês; 2015 a 2019 e 2026 já foram baixados para `raw/`; os de 2020 a 2025 são os do ARTEF1).
   O `agregar.py` ignora meses antes de jan/2015, que o SAS às vezes coloca junto no `.zip`.
2. `uv venv && source .venv/bin/activate && uv pip install -r requirements.txt`
3. `./rodar_pipeline.sh` (uns 10 minutos; a previsão é a parte lenta)
4. `cd web && npm run carregar` para subir a nova versão. O site não precisa de novo deploy.

A IPCA, a PTAX e o querosene em `ext/macro_mensal.csv` cobrem jan/2014 a set/2026. Se entrar mês da ANAC
depois disso, atualize esse arquivo antes (séries 433 e 3698 do Banco Central; MJFUELUSGULF no FRED).

## 3. O que cada script faz

| Script | Entrada | Saída |
|---|---|---|
| `agregar.py` | `.zip` da ANAC | `dados/painel.parquet` (rota × companhia × mês), `qualidade.csv` |
| `series.py` | painel + `ext/` | séries mensais de Brasil, companhias e rotas; tabela de rotas |
| `previsao.py` | séries | validação de 10 modelos em 3 origens, previsões de 18 meses com intervalos |
| `econometria.py` | painel | repasse do QAV, elasticidade-preço da demanda (VI), HHI × tarifa |
| `padroes.py` | painel | segmentos de rotas (k-médias), anomalias por aeroporto, eventos |
| `exportar.py` | tudo acima | `dados/banco/*.csv` |

Os detalhes de método estão na página **Método** do site.
