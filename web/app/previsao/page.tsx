'use client';
import { useEffect, useMemo, useState } from 'react';
import Grafico, { Ponto } from '@/components/Grafico';
import SeletorSerie, { Escolha, tituloEscolha } from '@/components/SeletorSerie';
import { Controle, Deslizante, Estado, Kpi, SalvarCenario, Titulo, COR } from '@/components/ui';
import { getMetricas, getRota, getTopRotas, Metrica, serieRotaEmpresa } from '@/lib/dados';
import { NOMES_MODELOS, useSerie } from '@/lib/hooks';
import { fmtMes, fmtN, fmtP, fmtR } from '@/lib/sim';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Boxplots, Histograma } from '@/components/Avaliacao';

export default function PaginaPrevisao() {
  const [escolha, setEscolha] = useState<Escolha>({ nivel: 'brasil', chave: 'BR', titulo: '' });
  const { serie, prev, carregando, erro, hierarquico, par } = useSerie(escolha);
  const [modelo, setModelo] = useState<string>('');
  const [horiz, setHoriz] = useState(12);
  const [faixas, setFaixas] = useState<'80' | '95' | 'ambas' | 'nenhuma'>('ambas');
  const [desde, setDesde] = useState('2019-01');
  const [metricas, setMetricas] = useState<Metrica[]>([]);
  const [porEmpresa, setPorEmpresa] = useState<{ periodo: string; grupo: string; tarifa_real: number; assentos: number }[]>([]);
  useEffect(() => { getMetricas().then(setMetricas).catch(() => {}); }, []);
  // links vindos das análises: /previsao?rota=SBGR-SBRF ou /previsao?empresa=LATAM
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const emp = q.get('empresa'), rota = q.get('rota');
    if (emp && ['LATAM', 'Gol', 'Azul', 'Outras'].includes(emp)) setEscolha({ nivel: 'empresa', chave: emp, titulo: '' });
    else if (rota) {
      getTopRotas(300).then((top) => top.find((r) => r.rota === rota) ?? getRota(rota))
        .then((r) => { if (r) setEscolha({ nivel: 'rota', chave: r.rota, rota: r, titulo: '' }); }).catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (escolha.nivel !== 'rota') { setPorEmpresa([]); return; }
    serieRotaEmpresa(escolha.chave).then(setPorEmpresa).catch(() => setPorEmpresa([]));
  }, [escolha]);

  const modelos = useMemo(() => Array.from(new Set(prev.map((p) => p.modelo))), [prev]);
  const melhor = prev.find((p) => p.melhor)?.modelo ?? modelos[0];
  useEffect(() => { setModelo(melhor ?? ''); }, [melhor, escolha.chave]);
  const m = modelos.includes(modelo) ? modelo : melhor;
  const ult = serie.length ? serie[serie.length - 1].periodo : '';

  const pontos: Ponto[] = useMemo(() => {
    const hist: Ponto[] = serie.filter((s) => s.periodo >= desde).map((s) => ({ periodo: s.periodo, real: s.tarifa_real }));
    const fut = prev.filter((p) => p.modelo === m && p.h <= horiz).map((p) => ({ periodo: p.periodo, previsto: p.previsto,
      f80: [p.lo80, p.hi80] as [number, number], f95: [p.lo95, p.hi95] as [number, number] }));
    if (hist.length && fut.length) hist[hist.length - 1] = { ...hist[hist.length - 1], previsto: hist[hist.length - 1].real };
    return [...hist, ...fut];
  }, [serie, prev, m, horiz, desde]);

  const resumo = useMemo(() => {
    const fut = prev.filter((p) => p.modelo === m && p.h <= 12);
    const ult12 = serie.slice(-12);
    const mediaFut = fut.reduce((a, p) => a + p.previsto, 0) / Math.max(fut.length, 1);
    const pesos = ult12.reduce((a, s) => a + s.assentos, 0);
    const mediaUlt = ult12.reduce((a, s) => a + s.tarifa_real * s.assentos, 0) / Math.max(pesos, 1);
    const minimo = fut.reduce((a, p) => (p.previsto < a.previsto ? p : a), fut[0] ?? { previsto: 0, periodo: '' });
    const maximo = fut.reduce((a, p) => (p.previsto > a.previsto ? p : a), fut[0] ?? { previsto: 0, periodo: '' });
    return { mediaFut, mediaUlt, minimo, maximo };
  }, [prev, serie, m]);

  const nivelMet = escolha.nivel;
  const tabMet = metricas.filter((x) => x.nivel === nivelMet).sort((a, b) => a.mape - b.mape);
  const dist = (par?.erros_dist ?? {}) as Record<string, any>;
  const distSel = dist[`${m}|${nivelMet}`];
  const hip = par?.hiperparametros;
  const hipFinal = hip?.final?.[m];
  const hipOrigens = hip ? Object.entries(hip.origens as Record<string, any>).map(([o, v]) => [o, v[m]?.escolhido] as const).filter(([, e]) => e && Object.keys(e).length) : [];
  const fmtHip = (p: Record<string, any>) => Object.entries(p).map(([k, v]) => k === 'ccp_alpha' ? `alfa de poda ${fmtN(Number(v) * 1000, 2)}×10⁻³`
    : k === 'neuronios' ? `${(v as number[]).join(' + ')} neurônios` : k === 'k' ? `k = ${v}` : k === 'alpha' ? `penalidade ${fmtN(Number(v), 1)}`
    : k === 'kernel' ? `kernel ${v}` : k === 'C' ? `C = ${fmtN(Number(v), 1)}` : `${k} = ${v}`).join(', ');

  const grupos = Array.from(new Set(porEmpresa.map((x) => x.grupo)));
  const dadosEmp = useMemo(() => {
    const mapa = new Map<string, Record<string, number | string>>();
    porEmpresa.filter((x) => x.periodo >= desde).forEach((x) => {
      const o = mapa.get(x.periodo) ?? { periodo: x.periodo };
      o[x.grupo] = x.tarifa_real; mapa.set(x.periodo, o);
    });
    return Array.from(mapa.values());
  }, [porEmpresa, desde]);

  return (
    <div className="space-y-5">
      <Titulo titulo="Previsão da tarifa real"
        sub={<>Tarifa média por assento, em reais constantes, com previsões de até 18 meses. Cada série tem dez modelos candidatos
          (estatísticos e de aprendizado de máquina) avaliados por validação com origem móvel; o padrão é o de menor erro na validação.</>} />
      <SeletorSerie valor={escolha} onChange={setEscolha} />
      <Estado carregando={carregando} erro={erro} />
      {!carregando && !erro && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi rotulo="Média dos últimos 12 meses" valor={fmtR(resumo.mediaUlt)} sub={`até ${fmtMes(ult)}`} />
            <Kpi rotulo="Média prevista, próximos 12 meses" valor={fmtR(resumo.mediaFut)} sub={fmtP(resumo.mediaFut / resumo.mediaUlt - 1) + ' sobre os 12 meses anteriores'} />
            <Kpi rotulo="Mês previsto mais barato" valor={resumo.minimo?.periodo ? fmtMes(resumo.minimo.periodo) : '—'} sub={resumo.minimo ? fmtR(resumo.minimo.previsto) : ''} />
            <Kpi rotulo="Mês previsto mais caro" valor={resumo.maximo?.periodo ? fmtMes(resumo.maximo.periodo) : '—'} sub={resumo.maximo ? fmtR(resumo.maximo.previsto) : ''} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="cartao">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-semibold">{tituloEscolha(escolha)} · {NOMES_MODELOS[m] ?? m}</div>
                {hierarquico && <span className="selo selo-aviso">rota sem modelo próprio: previsão hierárquica</span>}
              </div>
              <Grafico pontos={pontos} formato={(v) => fmtR(v)} corte={ult} faixas={faixas} rotulos={{ real: 'Tarifa real observada' }} />
            </div>
            <div className="cartao space-y-4">
              <Controle rotulo="Modelo">
                <select className="campo w-full" value={m} onChange={(e) => setModelo(e.target.value)}>
                  {modelos.map((k) => <option key={k} value={k}>{NOMES_MODELOS[k] ?? k}{k === melhor ? ' (melhor na validação)' : ''}</option>)}
                </select>
              </Controle>
              <Controle rotulo="Horizonte" valor={`${horiz} meses`}><Deslizante v={horiz} set={setHoriz} min={1} max={18} passo={1} /></Controle>
              <Controle rotulo="Intervalos de previsão">
                <select className="campo w-full" value={faixas} onChange={(e) => setFaixas(e.target.value as typeof faixas)}>
                  <option value="ambas">80% e 95%</option><option value="80">80%</option><option value="95">95%</option><option value="nenhuma">Sem intervalos</option>
                </select>
              </Controle>
              <Controle rotulo="Mostrar histórico desde">
                <select className="campo w-full" value={desde} onChange={(e) => setDesde(e.target.value)}>
                  {Array.from(new Set(serie.map((s) => s.periodo.slice(0, 4)))).map((a) => <option key={a} value={`${a}-01`}>{a}</option>)}
                </select>
              </Controle>
              <p className="nota">Os intervalos vêm dos erros que o modelo cometeu na validação, em séries do mesmo nível (Brasil, companhias ou rotas), e abrem com a raiz do horizonte.</p>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="cartao overflow-x-auto">
              <div className="mb-2 font-semibold">Seleção de modelos — erro na validação ({nivelMet === 'brasil' ? 'série Brasil' : nivelMet === 'empresa' ? 'séries de companhias' : 'séries de rotas'})</div>
              <table className="tabela">
                <thead><tr><th>Modelo</th><th className="text-right">MAPE</th><th className="text-right">MAE</th><th className="text-right">RMSE</th><th className="text-right">Previsões</th></tr></thead>
                <tbody>
                  {tabMet.map((x) => (
                    <tr key={x.modelo} className={x.modelo === m ? 'bg-soft' : ''} style={{ cursor: modelos.includes(x.modelo) ? 'pointer' : undefined }}
                      onClick={() => modelos.includes(x.modelo) && setModelo(x.modelo)}>
                      <td>{x.nome}</td><td className="text-right">{fmtN(100 * x.mape, 1)}%</td>
                      <td className="text-right">{x.mae != null ? fmtR(x.mae) : '—'}</td><td className="text-right">{x.rmse != null ? fmtR(x.rmse) : '—'}</td>
                      <td className="text-right">{fmtN(x.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="nota mt-2">Validação com três origens móveis (cada uma prevendo 12 meses à frente sem ver os dados do período testado). Métricas da Aula 4:
                MAPE = erro percentual absoluto médio; MAE = erro absoluto médio; RMSE = raiz do erro quadrático médio (em R$ de tarifa real). Clique num modelo para vê-lo no gráfico.</p>
            </div>
            <div className="cartao overflow-x-auto">
              <div className="mb-2 font-semibold">Previsão mês a mês</div>
              <table className="tabela">
                <thead><tr><th>Mês</th><th className="text-right">Previsto</th><th className="text-right">Faixa de 80%</th><th className="text-right">Faixa de 95%</th></tr></thead>
                <tbody>
                  {prev.filter((p) => p.modelo === m && p.h <= horiz).map((p) => (
                    <tr key={p.periodo}><td>{fmtMes(p.periodo)}</td><td className="text-right">{fmtR(p.previsto)}</td>
                      <td className="text-right">{fmtR(p.lo80)} – {fmtR(p.hi80)}</td><td className="text-right">{fmtR(p.lo95)} – {fmtR(p.hi95)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {distSel && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="cartao">
                <h3 className="mb-1 text-[1.3rem]">Distribuição dos erros · {NOMES_MODELOS[m] ?? m}</h3>
                <p className="nota mb-2">Erro percentual de cada previsão da validação (previsto ÷ real − 1), {nivelMet === 'brasil' ? 'série Brasil' : nivelMet === 'empresa' ? 'séries de companhias' : 'séries de rotas'}.
                  Mediana {fmtP(distSel.mediana)}; metade dos erros entre {fmtP(distSel.q1)} e {fmtP(distSel.q3)}.</p>
                <Histograma hist={distSel.hist} />
              </div>
              <div className="cartao">
                <h3 className="mb-1 text-[1.3rem]">Boxplot dos erros por modelo</h3>
                <p className="nota mb-2">Mesmo recorte; caixa do 1º ao 3º quartil, bigodes até 1,5 × IQR. Modelos com caixa estreita e centrada no zero erram menos e sem viés.</p>
                <Boxplots dominio={[-0.4, 0.4]} destaque={NOMES_MODELOS[m] ?? m}
                  itens={tabMet.filter((x) => dist[`${x.modelo}|${nivelMet}`]).map((x) => ({ nome: NOMES_MODELOS[x.modelo] ?? x.nome, caixa: dist[`${x.modelo}|${nivelMet}`],
                    cor: x.modelo === m ? 'var(--warn)' : 'var(--sig)' }))} />
              </div>
            </div>
          )}
          {hip && (
            <div className="cartao">
              <h3 className="mb-1 text-[1.3rem]">Hiperparâmetros escolhidos por validação cruzada · {NOMES_MODELOS[m] ?? m}</h3>
              {hipFinal && hipFinal.grade?.length ? (
                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                  <div className="overflow-x-auto">
                    <table className="tabela">
                      <thead><tr><th>Valor testado</th><th className="text-right">Erro na validação cruzada (RMSE, log)</th></tr></thead>
                      <tbody>{(hipFinal.grade as any[]).map((g, i) => {
                        const esc = JSON.stringify(g.param) === JSON.stringify(hipFinal.escolhido);
                        return <tr key={i} className={esc ? 'bg-soft' : ''}><td>{fmtHip(g.param)}{esc ? '  ← escolhido' : ''}</td><td className="text-right">{fmtN(g.rmse_cv, 4)}</td></tr>;
                      })}</tbody>
                    </table>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="rotulo">Escolha em cada origem da validação</div>
                    {hipOrigens.map(([o, e]) => <div key={o} className="flex justify-between gap-2"><span>até {fmtMes(o)}</span><span className="text-right font-semibold">{fmtHip(e as any)}</span></div>)}
                    <div className="flex justify-between gap-2"><span>modelo publicado</span><span className="text-right font-semibold">{fmtHip(hipFinal.escolhido)}</span></div>
                  </div>
                </div>
              ) : <p className="nota">Este modelo não tem hiperparâmetros ajustados por validação cruzada (Holt-Winters e sazonal ingênuo são estimados direto na série; floresta e boosting, extras fora da disciplina, ficam com valores fixos).</p>}
              <p className="nota mt-2">Como nas Aulas 4 e 5: k-fold com k = {hip.k_folds} dentro da base de treino de cada origem. Os folds são blocos de meses consecutivos, para que meses vizinhos não fiquem um no treino e outro na validação.
                Grades: k do kNN (5 a 60), kernel linear ou radial e C do SVM, neurônios da rede (8 a 64 + 32), poda da árvore pelo custo-complexidade (equivalente ao cv.tree do Lab 4) e penalidade da ridge.</p>
            </div>
          )}
          {escolha.nivel === 'rota' && dadosEmp.length > 0 && (
            <div className="cartao">
              <div className="mb-2 font-semibold">Quem cobra quanto nesta rota (tarifa real por companhia, consulta direta ao banco)</div>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={dadosEmp}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="periodo" tickFormatter={fmtMes} minTickGap={28} tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => fmtR(v)} width={84} tick={{ fontSize: 12 }} />
                    <Tooltip labelFormatter={(l) => fmtMes(String(l))} formatter={(v: number) => fmtR(v)} />
                    <Legend />
                    {grupos.map((g) => <Line key={g} dataKey={g} stroke={COR[g] ?? 'var(--nom)'} dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <SalvarCenario tipo="previsao" parametros={{ pagina: '/previsao', nivel: escolha.nivel, chave: escolha.chave, modelo: m, horizonte: horiz }}
            resumo={{ serie: tituloEscolha(escolha), modelo: NOMES_MODELOS[m] ?? m, media_prevista_12m: Math.round(resumo.mediaFut), media_ultimos_12m: Math.round(resumo.mediaUlt) }} />
        </>
      )}
    </div>
  );
}
