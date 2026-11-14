# -*- coding: utf-8 -*-
"""
Previsao da tarifa real (Brasil, companhias, 60 maiores rotas) com selecao de modelos (TRA-48).

Modelos: sazonal ingenuo, suavizacao exponencial (Holt-Winters amortecido) e modelos supervisionados
globais (regressao ridge, arvore de decisao, floresta aleatoria, gradient boosting, kNN, SVM e rede neural MLP)
treinados no conjunto de series com atributos defasados. Validacao por origem movel (12 meses a frente)
e intervalos empiricos a partir dos erros de validacao, por horizonte.

Hiperparametros (como na TRA-48, Aulas 4 e 5): escolhidos por validacao cruzada k-fold (k = 5) dentro da base de
treino de cada origem, com os folds formados por blocos de meses consecutivos (para nao misturar meses vizinhos
entre treino e validacao): k do kNN, kernel e C do SVM, neuronios da rede, poda da arvore (custo-complexidade,
equivalente ao cv.tree/prune.tree do Lab 4) e penalidade da regressao ridge. Floresta e boosting ficam com
valores fixos (sao extras, fora do conteudo da disciplina).

Metricas de regressao da Aula 4: MAE, RMSE (em R$) e MAPE, alem da distribuicao dos erros (histograma e boxplot).

Saidas (dados/saida): previsao.csv, metricas_modelos.csv, validacao.csv, hiperparametros.json, erros_dist.json
"""
import json
import warnings

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.neighbors import KNeighborsRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR, LinearSVR
from sklearn.tree import DecisionTreeRegressor

from base import SAIDA

warnings.filterwarnings('ignore')
H = 12                      # horizonte de validacao
H_FINAL = 18                # horizonte da previsao publicada
CHOQUE = ('2020-03', '2021-12')   # periodo pandemico (indicador no treino)

# modelos supervisionados e grades de hiperparametros (escolha por CV k-fold em blocos de meses)
def _pipe(m):
    return make_pipeline(StandardScaler(), m)


MODELOS_ML = {
    'ridge': ('Regressão linear (ridge)', lambda p: _pipe(Ridge(alpha=p['alpha'])),
              [{'alpha': a} for a in (0.1, 1.0, 10.0, 100.0, 1000.0)]),
    'arvore': ('Árvore de decisão', lambda p: DecisionTreeRegressor(min_samples_leaf=5, ccp_alpha=p['ccp_alpha'], random_state=0),
               None),                                   # grade = caminho de poda da arvore completa (ver _grade_arvore)
    'floresta': ('Floresta aleatória', lambda p: RandomForestRegressor(n_estimators=300, min_samples_leaf=5,
                                                                      n_jobs=-1, random_state=0), [{}]),
    'boosting': ('Gradient boosting', lambda p: GradientBoostingRegressor(n_estimators=400, max_depth=3, learning_rate=0.03,
                                                                         subsample=0.8, random_state=0), [{}]),
    'knn': ('k vizinhos mais próximos', lambda p: _pipe(KNeighborsRegressor(n_neighbors=p['k'], weights='distance')),
            [{'k': k} for k in (5, 10, 15, 25, 40, 60)]),
    # kernel linear pelo LinearSVR (mesmo modelo, otimizador muito mais rapido para milhares de linhas)
    'svm': ('Máquina de vetores de suporte (SVR)', lambda p: _pipe(
        LinearSVR(C=p['C'], epsilon=0.01, loss='epsilon_insensitive', dual=True, max_iter=50000, random_state=0)
        if p['kernel'] == 'linear' else SVR(kernel=p['kernel'], C=p['C'], epsilon=0.01)),
            [{'kernel': kr, 'C': c} for kr in ('linear', 'rbf') for c in (0.1, 1.0, 10.0)]),
    'mlp': ('Rede neural (MLP)', lambda p: _pipe(MLPRegressor(hidden_layer_sizes=tuple(p['neuronios']), alpha=1e-3,
                                                              max_iter=3000, early_stopping=True, random_state=0)),
            [{'neuronios': n} for n in ([8], [16], [32], [32, 16], [64, 32])]),
}
K_FOLDS = 5


def _grade_arvore(X, y):
    """Caminho de poda por custo-complexidade da arvore completa; 8 valores de alfa ao longo do caminho."""
    path = DecisionTreeRegressor(min_samples_leaf=5, random_state=0).cost_complexity_pruning_path(X, y)
    al = np.unique(path.ccp_alphas[path.ccp_alphas > 0])
    qs = np.unique(np.quantile(al, [0.5, 0.75, 0.9, 0.95, 0.98, 0.99, 0.995, 0.999])) if len(al) else [0.0]
    return [{'ccp_alpha': float(a)} for a in [0.0, *qs]]


def ajustar_por_cv(nome, X, y, per):
    """Escolhe os hiperparametros por k-fold em blocos de meses e devolve (modelo ajustado na base toda, resumo)."""
    _, fab, grade = MODELOS_ML[nome]
    if grade is None:
        grade = _grade_arvore(X, y)
    if len(grade) == 1:
        return fab(grade[0]).fit(X, y), {'escolhido': grade[0], 'grade': []}
    meses = np.array(sorted(set(per)))
    blocos = np.array_split(meses, K_FOLDS)
    dobra = pd.Series(per).map({m: i for i, b in enumerate(blocos) for m in b}).values
    curva = []
    for p in grade:
        err = []
        for k in range(K_FOLDS):
            tr, va = dobra != k, dobra == k
            mod = fab(p).fit(X[tr], y[tr])
            err.append(float(np.mean((mod.predict(X[va]) - y[va]) ** 2)))
        curva.append({'param': p, 'rmse_cv': float(np.sqrt(np.mean(err)))})
    melhor = min(curva, key=lambda c: c['rmse_cv'])['param']
    return fab(melhor).fit(X, y), {'escolhido': melhor, 'grade': curva}


NOMES = {'ingenuo': 'Sazonal ingênuo', 'ets': 'Suavização exponencial (Holt-Winters)',
         'hierarquico': 'Hierárquico (nacional × nível relativo)',
         **{k: v[0] for k, v in MODELOS_ML.items()}}


def carregar_series():
    s = pd.read_csv(SAIDA / 'serie_mensal.csv')
    m = pd.read_csv(SAIDA / 'macro.csv').set_index('mes')
    s['y'] = np.log(s.tarifa_real)
    s['sid'] = s.nivel + ':' + s.chave
    wide = s.pivot(index='periodo', columns='sid', values='y').sort_index()
    wide.index = pd.PeriodIndex(wide.index, freq='M')
    wide = wide.interpolate(limit=2, limit_area='inside')
    qav = np.log(m.qav_real24)
    qav.index = pd.PeriodIndex(qav.index, freq='M')
    return s, wide, qav


def _flag(t):
    return float(CHOQUE[0] <= str(t) <= CHOQUE[1])


def _feats(hd, t, qd, sid):
    """Atributos para prever o mes t com historico ate t-1. Alvo: y_t - m12, em que m12 e a media de y nos
    12 meses anteriores (log da tarifa real). hd e qd: dicionarios {Period: valor}."""
    g = lambda p: hd.get(p, np.nan)
    m12 = np.nanmean([g(t - k) for k in range(1, 13)])
    m_ant = np.nanmean([g(t - k) for k in range(13, 25)])
    q12 = np.nanmean([qd.get(t - k, np.nan) for k in range(1, 13)])
    f = {'d1': g(t - 1) - m12, 'd2': g(t - 2) - m12, 'd3': g(t - 3) - m12, 'd12': g(t - 12) - m12,
         'd13': g(t - 13) - m12, 'd24': g(t - 24) - m12, 'tend': m12 - m_ant,
         'qav': qd.get(t - 1, np.nan) - q12, 'choque_t': _flag(t), 'choque_t12': _flag(t - 12),
         'brasil': float(sid.startswith('brasil')), 'empresa': float(sid.startswith('empresa'))}
    for k in range(1, 13):
        f[f'm{k}'] = float(t.month == k)
    f = {k: (0.0 if (v is None or np.isnan(v)) else float(v)) for k, v in f.items()}
    return f, m12


def matriz(wide, qav, ate):
    """Base de treino supervisionada (todas as series empilhadas): alvo = y_t - m12."""
    qd = qav.to_dict()
    X, y, per = [], [], []
    for sid in wide.columns:
        h = wide[sid].loc[:ate].dropna()
        hd = h.to_dict()
        for t in h.index:
            if (t - 12) not in hd or (t - 13) not in hd:
                continue
            if sum((t - k) in hd for k in range(1, 13)) < 12:
                continue
            f, base = _feats(hd, t, qd, sid)
            X.append(f)
            y.append(hd[t] - base)
            per.append(str(t))
    return pd.DataFrame(X), np.array(y), np.array(per)


def prever_ml(modelo, wide, qav, ate, horiz, sids):
    """Previsao recursiva multi-passo; exogena (QAV) mantida no ultimo valor observado."""
    ult = qav.loc[:ate].iloc[-1]
    qd = qav.loc[:ate].to_dict()
    for k in range(1, horiz + 1):
        qd[ate + k] = ult
    out = {}
    for sid in sids:
        h = wide[sid].loc[:ate].dropna()
        if len(h) < 25 or h.index[-1] != ate or len(h.loc[ate - 23:]) < 24:
            continue
        hd = h.to_dict()
        prev = {}
        for k in range(1, horiz + 1):
            t = ate + k
            f, base = _feats(hd, t, qd, sid)
            hd[t] = base + float(modelo.predict(pd.DataFrame([f]))[0])
            prev[t] = hd[t]
        out[sid] = pd.Series(prev)
    return out


def prever_classicos(wide, ate, horiz, sids):
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    ing, ets = {}, {}
    for sid in sids:
        h = wide[sid].loc[:ate].dropna()
        if len(h) < 25 or h.index[-1] != ate or len(h.loc[ate - 23:]) < 24:
            continue
        idx = pd.period_range(ate + 1, periods=horiz, freq='M')
        ing[sid] = pd.Series([h.get(t - 12, h.iloc[-1]) if (t - 12) <= ate else np.nan for t in idx], index=idx)
        for i, t in enumerate(idx):                      # alem de 12 meses, repete o ultimo ano previsto
            if np.isnan(ing[sid].iloc[i]):
                ing[sid].iloc[i] = ing[sid].iloc[i - 12]
        try:
            fit = ExponentialSmoothing(h.values, trend='add', damped_trend=True, seasonal='add',
                                       seasonal_periods=12, initialization_method='estimated').fit()
            ets[sid] = pd.Series(fit.forecast(horiz), index=idx)
        except Exception:
            ets[sid] = ing[sid].copy()
    return {'ingenuo': ing, 'ets': ets}


def prever_hierarquico(wide, nacional, ate, sids):
    """Companhias e rotas: previsao nacional x nivel relativo medio dos ultimos 12 meses (de cima para baixo)."""
    br = wide['brasil:BR'].loc[:ate]
    out = {}
    for sid in sids:
        if sid.startswith('brasil') or sid not in nacional or 'brasil:BR' not in nacional:
            continue
        h = wide[sid].loc[:ate]
        rel = (h - br).iloc[-12:]
        if rel.isna().sum() > 2:
            continue
        out[sid] = nacional['brasil:BR'] + rel.mean()
    return out


def todas_previsoes(wide, qav, ate, horiz, sids, hiper=None):
    res = prever_classicos(wide, ate, horiz, sids)
    X, y, per = matriz(wide, qav, ate)
    for k in MODELOS_ML:
        mod, info = ajustar_por_cv(k, X, y, per)
        if hiper is not None:
            hiper.setdefault(str(ate), {})[k] = info
        print(f'  {ate} {k}: {info["escolhido"]}', flush=True)
        res[k] = prever_ml(mod, wide, qav, ate, horiz, sids)
    res['hierarquico'] = prever_hierarquico(wide, res['ingenuo'], ate, sids)
    return res


def distribuicao(v):
    """Quartis, bigodes (1,5 x IQR, como no boxplot da Aula 1) e histograma de faixas de 5 pontos percentuais."""
    v = np.asarray(v, float)
    q1, q2, q3 = np.percentile(v, [25, 50, 75])
    iqr = q3 - q1
    dentro = v[(v >= q1 - 1.5 * iqr) & (v <= q3 + 1.5 * iqr)]
    bordas = np.arange(-0.5, 0.5001, 0.05)
    cont, _ = np.histogram(np.clip(v, -0.4999, 0.4999), bins=bordas)
    return {'q1': float(q1), 'mediana': float(q2), 'q3': float(q3), 'min': float(dentro.min()), 'max': float(dentro.max()),
            'fora': int(len(v) - len(dentro)), 'n': int(len(v)), 'media': float(v.mean()),
            'hist': [{'de': float(a), 'ate': float(b), 'n': int(c)} for a, b, c in zip(bordas[:-1], bordas[1:], cont)]}


def main():
    s, wide, qav = carregar_series()
    sids = list(wide.columns)
    ultimo = wide.index.max()
    origens = [ultimo - 24, ultimo - 18, ultimo - 12]          # origens moveis com 12 meses de teste cada
    erros, hiper = [], {}
    for o in origens:
        res = todas_previsoes(wide, qav, o, H, sids, hiper)
        for mod, d in res.items():
            for sid, f in d.items():
                real = wide[sid].reindex(f.index)
                for k, (t, yh) in enumerate(f.items(), 1):
                    if not np.isnan(real[t]):
                        erros.append(dict(origem=str(o), modelo=mod, sid=sid, h=k, periodo=str(t),
                                          erro_log=real[t] - yh, ape=abs(np.exp(yh - real[t]) - 1),
                                          erro_pct=np.exp(yh - real[t]) - 1,           # previsto / real - 1
                                          erro_rs=np.exp(yh) - np.exp(real[t])))       # previsto - real, R$
        print(f'origem {o}: ok', flush=True)
    e = pd.DataFrame(erros)
    e['nivel'] = e.sid.str.split(':').str[0]
    agg = dict(mape=('ape', 'mean'), rmse_log=('erro_log', lambda x: np.sqrt((x ** 2).mean())),
               mae=('erro_rs', lambda x: x.abs().mean()), rmse=('erro_rs', lambda x: np.sqrt((x ** 2).mean())),
               n=('ape', 'size'))
    met = e.groupby(['modelo', 'nivel']).agg(**agg).reset_index()
    geral = e.groupby('modelo').agg(**agg).reset_index().assign(nivel='todas')
    met = pd.concat([met, geral]).assign(nome=lambda d: d.modelo.map(NOMES))
    met['rank'] = met.groupby('nivel').mape.rank()
    # melhor modelo por serie (usado como padrao no site)
    por_serie = e.groupby(['sid', 'modelo']).ape.mean().reset_index()
    melhor = por_serie.loc[por_serie.groupby('sid').ape.idxmin()].set_index('sid').modelo
    # quantis empiricos do erro por modelo e horizonte (intervalos)
    # quantis empiricos do erro padronizado por sqrt(h), por modelo e nivel (intervalos crescem com o horizonte)
    e['z'] = e.erro_log / np.sqrt(e.h)
    qs = e.groupby(['modelo', 'nivel']).z.quantile([0.025, 0.10, 0.90, 0.975]).unstack()
    # previsao final
    hiper_final = {}
    res = todas_previsoes(wide, qav, ultimo, H_FINAL, sids, hiper_final)
    hiper_final = hiper_final.get(str(ultimo), {})
    linhas = []
    for mod, d in res.items():
        for sid, f in d.items():
            for k, (t, yh) in enumerate(f.items(), 1):
                nivel, chave = sid.split(':', 1)
                q = qs.loc[(mod, nivel)] * np.sqrt(k)
                linhas.append(dict(nivel=nivel, chave=chave, modelo=mod, periodo=str(t), h=k,
                                   previsto=np.exp(yh), lo80=np.exp(yh + q[0.10]), hi80=np.exp(yh + q[0.90]),
                                   lo95=np.exp(yh + q[0.025]), hi95=np.exp(yh + q[0.975]),
                                   melhor=bool(melhor.get(sid) == mod)))
    prev = pd.DataFrame(linhas)
    prev.to_csv(SAIDA / 'previsao.csv', index=False)
    met.to_csv(SAIDA / 'metricas_modelos.csv', index=False)
    e.to_csv(SAIDA / 'validacao.csv', index=False)
    dist = {f'{m}|{n}': distribuicao(g.erro_pct) for (m, n), g in e.groupby(['modelo', 'nivel'])}
    dist.update({f'{m}|todas': distribuicao(g.erro_pct) for m, g in e.groupby('modelo')})
    (SAIDA / 'erros_dist.json').write_text(json.dumps(dist, ensure_ascii=False))
    (SAIDA / 'hiperparametros.json').write_text(json.dumps(
        {'k_folds': K_FOLDS, 'origens': hiper, 'final': hiper_final}, ensure_ascii=False, indent=1))
    print(met[met.nivel == 'todas'].sort_values('mape')[['nome', 'mape', 'mae', 'rmse', 'n']].to_string(index=False))
    print(met.pivot(index='modelo', columns='nivel', values='mape').round(4))
    print('melhor por serie:', melhor.value_counts().to_dict())


if __name__ == '__main__':
    main()
