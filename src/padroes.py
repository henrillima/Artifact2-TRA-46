# -*- coding: utf-8 -*-
"""
Aprendizado nao supervisionado (TRA-48):
1. Segmentacao das rotas por k-medias (k escolhido pela silhueta), conferida por mistura gaussiana.
2. Deteccao de anomalias nos aeroportos (floresta de isolamento + escore robusto) e biblioteca de choques
   de demanda (pandemia, enchente no RS e outros eventos detectados).

Saidas (dados/saida): rotas_clusters.csv, clusters.json, anomalias.csv, eventos.json
"""
import json

import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from sklearn.metrics import silhouette_score
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler

from base import SAIDA, carregar, distancia, rotulo, cidade


def clusters():
    s = pd.read_parquet(SAIDA / 'serie_todas_rotas.parquet')
    att = pd.read_csv(SAIDA / 'rotas.csv').set_index('rota')
    r = s[s.nivel == 'rota']
    per = sorted(r.periodo.unique())
    r24 = r[r.periodo.isin(per[-24:])]
    top = att.index[:300]
    r24 = r24[r24.chave.isin(top)]
    f = pd.DataFrame(index=top)
    f['ln_dist'] = np.log([distancia(k) for k in top])
    g = r24.groupby('chave')
    f['ln_assentos_mes'] = np.log(g.assentos.mean())
    f['ln_tarifa_km'] = np.log(g.apply(lambda x: (x.receita_real.sum() / x.assentos.sum())) / np.exp(f.ln_dist))
    ly = r24.assign(ly=np.log(r24.tarifa_real), moy=r24.periodo.str[5:7])
    saz = ly.groupby(['chave', 'moy']).ly.mean()
    f['sazonalidade'] = saz.groupby(level=0).std()
    f['volatilidade'] = ly.sort_values('periodo').groupby('chave').ly.apply(lambda x: x.diff().std())
    f['hhi'] = g.hhi.mean()
    # crescimento: ultimos 12 meses contra os 12 anteriores (o ultimo ano pode estar incompleto)
    a1 = r24[r24.periodo.isin(per[-12:])].groupby('chave').assentos.sum()
    a0 = r24[r24.periodo.isin(per[-24:-12])].groupby('chave').assentos.sum()
    f['crescimento'] = np.log(a1 / a0).clip(-1, 1)
    f = f.replace([np.inf, -np.inf], np.nan).dropna()
    Z = StandardScaler().fit_transform(f)
    sil = {}
    for k in range(3, 8):
        lab = KMeans(n_clusters=k, n_init=20, random_state=0).fit_predict(Z)
        sil[k] = float(silhouette_score(Z, lab))
    k = max(sil, key=sil.get)
    km = KMeans(n_clusters=k, n_init=50, random_state=0).fit(Z)
    f['cluster'] = km.labels_
    gm = GaussianMixture(n_components=k, n_init=5, random_state=0).fit(Z)
    concord = pd.crosstab(f.cluster, gm.predict(Z))
    acordo = float(concord.max(axis=1).sum() / len(f))
    cent = f.groupby('cluster').mean()
    # nomes por regra (estaveis entre reprocessamentos)
    nomes, livres = {}, list(cent.index)
    # nomes: cada grupo recebe o arquetipo que melhor descreve o centroide padronizado (atribuicao otima)
    zc = pd.DataFrame(Z, index=f.index, columns=[c for c in f.columns if c != 'cluster']).groupby(f.cluster).mean()
    arq = {'Troncais de alta densidade': zc.ln_assentos_mes,
           'Longa distância': zc.ln_dist,
           'Turísticas e sazonais': zc.sazonalidade,
           'Curtas e concentradas': (zc.hhi - zc.ln_dist) / 2}
    M = pd.DataFrame(arq)
    lin, col = linear_sum_assignment(-M.values)
    for a, b in zip(lin, col):
        nomes[M.index[a]] = M.columns[b]
    for c in cent.index:
        nomes.setdefault(c, f'Segmento {c + 1}')
    cent['n_rotas'] = f.groupby('cluster').size()
    cent['assentos_12m'] = att.loc[f.index].groupby(f.cluster).assentos.sum()
    cent['tarifa_real'] = att.loc[f.index].groupby(f.cluster).apply(lambda x: x.receita_real.sum() / x.assentos.sum())
    cent['dist_km'] = np.exp(cent.ln_dist)
    cent['nome'] = cent.index.map(nomes)
    f['segmento'] = f.cluster.map(nomes)
    out = f.join(att[['nome', 'cidades', 'assentos', 'tarifa_real', 'distancia_km']])
    out.reset_index().rename(columns={'index': 'rota'}).to_csv(SAIDA / 'rotas_clusters.csv', index=False)
    info = {'k': k, 'silhueta': sil, 'acordo_gmm': acordo,
            'centroides': cent.reset_index().to_dict(orient='records'),
            'variaveis': list(f.columns.drop('cluster'))}
    (SAIDA / 'clusters.json').write_text(json.dumps(info, indent=2, ensure_ascii=False))
    print(f'k={k} silhueta={sil} acordo GMM={acordo:.2f}')
    print(cent.round(3).to_string())


def anomalias_e_eventos():
    p, m, base = carregar()
    # assentos por aeroporto (origem + destino) e mes; tarifa media das partidas
    a1 = p.groupby(['periodo', 'origem']).agg(assentos=('assentos', 'sum'), receita=('receita_real', 'sum'))
    a2 = p.groupby(['periodo', 'destino']).assentos.sum()
    a1.index.names = ['periodo', 'aero']
    a2.index.names = ['periodo', 'aero']
    ae = a1.join(a2.rename('assentos_d'), how='outer').fillna(0)
    ae['mov'] = ae.assentos + ae.assentos_d
    ae['tarifa'] = ae.receita / ae.assentos.replace(0, np.nan)
    ae = ae.reset_index()
    tops = ae.groupby('aero').mov.sum().sort_values(ascending=False).index[:40]
    ae = ae[ae.aero.isin(tops)].sort_values(['aero', 'periodo'])
    nac = p.groupby('periodo').agg(mov=('assentos', 'sum'), receita=('receita_real', 'sum'))
    nac['tarifa'] = nac.receita / nac.mov
    for c in ('mov', 'tarifa'):
        ae[f'yoy_{c}'] = ae.groupby('aero')[c].transform(lambda x: np.log(x).diff(12))
        nyoy = np.log(nac[c]).diff(12)
        ae[f'rel_{c}'] = ae[f'yoy_{c}'] - ae.periodo.map(nyoy)
    d = ae.dropna(subset=['yoy_mov', 'yoy_tarifa', 'rel_mov', 'rel_tarifa']).copy()
    X = d[['rel_mov', 'rel_tarifa', 'yoy_mov', 'yoy_tarifa']].values
    iso = IsolationForest(n_estimators=500, contamination=0.02, random_state=0).fit(X)
    d['escore_isolamento'] = -iso.score_samples(X)
    d['anomalo'] = iso.predict(X) == -1
    med = d.groupby('aero').rel_mov.transform('median')
    mad = d.groupby('aero').rel_mov.transform(lambda x: (x - x.median()).abs().median()) * 1.4826
    d['z_robusto'] = (d.rel_mov - med) / mad.replace(0, np.nan)
    d['aeroporto'] = d.aero.map(rotulo)
    d['cidade'] = d.aero.map(cidade)
    d.sort_values('escore_isolamento', ascending=False).to_csv(SAIDA / 'anomalias.csv', index=False)
    print(d[d.anomalo].sort_values('escore_isolamento', ascending=False)
          [['periodo', 'aeroporto', 'cidade', 'rel_mov', 'rel_tarifa', 'z_robusto', 'escore_isolamento']].head(25).to_string())

    # ---------- biblioteca de choques: trajetoria relativa ao contrafactual
    eventos = []
    # Pandemia (Brasil): contrafactual = media de jan-fev/2020 ajustada pela sazonalidade media de 2023-2025
    nac = nac.sort_index()
    ln = np.log(nac[['mov', 'tarifa']])
    moy = pd.Series([int(x[5:7]) for x in ln.index], index=ln.index)
    pre = sorted({x[:4] for x in ln.index if x < '2020'})
    if len(pre) >= 3:   # com a base desde 2015: sazonalidade pre-pandemia e nivel de 2019 + jan-fev/2020
        anos_saz, base0 = pre, [x for x in ln.index if '2019-01' <= x <= '2020-02']
        nota = f'Contrafactual: nível de jan/2019 a fev/2020 com a sazonalidade média de {pre[0]} a {pre[-1]}.'
    else:
        anos_saz, base0 = ['2023', '2024', '2025'], ['2020-01', '2020-02']
        nota = 'Contrafactual: nível de jan-fev/2020 com a sazonalidade média de 2023 a 2025.'
    janela = ln.index.str[:4].isin(anos_saz)
    saz = ln[janela].groupby(moy[janela]).mean() - ln[janela].mean()
    nivel0 = ln.loc[base0].sub(saz.loc[[int(x[5:7]) for x in base0]].values).mean()
    meses = [x for x in ln.index if '2020-03' <= x <= '2022-02']
    traj = [{'k': i, 'periodo': t,
             'assentos': float(np.exp(ln.mov[t] - (nivel0.mov + saz.mov[int(t[5:7])]))),
             'tarifa': float(np.exp(ln.tarifa[t] - (nivel0.tarifa + saz.tarifa[int(t[5:7])])))}
            for i, t in enumerate(meses)]
    eventos.append({'id': 'pandemia', 'nome': 'Pandemia de covid-19 (Brasil)', 'escopo': 'brasil', 'inicio': '2020-03',
                    'trajetoria': traj,
                    'nota': nota})
    # Eventos locais: contrafactual = mesmo mes do ano anterior x variacao nacional em 12 meses
    for aero, ini, nome in [('SBPA', '2024-05', 'Enchente no Rio Grande do Sul (Porto Alegre)')]:
        x = ae[ae.aero == aero].set_index('periodo')
        ms = [t for t in x.index if t >= ini][:13]
        traj = [{'k': i, 'periodo': t, 'assentos': float(np.exp(x.rel_mov[t])), 'tarifa': float(np.exp(x.rel_tarifa[t]))}
                for i, t in enumerate(ms) if not np.isnan(x.rel_mov[t])]
        eventos.append({'id': f'local_{aero}_{ini}', 'nome': nome, 'escopo': 'aeroporto', 'aeroporto': aero,
                        'inicio': ini, 'trajetoria': traj,
                        'nota': 'Contrafactual: mesmo mês do ano anterior corrigido pela variação nacional em 12 meses.'})
    (SAIDA / 'eventos.json').write_text(json.dumps(eventos, indent=2, ensure_ascii=False))
    for e in eventos:
        print(e['nome'], [(t['periodo'], round(t['assentos'], 2), round(t['tarifa'], 2)) for t in e['trajetoria'][:8]])


if __name__ == '__main__':
    clusters()
    anomalias_e_eventos()
