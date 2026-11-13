'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Grafico, { Ponto } from '@/components/Grafico';
import { Estado, Kpi } from '@/components/ui';
import { getParametros, getPrevisao, getSerie, Prev, SerieMes } from '@/lib/dados';
import { NOMES_MODELOS } from '@/lib/hooks';
import { fmtMes, fmtN, fmtP, fmtR } from '@/lib/sim';

const CARTOES = [
  ['/analises', 'Análises da base completa', 'Tudo o que o ARTEF1 tinha (panorama, casos reais, sazonalidade, faixas de preço, companhias, rotas, aeroportos e método), agora de 2015 a 2026, com a Avianca separada e o caso da saída dela em 2019.'],
  ['/previsao', 'Previsão da tarifa', 'Dez modelos (de suavização exponencial a redes neurais) competem em validação fora da amostra; escolha Brasil, companhia ou qualquer rota.'],
  ['/custos', 'Choque de custos', 'Mexa no querosene e no câmbio e veja o repasse para a tarifa e a reação da demanda, com elasticidades estimadas nos dados.'],
  ['/fusao', 'Fusão e concentração', 'Junte duas companhias e veja o HHI por rota, o enquadramento no guia do CADE e o efeito previsto na tarifa.'],
  ['/demanda', 'Choques de demanda', 'Replique a pandemia ou a enchente no RS com outra intensidade, ou desenhe um choque, no Brasil ou num aeroporto.'],
  ['/segmentos', 'Segmentos de rotas', 'Agrupamento das 300 maiores rotas por k-médias, a partir de distância, densidade, sazonalidade e concentração.'],
  ['/cenarios', 'Cenários salvos', 'Simulações gravadas no banco pelo grupo, para comparar hipóteses e citar no artigo.'],
];

export default function Inicio() {
  const [serie, setSerie] = useState<SerieMes[]>([]);
  const [prev, setPrev] = useState<Prev[]>([]);
  const [par, setPar] = useState<Record<string, any> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([getSerie('brasil', 'BR'), getPrevisao('brasil', 'BR'), getParametros()])
      .then(([s, p, x]) => { setSerie(s); setPrev(p); setPar(x); }).catch((e) => setErro((e as Error).message));
  }, []);
  const melhor = prev.filter((p) => p.melhor && p.h <= 12);
  const k = useMemo(() => {
    const u = serie.slice(-12), a = serie.slice(-24, -12);
    const media = (x: SerieMes[]) => x.reduce((s, v) => s + v.tarifa_real * v.assentos, 0) / Math.max(x.reduce((s, v) => s + v.assentos, 0), 1);
    return { tar: media(u), tarAnt: media(a), ass: u.reduce((s, v) => s + v.assentos, 0), assAnt: a.reduce((s, v) => s + v.assentos, 0),
      prev: melhor.reduce((s, p) => s + p.previsto, 0) / Math.max(melhor.length, 1) };
  }, [serie, melhor]);
  const pontos: Ponto[] = [...serie.map((s) => ({ periodo: s.periodo, real: s.tarifa_real })),
    ...melhor.map((p) => ({ periodo: p.periodo, previsto: p.previsto, f80: [p.lo80, p.hi80] as [number, number], f95: [p.lo95, p.hi95] as [number, number] }))];
  const ult = serie.length ? serie[serie.length - 1].periodo : '';
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-tinta p-6 text-white md:p-8">
        <div className="text-sm uppercase tracking-wider text-sky-200">ARTEF2 · TRA-46 Economia Aplicada · ITA · Grupo 02</div>
        <h1 className="mt-2 text-3xl font-bold md:text-4xl">Quanto vai custar voar no Brasil, e o que muda se o cenário mudar?</h1>
        <p className="mt-3 max-w-3xl text-slate-200">
          As análises do ARTEF1 continuam aqui, agora para a base inteira, e o ARTEF2 acrescenta previsão e simulação de cenários. Tudo sobre {par ? `os microdados de tarifas aéreas domésticas da ANAC de ${fmtMes(par.primeiro_mes_dados)} a ${fmtMes(par.ultimo_mes_dados)}` : 'os microdados de tarifas aéreas domésticas da ANAC'},
          com valores em reais de {par ? fmtMes(par.mes_base_real) : '…'}: aprendizado de máquina para prever, econometria para medir repasses e elasticidades,
          e simuladores de custos, fusões e choques de demanda.
        </p>
      </section>
      <Estado carregando={!serie.length && !erro} erro={erro} />
      {serie.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi rotulo="Tarifa real média, últimos 12 meses" valor={fmtR(k.tar)} sub={fmtP(k.tar / k.tarAnt - 1) + ' sobre os 12 meses anteriores'} />
            <Kpi rotulo="Assentos vendidos, últimos 12 meses" valor={fmtN(k.ass / 1e6, 1) + ' mi'} sub={fmtP(k.ass / k.assAnt - 1)} />
            <Kpi rotulo="Tarifa prevista, próximos 12 meses" valor={fmtR(k.prev)} sub={`modelo: ${NOMES_MODELOS[melhor[0]?.modelo] ?? '—'}`} />
            <Kpi rotulo="Elasticidade-preço da demanda" valor={par ? fmtN(par.demanda.elasticidade_2sls_nacional, 2) : '—'} sub="estimada por variáveis instrumentais" />
          </div>
          <div className="cartao">
            <div className="mb-2 font-semibold">Tarifa média real no Brasil, com previsão para os próximos 12 meses</div>
            <Grafico pontos={pontos} formato={(v) => fmtR(v)} corte={ult} altura={340} rotulos={{ real: 'Tarifa real observada', previsto: 'Previsão' }} />
          </div>
        </>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {CARTOES.map(([h, t, d]) => (
          <Link key={h} href={h} className={`cartao transition hover:-translate-y-0.5 hover:shadow-md ${h === '/analises' ? 'md:col-span-3' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ceu">{t} →</span>
              <span className={`rounded px-2 py-0.5 text-xs ${h === '/analises' ? 'bg-slate-100 text-slate-600' : 'bg-orange-100 text-orange-700'}`}>{h === '/analises' ? 'do ARTEF1, ampliado' : 'novo no ARTEF2'}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{d}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
