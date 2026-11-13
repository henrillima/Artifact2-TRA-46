# -*- coding: utf-8 -*-
"""
agregar.py — ARTEF2 (TRA-46, Grupo 02)

Le os microdados de tarifas aereas domesticas da ANAC (um CSV AAAAMM por mes, dentro de .zip
ou solto), aplica a mesma limpeza do ARTEF1 e gera:

  dados/painel.parquet          ano, mes, empresa, origem, destino, assentos, receita, receita2
                                (receita = soma tarifa x assentos; receita2 = soma tarifa^2 x assentos; nominais)
  dados/nacional_mensal.csv     por mes: assentos, media e quantis ponderados (nominais)
  dados/qualidade.csv           relatorio de qualidade por arquivo

Uso:  python3 agregar.py PASTA_COM_ZIPS [PASTA2 ...]
"""
import io
import re
import sys
import time
import unicodedata
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).resolve().parent.parent / 'dados'
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
QS = [0.10, 0.25, 0.50, 0.75, 0.90]
PRIMEIRO_MES = '201501'   # o SAS da ANAC às vezes inclui anos antigos (2006-2012) no .zip; a série do ARTEF2 começa em 2015


def norm_col(c):
    s = ''.join(ch for ch in unicodedata.normalize('NFKD', str(c)) if not unicodedata.combining(ch))
    return s.strip().strip('"').strip().lower()


def listar(pastas):
    itens = {}
    for base in pastas:
        for p in sorted(Path(base).rglob('*')):
            if not p.is_file():
                continue
            if p.suffix.lower() == '.zip':
                try:
                    with zipfile.ZipFile(p) as z:
                        for nome in z.namelist():
                            m = re.fullmatch(r'(\d{6})(?: \(\d+\))?\.csv', Path(nome).name, flags=re.I)
                            if m and m.group(1) >= PRIMEIRO_MES:
                                itens[m.group(1)] = ('zip', p, nome)
                except zipfile.BadZipFile:
                    print(f'AVISO: {p.name} nao e zip valido', flush=True)
            elif p.suffix.lower() == '.csv':
                m = re.fullmatch(r'(\d{6})(?: \(\d+\))?\.csv', p.name, flags=re.I)
                if m and m.group(1) >= PRIMEIRO_MES:
                    itens[m.group(1)] = ('csv', p, None)
    return dict(sorted(itens.items()))


def ler(item):
    tipo, p, nome = item
    if tipo == 'zip':
        with zipfile.ZipFile(p) as z:
            return z.read(nome)
    return p.read_bytes()


def limpar(tag, item):
    raw = ler(item)
    try:
        txt, enc = raw.decode('utf-8-sig'), 'utf-8'
    except UnicodeDecodeError:
        txt, enc = raw.decode('latin-1'), 'latin-1'
    df = pd.read_csv(io.StringIO(txt), sep=';', dtype=str, keep_default_na=False)
    ren = {c: REV[norm_col(c)] for c in df.columns if norm_col(c) in REV}
    faltam = set(COLUNAS) - set(ren.values())
    if faltam:
        raise SystemExit(f'{tag}: colunas nao reconhecidas {sorted(faltam)}; cabecalho: {list(df.columns)}')
    df = df[list(ren)].rename(columns=ren)
    q = {'arquivo': tag, 'codificacao': enc, 'linhas_brutas': len(df)}
    t = df['tarifa'].str.strip().str.replace('"', '', regex=False)
    ambos = t.str.contains(',', regex=False) & t.str.contains('.', regex=False)
    t = t.mask(ambos, t.str.replace('.', '', regex=False)).str.replace(',', '.', regex=False)
    out = pd.DataFrame({
        'ano': pd.to_numeric(df['ano'], errors='coerce'),
        'mes': pd.to_numeric(df['mes'], errors='coerce'),
        'tarifa': pd.to_numeric(t, errors='coerce'),
        'assentos': pd.to_numeric(df['assentos'].str.strip().str.replace('"', '', regex=False), errors='coerce'),
    })
    for c in ('empresa', 'origem', 'destino'):
        out[c] = df[c].str.strip().str.strip('"').str.upper()
    ea, em = int(tag[:4]), int(tag[4:])
    ok = (out.ano == ea) & (out.mes == em) & (out.tarifa > 0) & (out.assentos > 0)
    q['linhas_invalidas'] = int((~ok).sum())
    if len(out) and (~ok).mean() > 0.001:
        raise SystemExit(f'{tag}: mais de 0,1% de linhas invalidas ({int((~ok).sum())})')
    out = out[ok].reset_index(drop=True)
    q['linhas_validas'] = len(out)
    q['assentos'] = float(out.assentos.sum())
    q['tarifa_max'] = float(out.tarifa.max())
    return out, q


def quantis(v, w, qs):
    o = np.argsort(v, kind='stable')
    v, c = v[o], np.cumsum(w[o], dtype=np.float64)
    return [float(v[min(int(np.searchsorted(c, x * c[-1])), len(v) - 1)]) for x in qs]


def main(pastas):
    OUT.mkdir(parents=True, exist_ok=True)
    itens = listar(pastas)
    if not itens:
        raise SystemExit('Nenhum arquivo AAAAMM.csv encontrado.')
    print(f'{len(itens)} meses: {min(itens)} a {max(itens)}', flush=True)
    blocos, nac, qual = [], [], []
    t0 = time.time()
    for tag, item in itens.items():
        df, q = limpar(tag, item)
        df['receita'] = df.tarifa * df.assentos
        df['receita2'] = df.tarifa ** 2 * df.assentos
        g = (df.groupby(['ano', 'mes', 'empresa', 'origem', 'destino'], sort=False)
               [['assentos', 'receita', 'receita2']].sum().reset_index())
        assert abs(g.assentos.sum() - df.assentos.sum()) < 1e-6
        blocos.append(g)
        v, w = df.tarifa.to_numpy(float), df.assentos.to_numpy(float)
        S = w.sum()
        nac.append(dict(ano=int(tag[:4]), mes=int(tag[4:]), assentos=S, media=float((v * w).sum() / S),
                        **{f'p{int(x * 100)}': y for x, y in zip(QS, quantis(v, w, QS))}))
        qual.append(q)
        print(f'  {tag}: {q["linhas_validas"]:>9,} linhas, {len(g):>7,} celulas  ({time.time() - t0:5.0f}s)', flush=True)
    painel = pd.concat(blocos, ignore_index=True)
    for c in ('empresa', 'origem', 'destino'):
        painel[c] = painel[c].astype('category')
    painel['ano'] = painel.ano.astype('int16')
    painel['mes'] = painel.mes.astype('int8')
    painel.to_parquet(OUT / 'painel.parquet', index=False)
    pd.DataFrame(nac).to_csv(OUT / 'nacional_mensal.csv', index=False)
    pd.DataFrame(qual).to_csv(OUT / 'qualidade.csv', index=False)
    print(f'Painel: {len(painel):,} celulas, {painel.assentos.sum():,.0f} assentos. Pronto em {time.time() - t0:.0f}s.')


if __name__ == '__main__':
    main(sys.argv[1:])
