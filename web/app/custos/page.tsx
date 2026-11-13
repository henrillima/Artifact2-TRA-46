'use client';
import { useEffect, useMemo, useState } from 'react';
import Grafico, { Ponto } from '@/components/Grafico';
import SeletorSerie, { Escolha, tituloEscolha } from '@/components/SeletorSerie';
import { Controle, Deslizante, Estado, Kpi, SalvarCenario, Titulo } from '@/components/ui';
import { useSerie } from '@/lib/hooks';
import { elasticidadeRepasse, fatoresCustos, fmtMes, fmtN, fmtP, fmtR } from '@/lib/sim';

export default function PaginaCustos() {
  const [escolha, setEscolha] = useState<Escolha>({ nivel: 'brasil', chave: 'BR', titulo: '' });
  const { serie, prev, assentos, par, carregando, erro } = useSerie(escolha);
  const [jet, setJet] = useState(20);
  const [cambio, setCambio] = useState(0);
  const [inicio, setInicio] = useState(1);
  const [repasse, setRepasse] = useState<number | null>(null);
  const [fonteDemanda, setFonteDemanda] = useState<'iv' | 'mqo' | 'livre'>('iv');
  const [demandaLivre, setDemandaLivre] = useState(-1.2);
  const [horiz, setHoriz] = useState(12);

  const repPadrao = par ? elasticidadeRepasse(par.repasse, escolha.rota?.distancia_km ?? null) : 0.22;
  useEffect(() => { setRepasse(null); }, [escolha.chave]);
  const rep = repasse ?? repPadrao;
  const ponte = par?.ponte_qav?.b ?? 0.85;
  const demanda = fonteDemanda === 'iv' ? par?.demanda?.elasticidade_2sls_nacional ?? -1.9
    : fonteDemanda === 'mqo' ? par?.demanda?.elasticidade_mqo ?? -1.36 : demandaLivre;

  const melhor = prev.filter((p) => p.melhor && p.h <= horiz);
  const ult = serie.length ? serie[serie.length - 1].periodo : '';
  const mapaAss = new Map(assentos.map((a) => [a.periodo, a.assentos]));
  const p = { jet: jet / 100, cambio: cambio / 100, inicio, repasse: rep, ponte, demanda };

  const linhas = melhor.map((x) => {
    const f = fatoresCustos(p, x.h);
    const a0 = mapaAss.get(x.periodo) ?? 0;
    return { periodo: x.periodo, h: x.h, tarifa0: x.previsto, tarifa1: x.previsto * f.tarifa, ass0: a0, ass1: a0 * f.assentos };
  });
  const soma = (k: 'ass0' | 'ass1') => linhas.reduce((a, l) => a + l[k], 0);
  const rec0 = linhas.reduce((a, l) => a + l.tarifa0 * l.ass0, 0), rec1 = linhas.reduce((a, l) => a + l.tarifa1 * l.ass1, 0);
  const f = fatoresCustos(p, 99);

  const ptsTarifa: Ponto[] = useMemo(() => [
    ...serie.slice(-24).map((s) => ({ periodo: s.periodo, real: s.tarifa_real })),
    ...linhas.map((l) => ({ periodo: l.periodo, base: l.tarifa0, cenario: l.tarifa1 })),
  ], [serie, linhas]);
  const ptsAss: Ponto[] = useMemo(() => [
    ...serie.slice(-24).map((s) => ({ periodo: s.periodo, real: s.assentos })),
    ...linhas.map((l) => ({ periodo: l.periodo, base: l.ass0, cenario: l.ass1 })),
  ], [serie, linhas]);

  return (
    <div className="space-y-5">
      <Titulo titulo="Choque de custos: querosene e câmbio"
        sub={<>O querosene de aviação é cotado em dólar, então seu preço em reais muda com o petróleo e com o câmbio. O simulador
          propaga um choque pela cadeia estimada nos dados: preço internacional em reais → QAV no Brasil → tarifa → assentos vendidos.</>} />
      <SeletorSerie valor={escolha} onChange={setEscolha} />
      <Estado carregando={carregando} erro={erro} />
      {!carregando && !erro && par && (
        <>
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="cartao space-y-4">
              <Controle rotulo="Querosene no mercado internacional (US$)" valor={fmtP(jet / 100, 0)}><Deslizante v={jet} set={setJet} min={-50} max={100} passo={5} /></Controle>
              <Controle rotulo="Dólar em reais" valor={fmtP(cambio / 100, 0)}><Deslizante v={cambio} set={setCambio} min={-30} max={50} passo={5} /></Controle>
              <Controle rotulo="Choque começa no mês" valor={ult ? fmtMes(prev.find((x) => x.h === inicio)?.periodo ?? ult) : ''}><Deslizante v={inicio} set={setInicio} min={1} max={12} passo={1} /></Controle>
              <Controle rotulo="Repasse do QAV para a tarifa" valor={fmtN(rep, 2)}
                ajuda={`Estimado no painel de rotas: ${fmtN(par.repasse.elasticidade_media, 2)} (erro-padrão ${fmtN(par.repasse.ep, 2)}) na distância média; ajustado à distância da rota.`}>
                <Deslizante v={rep} set={setRepasse} min={0} max={1} passo={0.01} />
              </Controle>
              <Controle rotulo="Elasticidade-preço da demanda" valor={fmtN(demanda, 2)}>
                <select className="campo w-full" value={fonteDemanda} onChange={(e) => setFonteDemanda(e.target.value as typeof fonteDemanda)}>
                  <option value="iv">Variáveis instrumentais: {fmtN(par.demanda.elasticidade_2sls_nacional, 2)}</option>
                  <option value="mqo">Mínimos quadrados (viesada): {fmtN(par.demanda.elasticidade_mqo, 2)}</option>
                  <option value="livre">Definir manualmente</option>
                </select>
                {fonteDemanda === 'livre' && <div className="mt-2"><Deslizante v={demandaLivre} set={setDemandaLivre} min={-3} max={0} passo={0.05} /></div>}
              </Controle>
              <Controle rotulo="Horizonte" valor={`${horiz} meses`}><Deslizante v={horiz} set={setHoriz} min={3} max={18} passo={1} /></Controle>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <Kpi rotulo="QAV no Brasil" valor={fmtP(Math.exp(f.dlnQav) - 1)} sub={`ponte estimada: ${fmtN(ponte, 2)} × variação em reais`} />
                <Kpi rotulo="Tarifa média" valor={fmtP(f.tarifa - 1)} tom={f.tarifa > 1 ? 'neg' : 'pos'} sub="após o início do choque" />
                <Kpi rotulo="Assentos no período" valor={fmtP(soma('ass1') / Math.max(soma('ass0'), 1) - 1)} sub={`${fmtN(soma('ass1') - soma('ass0'))} assentos`} />
                <Kpi rotulo="Receita no período" valor={fmtP(rec1 / Math.max(rec0, 1) - 1)} sub={fmtR((rec1 - rec0) / 1e6, 1) + ' milhões'} />
              </div>
              <div className="cartao"><div className="mb-1 font-semibold">Tarifa real — {tituloEscolha(escolha)}</div>
                <Grafico pontos={ptsTarifa} formato={(v) => fmtR(v)} corte={ult} altura={300} rotulos={{ base: 'Previsão base (melhor modelo)', cenario: 'Com o choque' }} /></div>
              <div className="cartao"><div className="mb-1 font-semibold">Assentos vendidos</div>
                <Grafico pontos={ptsAss} formato={(v) => fmtN(v / 1000, 0) + ' mil'} corte={ult} altura={260} rotulos={{ base: 'Base', cenario: 'Com o choque' }} /></div>
            </div>
          </div>
          <div className="cartao nota">
            Como ler: o choque muda o preço do querosene em reais em {fmtP(Math.exp(Math.log(1 + jet / 100) + Math.log(1 + cambio / 100)) - 1)}; com elasticidade de
            {' '}{fmtN(ponte, 2)}, o QAV no Brasil varia {fmtP(Math.exp(f.dlnQav) - 1)}; a tarifa responde com defasagem de um mês e elasticidade {fmtN(rep, 2)};
            os assentos respondem à tarifa com elasticidade {fmtN(demanda, 2)}. Como a demanda é elástica (|ε| &gt; 1), um repasse de custo reduz a receita das
            companhias mesmo com tarifa maior. A previsão base mantém o QAV no último valor observado.
          </div>
          <SalvarCenario tipo="custos" parametros={{ pagina: '/custos', nivel: escolha.nivel, chave: escolha.chave, ...p, horizonte: horiz }}
            resumo={{ serie: tituloEscolha(escolha), tarifa: f.tarifa - 1, assentos: soma('ass1') / Math.max(soma('ass0'), 1) - 1, receita: rec1 / Math.max(rec0, 1) - 1 }} />
        </>
      )}
    </div>
  );
}
