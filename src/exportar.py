# -*- coding: utf-8 -*-
"""Gera os arquivos que vao para o banco (dados/banco/*.csv) a partir das saidas dos modelos."""
import json

import numpy as np
import pandas as pd

from base import DADOS, SAIDA, carregar

BANCO = DADOS / 'banco'


def previsao_assentos(s, horiz=18):
    out = []
    for (nivel, chave), g in s.groupby(['nivel', 'chave']):
        g = g.set_index('periodo').sort_index()
        idx = pd.PeriodIndex(g.index, freq='M')
        a = pd.Series(g.assentos.values, index=idx)
        ult = idx.max()
        if len(a.loc[ult - 23:]) < 24:
            continue
        cresc = float(np.clip(a.loc[ult - 11:].sum() / a.loc[ult - 23:ult - 12].sum(), 0.9, 1.1))
        for h in range(1, horiz + 1):
            t = ult + h
            ref = t - 12 * ((h - 1) // 12 + 1)
            out.append(dict(nivel=nivel, chave=chave, periodo=str(t), h=h,
                            assentos=float(a.get(ref, np.nan) * cresc ** ((h - 1) // 12 + 1))))
    return pd.DataFrame(out)


def main():
    BANCO.mkdir(parents=True, exist_ok=True)
    s_all = pd.read_parquet(SAIDA / 'serie_todas_rotas.parquet')
    s_mod = pd.read_csv(SAIDA / 'serie_mensal.csv')
    cols = ['nivel', 'chave', 'periodo', 'assentos', 'tarifa_real', 'tarifa_nominal', 'hhi', 'n_empresas']
    s_all[cols].to_csv(BANCO / 'serie_mensal.csv', index=False)

    m = pd.read_csv(SAIDA / 'macro.csv')
    m[['mes', 'ipca_pct', 'idx_ipca', 'ptax', 'jet_usd_gal', 'qav_avdatabr', 'qav_real24']].to_csv(BANCO / 'macro.csv', index=False)

    prev = pd.read_csv(SAIDA / 'previsao.csv')
    prev.to_csv(BANCO / 'previsao.csv', index=False)
    previsao_assentos(s_mod).to_csv(BANCO / 'previsao_assentos.csv', index=False)
    pd.read_csv(SAIDA / 'metricas_modelos.csv').to_csv(BANCO / 'metricas_modelos.csv', index=False)

    rotas = pd.read_csv(SAIDA / 'rotas.csv')
    cl = pd.read_csv(SAIDA / 'rotas_clusters.csv')[['rota', 'cluster', 'segmento', 'sazonalidade', 'volatilidade',
                                                     'crescimento']]
    rotas = rotas.merge(cl, on='rota', how='left')
    rotas = rotas.rename(columns={'assentos': 'assentos_12m', 'tarifa_real': 'tarifa_real_12m'})
    rotas[['rota', 'origem', 'destino', 'nome', 'cidades', 'distancia_km', 'assentos_12m', 'tarifa_real_12m',
           'hhi_12m', 'rank', 'cluster', 'segmento', 'sazonalidade', 'volatilidade', 'crescimento']].to_csv(
        BANCO / 'rotas.csv', index=False)

    re_ = pd.read_csv(SAIDA / 'rota_empresa.csv')
    re_[['rota', 'grupo', 'assentos', 'tarifa_real', 'share']].to_csv(BANCO / 'rota_empresa.csv', index=False)

    an = pd.read_csv(SAIDA / 'anomalias.csv')
    an.rename(columns={'aero': 'icao'})[['icao', 'aeroporto', 'cidade', 'periodo', 'mov', 'tarifa', 'yoy_mov',
                                          'yoy_tarifa', 'rel_mov', 'rel_tarifa', 'z_robusto', 'escore_isolamento',
                                          'anomalo', 'escore_lof', 'escore_kmedias', 'escore_gmm',
                                          'evento_conhecido']].to_csv(BANCO / 'aeroporto_mensal.csv', index=False)

    ev = json.loads((SAIDA / 'eventos.json').read_text())
    pd.DataFrame([{'id': e['id'], 'nome': e['nome'], 'escopo': e['escopo'], 'aeroporto': e.get('aeroporto'),
                   'inicio': e['inicio'], 'nota': e['nota'], 'trajetoria': json.dumps(e['trajetoria'])}
                  for e in ev]).to_csv(BANCO / 'eventos.csv', index=False)

    par = json.loads((SAIDA / 'parametros.json').read_text())
    par['clusters'] = json.loads((SAIDA / 'clusters.json').read_text())
    # selecao de modelos e avaliacao (TRA-48): hiperparametros escolhidos por CV, distribuicao dos erros,
    # avaliacao dos detectores de anomalia e dos classificadores
    par['hiperparametros'] = json.loads((SAIDA / 'hiperparametros.json').read_text())
    par['erros_dist'] = json.loads((SAIDA / 'erros_dist.json').read_text())
    par['anomalias_avaliacao'] = json.loads((SAIDA / 'anomalias_avaliacao.json').read_text())
    # saída de uma companhia: estudo de eventos da Avianca, calibração e simulação da saída de Azul e Gol (PAPER)
    if (SAIDA / 'saida.json').exists():
        par['saida'] = json.loads((SAIDA / 'saida.json').read_text())
    from base import macro
    par['ponte_qav'] = macro().attrs['ponte']
    p, _, base = carregar()
    par['mes_base_real'] = base
    val = pd.read_csv(SAIDA / 'validacao.csv')
    vh = val[(val.modelo == 'hierarquico') & (val.nivel == 'rota')]
    zq = (vh.erro_log / np.sqrt(vh.h)).quantile([0.025, 0.1, 0.9, 0.975])
    par['erros_hierarquico_rota'] = {h: {str(q): float(v * np.sqrt(h)) for q, v in zq.items()} for h in range(1, 19)}
    par['ultimo_mes_dados'] = p.periodo.max()
    par['primeiro_mes_dados'] = p.periodo.min()
    pd.DataFrame([{'chave': k, 'valor': json.dumps(v, ensure_ascii=False)} for k, v in par.items()]).to_csv(
        BANCO / 'parametros.csv', index=False)

    # painel bruto agregado (rota x companhia x mes) para consultas livres
    pn = p[['ano', 'mes', 'empresa', 'grupo', 'origem', 'destino', 'rota', 'assentos', 'receita', 'receita_real']].copy()
    pn['tarifa_real'] = pn.receita_real / pn.assentos
    pn['tarifa_nominal'] = pn.receita / pn.assentos
    pn.drop(columns=['receita', 'receita_real']).to_csv(BANCO / 'painel.csv', index=False)
    for f in sorted(BANCO.glob('*.csv')):
        print(f.name, sum(1 for _ in open(f)) - 1)


if __name__ == '__main__':
    main()
