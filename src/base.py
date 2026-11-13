# -*- coding: utf-8 -*-
"""Tabelas-base do ARTEF2: deflator, QAV real, series mensais (Brasil, companhia, rota) e atributos de rota."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / 'dados'
EXT = RAIZ / 'ext'
SAIDA = DADOS / 'saida'
from config import AEROPORTOS  # noqa: E402  (ICAO -> cidade, IATA, lat, lon; do ARTEF1)

# aeroportos fora da lista do ARTEF1: coordenadas do pacote airportsdata (base OurAirports), conferidas contra os 59 do ARTEF1
# (diferença máxima de 6 km). Códigos novos da ANAC que o pacote ainda tem pelo código antigo estão na coluna 'fonte'.
for _a in pd.read_csv(EXT / 'aeroportos_complemento.csv').itertuples():
    AEROPORTOS.setdefault(_a.icao, (_a.cidade, _a.iata if isinstance(_a.iata, str) else _a.icao, _a.lat, _a.lon))

GRUPO = {'TAM': 'LATAM', 'GLO': 'Gol', 'AZU': 'Azul', 'ONE': 'Avianca'}   # demais -> 'Outras'
GAL_L = 3.78541


def grupo(cod):
    return GRUPO.get(cod, 'Outras')


def macro():
    """IPCA (indice), PTAX, querosene Golfo (US$/gal) e QAV real (R$/L de jan/2024, AvDataBr + ponte)."""
    m = pd.read_csv(EXT / 'macro_mensal.csv')
    m['idx_ipca'] = np.cumprod(1 + m.ipca_pct / 100)
    m = m.set_index('mes')
    defl24 = m.idx_ipca['2024-01'] / m.idx_ipca
    m['proxy_real'] = m.jet_usd_gal * m.ptax * defl24 / GAL_L
    av = pd.read_csv(EXT / 'qav_avdatabr.csv').set_index('mes')
    m = m.join(av, how='left')
    # ponte: ln QAV_real(t) = a + b ln proxy_real(t-1), estimada no periodo comum (AvDataBr vai ate 2023-12)
    x = np.log(m.proxy_real).shift(1)
    ok = x.notna() & m.qav_avdatabr.notna()
    b, a = np.polyfit(x[ok], np.log(m.qav_avdatabr[ok]), 1)
    resid = np.log(m.qav_avdatabr[ok]) - (a + b * x[ok])
    m['qav_real24'] = m.qav_avdatabr.where(m.qav_avdatabr.notna(), np.exp(a + b * x))
    m.attrs['ponte'] = {'a': float(a), 'b': float(b), 'r2': float(1 - resid.var() / np.log(m.qav_avdatabr[ok]).var()),
                        'dp_resid': float(resid.std()), 'n': int(ok.sum())}
    return m


def carregar(mes_base=None):
    """Painel com tarifa real. Valores reais em R$ do mes_base (padrao: ultimo mes da ANAC)."""
    p = pd.read_parquet(DADOS / 'painel.parquet')
    for c in ('empresa', 'origem', 'destino'):
        p[c] = p[c].astype(str)
    p['periodo'] = p.ano.astype(str) + '-' + p.mes.astype(int).map('{:02d}'.format)
    m = macro()
    mes_base = mes_base or p.periodo.max()
    fator = m.idx_ipca[mes_base] / m.idx_ipca
    p['fator'] = p.periodo.map(fator)
    if p.fator.isna().any():
        raise SystemExit('IPCA faltando para algum mes do painel')
    p['receita_real'] = p.receita * p.fator
    p['grupo'] = p.empresa.map(grupo)
    a, b = np.minimum(p.origem, p.destino), np.maximum(p.origem, p.destino)
    p['rota'] = a + '-' + b
    return p, m, mes_base


def haversine(o, d):
    la1, lo1, la2, lo2 = map(np.radians, [o[0], o[1], d[0], d[1]])
    h = np.sin((la2 - la1) / 2) ** 2 + np.cos(la1) * np.cos(la2) * np.sin((lo2 - lo1) / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(h))


def rotulo(icao):
    a = AEROPORTOS.get(icao)
    return f'{a[1]}' if a else icao


def cidade(icao):
    a = AEROPORTOS.get(icao)
    return a[0] if a else icao


def distancia(rota):
    o, d = rota.split('-')
    if o in AEROPORTOS and d in AEROPORTOS:
        return float(haversine(AEROPORTOS[o][2:], AEROPORTOS[d][2:]))
    return np.nan
