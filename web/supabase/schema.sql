-- ARTEF2 · TRA-46 · Grupo 02 — esquema do banco (Supabase/Postgres)
-- Rode no SQL Editor do Supabase (ou via scripts/carregar.mjs, que executa este arquivo antes da carga).

create table if not exists macro (
  mes text primary key, ipca_pct double precision, idx_ipca double precision, ptax double precision,
  jet_usd_gal double precision, qav_avdatabr double precision, qav_real24 double precision);

create table if not exists serie_mensal (
  nivel text not null, chave text not null, periodo text not null,
  assentos double precision, tarifa_real double precision, tarifa_nominal double precision,
  hhi double precision, n_empresas double precision,
  primary key (nivel, chave, periodo));

create table if not exists previsao (
  nivel text not null, chave text not null, modelo text not null, periodo text not null, h int,
  previsto double precision, lo80 double precision, hi80 double precision, lo95 double precision, hi95 double precision,
  melhor boolean, primary key (nivel, chave, modelo, periodo));

create table if not exists previsao_assentos (
  nivel text not null, chave text not null, periodo text not null, h int, assentos double precision,
  primary key (nivel, chave, periodo));

create table if not exists metricas_modelos (
  modelo text, nivel text, mape double precision, rmse_log double precision, n int, nome text, rank double precision,
  mae double precision, rmse double precision,
  primary key (modelo, nivel));
-- colunas novas em bancos ja criados (MAE e RMSE em R$)
alter table metricas_modelos add column if not exists mae double precision;
alter table metricas_modelos add column if not exists rmse double precision;

create table if not exists rotas (
  rota text primary key, origem text, destino text, nome text, cidades text, distancia_km double precision,
  assentos_12m double precision, tarifa_real_12m double precision, hhi_12m double precision, rank int,
  cluster double precision, segmento text, sazonalidade double precision, volatilidade double precision,
  crescimento double precision);

create table if not exists rota_empresa (
  rota text, grupo text, assentos double precision, tarifa_real double precision, share double precision,
  primary key (rota, grupo));

create table if not exists aeroporto_mensal (
  icao text, aeroporto text, cidade text, periodo text, mov double precision, tarifa double precision,
  yoy_mov double precision, yoy_tarifa double precision, rel_mov double precision, rel_tarifa double precision,
  z_robusto double precision, escore_isolamento double precision, anomalo boolean,
  escore_lof double precision, escore_kmedias double precision, escore_gmm double precision, evento_conhecido boolean,
  primary key (icao, periodo));
alter table aeroporto_mensal add column if not exists escore_lof double precision;
alter table aeroporto_mensal add column if not exists escore_kmedias double precision;
alter table aeroporto_mensal add column if not exists escore_gmm double precision;
alter table aeroporto_mensal add column if not exists evento_conhecido boolean;

create table if not exists eventos (
  id text primary key, nome text, escopo text, aeroporto text, inicio text, nota text, trajetoria jsonb);

create table if not exists parametros (chave text primary key, valor jsonb);

create table if not exists painel (
  ano smallint, mes smallint, empresa text, grupo text, origem text, destino text, rota text,
  assentos double precision, tarifa_real double precision, tarifa_nominal double precision);
create index if not exists painel_rota_idx on painel (rota);

-- dados das telas de analise do ARTEF1 na base completa (um bloco JSON por linha; gerado por src/analises.py)
create table if not exists analises (secao text primary key, dados jsonb not null);

-- cenarios criados pelos usuarios no site
create table if not exists cenarios (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  autor text not null check (char_length(autor) between 1 and 60),
  nome text not null check (char_length(nome) between 1 and 120),
  tipo text not null check (tipo in ('previsao', 'custos', 'fusao', 'demanda')),
  parametros jsonb not null,
  resumo jsonb,
  check (pg_column_size(parametros) < 20000),
  check (resumo is null or pg_column_size(resumo) < 20000));

-- leitura publica; escrita so em cenarios
do $$
declare t text;
begin
  foreach t in array array['macro','serie_mensal','previsao','previsao_assentos','metricas_modelos','rotas',
                           'rota_empresa','aeroporto_mensal','eventos','parametros','painel','analises','cenarios'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists leitura_publica on %I', t);
    execute format('create policy leitura_publica on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
drop policy if exists insercao_publica on cenarios;
create policy insercao_publica on cenarios for insert to anon, authenticated with check (true);

-- serie mensal por companhia para qualquer rota (consulta ao painel)
create or replace function serie_rota_empresa(p_rota text)
returns table (periodo text, grupo text, assentos double precision, tarifa_real double precision)
language sql stable as $$
  select to_char(make_date(ano, mes, 1), 'YYYY-MM') as periodo, grupo,
         sum(assentos) as assentos, sum(assentos * tarifa_real) / sum(assentos) as tarifa_real
  from painel where rota = p_rota
  group by 1, 2 order by 1, 2;
$$;

-- busca de rotas por codigo IATA/ICAO ou cidade
create or replace function buscar_rotas(q text)
returns setof rotas language sql stable as $$
  select * from rotas
  where nome ilike '%' || q || '%' or cidades ilike '%' || q || '%' or rota ilike '%' || q || '%'
  order by rank limit 30;
$$;

-- permissoes (no Supabase ja existem por padrao; explicitas aqui para outros Postgres)
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert on cenarios to anon, authenticated;
grant execute on function serie_rota_empresa(text), buscar_rotas(text) to anon, authenticated;
