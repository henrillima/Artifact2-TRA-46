# -*- coding: utf-8 -*-
"""
Parametros economicos dos simuladores (painel rota x mes, valores reais):

1. Repasse do custo de combustivel para a tarifa (elasticidade da tarifa ao QAV real, com interacao por distancia).
2. Elasticidade-preco da demanda por variaveis instrumentais (2SLS): instrumento = QAV(t-1) x ln(distancia),
   com efeitos fixos de rota e de mes (o nivel nacional do QAV e absorvido pelo efeito de mes; identifica-se
   pela exposicao diferente das rotas ao custo de combustivel).
3. Associacao entre concentracao (HHI) e tarifa na mesma rota ao longo do tempo (efeitos fixos de rota e mes).

Saida: dados/saida/parametros.json
"""
import json

import numpy as np
import pandas as pd

from base import SAIDA, distancia

CHOQUE = ('2020-03', '2021-12')


def demean2(df, cols, g1, g2, w=None, iters=50, tol=1e-10):
    """Remove efeitos fixos de dois grupos por projecoes alternadas (com pesos opcionais)."""
    out = df[cols].astype(float).copy()
    ww = np.ones(len(df)) if w is None else w
    for _ in range(iters):
        prev = out.values.copy()
        for g in (g1, g2):
            m = (out.mul(ww, axis=0)).groupby(df[g]).transform('sum').div(
                pd.Series(ww, index=df.index).groupby(df[g]).transform('sum'), axis=0)
            out = out - m
        if np.abs(out.values - prev).max() < tol:
            break
    return out


def ols_cluster(X, y, cl, w=None):
    X, y = np.asarray(X, float), np.asarray(y, float)
    if w is None:
        w = np.ones(len(y))
    sw = np.sqrt(w)
    Xw, yw = X * sw[:, None], y * sw
    XtXi = np.linalg.inv(Xw.T @ Xw)
    b = XtXi @ Xw.T @ yw
    u = yw - Xw @ b
    meat = np.zeros((X.shape[1], X.shape[1]))
    for g in np.unique(cl):
        idx = cl == g
        s = Xw[idx].T @ u[idx]
        meat += np.outer(s, s)
    G = len(np.unique(cl))
    V = XtXi @ meat @ XtXi * G / (G - 1)
    return b, np.sqrt(np.diag(V))


def tsls_cluster(y, xend, z, cl):
    """2SLS com um regressor endogeno e um instrumento (variaveis ja sem efeitos fixos)."""
    y, x, z = map(lambda a: np.asarray(a, float), (y, xend, z))
    pi = (z @ x) / (z @ z)
    xh = z * pi
    beta = (xh @ y) / (xh @ x)
    u = y - x * beta
    # erro-padrao robusto por cluster
    num = 0.0
    for g in np.unique(cl):
        idx = cl == g
        num += (xh[idx] @ u[idx]) ** 2
    G = len(np.unique(cl))
    se = np.sqrt(num / (xh @ x) ** 2 * G / (G - 1))
    # F do primeiro estagio (robusto por cluster)
    v = x - z * pi
    num1 = 0.0
    for g in np.unique(cl):
        idx = cl == g
        num1 += (z[idx] @ v[idx]) ** 2
    se_pi = np.sqrt(num1 / (z @ z) ** 2 * G / (G - 1))
    return beta, se, (pi / se_pi) ** 2


def main():
    s = pd.read_parquet(SAIDA / 'serie_todas_rotas.parquet')
    m = pd.read_csv(SAIDA / 'macro.csv').set_index('mes')
    r = s[s.nivel == 'rota'].copy()
    # rotas com historico razoavel e distancia conhecida
    cont = r.groupby('chave').periodo.count()
    r = r[r.chave.isin(cont[cont >= 36].index)]
    dist = {k: distancia(k) for k in r.chave.unique()}
    r['dist'] = r.chave.map(dist)
    r = r[r.dist.notna() & (r.assentos >= 300)].copy()
    per = pd.PeriodIndex(r.periodo, freq='M')
    q = np.log(m.qav_real24)
    q.index = pd.PeriodIndex(q.index, freq='M')
    r['lqav1'] = (per - 1).map(q).values
    r['ldist'] = np.log(r.dist) - np.log(r.dist).mean()
    r['ly'] = np.log(r.tarifa_real)
    r['lq'] = np.log(r.assentos)
    r['choque'] = r.periodo.between(*CHOQUE)
    r['moy'] = per.month
    r['t'] = (per.year - 2020) * 12 + per.month
    r = r.dropna(subset=['lqav1'])
    cl = r.chave.astype('category').cat.codes.values
    res = {'amostra': {'rotas': int(r.chave.nunique()), 'obs': int(len(r)),
                       'periodo': [r.periodo.min(), r.periodo.max()]}}

    # ---- 1. Repasse: FE de rota; mes do ano; tendencia; dummies de cada mes da pandemia
    X = pd.DataFrame({'lqav1': r.lqav1, 'lqav1_x_ldist': r.lqav1 * r.ldist, 't': r.t / 12})
    X = X.join(pd.get_dummies(r.moy, prefix='m', drop_first=True).astype(float))
    X = X.join(pd.get_dummies(r.periodo.where(r.choque, 'normal'), prefix='c').drop(columns='c_normal').astype(float))
    df = X.assign(ly=r.ly, rota=r.chave.values, um=1)
    dm = demean2(df.assign(um=0), list(X.columns) + ['ly'], 'rota', 'um', w=r.assentos.values)
    b, se = ols_cluster(dm[X.columns].values, dm.ly.values, cl, w=r.assentos.values)
    res['repasse'] = {'elasticidade_media': float(b[0]), 'ep': float(se[0]),
                      'interacao_ldist': float(b[1]), 'ep_interacao': float(se[1]),
                      'nota': 'Elasticidade da tarifa real ao QAV real do mês anterior, na distância média; '
                              'efeito fixo de rota, sazonalidade, tendência e um indicador por mês da pandemia.'}
    for km in (400, 800, 1500, 2500):
        ld = np.log(km) - np.log(r.dist).mean()
        res['repasse'][f'elasticidade_{km}km'] = float(b[0] + b[1] * ld)

    # ---- 2. Demanda (2SLS): FE de rota e de mes; instrumento QAV(t-1) x ln(dist)
    df2 = pd.DataFrame({'lq': r.lq, 'ly': r.ly, 'z': r.lqav1 * r.ldist, 'rota': r.chave.values, 'mes': r.periodo.values})
    df2 = df2[~r.choque.values]
    cl2 = df2.rota.astype('category').cat.codes.values
    dm2 = demean2(df2, ['lq', 'ly', 'z'], 'rota', 'mes')
    beta, se_b, F = tsls_cluster(dm2.lq, dm2.ly, dm2.z, cl2)
    b_ols, se_ols = ols_cluster(dm2[['ly']].values, dm2.lq.values, cl2)
    res['demanda'] = {'elasticidade_2sls': float(beta), 'ep': float(se_b), 'F_primeiro_estagio': float(F),
                      'elasticidade_mqo': float(b_ols[0]), 'ep_mqo': float(se_ols[0]),
                      'nota': 'ln(assentos) em ln(tarifa real); efeitos fixos de rota e de mês; fora da pandemia; '
                              'instrumento = ln QAV(t−1) × ln distância; erros-padrão por rota.'}

    # ---- 2b. Demanda (2SLS) com instrumento nacional: QAV(t-1); FE de rota, sazonalidade, tendencia, pandemia
    W = pd.DataFrame({'t': r.t / 12}, index=r.index)
    W = W.join(pd.get_dummies(r.moy, prefix='m', drop_first=True).astype(float))
    W = W.join(pd.get_dummies(r.periodo.where(r.choque, 'normal'), prefix='c').drop(columns='c_normal').astype(float))
    base4 = W.assign(lq=r.lq, ly=r.ly, z=r.lqav1, rota=r.chave.values, um=0)
    dm4 = demean2(base4, list(W.columns) + ['lq', 'ly', 'z'], 'rota', 'um')
    # parcial dos controles W (FWL)
    Wm = dm4[W.columns].values
    P = lambda v: v - Wm @ np.linalg.lstsq(Wm, v, rcond=None)[0]
    lq4, ly4, z4 = P(dm4.lq.values), P(dm4.ly.values), P(dm4.z.values)
    beta4, se4, F4 = tsls_cluster(lq4, ly4, z4, cl)
    res['demanda'].update({'elasticidade_2sls_nacional': float(beta4), 'ep_nacional': float(se4),
                           'F_nacional': float(F4),
                           'nota_nacional': 'Instrumento = ln QAV(t−1) nacional; efeito fixo de rota, sazonalidade, '
                                            'tendência e um indicador por mês da pandemia. Supõe que o custo do '
                                            'combustível (petróleo e câmbio) não responde a choques de demanda doméstica.'})

    # ---- 2c. Robustez do instrumento nacional: efeito fixo de ano (absorve mudancas de cobertura da base da ANAC
    #          entre anos) e janela so desde 2020 (mesma base do ARTEF1)
    def iv_nacional(mask, ano_fe):
        rr = r[mask]
        Wr = pd.DataFrame(index=rr.index) if ano_fe else pd.DataFrame({'t': rr.t / 12}, index=rr.index)
        if ano_fe:
            Wr = Wr.join(pd.get_dummies(rr.periodo.str[:4], prefix='a', drop_first=True).astype(float))
        Wr = Wr.join(pd.get_dummies(rr.moy, prefix='m', drop_first=True).astype(float))
        Wr = Wr.join(pd.get_dummies(rr.periodo.where(rr.choque, 'normal'), prefix='c').drop(columns='c_normal', errors='ignore').astype(float))
        bb = Wr.assign(lq=rr.lq, ly=rr.ly, z=rr.lqav1, rota=rr.chave.values, um=0)
        dd = demean2(bb, list(Wr.columns) + ['lq', 'ly', 'z'], 'rota', 'um')
        Wm_ = dd[Wr.columns].values
        P_ = lambda v: v - Wm_ @ np.linalg.lstsq(Wm_, v, rcond=None)[0]
        b_, s_, F_ = tsls_cluster(P_(dd.lq.values), P_(dd.ly.values), P_(dd.z.values), rr.chave.astype('category').cat.codes.values)
        return {'elasticidade': float(b_), 'ep': float(s_), 'F': float(F_), 'obs': int(len(rr)),
                'periodo': [rr.periodo.min(), rr.periodo.max()], 'controle_tempo': 'efeito fixo de ano' if ano_fe else 'tendencia linear'}
    tudo = np.ones(len(r), bool)
    res['demanda']['robustez'] = {
        'tendencia_amostra_toda': iv_nacional(tudo, False),
        'ano_fe_amostra_toda': iv_nacional(tudo, True),
        'tendencia_desde_2020': iv_nacional((r.periodo >= '2020-01').values, False),
    }

    # ---- 3. Concentracao e tarifa (associacao, nao causal)
    df3 = pd.DataFrame({'ly': r.ly, 'hhi': r.hhi, 'rota': r.chave.values, 'mes': r.periodo.values}).dropna()
    df3 = df3[~df3.mes.between(*CHOQUE)]
    cl3 = df3.rota.astype('category').cat.codes.values
    dm3 = demean2(df3, ['ly', 'hhi'], 'rota', 'mes')
    b3, se3 = ols_cluster(dm3[['hhi']].values, dm3.ly.values, cl3)
    res['hhi'] = {'semi_elasticidade': float(b3[0]), 'ep': float(se3[0]),
                  'nota': 'ln(tarifa real) no HHI (0 a 1) da rota; efeitos fixos de rota e de mês; fora da pandemia. '
                          'Associação: o HHI é endógeno (entrada e saída respondem a demanda e custo).'}
    (SAIDA / 'parametros.json').write_text(json.dumps(res, indent=2, ensure_ascii=False))
    print(json.dumps(res, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
