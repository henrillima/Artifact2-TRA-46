# -*- coding: utf-8 -*-
"""
Saída de uma companhia: o caso da Avianca (2019) e a simulação da saída de um grande hoje (PAPER, TRA-46).

1. Estudo de eventos (diferenças em diferenças com efeitos fixos de rota e de mês): rotas em que a Avianca operava
   (tratadas), rotas em que ela era só entrante potencial (vendia nas duas pontas) e rotas sem a Avianca (controle).
   Janela jan/2017 a fev/2020 (fora da pandemia). Desfechos: ln da tarifa real média, HHI e número de grupos, ln dos
   assentos.
2. Para quem foi a participação da Avianca (absorção por grupo, em diferenças contra o controle).
3. Calibração do simulador de Cournot com conduta: L = θ·HHI/|ε|. Só a razão κ = θ/|ε| é identificada pela
   variação de preço; a calibração escolhe κ que reproduz o efeito observado na tarifa a partir da variação de HHI
   observada em cada rota tratada.
4. Simulação da saída da Azul e da Gol nas 300 maiores rotas de hoje (últimos 12 meses), com duas regras de
   realocação da participação de quem sai: proporcional às participações dos que ficam e o padrão observado na
   saída da Avianca.

Saída: dados/saida/saida.json e dados/saida/saida_rotas.csv
"""
import json
import os

import numpy as np
import pandas as pd

from base import SAIDA, carregar
from econometria import demean2, ols_cluster

INI, FIM = '2017-01', '2020-02'                 # janela sem a pandemia
PRE = ('2017-07', '2018-06')                    # 12 meses antes da contração da Avianca (que começa em jul/2018)
CONTRACAO = '2018-07'                           # vendas da Avianca caem a partir de jul/2018; pedido de RJ em dez/2018
MIN_ROTA = 500                                  # assentos/mês da rota no pré-período
MIN_AVI = int(os.environ.get('SAIDA_MIN_AVI', 300))   # Avianca "opera" a rota (Oliveira e Lucinda, 2024); robustez: SAIDA_MIN_AVI=200
SUFIXO = os.environ.get('SAIDA_SUFIXO', '')          # robustez grava em saida<SUFIXO>.json sem tocar na versão principal
JANELA = range(-27, 11)                         # meses relativos à saída (abr/2019 para quase todas: -27 = jan/2017, +10 = fev/2020)
REF = -10                                       # mês de referência: jun/2018, o último antes da contração
K_PRE = range(-21, -9)                          # meses do período pré (jul/2017 a jun/2018) nas saídas de abril/2019
GRUPOS = ['LATAM', 'Gol', 'Azul', 'Outras']
B = 499


def painel_rotas(p):
    """Rota × mês: assentos, tarifa real média, HHI dos grupos, número de grupos e participação de cada grupo."""
    g = p.groupby(['rota', 'periodo', 'grupo'], observed=True).agg(a=('assentos', 'sum'), r=('receita_real', 'sum')).reset_index()
    tot = g.groupby(['rota', 'periodo']).agg(A=('a', 'sum'), R=('r', 'sum'))
    g = g.join(tot, on=['rota', 'periodo'])
    g['s'] = g.a / g.A
    hhi = (g.s ** 2).groupby([g.rota, g.periodo]).sum().rename('hhi')
    n = (g.s >= 0.01).groupby([g.rota, g.periodo]).sum().rename('n_grupos')
    sh = g.pivot_table(index=['rota', 'periodo'], columns='grupo', values='s', fill_value=0)
    out = tot.join(hhi).join(n).join(sh).reset_index()
    out['tarifa'] = out.R / out.A
    for c in GRUPOS + ['Avianca']:
        if c not in out:
            out[c] = 0.0
    return out


def main():
    p, m, base = carregar()
    pw = p[(p.periodo >= INI) & (p.periodo <= FIM)]
    d = painel_rotas(pw)
    meses = sorted(d.periodo.unique())
    pre = d[(d.periodo >= PRE[0]) & (d.periodo <= PRE[1])]
    a_pre = pre.groupby('rota').A.mean()
    avi_pre = (pre.Avianca * pre.A).groupby(pre.rota).mean()
    # rotas presentes em todos os meses da janela e com volume mínimo no pré-período
    cont = d.groupby('rota').periodo.nunique()
    rotas = a_pre[(a_pre >= MIN_ROTA) & cont.reindex(a_pre.index).eq(len(meses))].index
    d = d[d.rota.isin(rotas)].copy()

    # grupos: opera (tratada), potencial (Avianca vende nas duas pontas, mas não na rota) e controle
    pa = pw[(pw.periodo >= PRE[0]) & (pw.periodo <= PRE[1]) & (pw.grupo == 'Avianca')]
    ap = pd.concat([pa.groupby('origem', observed=True).assentos.sum(), pa.groupby('destino', observed=True).assentos.sum()]).groupby(level=0).sum() / 12
    aero_avi = set(ap[ap >= MIN_AVI].index.astype(str))
    opera = set(avi_pre[avi_pre >= MIN_AVI].index) & set(rotas)
    pot = {r for r in rotas if r not in opera and set(r.split('-')) <= aero_avi and avi_pre.get(r, 0) < MIN_AVI}
    d['grupo_rota'] = np.where(d.rota.isin(opera), 'opera', np.where(d.rota.isin(pot), 'potencial', 'controle'))
    # rotas com presença pequena da Avianca (abaixo do limite de operação) não servem de controle
    d = d[~((d.grupo_rota == 'controle') & (d.rota.map(avi_pre).fillna(0) > 0))]

    # mês de saída por rota: primeiro mês a partir do qual as vendas da Avianca ficam abaixo de 10% da média pré
    avi_m = (d.Avianca * d.A)
    d['avi_a'] = avi_m
    saida = {}
    for r, g in d[d.grupo_rota == 'opera'].sort_values('periodo').groupby('rota'):
        lim = 0.10 * avi_pre[r]
        abaixo = (g.avi_a < lim).values
        idx = next(i for i in range(len(abaixo)) if abaixo[i:].all())
        saida[r] = g.periodo.values[idx]
    # saídas anteriores à contração (jul/2018) não fazem parte do episódio: rota fora da amostra
    antigas = {r for r, t in saida.items() if t < CONTRACAO}
    d = d[~d.rota.isin(antigas)]
    opera -= antigas
    saida = {r: t for r, t in saida.items() if r not in antigas}
    # meses sem nenhuma venda da Avianca não aparecem no painel: completa com zero, senão a saída nacional nunca é achada
    nac = pw[pw.grupo == 'Avianca'].groupby('periodo').assentos.sum().reindex(meses, fill_value=0.0)
    lim_n = 0.10 * nac.loc[PRE[0]:PRE[1]].mean()
    saida_nac = next(t for t in nac.index if (nac.loc[t:] < lim_n).all()) if (nac < lim_n).any() else FIM
    for r in pot:
        saida[r] = saida_nac
    d['saida'] = d.rota.map(saida)
    ti = {t: i for i, t in enumerate(meses)}
    d['k'] = np.where(d.saida.notna(), d.periodo.map(ti) - d.saida.map(lambda x: ti.get(x, np.nan)), np.nan)
    d['ln_tarifa'] = np.log(d.tarifa)
    d['ln_assentos'] = np.log(d.A)

    res = {'janela': [INI, FIM], 'pre': list(PRE), 'saida_nacional': saida_nac,
           'n_rotas': {k: int(v) for k, v in d.groupby('grupo_rota').rota.nunique().items()},
           'meses_saida': pd.Series(saida).loc[list(opera)].value_counts().sort_index().to_dict(),
           'parcela_avianca_pre': float((pre[pre.rota.isin(opera)].Avianca * pre[pre.rota.isin(opera)].A).sum()
                                        / pre[pre.rota.isin(opera)].A.sum())}
    w_rota = d.rota.map(a_pre).values
    cl = d.rota.astype('category').cat.codes.values

    # ---------- estudo de eventos (dinâmico) e efeito médio (estático), por desfecho
    def regs(y, pesos):
        out = {}
        X = pd.DataFrame(index=d.index)
        for grp in ('opera', 'potencial'):
            gk = (d.grupo_rota == grp)
            for k in JANELA:
                if k == REF:
                    continue
                X[f'{grp}_{k}'] = (gk & (d.k == k)).astype(float)
            X[f'{grp}_antes'] = (gk & (d.k < JANELA[0])).astype(float)
            X[f'{grp}_depois'] = (gk & (d.k > JANELA[-1])).astype(float)
        df = X.assign(y=d[y].values, rota=d.rota.values, mes=d.periodo.values)
        dm = demean2(df, list(X.columns) + ['y'], 'rota', 'mes', w=pesos)
        keep = [c for c in X.columns if X[c].sum() > 0]
        b, se, V = ols_cluster(dm[keep].values, dm.y.values, cl, w=pesos, vcov=True)
        coef = dict(zip(keep, zip(b, se)))
        pos = {c: i for i, c in enumerate(keep)}
        for grp in ('opera', 'potencial'):
            out[grp] = [{'k': k, 'b': float(coef[f'{grp}_{k}'][0]) if f'{grp}_{k}' in coef else 0.0,
                         'ep': float(coef[f'{grp}_{k}'][1]) if f'{grp}_{k}' in coef else 0.0} for k in JANELA]
            # mesma série medida contra a média do período pré (jul/2017 a jun/2018 = k de -21 a -10 nas saídas de abril),
            # em vez de um único mês; o erro-padrão sai da matriz de covariância completa (combinação linear)
            pre_k = [k for k in K_PRE if f'{grp}_{k}' in pos]
            norm = []
            for k in JANELA:
                a = np.zeros(len(keep))
                for kp in pre_k:
                    a[pos[f'{grp}_{kp}']] -= 1.0 / len(K_PRE)    # o mês de referência entra na média com coeficiente 0
                if f'{grp}_{k}' in pos:
                    a[pos[f'{grp}_{k}']] += 1.0
                norm.append({'k': k, 'b': float(a @ b), 'ep': float(np.sqrt(a @ V @ a))})
            out[f'{grp}_norm'] = norm
        # estático: contração (jul/2018 até a saída) e pós-saída (abr/2019 a fev/2020)
        Xs = pd.DataFrame(index=d.index)
        for grp in ('opera', 'potencial'):
            gk = (d.grupo_rota == grp)
            Xs[f'{grp}_transicao'] = (gk & (d.periodo >= CONTRACAO) & (d.k < 0)).astype(float)
            Xs[f'{grp}_pos'] = (gk & (d.k >= 0)).astype(float)
        dfs = Xs.assign(y=d[y].values, rota=d.rota.values, mes=d.periodo.values)
        dms = demean2(dfs, list(Xs.columns) + ['y'], 'rota', 'mes', w=pesos)
        bs, ses = ols_cluster(dms[list(Xs.columns)].values, dms.y.values, cl, w=pesos)
        out['estatico'] = {c: {'b': float(x), 'ep': float(s)} for c, x, s in zip(Xs.columns, bs, ses)}
        # tendência prévia: média dos coeficientes antes do mês de referência
        out['pre_media'] = {grp: float(np.mean([c['b'] for c in out[grp] if c['k'] < REF])) for grp in ('opera', 'potencial')}
        return out

    res['eventos'] = {}
    for y in ('ln_tarifa', 'hhi', 'n_grupos', 'ln_assentos'):
        res['eventos'][y] = {'ponderado': regs(y, w_rota), 'sem_peso': regs(y, None)}
        e = res['eventos'][y]['ponderado']['estatico']
        print(f"{y:12s} opera pós {e['opera_pos']['b']:+.4f} ({e['opera_pos']['ep']:.4f})  "
              f"potencial pós {e['potencial_pos']['b']:+.4f} ({e['potencial_pos']['ep']:.4f})")

    # ---------- variações por rota: pré (jan-nov/2018) contra os 12 meses a partir da saída (até fev/2020)
    def janelas(df):
        a = df[(df.periodo >= PRE[0]) & (df.periodo <= PRE[1])]
        b = df[(df.k >= 0) & (df.k <= 11)]
        f = lambda x: pd.Series({'A': x.A.mean(), 'P': (x.tarifa * x.A).sum() / x.A.sum(), 'hhi': (x.hhi * x.A).sum() / x.A.sum(),
                                 **{g: (x[g] * x.A).sum() / x.A.sum() for g in GRUPOS + ['Avianca']}})
        return a.groupby('rota').apply(f), b.groupby('rota').apply(f)
    tr = d[d.grupo_rota == 'opera']
    a0, a1 = janelas(tr)
    # controle: mesma comparação no calendário (pré contra abr/2019-fev/2020)
    ct = d[d.grupo_rota == 'controle'].copy()
    ct['k'] = ct.periodo.map(ti) - ti[saida_nac]
    c0, c1 = janelas(ct)
    wc = c0.A
    dlnP_c = np.average(np.log(c1.P / c0.P), weights=wc)
    ds_c = {g: np.average(c1[g] - c0[g], weights=wc) for g in GRUPOS}
    dh_c = np.average(c1.hhi - c0.hhi, weights=wc)
    rt = pd.DataFrame({'A0': a0.A, 's_avi': a0.Avianca, 'hhi0': a0.hhi, 'hhi1': a1.hhi,
                       'dlnP': np.log(a1.P / a0.P) - dlnP_c})
    for g in GRUPOS:
        rt[f'ds_{g}'] = (a1[g] - a0[g]) - ds_c[g]
    # absorção: parcela da participação perdida pela Avianca que cada grupo ganhou (relativo ao controle)
    w = rt.A0 * rt.s_avi
    absorc = {g: float((rt[f'ds_{g}'] * rt.A0).sum() / (rt.s_avi * rt.A0).sum()) for g in GRUPOS}
    res['absorcao'] = absorc
    res['controle'] = {'dlnP': float(dlnP_c), 'dhhi': float(dh_c)}
    res['tratadas'] = {'dlnP_medio': float(np.average(rt.dlnP, weights=rt.A0)),
                       'dhhi_medio': float(np.average(rt.hhi1 - rt.hhi0 - dh_c, weights=rt.A0)),
                       'hhi0_medio': float(np.average(rt.hhi0, weights=rt.A0)),
                       'hhi1_medio': float(np.average(rt.hhi1, weights=rt.A0))}
    print('absorção', {k: round(v, 3) for k, v in absorc.items()}, 'soma', round(sum(absorc.values()), 3))

    # ---------- o simulador de Cournot reproduz o episódio?  L = θ·HHI/|ε|, limitado ao Lerner de monopólio 1/|ε|
    EPS = {'1,48': 1.477, '2,16': 2.164}

    def prev(kap, h0, h1, cap=0.95):
        L0, L1 = np.minimum(kap * h0, cap), np.minimum(kap * h1, cap)
        return np.log((1 - L0) / (1 - L1))
    # HHI pós descontada a variação média do controle no mesmo período
    h0, h1 = rt.hhi0.values, (rt.hhi1 - dh_c).values
    wr = rt.A0.values
    att = res['eventos']['ln_tarifa']['ponderado']['estatico']['opera_pos']
    alvo_reg = att['b']
    alvos = {'regressao': alvo_reg, 'janelas': float(np.average(rt.dlnP, weights=wr))}
    cal = {'alvos': alvos, 'ic95_alvo_regressao': [alvo_reg - 1.96 * att['ep'], alvo_reg + 1.96 * att['ep']]}
    # (a) previsão com Cournot (θ = 1) e as duas elasticidades, sem calibrar
    cal['cournot'] = {e: float(np.average(prev(1 / v, h0, h1, 1 / v), weights=wr)) for e, v in EPS.items()}
    # (b) κ = θ/|ε| que reproduz o efeito observado (sem limite de monopólio), com bootstrap das rotas
    grade = np.linspace(0.0, 1.5, 1501)
    prevs = np.array([[prev(kk, h0, h1) for kk in grade]])[0]

    def calibra(idx, alvo):
        m_ = np.average(prevs[:, idx], axis=1, weights=wr[idx])
        return float(grade[np.argmin(np.abs(m_ - alvo))])
    kap = calibra(np.arange(len(rt)), alvo_reg)
    rng = np.random.default_rng(2026)
    boot = []
    for _ in range(B):
        idx = rng.integers(0, len(rt), len(rt))
        boot.append(calibra(idx, rng.normal(alvo_reg, att['ep'])))
    cal['kappa'] = kap
    cal['kappa_ic95'] = [float(np.percentile(boot, 2.5)), float(np.percentile(boot, 97.5))]
    cal['kappa_janelas'] = calibra(np.arange(len(rt)), alvos['janelas'])
    cal['theta_implicito'] = {e: kap * v for e, v in EPS.items()}
    cal['kappa_max_coerente'] = {e: 1 / v for e, v in EPS.items()}   # κ·1 ≤ 1/|ε| (Lerner de monopólio)
    # (c) relação entre concentração e tarifa entre as rotas tratadas: Δln P = a + b·ΔHHI
    X = np.column_stack([np.ones(len(rt)), h1 - h0])
    sw = np.sqrt(wr)
    bb, *_ = np.linalg.lstsq(X * sw[:, None], rt.dlnP.values * sw, rcond=None)
    u = (rt.dlnP.values - X @ bb) * sw
    XtXi = np.linalg.inv((X * sw[:, None]).T @ (X * sw[:, None]))
    V = XtXi @ ((X * sw[:, None]).T * u ** 2) @ (X * sw[:, None]) @ XtXi
    cal['dP_dHHI'] = {'a': float(bb[0]), 'b': float(bb[1]), 'ep_b': float(np.sqrt(V[1, 1])), 'n': int(len(rt))}
    res['calibracao'] = cal
    rt['dlnP_prev_cournot'] = prev(1 / 1.477, h0, h1, 1 / 1.477)
    rt['dlnP_prev_kappa'] = prev(kap, h0, h1)
    print('alvos', alvos, 'Cournot prevê', cal['cournot'], 'κ', kap, cal['kappa_ic95'], 'θ implícito', cal['theta_implicito'],
          'ΔlnP/ΔHHI', cal['dP_dHHI'])

    # ---------- simulação da saída de Azul e de Gol hoje (300 maiores rotas, últimos 12 meses)
    re_ = pd.read_csv(SAIDA / 'rota_empresa.csv')
    att = pd.read_csv(SAIDA / 'rotas.csv').set_index('rota')
    sh = re_.pivot_table(index='rota', columns='grupo', values='share', fill_value=0)
    for g in GRUPOS:
        if g not in sh:
            sh[g] = 0.0
    sh = sh[GRUPOS]
    peso = att.assentos.reindex(sh.index)
    tarifa = att.tarifa_real.reindex(sh.index)
    linhas, resumo = [], {}
    for sai in ('Azul', 'Gol'):
        for regra in ('proporcional', 'avianca'):
            s0 = sh.copy()
            fica = [g for g in GRUPOS if g != sai]
            abandon = pd.Series(False, index=s0.index)
            if regra == 'proporcional':
                # sem entrada: a rota em que só a companhia que sai operava fica sem oferta (fora das médias)
                abandon = (1 - s0[sai]) < 1e-9
                s1 = s0[fica].div((1 - s0[sai]).where(~abandon, 1), axis=0)
            else:
                wa = np.array([max(absorc[g], 0) for g in fica])
                wa = wa / wa.sum()
                s1 = s0[fica] + np.outer(s0[sai], wa)
            h0r = (s0 ** 2).sum(axis=1)
            h1r = (s1 ** 2).sum(axis=1)
            afet = (s0[sai] > 0) & ~abandon
            # conduta: Cournot (θ = 1) com ε = -1,48 e -2,16, e κ calibrado na Avianca; Lerner limitado ao de monopólio (ε = -1,48)
            condutas = {'cournot_1_48': (1 / 1.477, 1 / 1.477), 'cournot_2_16': (1 / 2.164, 1 / 2.164),
                        'calibrado': (kap, 1 / 1.477), 'calibrado_baixo': (cal['kappa_ic95'][0], 1 / 1.477),
                        'calibrado_alto': (cal['kappa_ic95'][1], 1 / 1.477)}
            resumo[f'{sai}|{regra}'] = {}
            for nome, (kk, cap) in condutas.items():
                efc = np.where(afet, np.exp(prev(kk, h0r.values, h1r.values, cap)) - 1, 0.0)
                resumo[f'{sai}|{regra}'][nome] = float(np.average(efc[~abandon.values], weights=(peso * tarifa)[~abandon]))
                resumo[f'{sai}|{regra}'][nome + '_afetadas'] = float(np.average(efc[afet.values], weights=(peso * tarifa)[afet]))
            ef = np.where(afet, np.exp(prev(kap, h0r.values, h1r.values, 1 / 1.477)) - 1, 0.0)
            ef_c = np.where(afet, np.exp(prev(1 / 1.477, h0r.values, h1r.values, 1 / 1.477)) - 1, 0.0)
            H, D = h1r * 1e4, (h1r - h0r) * 1e4
            pres = afet & (H > 2500) & (D > 200)
            resumo[f'{sai}|{regra}'].update({
                'rotas_afetadas': int(afet.sum()), 'parcela_assentos_afetados': float(peso[afet].sum() / peso.sum()),
                'hhi0': float(np.average(h0r[~abandon], weights=peso[~abandon])), 'hhi1': float(np.average(h1r[~abandon], weights=peso[~abandon])),
                'presuncao_cade': int(pres.sum()), 'monopolios': int((afet & (h1r > 0.999)).sum()),
                'rotas_sem_oferta': int(abandon.sum()),
            })
            for r in sh.index:
                linhas.append({'cenario': sai, 'regra': regra, 'rota': r, 'assentos': float(peso[r]), 'tarifa': float(tarifa[r]),
                               'share_sai': float(s0.at[r, sai]), 'hhi0': float(h0r[r]), 'hhi1': float(h1r[r]),
                               'efeito_calibrado': float(ef[sh.index.get_loc(r)]), 'efeito_cournot': float(ef_c[sh.index.get_loc(r)])})
            print(sai, regra, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in resumo[f'{sai}|{regra}'].items() if not k.endswith('_afetadas')})
    res['simulacao'] = resumo
    # ---------- projeção: previsão base do Brasil (melhor modelo) com o efeito de cada cenário, na dinâmica da Avianca
    ev = res['eventos']['ln_tarifa']['ponderado']
    pos = [c['b'] for c in ev['opera_norm'] if c['k'] >= 0]      # efeito mês a mês contra a média de jul/2017 a jun/2018
    perfil = np.array(pos) / max(np.mean(pos), 1e-9)          # média 1 nos meses observados após a saída
    pv = pd.read_csv(SAIDA / 'previsao.csv')
    base_br = pv[(pv.nivel == 'brasil') & pv.melhor & (pv.h <= 12)].sort_values('h')
    proj = {'periodos': base_br.periodo.tolist(), 'base': base_br.previsto.round(2).tolist(), 'perfil': perfil.round(4).tolist()}
    for k, v in resumo.items():
        ef = v['calibrado']
        prof = np.array([perfil[min(h, len(perfil) - 1)] for h in range(12)])
        proj[k] = (base_br.previsto.values * (1 + ef * prof)).round(2).tolist()
        proj[k + '|nivel'] = (base_br.previsto.values * (1 + ef)).round(2).tolist()
    res['projecao'] = proj
    res['cobertura_300'] = float(att.assentos.iloc[:300].sum() / att.assentos.sum())
    res['rotas_tratadas'] = rt.reset_index().rename(columns={'index': 'rota'}).round(5).to_dict(orient='records')
    (SAIDA / f'saida{SUFIXO}.json').write_text(json.dumps(res, ensure_ascii=False, indent=1, default=float))
    if not SUFIXO:
        pd.DataFrame(linhas).to_csv(SAIDA / 'saida_rotas.csv', index=False)


if __name__ == '__main__':
    main()
