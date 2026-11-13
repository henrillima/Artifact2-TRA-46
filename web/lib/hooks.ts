'use client';
import { useEffect, useState } from 'react';
import { getParametros, getPrevAssentos, getPrevisao, getSerie, Prev, PrevAssentos, previsaoHierarquica, SerieMes } from './dados';
import { addMes } from './sim';
import type { Escolha } from '@/components/SeletorSerie';

/** Assentos futuros para séries sem previsão própria: mesmo mês do ano anterior x crescimento dos últimos 12 meses (limitado a ±10%). */
export function assentosIngenuo(serie: SerieMes[], horiz = 18): PrevAssentos[] {
  if (serie.length < 24) return [];
  const mapa = new Map(serie.map((s) => [s.periodo, s.assentos]));
  const ult = serie[serie.length - 1].periodo;
  const soma = (a: number, b: number) => { let t = 0; for (let k = a; k <= b; k++) t += mapa.get(addMes(ult, -k)) ?? 0; return t; };
  const g = Math.min(Math.max(soma(0, 11) / Math.max(soma(12, 23), 1), 0.9), 1.1);
  const out: PrevAssentos[] = [];
  for (let h = 1; h <= horiz; h++) {
    const anos = Math.floor((h - 1) / 12) + 1;
    out.push({ periodo: addMes(ult, h), h, assentos: (mapa.get(addMes(ult, h - 12 * anos)) ?? 0) * g ** anos });
  }
  return out;
}

export function useSerie(escolha: Escolha) {
  const [estado, setEstado] = useState<{ serie: SerieMes[]; prev: Prev[]; assentos: PrevAssentos[]; par: Record<string, any> | null;
    carregando: boolean; erro: string | null; hierarquico: boolean }>({ serie: [], prev: [], assentos: [], par: null, carregando: true, erro: null, hierarquico: false });
  useEffect(() => {
    let vivo = true;
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    (async () => {
      const [serie, par] = await Promise.all([getSerie(escolha.nivel, escolha.chave), getParametros()]);
      let prev = await getPrevisao(escolha.nivel, escolha.chave);
      let assentos = await getPrevAssentos(escolha.nivel, escolha.chave);
      let hierarquico = false;
      if (prev.length === 0) { prev = await previsaoHierarquica(serie); hierarquico = true; }
      if (assentos.length === 0) assentos = assentosIngenuo(serie);
      if (vivo) setEstado({ serie, prev, assentos, par, carregando: false, erro: null, hierarquico });
    })().catch((e) => vivo && setEstado((s) => ({ ...s, carregando: false, erro: (e as Error).message ?? String(e) })));
    return () => { vivo = false; };
  }, [escolha.nivel, escolha.chave]);
  return estado;
}

export const NOMES_MODELOS: Record<string, string> = {
  ingenuo: 'Sazonal ingênuo', ets: 'Suavização exponencial (Holt-Winters)', hierarquico: 'Hierárquico (nacional × nível relativo)',
  ridge: 'Regressão linear (ridge)', arvore: 'Árvore de decisão', floresta: 'Floresta aleatória', boosting: 'Gradient boosting',
  knn: 'k vizinhos mais próximos', svm: 'Máquina de vetores de suporte (SVR)', mlp: 'Rede neural (MLP)',
};
