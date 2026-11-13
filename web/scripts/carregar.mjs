// Carrega os dados do ARTEF2 no seu Supabase.
// Uso (na pasta web/):  npm run carregar
// Precisa de DATABASE_URL no arquivo .env.local (Supabase > Connect > Session pooler).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');
const banco = path.resolve(raiz, '..', 'dados', 'banco');

function lerEnv() {
  const f = path.join(raiz, '.env.local');
  if (!fs.existsSync(f)) return;
  for (const linha of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
lerEnv();
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL em web/.env.local (veja o LEIA-ME.md na pasta do projeto).');
  process.exit(1);
}

const TABELAS = ['macro', 'parametros', 'metricas_modelos', 'rotas', 'rota_empresa', 'eventos', 'aeroporto_mensal',
  'previsao_assentos', 'previsao', 'serie_mensal', 'painel'];

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false } });
await cliente.connect();
// o Supabase corta comandos longos (statement_timeout); a carga do painel leva alguns minutos
await cliente.query("set statement_timeout = 0");
console.log('Conectado. Criando/atualizando o esquema...');
await cliente.query(fs.readFileSync(path.join(raiz, 'supabase', 'schema.sql'), 'utf8'));

for (const t of TABELAS) {
  const arq = path.join(banco, `${t}.csv`);
  if (!fs.existsSync(arq)) { console.warn(`  (sem ${t}.csv, pulando)`); continue; }
  const cab = fs.readFileSync(arq, 'utf8').split('\n', 1)[0].trim();
  const cols = cab.split(',').map((c) => `"${c}"`).join(',');
  await cliente.query(`truncate table ${t}`);
  const t0 = Date.now();
  await pipeline(fs.createReadStream(arq),
    cliente.query(copyFrom(`copy ${t} (${cols}) from stdin with (format csv, header true)`)));
  const { rows } = await cliente.query(`select count(*)::int as n from ${t}`);
  console.log(`  ${t.padEnd(18)} ${String(rows[0].n).padStart(8)} linhas  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
await cliente.query('analyze');
await cliente.end();
console.log('Pronto. O site já pode ler os dados.');
