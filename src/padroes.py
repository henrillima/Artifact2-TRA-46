# -*- coding: utf-8 -*-
"""
Aprendizado nao supervisionado e deteccao de anomalias (TRA-48, Aulas 1 a 3 e 6):
1. Segmentacao das rotas por k-medias (k escolhido pela silhueta, com o metodo do cotovelo ao lado),
   conferida por clusterizacao hierarquica (average linkage, como no Lab 2) e por mistura gaussiana com o numero
   de componentes escolhido pelo BIC (Aula 3). PCA para visualizar, correlograma dos atributos e boxplots por
   segmento (Aula 1).
2. Deteccao de anomalias nos aeroportos pelos quatro enfoques da Aula 6 (estatistico: mistura gaussiana e escore
   robusto; distancia/densidade: LOF; clusterizacao: distancia ao centroide do k-medias) e pela floresta de
   isolamento (extra). Avaliacao contra eventos conhecidos (precisao, recall, F1, curva ROC) e classificadores
   supervisionados com classes desbalanceadas (regressao logistica, arvore e SVM com pesos, como no Lab 6).
3. Biblioteca de choques de demanda (pandemia, enchente no RS).

Saidas (dados/saida): rotas_clusters.csv, clusters.json, anomalias.csv, anomalias_avaliacao.json, eventos.json
"""
import json

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import dendrogram, fcluster, linkage
from scipy.optimize import linear_sum_assignment
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (adjusted_rand_score, confusion_matrix, f1_score, precision_score, recall_score,
                             roc_auc_score, roc_curve, silhouette_score)
from sklearn.mixture import GaussianMixture
from sklearn.model_selection import KFold, train_test_split
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

CHOQUE = ('2020-03', '2021-12')   # mesma janela da pandemia usada na previsao e na econometria

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
    # k-medias (k-means++ com varias inicializacoes): cotovelo (inercia) e silhueta para k de 2 a 8;
    # a escolha usa a silhueta entre 3 e 7 grupos (com 2 grupos a segmentacao so separa curtas de longas)
    sil, inercia = {}, {}
    for k in range(2, 9):
        kmk = KMeans(n_clusters=k, n_init=20, random_state=0).fit(Z)
        sil[k] = float(silhouette_score(Z, kmk.labels_))
        inercia[k] = float(kmk.inertia_)
    k = max((x for x in sil if 3 <= x <= 7), key=sil.get)
    km = KMeans(n_clusters=k, n_init=50, random_state=0).fit(Z)
    f['cluster'] = km.labels_
    gm = GaussianMixture(n_components=k, n_init=5, random_state=0).fit(Z)
    concord = pd.crosstab(f.cluster, gm.predict(Z))
    acordo = float(concord.max(axis=1).sum() / len(f))
    # mistura gaussiana: numero de componentes pelo BIC (Aula 3), covariancia completa e diagonal
    bic = {cov: {n: float(GaussianMixture(n_components=n, covariance_type=cov, n_init=5, random_state=0).fit(Z).bic(Z))
                 for n in range(1, 9)} for cov in ('full', 'diag')}
    cov_b, n_b = min(((c, n) for c in bic for n in bic[c]), key=lambda x: bic[x[0]][x[1]])
    gm_b = GaussianMixture(n_components=n_b, covariance_type=cov_b, n_init=5, random_state=0).fit(Z)
    ari_gmm = float(adjusted_rand_score(f.cluster, gm_b.predict(Z)))
    # hierarquica aglomerativa (Lab 2: distancia euclidiana, average linkage) e comparacao com outros criterios
    hier = {}
    for met in ('average', 'complete', 'single', 'ward'):
        L = linkage(Z, method=met, metric='euclidean')
        lab_h = fcluster(L, t=k, criterion='maxclust')
        hier[met] = {'ari_kmedias': float(adjusted_rand_score(f.cluster, lab_h)),
                     'tamanhos': sorted(np.bincount(lab_h)[1:].tolist(), reverse=True),
                     'alturas_ultimas_fusoes': [float(x) for x in L[-10:, 2][::-1]]}
        if met == 'average':
            dd = dendrogram(L, truncate_mode='lastp', p=30, no_plot=True)
            dendro = {'icoord': dd['icoord'], 'dcoord': dd['dcoord'], 'folhas': dd['ivl'],
                      'corte': float((L[-k, 2] + L[-k + 1, 2]) / 2)}
    # PCA para visualizar os grupos em 2 dimensoes (Labs 1 e 2)
    pca = PCA(n_components=min(len(f.columns) - 1, 7)).fit(Z)
    pc = pca.transform(Z)[:, :2]
    var_cols = list(f.columns.drop('cluster'))
    pca_info = {'variancia': [float(x) for x in pca.explained_variance_ratio_],
                'cargas': {v: [float(pca.components_[0, i]), float(pca.components_[1, i])] for i, v in enumerate(var_cols)},
                'pontos': [{'rota': r_, 'pc1': float(a), 'pc2': float(b), 'cluster': int(c)}
                           for r_, (a, b), c in zip(f.index, pc, f.cluster)]}
    correl = f[var_cols].corr().round(3)
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
    # boxplots por segmento (Aula 1): cinco numeros de cada variavel, por rota
    def caixa(v):
        v = np.asarray(v, float)
        q1, q2, q3 = np.percentile(v, [25, 50, 75])
        iqr = q3 - q1
        dentro = v[(v >= q1 - 1.5 * iqr) & (v <= q3 + 1.5 * iqr)]
        return {'q1': float(q1), 'mediana': float(q2), 'q3': float(q3), 'min': float(dentro.min()),
                'max': float(dentro.max()), 'fora': [float(x) for x in v[(v < q1 - 1.5 * iqr) | (v > q3 + 1.5 * iqr)]],
                'n': int(len(v))}
    bx = out.assign(tarifa_km=out.tarifa_real / out.distancia_km, hhi_=np.nan)
    bx['hhi_'] = f.hhi
    caixas = {var: {nomes[c]: caixa(g[var].dropna()) for c, g in bx.groupby('cluster')}
              for var in ('tarifa_real', 'distancia_km', 'tarifa_km', 'hhi_')}
    info = {'k': k, 'silhueta': sil, 'inercia': inercia, 'acordo_gmm': acordo,
            'gmm_bic': {'bic': bic, 'escolhido': {'covariancia': cov_b, 'componentes': n_b}, 'ari_kmedias': ari_gmm},
            'hierarquica': hier, 'dendrograma': dendro, 'pca': pca_info,
            'correlacao': {'variaveis': var_cols, 'matriz': correl.values.tolist()}, 'caixas': caixas,
            'centroides': cent.reset_index().to_dict(orient='records'),
            'variaveis': var_cols}
    (SAIDA / 'clusters.json').write_text(json.dumps(info, indent=2, ensure_ascii=False))
    print(f'k={k} silhueta={sil} acordo GMM={acordo:.2f}')
    print('inercia', {a: round(b, 1) for a, b in inercia.items()})
    print('BIC escolhido', cov_b, n_b, 'ARI com k-medias', round(ari_gmm, 3))
    print('hierarquica', {m: (round(h['ari_kmedias'], 3), h['tamanhos']) for m, h in hier.items()})
    print('PCA variancia', [round(x, 3) for x in pca.explained_variance_ratio_])
    print(cent.round(3).to_string())


def _roc(y, sc, n=60):
    fpr, tpr, _ = roc_curve(y, sc)
    idx = np.unique(np.linspace(0, len(fpr) - 1, n).astype(int))
    return [{'fpr': float(fpr[i]), 'tpr': float(tpr[i])} for i in idx]


def _metricas(y, pred, sc):
    cm = confusion_matrix(y, pred, labels=[0, 1])
    return {'matriz_confusao': cm.tolist(), 'acuracia': float((cm[0, 0] + cm[1, 1]) / cm.sum()),
            'precisao': float(precision_score(y, pred, zero_division=0)), 'recall': float(recall_score(y, pred)),
            'f1': float(f1_score(y, pred)), 'auc': float(roc_auc_score(y, sc)), 'roc': _roc(y, sc), 'n': int(len(y))}


def avaliar_anomalias(d, X):
    """Escores de anomalia pelos enfoques da Aula 6 e avaliacao contra eventos conhecidos.

    Rotulos (definidos pelo grupo): pandemia = todos os aeroportos de mar/2020 a dez/2021 (mesma janela usada
    no resto do projeto); enchente no RS = Porto Alegre (SBPA) de mai/2024 a out/2024, enquanto o Salgado Filho
    ficou fechado para voos comerciais. Os demais aeroportos-mes contam como normais.
    """
    Z = StandardScaler().fit_transform(X)
    per = d.periodo.values
    y = (((per >= CHOQUE[0]) & (per <= CHOQUE[1])) |
         ((d.aero.values == 'SBPA') & (per >= '2024-05') & (per <= '2024-10'))).astype(int)
    d['evento_conhecido'] = y.astype(bool)
    # densidade local (LOF)
    lof = LocalOutlierFactor(n_neighbors=20)
    lof.fit(Z)
    d['escore_lof'] = -lof.negative_outlier_factor_
    # clusterizacao: distancia ao centroide mais proximo do k-medias (k pela silhueta)
    silk = {k: silhouette_score(Z, KMeans(n_clusters=k, n_init=10, random_state=0).fit_predict(Z),
                                sample_size=min(3000, len(Z)), random_state=0) for k in range(2, 9)}
    k_an = max(silk, key=silk.get)
    km = KMeans(n_clusters=k_an, n_init=20, random_state=0).fit(Z)
    d['escore_kmedias'] = np.min(km.transform(Z), axis=1)
    # estatistico: mistura gaussiana (componentes pelo BIC); anomalia = baixa densidade
    bics = {n: GaussianMixture(n_components=n, n_init=3, random_state=0).fit(Z).bic(Z) for n in range(1, 9)}
    n_an = min(bics, key=bics.get)
    gm = GaussianMixture(n_components=n_an, n_init=3, random_state=0).fit(Z)
    d['escore_gmm'] = -gm.score_samples(Z)
    d['escore_z'] = d.z_robusto.abs().fillna(0)
    detectores = {'gmm': 'Mistura gaussiana (estatístico)', 'z': 'Escore robusto (mediana e MAD)',
                  'lof': 'LOF (densidade local)', 'kmedias': 'Distância ao centroide (k-médias)',
                  'isolamento': 'Floresta de isolamento (extra)'}
    nao_sup = {}
    for c, nome in detectores.items():
        sc = d[f'escore_{c}'].values
        corte = np.quantile(sc, 0.98)                       # mesma taxa de alerta para todos: 2% dos aeroportos-mes
        nao_sup[c] = {'nome': nome, **_metricas(y, (sc >= corte).astype(int), sc)}
    # supervisionado com classes desbalanceadas (Lab 6): 75% treino / 25% teste, pesos inversos a frequencia
    idx = np.arange(len(y))
    tr, te = train_test_split(idx, test_size=0.25, random_state=0, stratify=y)
    freq = np.bincount(y[tr]) / len(tr)
    pesos = {0: 1 / freq[0], 1: 1 / freq[1]}
    w_tr = np.where(y[tr] == 1, pesos[1], pesos[0])
    sc_ = StandardScaler().fit(X[tr])
    Xtr, Xte = sc_.transform(X[tr]), sc_.transform(X[te])
    sup = {}
    lg = LogisticRegression(class_weight=pesos, max_iter=2000).fit(Xtr, y[tr])
    sup['logistica'] = {'nome': 'Regressão logística', **_metricas(y[te], lg.predict(Xte), lg.predict_proba(Xte)[:, 1]),
                        'coeficientes': dict(zip(['rel_mov', 'rel_tarifa', 'yoy_mov', 'yoy_tarifa', 'intercepto'],
                                                 [float(v) for v in [*lg.coef_[0], lg.intercept_[0]]]))}
    # arvore: poda por custo-complexidade escolhida por validacao cruzada 5-fold (como cv.tree no Lab 6)
    path = DecisionTreeClassifier(random_state=0).cost_complexity_pruning_path(Xtr, y[tr], sample_weight=w_tr)
    alfas = np.unique(np.quantile(path.ccp_alphas, np.linspace(0, 0.99, 15)))
    kf = KFold(5, shuffle=True, random_state=0)
    def erro_cv(a):
        e = []
        for i_tr, i_va in kf.split(Xtr):
            t = DecisionTreeClassifier(ccp_alpha=a, random_state=0).fit(Xtr[i_tr], y[tr][i_tr], sample_weight=w_tr[i_tr])
            e.append(np.average(t.predict(Xtr[i_va]) != y[tr][i_va], weights=w_tr[i_va]))
        return float(np.mean(e))
    curva_arv = [{'ccp_alpha': float(a), 'erro_cv': erro_cv(a)} for a in alfas]
    a_b = min(curva_arv, key=lambda c: c['erro_cv'])['ccp_alpha']
    arv = DecisionTreeClassifier(ccp_alpha=a_b, random_state=0).fit(Xtr, y[tr], sample_weight=w_tr)
    sup['arvore'] = {'nome': 'Árvore de decisão (poda por CV)', **_metricas(y[te], arv.predict(Xte), arv.predict_proba(Xte)[:, 1]),
                     'folhas': int(arv.get_n_leaves()), 'curva_cv': curva_arv}
    # SVM: kernel e C escolhidos por validacao cruzada 5-fold (como tune() no Lab 6), class.weights inversos
    grade = [(kr, C) for kr in ('linear', 'rbf') for C in (0.1, 1, 10)]
    def erro_svm(kr, C):
        e = []
        for i_tr, i_va in kf.split(Xtr):
            m = SVC(kernel=kr, C=C, class_weight=pesos).fit(Xtr[i_tr], y[tr][i_tr])
            e.append(np.average(m.predict(Xtr[i_va]) != y[tr][i_va], weights=w_tr[i_va]))
        return float(np.mean(e))
    curva_svm = [{'kernel': kr, 'C': C, 'erro_cv': erro_svm(kr, C)} for kr, C in grade]
    b = min(curva_svm, key=lambda c: c['erro_cv'])
    svm = SVC(kernel=b['kernel'], C=b['C'], class_weight=pesos).fit(Xtr, y[tr])
    sup['svm'] = {'nome': f"SVM (kernel {b['kernel']}, C = {b['C']})",
                  **_metricas(y[te], svm.predict(Xte), svm.decision_function(Xte)), 'curva_cv': curva_svm}
    res = {'rotulos': 'Pandemia: todos os aeroportos de mar/2020 a dez/2021. Enchente no RS: Porto Alegre (SBPA) de '
                      'mai/2024 a out/2024. Os demais aeroportos-mês contam como normais.',
           'n': int(len(y)), 'positivos': int(y.sum()), 'taxa_alerta': 0.02,
           'k_kmedias': int(k_an), 'componentes_gmm': int(n_an),
           'nao_supervisionado': nao_sup, 'supervisionado': sup,
           'divisao': '75% treino / 25% teste, estratificada; pesos inversos à frequência das classes no treino',
           'variaveis': ['rel_mov', 'rel_tarifa', 'yoy_mov', 'yoy_tarifa']}
    (SAIDA / 'anomalias_avaliacao.json').write_text(json.dumps(res, ensure_ascii=False, indent=1))
    for c, v in {**nao_sup, **sup}.items():
        print(f"{v['nome']:45s} prec {v['precisao']:.2f} rec {v['recall']:.2f} F1 {v['f1']:.2f} AUC {v['auc']:.3f}")


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
    avaliar_anomalias(d, X)
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
