# -*- coding: utf-8 -*-
"""Series mensais (Brasil, companhia, rota), HHI por rota e atributos das rotas."""
import numpy as np
import pandas as pd

from base import SAIDA, carregar, distancia, rotulo, cidade

N_ROTAS_MODELO = 60      # rotas com previsao propria
N_ROTAS_FUSAO = 300      # rotas no simulador de fusao


def _agrega(df, chaves):
    g = df.groupby(chaves, observed=True).agg(assentos=('assentos', 'sum'), receita=('receita', 'sum'),
                                               receita_real=('receita_real', 'sum')).reset_index()
    g['tarifa_nominal'] = g.receita / g.assentos
    g['tarifa_real'] = g.receita_real / g.assentos
    return g


def construir():
    SAIDA.mkdir(parents=True, exist_ok=True)
    p, m, mes_base = carregar()
    ultimo_ano = int(p.ano.max())
    # ---------------- series
    br = _agrega(p, ['ano', 'mes', 'periodo']).assign(nivel='brasil', chave='BR')
    emp = _agrega(p, ['ano', 'mes', 'periodo', 'grupo']).rename(columns={'grupo': 'chave'}).assign(nivel='empresa')
    rt = _agrega(p, ['ano', 'mes', 'periodo', 'rota']).rename(columns={'rota': 'chave'}).assign(nivel='rota')
    # HHI por rota-mes (assentos por companhia; grupos)
    sh = p.groupby(['periodo', 'rota', 'grupo'], observed=True).assentos.sum()
    tot = sh.groupby(level=[0, 1]).transform('sum')
    hhi = ((sh / tot) ** 2).groupby(level=[0, 1]).sum().rename('hhi').reset_index().rename(columns={'rota': 'chave'})
    nemp = (sh / tot > 0.01).groupby(level=[0, 1]).sum().rename('n_empresas').reset_index().rename(columns={'rota': 'chave'})
    rt = rt.merge(hhi, on=['periodo', 'chave'], how='left').merge(nemp, on=['periodo', 'chave'], how='left')
    serie = pd.concat([br, emp, rt], ignore_index=True)

    # ---------------- atributos de rota (ultimos 12 meses)
    ult12 = sorted(p.periodo.unique())[-12:]
    r12 = p[p.periodo.isin(ult12)]
    att = _agrega(r12, ['rota']).set_index('rota')
    att['distancia_km'] = [distancia(r) for r in att.index]
    o, d = zip(*[r.split('-') for r in att.index])
    att['origem'], att['destino'] = o, d
    att['nome'] = [f'{rotulo(a)}–{rotulo(b)}' for a, b in zip(o, d)]
    att['cidades'] = [f'{cidade(a)} – {cidade(b)}' for a, b in zip(o, d)]
    att = att.sort_values('assentos', ascending=False)
    att['rank'] = np.arange(1, len(att) + 1)
    # participacao por companhia (ultimos 12 meses) nas rotas do simulador
    top_fusao = att.index[:N_ROTAS_FUSAO]
    re_ = _agrega(r12[r12.rota.isin(top_fusao)], ['rota', 'grupo'])
    re_['share'] = re_.assentos / re_.groupby('rota').assentos.transform('sum')
    att['hhi_12m'] = (re_.assign(s2=re_.share ** 2).groupby('rota').s2.sum()).reindex(att.index)

    serie_modelo = serie[(serie.nivel != 'rota') | serie.chave.isin(att.index[:N_ROTAS_MODELO])]
    serie.to_parquet(SAIDA / 'serie_todas_rotas.parquet', index=False)
    serie_modelo.to_csv(SAIDA / 'serie_mensal.csv', index=False)
    att.reset_index().to_csv(SAIDA / 'rotas.csv', index=False)
    re_.to_csv(SAIDA / 'rota_empresa.csv', index=False)
    m.reset_index().to_csv(SAIDA / 'macro.csv', index=False)
    print(f'series: {serie_modelo.groupby(["nivel"]).chave.nunique().to_dict()}; base {mes_base}; '
          f'rotas: {len(att)}; cobertura top{N_ROTAS_MODELO}: {att.assentos[:N_ROTAS_MODELO].sum() / att.assentos.sum():.1%}')
    return serie, att, re_, m, mes_base


if __name__ == '__main__':
    construir()
