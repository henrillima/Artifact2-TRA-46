# -*- coding: utf-8 -*-
"""
analises.py — ARTEF2 (TRA-46, Grupo 02)
=======================================
As analises do ARTEF1 (panorama, casos reais, sazonalidade, faixas de preco, companhias, rotas,
aeroportos e metodo), refeitas para a base completa (jan/2015 em diante). E o mesmo gerador do ARTEF1,
generalizado para qualquer periodo e com a Avianca separada das "Outras".

Gera:
  dados/analises/dados_dashboard.json        dados que alimentam as analises
  dados/analises/resumo_*.csv                tabelas prontas para Excel/PowerPoint
  dados/banco/analises.csv                   os mesmos dados, um bloco por linha, para a tabela "analises" do banco
  web/public/dados/analises.json             copia estatica usada pelo site se o banco ainda nao tiver a tabela

As telas ficam no site: web/app/analises (pagina), web/components/analises/Secoes.tsx (marcacao)
e web/lib/analises/painel.ts (graficos e interacao, o codigo do ARTEF1 adaptado).

Uso (na pasta src/):
  python3 analises.py ../raw [../raw_novos]  # processa tudo (alguns minutos)
  python3 analises.py --so-exportar          # so regrava o CSV do banco e a copia estatica a partir do JSON
"""
import gc
import io
import json
import re
import sys
import time
import unicodedata
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from base import AEROPORTOS, EXT  # noqa: E402  (ICAO -> cidade, IATA, lat, lon; ARTEF1 + complemento)

RAIZ = Path(__file__).resolve().parent.parent
PROC = RAIZ / 'dados' / 'analises'
SAIDA_BANCO = RAIZ / 'dados' / 'banco' / 'analises.csv'
SAIDA_WEB = RAIZ / 'web' / 'public' / 'dados' / 'analises.json'
PRIMEIRO_MES = '201501'
GRUPOS = ['TAM', 'GLO', 'AZU', 'ONE', 'OUT']
NOMES_GRUPO = {'TAM': 'LATAM', 'GLO': 'Gol', 'AZU': 'Azul', 'ONE': 'Avianca', 'OUT': 'Outras'}
NG = len(GRUPOS)
N_ROTAS, N_AEROPORTOS = 250, 40
# IPCA acumulado no ano (IBGE), para conferir a serie mensal do Banco Central (433)
IPCA_ANUAL_OFICIAL = {2015: 10.67, 2016: 6.29, 2017: 2.95, 2018: 3.75, 2019: 4.31, 2020: 4.52, 2021: 10.06,
                      2022: 5.78, 2023: 4.62, 2024: 4.83, 2025: 4.26}
MESES = []                                      # [(ano, mes)] consecutivos; definido em main()
ANOS = []
P0 = 0
MA = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']


def pos_de(ano, mes):
    return ano * 12 + mes - 1 - P0

NM = 4096                                   # limite de codigos de aeroporto (para as chaves numericas)
FINE = np.arange(0, 3100, 100)              # histograma: faixas de R$ 100 ate R$ 3.000+
BANDAS = [0, 300, 500, 800, 1200, 2000, 1e12]
BANDAS_ROT = ['<300', '300–500', '500–800', '800–1.200', '1.200–2.000', '>2.000']
COLUNAS = {
    'ano': ['ano de referencia', 'ano', 'nr_ano_referencia'],
    'mes': ['mes de referencia', 'mes', 'nr_mes_referencia'],
    'empresa': ['icao empresa aerea', 'empresa', 'sg_empresa_icao'],
    'origem': ['icao aerodromo origem', 'origem', 'sg_icao_origem'],
    'destino': ['icao aerodromo destino', 'destino', 'sg_icao_destino'],
    'tarifa': ['tarifa-n', 'tarifa', 'nr_tarifa'],
    'assentos': ['assentos comercializados', 'assentos', 'nr_assentos'],
}
REV = {v: k for k, vs in COLUNAS.items() for v in vs}


def log(msg):
    print(msg, flush=True)


def mem_mb():
    """Pico de memoria do processo em MB (so em Linux/Mac; no Windows devolve 0)."""
    try:
        import resource
        v = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return v / (1024 * 1024) if sys.platform == 'darwin' else v / 1024
    except Exception:
        return 0


# ------------------------------------------------------------------ IPCA
def indice_ipca():
    """Numero-indice mensal do IPCA (serie 433 do BCB, em ext/macro_mensal.csv) e conferencia com o acumulado oficial."""
    mm = pd.read_csv(EXT / 'macro_mensal.csv').dropna(subset=['ipca_pct'])
    idx, v, acum = {}, 100.0, {}
    for row in mm.itertuples():
        a, m = int(row.mes[:4]), int(row.mes[5:7])
        v *= 1 + row.ipca_pct / 100
        idx[(a, m)] = v
        acum.setdefault(a, []).append(row.ipca_pct)
    for a, xs in acum.items():
        if a in IPCA_ANUAL_OFICIAL and len(xs) == 12:
            tot = (np.prod([1 + x / 100 for x in xs]) - 1) * 100
            if abs(tot - IPCA_ANUAL_OFICIAL[a]) > 0.011:
                raise SystemExit(f'IPCA de {a} nao bate com o acumulado oficial ({tot:.3f}% contra {IPCA_ANUAL_OFICIAL[a]}%).')
    return idx


# ------------------------------------------------------------------ leitura
def sem_acento(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))


def norm_col(c):
    return sem_acento(str(c).strip().strip('"').strip()).lower()


def listar_arquivos(pastas):
    """Procura arquivos AAAAMM.csv dentro de .zip ou soltos nas pastas indicadas (inclusive subpastas)."""
    itens = {}
    for p in sorted(q for b in pastas for q in Path(b).rglob('*')):
        if not p.is_file():
            continue
        suf = p.suffix.lower()
        if suf == '.zip':
            try:
                with zipfile.ZipFile(p) as z:
                    for nome in z.namelist():
                        m = re.fullmatch(r'(\d{6})(?: \(\d+\))?\.csv', Path(nome).name, flags=re.I)
                        if m and m.group(1) >= PRIMEIRO_MES:
                            itens[m.group(1)] = ('zip', p, nome)
            except zipfile.BadZipFile:
                log(f'AVISO: {p.name} nao e um zip valido e foi ignorado.')
        elif suf == '.csv':
            m = re.fullmatch(r'(\d{6})(?: \(\d+\))?\.csv', p.name, flags=re.I)
            if m and m.group(1) >= PRIMEIRO_MES:
                itens[m.group(1)] = ('csv', p, None)
    return itens


def ler_bytes(item):
    tipo, p, nome = item
    if tipo == 'zip':
        with zipfile.ZipFile(p) as z:
            return z.read(nome)
    return p.read_bytes()


def ler_e_limpar(tag, item):
    """Le um arquivo mensal, unifica cabecalhos/decimais/codificacao e devolve (DataFrame limpo, relatorio)."""
    raw = ler_bytes(item)
    try:
        txt, enc = raw.decode('utf-8-sig'), 'utf-8'
    except UnicodeDecodeError:
        txt, enc = raw.decode('latin-1'), 'latin-1'
    del raw
    df = pd.read_csv(io.StringIO(txt), sep=';', dtype=str, keep_default_na=False)
    cab_original = ';'.join(str(c) for c in df.columns)
    del txt
    ren = {c: REV[norm_col(c)] for c in df.columns if norm_col(c) in REV}
    faltam = set(COLUNAS) - set(ren.values())
    if faltam:
        raise SystemExit(f'{tag}: colunas nao reconhecidas {sorted(faltam)}. Cabecalho encontrado: {cab_original}')
    df = df[list(ren)].rename(columns=ren)
    q = {'arquivo': tag, 'codificacao': enc, 'cabecalho': cab_original.replace('Unnamed: 0', '(coluna sem nome)'),
         'linhas_brutas': len(df)}

    t = df['tarifa'].str.strip().str.replace('"', '', regex=False)
    tem_v, tem_p = t.str.contains(',', regex=False), t.str.contains('.', regex=False)
    q['tarifa_com_virgula'], q['tarifa_com_ponto'] = int(tem_v.sum()), int(tem_p.sum())
    ambos = tem_v & tem_p                       # ex.: "1.234,5" (ponto de milhar + virgula decimal)
    q['tarifa_ponto_e_virgula'] = int(ambos.sum())
    if ambos.any():
        t = t.mask(ambos, t.str.replace('.', '', regex=False))
    t = t.str.replace(',', '.', regex=False)
    tarifa = pd.to_numeric(t, errors='coerce')
    assentos = pd.to_numeric(df['assentos'].str.strip().str.replace('"', '', regex=False), errors='coerce')
    ano = pd.to_numeric(df['ano'], errors='coerce')
    mes = pd.to_numeric(df['mes'], errors='coerce')
    q['tarifa_nao_numerica'], q['assentos_nao_numerico'] = int(tarifa.isna().sum()), int(assentos.isna().sum())

    out = pd.DataFrame({'ano': ano, 'mes': mes, 'tarifa': tarifa, 'assentos': assentos})
    for c in ('empresa', 'origem', 'destino'):
        out[c] = df[c].str.strip().str.strip('"').str.upper()
    ea, em = int(tag[:4]), int(tag[4:])
    q['periodo_diverge'] = int(((out['ano'] != ea) | (out['mes'] != em)).sum())
    q['tarifa_le_zero'] = int((out['tarifa'] <= 0).sum())
    q['assentos_le_zero'] = int((out['assentos'] <= 0).sum())
    q['origem_igual_destino'] = int((out['origem'] == out['destino']).sum())
    q['codigo_icao_anomalo'] = int(((out['origem'].str.len() != 4) | (out['destino'].str.len() != 4)).sum())
    ok = (out['ano'] == ea) & (out['mes'] == em) & (out['tarifa'] > 0) & (out['assentos'] > 0) \
        & out['tarifa'].notna() & out['assentos'].notna()
    if q['linhas_brutas'] and (~ok).sum() / q['linhas_brutas'] > 0.001:
        raise SystemExit(f'{tag}: mais de 0,1% das linhas invalidas ({int((~ok).sum())}). Verifique o arquivo.')
    out = out[ok].reset_index(drop=True)
    q['linhas_validas'] = len(out)
    q['tarifa_min'], q['tarifa_max'] = float(out['tarifa'].min()), float(out['tarifa'].max())
    q['assentos_soma'] = float(out['assentos'].sum())
    return out, q


# ------------------------------------------------------------------ estatistica
def quantis_pond(v, w, qs):
    o = np.argsort(v, kind='stable')
    v = v[o]
    c = np.cumsum(w[o])
    tot = c[-1]
    return [float(v[min(int(np.searchsorted(c, q * tot)), len(v) - 1)]) for q in qs]


def r(x, n=2):
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x), n)


def limpa(o):
    """Converte tipos numpy e troca NaN/inf por None, para o JSON ser sempre valido."""
    if isinstance(o, dict):
        return {str(k): limpa(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [limpa(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        return None if not np.isfinite(o) else float(o)
    return o


# ------------------------------------------------------------------ processamento
def processar(itens, esperados, idx, base):
    AIR = {}                                    # codigo ICAO -> inteiro

    def cod(serie):
        for x in serie.unique():
            if x not in AIR:
                AIR[x] = len(AIR)
                if len(AIR) >= NM:
                    raise SystemExit('Mais aeroportos do que o esperado; aumente NM em gerar_dashboard.py')
        return serie.map(AIR).to_numpy(dtype=np.int64)

    mensal, gm, ind, qual = [], [], [], []
    rotas_blocos, aero_blocos = [], []
    anual = {}
    buf = {'ano': None, 'v': [], 'w': [], 'g': [], 'n': 0}
    cestas = {}

    def fechar_ano():
        if buf['ano'] is None:
            return
        v, w, g = np.concatenate(buf['v']), np.concatenate(buf['w']), np.concatenate(buf['g'])
        buf.update({'v': [], 'w': [], 'g': []})
        nmeses = buf['n']
        o = np.argsort(v, kind='stable')                 # ordena uma unica vez; tudo abaixo reaproveita
        v, w, g = v[o], w[o], g[o]
        del o
        gc.collect()

        def q_sorted(vv, ww, qs):
            c = np.cumsum(ww, dtype=np.float64)
            return [float(vv[min(int(np.searchsorted(c, q * c[-1])), len(vv) - 1)]) for q in qs]

        S = float(w.sum(dtype=np.float64))
        res = {'assentos': S, 'media_real': float((v * w).sum(dtype=np.float64) / S)}
        qs = q_sorted(v, w, [.10, .25, .5, .75, .9, .99])
        res.update(dict(zip(['p10', 'p25', 'mediana_real', 'p75', 'p90', 'p99'], qs)))
        h, _ = np.histogram(np.minimum(v, 3050), bins=np.append(FINE, 3100), weights=w)
        res['hist'] = (h / S).tolist()
        b = np.digitize(v, BANDAS[1:-1])
        res['bandas'] = [float(w[b == i].sum(dtype=np.float64) / S) for i in range(len(BANDAS_ROT))]
        res['grupos'] = {}
        for k, nome in enumerate(GRUPOS[:4]):
            mk = g == k
            vk, wk = v[mk], w[mk]
            if wk.sum() <= 0:
                res['grupos'][nome] = None
                continue
            res['grupos'][nome] = {'media_real': float((vk * wk).sum(dtype=np.float64) / wk.sum(dtype=np.float64)),
                                   'mediana_real': q_sorted(vk, wk, [.5])[0],
                                   'p90_real': q_sorted(vk, wk, [.9])[0]}
        res['n_meses'] = nmeses
        anual[buf['ano']] = res
        buf['ano'] = None
        buf['n'] = 0
        del v, w, g
        gc.collect()
        log(f'  ano fechado (pico de memoria ate agora: {mem_mb():.0f} MB)')

    gcod = {'TAM': 0, 'GLO': 1, 'AZU': 2, 'ONE': 3}
    t0 = time.time()
    for i, tag in enumerate(esperados, 1):
        ano, mes = int(tag[:4]), int(tag[4:])
        if buf['ano'] is not None and buf['ano'] != ano:
            fechar_ano()
        buf['ano'] = ano
        buf['n'] += 1
        d, q = ler_e_limpar(tag, itens[tag])
        qual.append(q)
        fator = base / idx[(ano, mes)]
        tar = d['tarifa'].to_numpy('float64')
        w = d['assentos'].to_numpy('float64')
        rec = tar * w
        grp = d['empresa'].map(gcod).fillna(NG - 1).to_numpy(dtype=np.int64)
        o, de = cod(d['origem']), cod(d['destino'])
        S, R = w.sum(), rec.sum()
        p10, p25, p50, p75, p90 = quantis_pond(tar, w, [.10, .25, .5, .75, .9])
        mensal.append(dict(ano=ano, mes=mes, linhas=len(d), assentos=S, receita=R, media=R / S,
                           p10=p10, p25=p25, mediana=p50, p75=p75, p90=p90))
        gm.append(dict(ano=ano, mes=mes,
                       s=np.bincount(grp, weights=w, minlength=NG), r=np.bincount(grp, weights=rec, minlength=NG)))
        e = d.groupby('empresa')['assentos'].sum()
        ind.append(pd.DataFrame({'ano': ano, 'mes': mes, 'empresa': e.index, 'assentos': e.values}))
        # rotas (par de aeroportos sem direcao) x grupo de companhia
        kp = (np.minimum(o, de) * NM + np.maximum(o, de)) * NG + grp
        g1 = pd.DataFrame({'k': kp, 's': w, 'r': rec}).groupby('k', sort=False)[['s', 'r']].sum()
        rotas_blocos.append((ano, mes, g1.index.to_numpy(), g1['s'].to_numpy(), g1['r'].to_numpy()))
        # aeroporto de origem x grupo
        ko = o * NG + grp
        g2 = pd.DataFrame({'k': ko, 's': w, 'r': rec}).groupby('k', sort=False)[['s', 'r']].sum()
        aero_blocos.append((ano, mes, g2.index.to_numpy(), g2['s'].to_numpy(), g2['r'].to_numpy()))
        # anos: valores reais para quantis
        buf['v'].append(tar * fator)
        buf['w'].append(w.astype(np.float32))
        buf['g'].append(grp.astype(np.int8))
        # cesta fixa (mesma empresa + mesma rota) para o caso "marco/2022"
        if tag in ('202202', '202203'):
            c = d.groupby(['empresa', 'origem', 'destino'])[['assentos']].sum()
            c['rec'] = (d.assign(rec=rec).groupby(['empresa', 'origem', 'destino'])['rec'].sum())
            cestas[tag] = c
        del d, tar, w, rec, grp, o, de, kp, g1, ko, g2
        gc.collect()
        if i % 6 == 0 or i == len(esperados):
            log(f'  [{i:2d}/{len(esperados)}] {tag} processado ({time.time() - t0:.0f}s, memoria {mem_mb():.0f} MB)')
    fechar_ano()
    return dict(AIR=AIR, mensal=pd.DataFrame(mensal), gm=gm, ind=pd.concat(ind, ignore_index=True), qual=pd.DataFrame(qual),
                rotas=rotas_blocos, aero=aero_blocos, anual=anual, cestas=cestas)


def blocos_para_df(blocos, fator_arr):
    ano = np.concatenate([np.full(len(b[2]), b[0], dtype=np.int64) for b in blocos])
    mes = np.concatenate([np.full(len(b[2]), b[1], dtype=np.int64) for b in blocos])
    k = np.concatenate([b[2] for b in blocos])
    s = np.concatenate([b[3] for b in blocos])
    rr = np.concatenate([b[4] for b in blocos])
    df = pd.DataFrame({'ano': ano, 'mes': mes, 'k': k, 's': s, 'r': rr})
    df['pos'] = df['ano'] * 12 + df['mes'] - 1 - P0
    df['rr'] = df['r'] * fator_arr[df['pos'].to_numpy()]      # receita em reais do mes-base
    df['grp'] = df['k'] % NG
    return df


# ------------------------------------------------------------------ montagem dos dados
def montar(res, idx, base):
    meses = [f'{a}-{m:02d}' for a, m in MESES]
    NMES = len(meses)
    fator_arr = np.array([base / idx[(a, m)] for a, m in MESES])
    pos = pos_de
    AIR = res['AIR']
    INV = {v: k for k, v in AIR.items()}
    m = res['mensal'].copy()
    m['pos'] = [pos(a, mm) for a, mm in zip(m.ano, m.mes)]
    m = m.sort_values('pos').reset_index(drop=True)
    assert list(m.pos) == list(range(NMES)), 'meses faltando ou repetidos'
    m['fator'] = fator_arr
    m['rec_real'] = m.receita * m.fator

    def nome(ic):
        return f'{AEROPORTOS[ic][0]} ({AEROPORTOS[ic][1]})' if ic in AEROPORTOS else ic

    # ---- nacional
    nac = {'a': [int(x) for x in m.assentos], 'media': [r(x) for x in m.media], 'mediana': [r(x) for x in m.mediana],
           'p25': [r(x) for x in m.p25], 'p75': [r(x) for x in m.p75], 'p90': [r(x) for x in m.p90]}

    # ---- companhias (grupos)
    gs = np.zeros((NMES, NG))
    gr = np.zeros((NMES, NG))
    for x in res['gm']:
        gs[pos(x['ano'], x['mes'])] = x['s']
        gr[pos(x['ano'], x['mes'])] = x['r']
    emp = {}
    for k, g in enumerate(GRUPOS):
        emp[g] = {'a': [int(x) for x in gs[:, k]],
                  'n': [r(gr[i, k] / gs[i, k]) if gs[i, k] > 0 else None for i in range(NMES)]}
    anos_idx = {a: [pos(aa, mm) for aa, mm in MESES if aa == a] for a in ANOS}
    tot_ano = {a: gs[anos_idx[a]].sum() for a in ANOS}
    emp_anual = {g: {} for g in GRUPOS}
    for k, g in enumerate(GRUPOS):
        for a in ANOS:
            s = gs[anos_idx[a], k].sum()
            rr = (gr[anos_idx[a], k] * fator_arr[anos_idx[a]]).sum()
            item = {'share': r(s / tot_ano[a], 4), 'assentos': int(s), 'media_real': r(rr / s, 1) if s > 0 else None}
            q_ = res['anual'][a]['grupos'].get(g) if g != 'OUT' else None
            if q_:
                item['mediana_real'] = r(q_['mediana_real'], 1)
                item['p90_real'] = r(q_['p90_real'], 1)
            emp_anual[g][a] = item
    ee = res['ind'].groupby(['ano', 'empresa'])['assentos'].sum().reset_index()
    ee['s'] = ee['assentos'] / ee.groupby('ano')['assentos'].transform('sum')
    hhi = {int(a): int(round(float((g['s'] ** 2).sum() * 10000))) for a, g in ee.groupby('ano')}
    em_ = res['ind'].groupby(['ano', 'mes', 'empresa'])['assentos'].sum().reset_index()
    em_['s'] = em_['assentos'] / em_.groupby(['ano', 'mes'])['assentos'].transform('sum')
    hm = em_.groupby(['ano', 'mes']).apply(lambda g: float((g['s'] ** 2).sum() * 10000))
    hhi_m = [int(round(hm.loc[(a, m)])) for a, m in MESES]

    # ---- anual nacional
    anual = {}
    for a in ANOS:
        q = res['anual'][a]
        ii = anos_idx[a]
        anual[a] = {'assentos': int(m.assentos[ii].sum()), 'media_nom': r(m.receita[ii].sum() / m.assentos[ii].sum(), 1),
                    'media_real': r(m.rec_real[ii].sum() / m.assentos[ii].sum(), 1), 'mediana_real': r(q['mediana_real'], 1),
                    'p10': r(q['p10'], 1), 'p25': r(q['p25'], 1), 'p75': r(q['p75'], 1), 'p90': r(q['p90'], 1),
                    'p99': r(q['p99'], 1), 'bandas': [r(x, 4) for x in q['bandas']], 'hist': [r(x, 5) for x in q['hist']],
                    'meses': len(ii)}

    # ---- rotas
    R = blocos_para_df(res['rotas'], fator_arr)
    R['par'] = R['k'] // NG
    O = blocos_para_df(res['aero'], fator_arr)
    O['orig'] = O['k'] // NG
    tot_orig = O.groupby('orig')['s'].sum()
    rank = tot_orig.rank(ascending=False, method='first')
    tot_par = R.groupby('par')['s'].sum().sort_values(ascending=False)
    top = tot_par.head(N_ROTAS).index.tolist()
    Rt = R[R['par'].isin(top)]
    mm = Rt.groupby(['par', 'pos'])[['s', 'r']].sum()
    ya = Rt.groupby(['par', 'ano'])[['s', 'rr']].sum()
    yg = Rt.groupby(['par', 'grp', 'ano'])[['s', 'rr']].sum()
    mm_d = {k: (v[0], v[1]) for k, v in zip(mm.index, mm.values)}
    ya_d = {k: (v[0], v[1]) for k, v in zip(ya.index, ya.values)}
    yg_d = {k: (v[0], v[1]) for k, v in zip(yg.index, yg.values)}
    rotas = []
    for par in top:
        a_, b_ = par // NM, par % NM
        o_, d_ = INV[a_], INV[b_]
        if rank.get(a_, 1e9) > rank.get(b_, 1e9):
            o_, d_ = d_, o_
        A_, N_ = [], []
        for p in range(NMES):
            s, rc = mm_d.get((par, p), (0, 0))
            A_.append(int(s))
            N_.append(r(rc / s, 1) if s > 0 else None)
        an = {}
        for a in ANOS:
            s, rr = ya_d.get((par, a), (0, 0))
            an[a] = [int(s), r(rr / s, 1) if s > 0 else None]
        ea = {}
        for k, g in enumerate(GRUPOS[:4]):
            ea[g] = {}
            for a in ANOS:
                s, rr = yg_d.get((par, k, a), (0, 0))
                ea[g][a] = [int(s), r(rr / s, 1) if s > 0 else None]
        rotas.append({'id': f'{o_}-{d_}', 'o': o_, 'd': d_, 'nome': f'{nome(o_)} ↔ {nome(d_)}', 'tot': int(tot_par[par]),
                      'a': A_, 'n': N_, 'anual': an, 'emp': ea})
    cobertura = float(tot_par.head(N_ROTAS).sum() / tot_par.sum())

    # ---- aeroportos (origem)
    topa = tot_orig.sort_values(ascending=False).head(N_AEROPORTOS).index.tolist()
    Ot = O[O['orig'].isin(topa)]
    om = Ot.groupby(['orig', 'pos'])[['s', 'r']].sum()
    oy = Ot.groupby(['orig', 'ano'])[['s', 'rr']].sum()
    og = Ot.groupby(['orig', 'grp', 'ano'])[['s', 'rr']].sum()
    om_d = {k: (v[0], v[1]) for k, v in zip(om.index, om.values)}
    oy_d = {k: (v[0], v[1]) for k, v in zip(oy.index, oy.values)}
    og_d = {k: (v[0], v[1]) for k, v in zip(og.index, og.values)}
    aero = []
    sem_coord = []
    for oc in topa:
        ic = INV[oc]
        A_, N_ = [], []
        for p in range(NMES):
            s, rc = om_d.get((oc, p), (0, 0))
            A_.append(int(s))
            N_.append(r(rc / s, 1) if s > 0 else None)
        an = {a: [int(oy_d.get((oc, a), (0, 0))[0]),
                  r(oy_d[(oc, a)][1] / oy_d[(oc, a)][0], 1) if (oc, a) in oy_d and oy_d[(oc, a)][0] > 0 else None] for a in ANOS}
        ea = {}
        for a in ANOS:
            ea[a] = {}
            for k, g in enumerate(GRUPOS):
                s, rr = og_d.get((oc, k, a), (0, 0))
                ea[a][g] = [int(s), r(rr / s, 1) if s > 0 else None]
        item = {'icao': ic, 'nome': nome(ic), 'anual': an, 'a': A_, 'n': N_, 'emp': ea}
        if ic in AEROPORTOS:
            item['lat'], item['lon'] = AEROPORTOS[ic][2], AEROPORTOS[ic][3]
        else:
            sem_coord.append(ic)
        aero.append(item)
    if sem_coord:
        log(f'  AVISO: aeroportos sem coordenadas no config.py (nao aparecem no mapa): {sem_coord}')

    # ---- casos reais
    def serie_aero(ic):
        oc = AIR.get(ic)
        a_, n_ = [0] * NMES, [None] * NMES
        if oc is not None:
            sub = O[O['orig'] == oc].groupby('pos')[['s', 'r']].sum()
            for p, (s, rc) in zip(sub.index, sub.values):
                a_[int(p)] = int(s)
                n_[int(p)] = r(rc / s, 1) if s > 0 else None
        return {'a': a_, 'n': n_}

    c0, c1 = res['cestas']['202202'], res['cestas']['202203']
    j = c0.join(c1, lsuffix='0', rsuffix='1', how='inner')
    j['f0'], j['f1'] = j['rec0'] / j['assentos0'], j['rec1'] / j['assentos1']
    w0 = j['assentos0']
    cesta = {'total': r((w0 * j['f1']).sum() / (w0 * j['f0']).sum() - 1, 4),
             'cobertura': r(j['assentos0'].sum() / c0['assentos'].sum(), 4)}
    for g in ('TAM', 'GLO', 'AZU'):
        jj = j[j.index.get_level_values('empresa') == g]
        cesta[g] = r((jj['assentos0'] * jj['f1']).sum() / (jj['assentos0'] * jj['f0']).sum() - 1, 4)
    casos = {'poa': {'SBPA': serie_aero('SBPA'), 'SBCO': serie_aero('SBCO')}, 'cesta_mar22': cesta}

    completos = [a for a in ANOS if len(anos_idx[a]) == 12]
    ua, um = MESES[-1]
    D = {'meta': {'linhas': int(m.linhas.sum()), 'arquivos': NMES, 'total_assentos': int(m.assentos.sum()),
                  'base': f'{MA[um - 1]}/{ua}', 'inicio': f'{MA[MESES[0][1] - 1]}/{MESES[0][0]}', 'fim': f'{MA[um - 1]}/{ua}',
                  'anos': ANOS, 'ultimo_completo': completos[-1], 'parcial': (ANOS[-1] if ANOS[-1] not in completos else None),
                  'meses_parcial': len(anos_idx[ANOS[-1]]),
                  'ipca_anual': {a: IPCA_ANUAL_OFICIAL[a] for a in completos if a in IPCA_ANUAL_OFICIAL}, 'cobertura_rotas': r(cobertura, 4)},
         'meses': meses, 'fator': [round(float(x), 5) for x in fator_arr], 'nac': nac, 'anual': anual, 'bandas': BANDAS_ROT,
         'emp': emp, 'emp_anual': emp_anual, 'hhi': hhi, 'hhi_m': hhi_m, 'rotas': rotas, 'aero': aero, 'casos': casos}
    tabelas = dict(m=m, emp_anual=emp_anual, anual=anual, rotas=rotas, aero=aero)
    return D, tabelas


# ------------------------------------------------------------------ conferencias
def conferir(D, res):
    """Confere se os agregados batem com os totais brutos (falha com mensagem clara se nao bater)."""
    q = res['qual']
    tot_linhas = int(q['linhas_validas'].sum())
    assert D['meta']['linhas'] == tot_linhas, 'total de linhas nao bate'
    assert abs(D['meta']['total_assentos'] - q['assentos_soma'].sum()) < 1, 'total de assentos nao bate'
    for a, v in D['anual'].items():
        s_emp = sum(D['emp_anual'][g][a]['assentos'] for g in GRUPOS)
        assert s_emp == v['assentos'], f'assentos por companhia nao somam o total em {a}'
        assert abs(sum(v['hist']) - 1) < 1e-3 and abs(sum(v['bandas']) - 1) < 1e-3, f'distribuicao de {a} nao soma 100%'
    for g in GRUPOS:
        assert sum(D['emp'][g]['a']) == sum(D['emp_anual'][g][a]['assentos'] for a in ANOS)
    log('  conferencias internas: OK (linhas, assentos, somas por companhia e distribuicoes)')


# ------------------------------------------------------------------ saidas
def gravar_csvs(D, T, res):
    PROC.mkdir(exist_ok=True)
    kw = dict(sep=';', decimal=',', encoding='utf-8-sig', index=False)
    m = T['m']
    pd.DataFrame({'ano': m.ano, 'mes': m.mes, 'assentos_vendidos': m.assentos.astype(int),
                  'tarifa_media_nominal': m.media.round(2), 'tarifa_media_real': (m.rec_real / m.assentos).round(2),
                  'mediana_nominal': m.mediana.round(2), 'p25_nominal': m.p25.round(2), 'p75_nominal': m.p75.round(2),
                  'p90_nominal': m.p90.round(2), 'fator_ipca_para_mes_base': m.fator.round(5)}).to_csv(PROC / 'resumo_mensal.csv', **kw)
    linhas = []
    for a, v in D['anual'].items():
        row = {'ano': a, 'assentos_vendidos': v['assentos'], 'tarifa_media_nominal': v['media_nom'],
               'tarifa_media_real': v['media_real'], 'mediana_real': v['mediana_real'], 'p10_real': v['p10'],
               'p25_real': v['p25'], 'p75_real': v['p75'], 'p90_real': v['p90'], 'p99_real': v['p99']}
        for lab, x in zip(BANDAS_ROT, v['bandas']):
            row['share_faixa_' + lab] = round(x, 4)
        linhas.append(row)
    pd.DataFrame(linhas).to_csv(PROC / 'resumo_anual.csv', **kw)
    linhas = []
    for g in GRUPOS:
        for a in ANOS:
            x = D['emp_anual'][g][a]
            linhas.append({'ano': a, 'companhia': NOMES_GRUPO[g], 'assentos_vendidos': x['assentos'], 'participacao': x['share'],
                           'tarifa_media_real': x['media_real'], 'mediana_real': x.get('mediana_real'), 'p90_real': x.get('p90_real')})
    pd.DataFrame(linhas).to_csv(PROC / 'resumo_companhias_anual.csv', **kw)
    linhas = []
    for rt in D['rotas']:
        row = {'rota': rt['nome'], 'icao_a': rt['o'], 'icao_b': rt['d'], 'assentos_periodo': rt['tot']}
        for a in ANOS:
            row[f'assentos_{a}'] = rt['anual'][a][0]
        for a in ANOS:
            row[f'tarifa_real_{a}'] = rt['anual'][a][1]
        linhas.append(row)
    pd.DataFrame(linhas).to_csv(PROC / 'resumo_rotas_top250.csv', **kw)
    linhas = []
    for ap in D['aero']:
        row = {'aeroporto': ap['nome'], 'icao': ap['icao']}
        for a in ANOS:
            row[f'assentos_origem_{a}'] = ap['anual'][a][0]
        for a in ANOS:
            row[f'tarifa_real_{a}'] = ap['anual'][a][1]
        linhas.append(row)
    pd.DataFrame(linhas).to_csv(PROC / 'resumo_aeroportos_top40.csv', **kw)
    res['qual'].to_csv(PROC / 'qualidade_por_arquivo.csv', **kw)


def exportar_site():
    """Grava os dados das analises no CSV do banco (tabela analises: secao, dados) e na copia estatica do site."""
    jp = PROC / 'dados_dashboard.json'
    if not jp.exists():
        raise SystemExit('Nao encontrei dados/analises/dados_dashboard.json. Rode primeiro: python3 analises.py ../raw')
    D = json.loads(jp.read_text(encoding='utf-8'))
    SAIDA_BANCO.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame([{'secao': k, 'dados': json.dumps(v, ensure_ascii=False, separators=(',', ':'))} for k, v in D.items()]) \
        .to_csv(SAIDA_BANCO, index=False, encoding='utf-8')
    SAIDA_WEB.parent.mkdir(parents=True, exist_ok=True)
    SAIDA_WEB.write_text(jp.read_text(encoding='utf-8'), encoding='utf-8')
    log(f'  {SAIDA_BANCO.relative_to(RAIZ)} ({len(D)} blocos) e {SAIDA_WEB.relative_to(RAIZ)} gravados')


def main():
    if '--so-exportar' in sys.argv:
        exportar_site()
        return
    global MESES, ANOS, P0
    t0 = time.time()
    idx = indice_ipca()
    pastas = [a for a in sys.argv[1:] if not a.startswith('--')] or [str(RAIZ / 'raw')]
    log('1/4  Procurando arquivos em ' + ', '.join(pastas) + ' ...')
    itens = listar_arquivos(pastas)
    if not itens:
        raise SystemExit('Nenhum arquivo AAAAMM.csv encontrado.')
    a0, m0 = int(min(itens)[:4]), int(min(itens)[4:])
    a1, m1 = int(max(itens)[:4]), int(max(itens)[4:])
    MESES = [(a, m) for a in range(a0, a1 + 1) for m in range(1, 13) if (a0, m0) <= (a, m) <= (a1, m1)]
    ANOS = sorted({a for a, _ in MESES})
    P0 = a0 * 12 + m0 - 1
    esperados = [f'{a}{mm:02d}' for a, mm in MESES]
    faltam = [t for t in esperados if t not in itens]
    if faltam:
        raise SystemExit(f'Faltam {len(faltam)} arquivos mensais (ex.: {faltam[:6]}).')
    if (a1, m1) not in idx:
        raise SystemExit(f'Falta IPCA de {m1:02d}/{a1} em ext/macro_mensal.csv.')
    base = idx[(a1, m1)]
    log(f'     {len(esperados)} arquivos mensais encontrados.')
    log('2/4  Lendo, limpando e agregando (alguns minutos) ...')
    res = processar(itens, esperados, idx, base)
    log('3/4  Montando dados do dashboard e conferindo ...')
    D, T = montar(res, idx, base)
    conferir(D, res)
    PROC.mkdir(exist_ok=True)
    (PROC / 'dados_dashboard.json').write_text(
        json.dumps(limpa(D), ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    gravar_csvs(D, T, res)
    log('4/4  Exportando para o banco e para o site ...')
    exportar_site()
    log(f'Pronto em {time.time() - t0:.0f}s. Depois rode "npm run carregar" na pasta web/.')


if __name__ == '__main__':
    main()
