# -*- coding: utf-8 -*-
"""
Previsao da tarifa real (Brasil, companhias, 60 maiores rotas) com selecao de modelos (TRA-48).

Modelos: sazonal ingenuo, suavizacao exponencial (Holt-Winters amortecido) e modelos supervisionados
globais (regressao ridge, arvore de decisao, floresta aleatoria, gradient boosting, kNN, SVM e rede neural MLP)
treinados no conjunto de series com atributos defasados. Validacao por origem movel (12 meses a frente)
e intervalos empiricos a partir dos erros de validacao, por horizonte.

Saidas (dados/saida): previsao.csv, metricas_modelos.csv, validacao.csv
"""
import warnings

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.neighbors import KNeighborsRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR
from sklearn.tree import DecisionTreeRegressor

from base import SAIDA

warnings.filterwarnings('ignore')
H = 12                      # horizonte de validacao
H_FINAL = 18                # horizonte da previsao publicada
CHOQUE = ('2020-03', '2021-12')   # periodo pandemico (indicador no treino)

MODELOS_ML = {
    'ridge': ('Regressão linear (ridge)', lambda: make_pipeline(StandardScaler(), Ridge(alpha=1.0))),
    'arvore': ('Árvore de decisão', lambda: DecisionTreeRegressor(max_depth=6, min_samples_leaf=20, random_state=0)),
    'floresta': ('Floresta aleatória', lambda: RandomForestRegressor(n_estimators=300, min_samples_leaf=5,
                                                                   n_jobs=-1, random_state=0)),
    'boosting': ('Gradient boosting', lambda: GradientBoostingRegressor(n_estimators=400, max_depth=3,
                                                                       learning_rate=0.03, subsample=0.8,
                                                                       random_state=0)),
    'knn': ('k vizinhos mais próximos', lambda: make_pipeline(StandardScaler(), KNeighborsRegressor(n_neighbors=15,
                                                                                                    weights='distance'))),
    'svm': ('Máquina de vetores de suporte (SVR)', lambda: make_pipeline(StandardScaler(), SVR(C=1.0, epsilon=0.01))),
    'mlp': ('Rede neural (MLP)', lambda: make_pipeline(StandardScaler(), MLPRegressor(hidden_layer_sizes=(32, 16),
                                                                                       alpha=1e-3, max_iter=3000,
                                                                                       early_stopping=True,
                                                                                       random_state=0))),
}
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
    X, y = [], []
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
    return pd.DataFrame(X), np.array(y)


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


def todas_previsoes(wide, qav, ate, horiz, sids):
    res = prever_classicos(wide, ate, horiz, sids)
    X, y = matriz(wide, qav, ate)
    for k, (_, fab) in MODELOS_ML.items():
        mod = fab().fit(X, y)
        res[k] = prever_ml(mod, wide, qav, ate, horiz, sids)
    res['hierarquico'] = prever_hierarquico(wide, res['ingenuo'], ate, sids)
    return res


def main():
    s, wide, qav = carregar_series()
    sids = list(wide.columns)
    ultimo = wide.index.max()
    origens = [ultimo - 24, ultimo - 18, ultimo - 12]          # origens moveis com 12 meses de teste cada
    erros = []
    for o in origens:
        res = todas_previsoes(wide, qav, o, H, sids)
        for mod, d in res.items():
            for sid, f in d.items():
                real = wide[sid].reindex(f.index)
                for k, (t, yh) in enumerate(f.items(), 1):
                    if not np.isnan(real[t]):
                        erros.append(dict(origem=str(o), modelo=mod, sid=sid, h=k, periodo=str(t),
                                          erro_log=real[t] - yh, ape=abs(np.exp(yh - real[t]) - 1)))
        print(f'origem {o}: ok', flush=True)
    e = pd.DataFrame(erros)
    e['nivel'] = e.sid.str.split(':').str[0]
    met = (e.groupby(['modelo', 'nivel']).agg(mape=('ape', 'mean'), rmse_log=('erro_log', lambda x: np.sqrt((x ** 2).mean())),
                                              n=('ape', 'size')).reset_index())
    geral = e.groupby('modelo').agg(mape=('ape', 'mean'), rmse_log=('erro_log', lambda x: np.sqrt((x ** 2).mean())),
                                    n=('ape', 'size')).reset_index().assign(nivel='todas')
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
    res = todas_previsoes(wide, qav, ultimo, H_FINAL, sids)
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
    print(met[met.nivel == 'todas'].sort_values('mape')[['nome', 'mape', 'rmse_log', 'n']].to_string(index=False))
    print(met.pivot(index='modelo', columns='nivel', values='mape').round(4))
    print('melhor por serie:', melhor.value_counts().to_dict())


if __name__ == '__main__':
    main()
