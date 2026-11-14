'use client';
import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import Grafico, { Ponto } from '@/components/Grafico';
import { CurvasROC, MatrizConfusao } from '@/components/Avaliacao';
import { Controle, Deslizante, Estado, Kpi, SalvarCenario, Titulo } from '@/components/ui';
import { AeroMes, Evento, getAeroportos, getEventos, getParametros, getPrevAssentos, getPrevisao, getSerie, Prev, PrevAssentos, SerieMes } from '@/lib/dados';
import { assentosIngenuo } from '@/lib/hooks';
import { fmtMes, fmtN, fmtP, fmtR, intensificar, respostaTarifaEvento, Trajetoria, trajetoriaPersonalizada } from '@/lib/sim';

type Base = { serie: SerieMes[]; tarifa: { periodo: string; h: number; v: number }[]; assentos: PrevAssentos[] };

export default function PaginaDemanda() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [aero, setAero] = useState<AeroMes[]>([]);
  const [br, setBr] = useState<{ serie: SerieMes[]; prev: Prev[]; ass: PrevAssentos[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escopo, setEscopo] = useState('BR');
  const [modelo, setModelo] = useState('pandemia');
  const [intens, setIntens] = useState(0.5);
  const [dur, setDur] = useState(1);
  const [queda, setQueda] = useState(40);
  const [pior, setPior] = useState(1);
  const [meia, setMeia] = useState(4);
  const [resp, setResp] = useState<number | null>(null);
  const [inicio, setInicio] = useState(1);
  const [aeroGraf, setAeroGraf] = useState('SBPA');
  const [detector, setDetector] = useState<'isolamento' | 'lof' | 'kmedias' | 'gmm'>('isolamento');
  const [classif, setClassif] = useState('svm');
  const [aval, setAval] = useState<Record<string, any> | null>(null);
  useEffect(() => { getParametros().then((p) => setAval(p.anomalias_avaliacao ?? null)).catch(() => {}); }, []);

  useEffect(() => {
    Promise.all([getEventos(), getAeroportos(), getSerie('brasil', 'BR'), getPrevisao('brasil', 'BR'), getPrevAssentos('brasil', 'BR')])
      .then(([e, a, s, p, pa]) => { setEventos(e); setAero(a); setBr({ serie: s, prev: p, ass: pa }); })
      .catch((x) => setErro((x as Error).message));
  }, []);
  // link vindo das análises: /demanda?aeroporto=SBPA
  useEffect(() => {
    const ic = new URLSearchParams(window.location.search).get('aeroporto');
    if (ic && aero.some((x) => x.icao === ic)) { setEscopo(ic); setAeroGraf(ic); }
  }, [aero]);

  const aeroportos = useMemo(() => {
    const m = new Map<string, { icao: string; nome: string; mov: number }>();
    aero.forEach((x) => { const o = m.get(x.icao) ?? { icao: x.icao, nome: `${x.aeroporto} · ${x.cidade}`, mov: 0 }; o.mov += x.mov; m.set(x.icao, o); });
    return Array.from(m.values()).sort((p, q) => q.mov - p.mov);
  }, [aero]);

  const base: Base | null = useMemo(() => {
    if (!br) return null;
    const melhor = br.prev.filter((p) => p.melhor);
    if (escopo === 'BR') return { serie: br.serie, tarifa: melhor.map((p) => ({ periodo: p.periodo, h: p.h, v: p.previsto })), assentos: br.ass };
    const s: SerieMes[] = aero.filter((x) => x.icao === escopo).map((x) => ({ periodo: x.periodo, assentos: x.mov, tarifa_real: x.tarifa, tarifa_nominal: x.tarifa, hhi: null }));
    const mapaBr = new Map(br.serie.map((x) => [x.periodo, x.tarifa_real]));
    const rel = s.slice(-12).reduce((a, x) => a + Math.log(x.tarifa_real / (mapaBr.get(x.periodo) ?? x.tarifa_real)), 0) / 12;
    return { serie: s, tarifa: melhor.map((p) => ({ periodo: p.periodo, h: p.h, v: p.previsto * Math.exp(rel) })), assentos: assentosIngenuo(s) };
  }, [br, aero, escopo]);

  const ev = eventos.find((x) => x.id === modelo);
  const respEvento = ev ? respostaTarifaEvento(ev.trajetoria) : 0;
  const traj: Trajetoria = useMemo(() => {
    if (modelo === 'livre') return trajetoriaPersonalizada(queda / 100, pior, meia, resp ?? respEvento);
    if (!ev) return [];
    return intensificar(ev.trajetoria, intens, dur);
  }, [modelo, ev, intens, dur, queda, pior, meia, resp, respEvento]);

  const linhas = useMemo(() => {
    if (!base) return [];
    const mapaA = new Map(base.assentos.map((a) => [a.periodo, a.assentos]));
    return base.tarifa.map((t) => {
      const k = t.h - inicio;
      const f = k >= 0 && k < traj.length ? traj[k] : { assentos: 1, tarifa: 1 };
      const a0 = mapaA.get(t.periodo) ?? 0;
      return { periodo: t.periodo, h: t.h, t0: t.v, t1: t.v * f.tarifa, a0, a1: a0 * f.assentos };
    });
  }, [base, traj, inicio]);

  const perdidos = linhas.reduce((s, l) => s + (l.a0 - l.a1), 0);
  const rec0 = linhas.reduce((s, l) => s + l.t0 * l.a0, 0), rec1 = linhas.reduce((s, l) => s + l.t1 * l.a1, 0);
  const pioresMes = linhas.reduce((p, l) => (l.a1 / Math.max(l.a0, 1) < p.r ? { r: l.a1 / Math.max(l.a0, 1), periodo: l.periodo } : p), { r: 1, periodo: '' });
  const recup = traj.findIndex((t, k) => k > traj.findIndex((x) => x.assentos === Math.min(...traj.map((y) => y.assentos))) && t.assentos >= 0.95);
  const ult = base?.serie.length ? base.serie[base.serie.length - 1].periodo : '';

  const ptsA: Ponto[] = base ? [...base.serie.slice(-24).map((s) => ({ periodo: s.periodo, real: s.assentos })), ...linhas.map((l) => ({ periodo: l.periodo, base: l.a0, cenario: l.a1 }))] : [];
  const ptsT: Ponto[] = base ? [...base.serie.slice(-24).map((s) => ({ periodo: s.periodo, real: s.tarifa_real })), ...linhas.map((l) => ({ periodo: l.periodo, base: l.t0, cenario: l.t1 }))] : [];

  // cada detector marca os 2% de aeroportos-mês com maior escore (mesma taxa de alerta para todos)
  const escore = (x: AeroMes) => (detector === 'isolamento' ? x.escore_isolamento : (x[`escore_${detector}` as keyof AeroMes] as number | null) ?? 0);
  const temNovos = aero.some((x) => x.escore_lof != null);
  const corte = useMemo(() => {
    const v = aero.map(escore).sort((a, b) => a - b);
    return v.length ? v[Math.floor(0.98 * (v.length - 1))] : Infinity;
  }, [aero, detector]); // eslint-disable-line react-hooks/exhaustive-deps
  const ehAnom = (x: AeroMes) => (detector === 'isolamento' ? x.anomalo : escore(x) >= corte);
  const anom = aero.filter(ehAnom).sort((p, q) => escore(q) - escore(p));
  const clip = (v: number) => Math.max(Math.min(v, Math.log(4)), Math.log(0.05));   // mostra entre -95% e +300%
  const pct = (v: number) => 100 * (Math.exp(clip(v)) - 1);
  const serieAero = aero.filter((x) => x.icao === aeroGraf).map((x) => ({ periodo: x.periodo, rel: pct(x.rel_mov), anom: ehAnom(x) ? pct(x.rel_mov) : null }));
  const fmtRel = (v: number) => (v > Math.log(4) ? 'acima de +300%' : v < Math.log(0.05) ? 'abaixo de −95%' : fmtP(Math.exp(v) - 1, 0));

  return (
    <div className="space-y-5">
      <Titulo titulo="Choques de demanda"
        sub={<>Aplica à previsão base um choque com o formato de eventos reais detectados nos dados (pandemia, enchente no Rio Grande do Sul) ou
          um choque definido pelo usuário, no Brasil todo ou num aeroporto. Abaixo, o detector de anomalias que encontrou esses eventos.</>} />
      <Estado carregando={!br && !erro} erro={erro} />
      {base && (
        <>
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="cartao space-y-4">
              <Controle rotulo="Onde">
                <select className="campo w-full" value={escopo} onChange={(e) => setEscopo(e.target.value)}>
                  <option value="BR">Brasil (todas as rotas)</option>{aeroportos.map((a) => <option key={a.icao} value={a.icao}>{a.nome}</option>)}
                </select></Controle>
              <Controle rotulo="Formato do choque">
                <select className="campo w-full" value={modelo} onChange={(e) => setModelo(e.target.value)}>
                  {eventos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}<option value="livre">Personalizado</option>
                </select></Controle>
              {modelo !== 'livre' ? (
                <>
                  <Controle rotulo="Intensidade relativa ao evento" valor={`${fmtN(100 * intens)}%`}><Deslizante v={intens} set={setIntens} min={0.1} max={1.5} passo={0.05} /></Controle>
                  <Controle rotulo="Duração relativa ao evento" valor={`${fmtN(dur, 2)}×`}><Deslizante v={dur} set={setDur} min={0.25} max={2} passo={0.05} /></Controle>
                  <p className="nota">{ev?.nota} Resposta da tarifa à queda de assentos no evento: {fmtN(respEvento, 2)} (inclinação de ln tarifa em ln assentos).</p>
                </>
              ) : (
                <>
                  <Controle rotulo="Queda de assentos no pior mês" valor={`${queda}%`}><Deslizante v={queda} set={setQueda} min={5} max={95} passo={5} /></Controle>
                  <Controle rotulo="Meses até o pior momento" valor={`${pior}`}><Deslizante v={pior} set={setPior} min={0} max={6} passo={1} /></Controle>
                  <Controle rotulo="Meia-vida da recuperação" valor={`${meia} meses`}><Deslizante v={meia} set={setMeia} min={1} max={18} passo={1} /></Controle>
                  <Controle rotulo="Resposta da tarifa à queda de demanda" valor={fmtN(resp ?? respEvento, 2)} ajuda="Positivo: tarifa cai junto com a demanda (como na pandemia).">
                    <Deslizante v={resp ?? respEvento} set={setResp} min={-0.5} max={1} passo={0.05} /></Controle>
                </>
              )}
              <Controle rotulo="Início" valor={linhas.find((l) => l.h === inicio) ? fmtMes(linhas.find((l) => l.h === inicio)!.periodo) : ''}><Deslizante v={inicio} set={setInicio} min={1} max={12} passo={1} /></Controle>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <Kpi rotulo="Assentos perdidos" valor={fmtN(perdidos)} sub={fmtP(-perdidos / Math.max(linhas.reduce((s, l) => s + l.a0, 0), 1)) + ' no horizonte'} />
                <Kpi rotulo="Receita perdida" valor={fmtR((rec0 - rec1) / 1e6, 0) + ' mi'} sub={fmtP(rec1 / Math.max(rec0, 1) - 1)} />
                <Kpi rotulo="Pior mês" valor={pioresMes.periodo ? fmtMes(pioresMes.periodo) : '—'} sub={fmtP(pioresMes.r - 1) + ' de assentos'} />
                <Kpi rotulo="Recuperação a 95%" valor={recup > 0 ? `${recup} meses` : 'além do horizonte'} sub="desde o início do choque" />
              </div>
              <div className="cartao"><div className="mb-1 font-semibold">Assentos vendidos</div>
                <Grafico pontos={ptsA} formato={(v) => fmtN(v / 1000, 0) + ' mil'} corte={ult} altura={280} rotulos={{ base: 'Base', cenario: 'Com o choque' }} /></div>
              <div className="cartao"><div className="mb-1 font-semibold">Tarifa real</div>
                <Grafico pontos={ptsT} formato={(v) => fmtR(v)} corte={ult} altura={240} rotulos={{ base: 'Base', cenario: 'Com o choque' }} /></div>
            </div>
          </div>
          <SalvarCenario tipo="demanda" parametros={{ pagina: '/demanda', escopo, modelo, intens, dur, queda, pior, meia, inicio }}
            resumo={{ escopo, formato: ev?.nome ?? 'Personalizado', assentos_perdidos: Math.round(perdidos), receita_perdida_mi: Math.round((rec0 - rec1) / 1e6) }} />

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="cartao">
              <div className="mb-1 font-semibold">Detector de anomalias: movimento do aeroporto em relação ao Brasil</div>
              <div className="mb-2 flex flex-wrap gap-2">
                <select className="campo" value={aeroGraf} onChange={(e) => setAeroGraf(e.target.value)}>
                  {aeroportos.map((a) => <option key={a.icao} value={a.icao}>{a.nome}</option>)}
                </select>
                {temNovos && (
                  <select className="campo" value={detector} onChange={(e) => setDetector(e.target.value as typeof detector)}>
                    <option value="isolamento">Floresta de isolamento</option><option value="gmm">Mistura gaussiana (estatístico)</option>
                    <option value="lof">LOF (densidade local)</option><option value="kmedias">Distância ao centroide (k-médias)</option>
                  </select>
                )}
              </div>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer><ComposedChart data={serieAero}>
                  <CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="periodo" tickFormatter={fmtMes} minTickGap={28} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} unit="%" width={60} /><Tooltip labelFormatter={(l) => fmtMes(String(l))} formatter={(v: number) => fmtN(v, 0) + '%'} />
                  <ReferenceLine y={0} stroke="var(--nom)" />
                  <Line dataKey="rel" name="Assentos: variação em 12 meses relativa à do Brasil" stroke="var(--ink)" dot={false} isAnimationActive={false} />
                  <Scatter dataKey="anom" name="Anomalia" fill="var(--warn)" />
                </ComposedChart></ResponsiveContainer>
              </div>
              <p className="nota">Eixo limitado entre −95% e +300%. Quatro atributos (variação em 12 meses de assentos e tarifa, absoluta e relativa ao Brasil) dos 40 maiores aeroportos;
                cada detector marca os 2% de aeroportos-mês com maior escore. Os enfoques são os da Aula 6 (estatístico, densidade e clusterização); a floresta de isolamento é um extra.</p>
            </div>
            <div className="cartao max-h-[420px] overflow-auto">
              <div className="mb-2 font-semibold">Meses mais anômalos</div>
              <table className="tabela">
                <thead><tr><th>Mês</th><th>Aeroporto</th><th className="text-right">Assentos vs. Brasil</th><th className="text-right">Tarifa vs. Brasil</th><th className="text-right">Escore</th></tr></thead>
                <tbody>{anom.slice(0, 40).map((x) => (
                  <tr key={x.icao + x.periodo} className="cursor-pointer hover:bg-soft" onClick={() => setAeroGraf(x.icao)}>
                    <td>{fmtMes(x.periodo)}</td><td>{x.aeroporto} <span className="text-muted">{x.cidade}</span></td>
                    <td className="text-right">{fmtRel(x.rel_mov)}</td><td className="text-right">{fmtRel(x.rel_tarifa)}</td>
                    <td className="text-right">{fmtN(escore(x), 2)}</td></tr>))}
                </tbody>
              </table>
            </div>
          </div>
          {aval && (
            <>
              <h2 className="pt-4 text-[1.8rem]">Os detectores acertam os eventos conhecidos?</h2>
              <p className="-mt-2 max-w-[78ch] text-muted">Rotulamos como evento a pandemia (todos os aeroportos, mar/2020 a dez/2021) e a enchente no RS (Porto Alegre, mai a out/2024):
                {' '}{fmtN(aval.positivos)} de {fmtN(aval.n)} aeroportos-mês. Com esses rótulos dá para medir os detectores não supervisionados e treinar classificadores
                supervisionados, como no Lab 6 (classes desbalanceadas, pesos inversos à frequência).</p>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="cartao overflow-x-auto">
                  <h3 className="mb-2 text-[1.3rem]">Não supervisionados (alerta nos 2% maiores escores)</h3>
                  <table className="tabela">
                    <thead><tr><th>Detector</th><th className="text-right">Precisão</th><th className="text-right">Recall</th><th className="text-right">F1</th><th className="text-right">AUC</th></tr></thead>
                    <tbody>{Object.values(aval.nao_supervisionado as Record<string, any>).sort((a: any, b: any) => b.auc - a.auc).map((d: any) => (
                      <tr key={d.nome}><td>{d.nome}</td><td className="text-right">{fmtN(d.precisao, 2)}</td><td className="text-right">{fmtN(d.recall, 2)}</td>
                        <td className="text-right">{fmtN(d.f1, 2)}</td><td className="text-right font-semibold">{fmtN(d.auc, 2)}</td></tr>))}</tbody>
                  </table>
                  <p className="nota mt-2">Com só 2% de alertas, o recall fica baixo por construção (há {fmtN(100 * aval.positivos / aval.n, 0)}% de eventos). A AUC, que não depende do corte,
                    mostra quem ordena melhor os meses: aqui, {(Object.values(aval.nao_supervisionado) as any[]).sort((a, b) => b.auc - a.auc)[0].nome.toLowerCase()}.
                    Mistura gaussiana com {aval.componentes_gmm} componentes (BIC); k-médias com k = {aval.k_kmedias} (silhueta).</p>
                </div>
                <div className="cartao">
                  <h3 className="mb-1 text-[1.3rem]">Curvas ROC (não supervisionados)</h3>
                  <CurvasROC curvas={Object.entries(aval.nao_supervisionado as Record<string, any>).map(([k, d]: [string, any], i) => ({
                    nome: d.nome.split(' (')[0], cor: ['var(--sig)', 'var(--warn)', 'var(--azu)', 'var(--one)', 'var(--nom)'][i % 5], pontos: d.roc, auc: d.auc }))} />
                </div>
                <div className="cartao overflow-x-auto">
                  <h3 className="mb-2 text-[1.3rem]">Supervisionados ({aval.divisao})</h3>
                  <table className="tabela">
                    <thead><tr><th>Classificador</th><th className="text-right">Acurácia</th><th className="text-right">Precisão</th><th className="text-right">Recall</th><th className="text-right">F1</th><th className="text-right">AUC</th></tr></thead>
                    <tbody>{Object.entries(aval.supervisionado as Record<string, any>).map(([k, d]: [string, any]) => (
                      <tr key={k} className={`cursor-pointer ${k === classif ? 'bg-soft' : ''}`} onClick={() => setClassif(k)}>
                        <td>{d.nome}</td><td className="text-right">{fmtN(d.acuracia, 2)}</td><td className="text-right">{fmtN(d.precisao, 2)}</td>
                        <td className="text-right">{fmtN(d.recall, 2)}</td><td className="text-right">{fmtN(d.f1, 2)}</td><td className="text-right font-semibold">{fmtN(d.auc, 2)}</td></tr>))}</tbody>
                  </table>
                  <p className="nota mt-2">Base de teste: {fmtN(aval.supervisionado.svm?.n ?? 0)} aeroportos-mês. A regressão logística traça uma fronteira linear e não separa bem um evento que aparece
                    tanto como queda forte (2020) quanto como alta forte na comparação anual (2021); árvore e SVM com kernel radial capturam os dois lados. Hiperparâmetros por validação cruzada 5-fold
                    (poda da árvore; kernel e C do SVM). Clique num classificador para ver a matriz de confusão.</p>
                </div>
                <div className="cartao">
                  <h3 className="mb-2 text-[1.3rem]">Matriz de confusão · {aval.supervisionado[classif]?.nome}</h3>
                  {aval.supervisionado[classif] && <MatrizConfusao m={aval.supervisionado[classif].matriz_confusao} />}
                  <div className="mt-3">
                    <CurvasROC altura={230} curvas={Object.entries(aval.supervisionado as Record<string, any>).map(([k, d]: [string, any], i) => ({
                      nome: d.nome.split(' (')[0], cor: ['var(--sig)', 'var(--warn)', 'var(--azu)'][i % 3], pontos: d.roc, auc: d.auc }))} />
                  </div>
                  {aval.supervisionado.logistica?.coeficientes && (
                    <p className="nota mt-1">Coeficientes da logística (atributos padronizados): {Object.entries(aval.supervisionado.logistica.coeficientes as Record<string, number>)
                      .map(([k, v]) => `${k.replace('_', ' ')} ${fmtN(v, 2)}`).join('; ')}.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
