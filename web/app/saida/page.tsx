'use client';
import { useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Controle, Deslizante, Estado, Kpi, SalvarCenario, Titulo } from '@/components/ui';
import { getParametros, getRotaEmpresa, getTopRotas, Rota, RotaEmpresa } from '@/lib/dados';
import { classeCade, fmtMes, fmtN, fmtP, fmtR } from '@/lib/sim';

const GRUPOS = ['LATAM', 'Gol', 'Azul', 'Outras'];
const DESFECHOS: Record<string, [string, (v: number) => string]> = {
  ln_tarifa: ['Tarifa real média', (v) => fmtP(Math.exp(v) - 1, 0)],
  hhi: ['Concentração (HHI)', (v) => (v >= 0 ? '+' : '') + fmtN(10000 * v)],
  n_grupos: ['Número de companhias na rota', (v) => (v >= 0 ? '+' : '') + fmtN(v, 2)],
  ln_assentos: ['Assentos vendidos', (v) => fmtP(Math.exp(v) - 1, 0)],
};

/** Variação de preço no Cournot com conduta: P1/P0 = (1 − L0)/(1 − L1), L = min(κ·HHI, teto). */
function razaoPreco(kappa: number, h0: number, h1: number, teto: number) {
  const L0 = Math.min(kappa * h0, teto), L1 = Math.min(kappa * h1, teto);
  return (1 - L0) / (1 - L1);
}

export default function PaginaSaida() {
  const [par, setPar] = useState<Record<string, any> | null>(null);
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [re, setRe] = useState<RotaEmpresa[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [desfecho, setDesfecho] = useState('ln_tarifa');
  const [sai, setSai] = useState('Gol');
  const [regra, setRegra] = useState<'proporcional' | 'avianca'>('avianca');
  const [conduta, setConduta] = useState<'calibrado' | 'cournot148' | 'cournot216' | 'manual'>('calibrado');
  const [kManual, setKManual] = useState(0.6);
  const [ordem, setOrdem] = useState<'delta' | 'preco' | 'assentos'>('preco');
  useEffect(() => {
    Promise.all([getParametros(), getTopRotas(300), getRotaEmpresa()])
      .then(([p, r, e]) => { setPar(p); setRotas(r); setRe(e); }).catch((x) => setErro((x as Error).message));
  }, []);
  const S = par?.saida;

  // ---------- estudo de eventos (coeficientes centrados na média antes da contração)
  const serieEv = useMemo(() => {
    if (!S) return [];
    const ev = S.eventos[desfecho].ponderado;
    // séries medidas contra a média de jul/2017 a jun/2018 (erro-padrão da combinação linear, calculado no pipeline)
    const op = ev.opera_norm ?? ev.opera, pot = ev.potencial_norm ?? ev.potencial;
    return op.map((x: any, i: number) => ({ k: x.k, opera: x.b, faixa: [x.b - 1.96 * x.ep, x.b + 1.96 * x.ep], potencial: pot[i].b }));
  }, [S, desfecho]);

  // ---------- simulação da saída
  const kap = S?.calibracao?.kappa ?? 0.6;
  const [kappa, teto] = conduta === 'cournot148' ? [1 / 1.477, 1 / 1.477] : conduta === 'cournot216' ? [1 / 2.164, 1 / 2.164]
    : conduta === 'manual' ? [kManual, 1 / 1.477] : [kap, 1 / 1.477];
  const sim = useMemo(() => {
    if (!S || !rotas.length) return null;
    const shares = new Map<string, Record<string, number>>();
    re.forEach((x) => { const s = shares.get(x.rota) ?? {}; s[x.grupo] = x.share; shares.set(x.rota, s); });
    const abs = S.absorcao as Record<string, number>;
    const fica = GRUPOS.filter((g) => g !== sai);
    const wa = fica.map((g) => Math.max(abs[g] ?? 0, 0)); const wt = wa.reduce((a, b) => a + b, 0) || 1;
    const linhas = rotas.map((r) => {
      const s = shares.get(r.rota) ?? {};
      const s0 = GRUPOS.map((g) => s[g] ?? 0), ss = s[sai] ?? 0;
      const h0 = s0.reduce((a, x) => a + x * x, 0);
      const semOferta = regra === 'proporcional' && 1 - ss < 1e-9;
      let s1: number[];
      if (regra === 'proporcional') s1 = fica.map((g) => (semOferta ? 0 : (s[g] ?? 0) / (1 - ss)));
      else s1 = fica.map((g, i) => (s[g] ?? 0) + ss * wa[i] / wt);
      const h1 = s1.reduce((a, x) => a + x * x, 0);
      const afetada = ss > 0 && !semOferta;
      const ratio = afetada ? razaoPreco(kappa, h0, h1, teto) : 1;
      return { r, ss, h0, h1, afetada, semOferta, ratio, ...classeCade(h1, h1 - h0) };
    });
    const ok = linhas.filter((l) => !l.semOferta);
    const peso = (l: typeof linhas[number]) => l.r.assentos_12m * l.r.tarifa_real_12m;
    const efeito = ok.reduce((a, l) => a + (l.ratio - 1) * peso(l), 0) / Math.max(ok.reduce((a, l) => a + peso(l), 0), 1);
    const af = ok.filter((l) => l.afetada);
    const ass = ok.reduce((a, l) => a + l.r.assentos_12m, 0);
    return {
      linhas, efeito, afetadas: af.length, semOferta: linhas.length - ok.length,
      hhi0: ok.reduce((a, l) => a + l.h0 * l.r.assentos_12m, 0) / ass, hhi1: ok.reduce((a, l) => a + l.h1 * l.r.assentos_12m, 0) / ass,
      presuncao: af.filter((l) => l.alerta.startsWith('Presun')).length, monopolios: af.filter((l) => l.h1 > 0.999).length,
    };
  }, [S, rotas, re, sai, regra, kappa, teto]);

  const proj = useMemo(() => {
    if (!S || !sim) return [];
    const P = S.projecao;
    return (P.periodos as string[]).map((t: string, h: number) => ({
      periodo: t, base: P.base[h], cenario: P.base[h] * (1 + sim.efeito * P.perfil[Math.min(h, P.perfil.length - 1)]),
    }));
  }, [S, sim]);

  const tabela = sim ? [...sim.linhas.filter((l) => l.afetada)].sort((a, b) => ordem === 'delta' ? (b.h1 - b.h0) - (a.h1 - a.h0)
    : ordem === 'preco' ? b.ratio - a.ratio : b.r.assentos_12m - a.r.assentos_12m).slice(0, 40) : [];
  const cal = S?.calibracao;

  return (
    <div className="space-y-5">
      <Titulo titulo="Saída de uma companhia: concentração e tarifa"
        sub={<>O que aconteceu nas rotas da Avianca depois que ela deixou de voar em 2019 e o que aconteceria hoje se a Azul ou a Gol saísse do mercado.
          O episódio da Avianca é usado para testar e calibrar o simulador de Cournot que projeta a saída de um grande.</>} />
      <Estado carregando={!par && !erro} erro={erro} />
      {par && !S && <div className="cartao nota">Os dados deste módulo ainda não foram carregados no banco (rode <code>npm run carregar -- parametros</code>).</div>}
      {S && sim && (
        <>
          <h2 className="pt-2 text-[1.8rem]">1. A saída da Avianca</h2>
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi rotulo="Tarifa nas rotas da Avianca" valor={fmtP(Math.exp(S.eventos.ln_tarifa.ponderado.estatico.opera_pos.b) - 1)}
              sub={`abr/2019 a fev/2020 contra o controle (erro-padrão ${fmtN(100 * S.eventos.ln_tarifa.ponderado.estatico.opera_pos.ep, 1)} p.p.)`} tom="neg" />
            <Kpi rotulo="Concentração (HHI)" valor={'+' + fmtN(10000 * S.eventos.hhi.ponderado.estatico.opera_pos.b)} sub="pontos, na escala de 0 a 10.000" />
            <Kpi rotulo="Para quem foi a participação" valor={`Gol ${fmtN(100 * S.absorcao.Gol, 0)}%`}
              sub={`Azul ${fmtN(100 * S.absorcao.Azul, 0)}%, LATAM ${fmtN(100 * S.absorcao.LATAM, 0)}%, Outras ${fmtN(100 * S.absorcao.Outras, 0)}%`} />
            <Kpi rotulo="Rotas" valor={`${S.n_rotas.opera} tratadas`} sub={`${S.n_rotas.potencial} com entrada potencial; ${S.n_rotas.controle} de controle`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="cartao">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[1.3rem]">Estudo de eventos: rotas da Avianca contra o controle</h3>
                <select className="campo" value={desfecho} onChange={(e) => setDesfecho(e.target.value)}>
                  {Object.entries(DESFECHOS).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}
                </select>
              </div>
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer><ComposedChart data={serieEv} margin={{ top: 8, right: 12, left: 0, bottom: 14 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="k" tick={{ fontSize: 12 }} label={{ value: 'meses em relação à saída (0 = abr/2019)', position: 'insideBottom', offset: -8, fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={56} tickFormatter={(v) => DESFECHOS[desfecho][1](v)} />
                  <Tooltip labelFormatter={(l) => `mês ${l}`} formatter={(v: unknown, n: string) => Array.isArray(v) ? [`${DESFECHOS[desfecho][1](v[0])} a ${DESFECHOS[desfecho][1](v[1])}`, n] : [DESFECHOS[desfecho][1](Number(v)), n]} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="var(--nom)" />
                  <ReferenceLine x={0} stroke="var(--warn)" strokeDasharray="4 4" />
                  <ReferenceLine x={-9} stroke="var(--nom)" strokeDasharray="2 4" label={{ value: 'contração', fontSize: 11, position: 'insideTopLeft' }} />
                  <Area dataKey="faixa" name="Intervalo de 95%" stroke="none" fill="var(--sig)" fillOpacity={0.18} isAnimationActive={false} />
                  <Line dataKey="opera" name="Rotas que a Avianca operava" stroke="var(--sig)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                  <Line dataKey="potencial" name="Rotas em que era entrante potencial" stroke="var(--nom)" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                </ComposedChart></ResponsiveContainer>
              </div>
              <p className="nota mt-1">Diferenças em diferenças com efeitos fixos de rota e de mês, ponderadas pelos assentos da rota e com erros agrupados por rota. Coeficientes medidos contra
                a média de jul/2017 a jun/2018, os 12 meses antes da contração da Avianca; faixa de 95%. A janela termina em fev/2020, antes da pandemia. A Avianca vendeu até mar/2019 em quase todas as rotas.</p>
            </div>
            <div className="cartao space-y-3">
              <h3 className="text-[1.3rem]">O simulador acerta o episódio?</h3>
              <p className="text-sm">Com o HHI antes e depois observado em cada rota, o Cournot (θ = 1) com a elasticidade estimada (−1,48) prevê alta de
                <b> {fmtP(Math.exp(cal.cournot['1,48']) - 1)}</b> na tarifa. O observado foi <b>{fmtP(Math.exp(cal.alvos.regressao) - 1)}</b>.</p>
              <p className="text-sm">A conduta que reproduz o observado é κ = θ/|ε| = <b>{fmtN(cal.kappa, 2)}</b> (intervalo de 95% de {fmtN(cal.kappa_ic95[0], 2)} a {fmtN(cal.kappa_ic95[1], 2)}),
                ou θ = <b>{fmtN(cal.theta_implicito['1,48'], 2)}</b> com ε = −1,48: perto de Cournot.</p>
              <p className="text-sm">Entre as rotas tratadas, cada 0,1 a mais de HHI veio com tarifa {fmtP(Math.exp(0.1 * cal.dP_dHHI.b) - 1)} mais alta (erro-padrão {fmtN(10 * cal.dP_dHHI.ep_b, 1)} p.p.).</p>
            </div>
          </div>
          <div className="cartao">
            <h3 className="mb-2 text-[1.3rem]">Concentração e tarifa nas rotas da Avianca</h3>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer><ScatterChart margin={{ left: 0, right: 10, bottom: 14 }}>
                <CartesianGrid stroke="var(--line)" />
                <XAxis type="number" dataKey="x" name="Variação do HHI" tick={{ fontSize: 12 }} tickFormatter={(v) => fmtN(10000 * v)}
                  label={{ value: 'variação do HHI (antes × depois, descontado o controle)', position: 'insideBottom', offset: -8, fontSize: 12 }} />
                <YAxis type="number" dataKey="y" name="Variação da tarifa" tick={{ fontSize: 12 }} width={56} tickFormatter={(v) => fmtP(Math.exp(v) - 1, 0)} />
                <ZAxis dataKey="z" range={[20, 300]} />
                <Tooltip formatter={(v: number, n: string) => [n === 'Variação do HHI' ? fmtN(10000 * v) : fmtP(Math.exp(v) - 1, 0), n]} />
                <Scatter data={(S.rotas_tratadas as any[]).map((r) => ({ x: r.hhi1 - r.hhi0 - S.controle.dhhi, y: r.dlnP, z: r.A0, rota: r.rota }))} fill="var(--sig)" fillOpacity={0.6} />
              </ScatterChart></ResponsiveContainer>
            </div>
            <p className="nota">Cada ponto é uma rota que a Avianca operava (tamanho = assentos antes da saída): variação do HHI e da tarifa real entre jul/2017–jun/2018 e os meses após a saída, descontada a variação das rotas de controle.</p>
          </div>

          <h2 className="pt-4 text-[1.8rem]">2. E se um grande saísse hoje?</h2>
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="cartao space-y-4">
              <Controle rotulo="Companhia que sai">
                <select className="campo w-full" value={sai} onChange={(e) => setSai(e.target.value)}>
                  {['Gol', 'Azul', 'LATAM'].map((g) => <option key={g}>{g}</option>)}
                </select>
              </Controle>
              <Controle rotulo="Para onde vai a participação" ajuda={regra === 'avianca' ? 'Na proporção em que Gol, Azul, LATAM e Outras absorveram a participação da Avianca (inclui entrada em rotas novas).' : 'Na proporção das participações de quem já está na rota (sem entrada).'}>
                <select className="campo w-full" value={regra} onChange={(e) => setRegra(e.target.value as typeof regra)}>
                  <option value="avianca">Padrão observado na saída da Avianca</option><option value="proporcional">Proporcional a quem fica</option>
                </select>
              </Controle>
              <Controle rotulo="Conduta" ajuda="κ = θ/|ε|. O Lerner fica limitado ao de monopólio (1/|ε|).">
                <select className="campo w-full" value={conduta} onChange={(e) => setConduta(e.target.value as typeof conduta)}>
                  <option value="calibrado">Calibrada na Avianca (κ = {fmtN(kap, 2)})</option>
                  <option value="cournot148">Cournot, ε = −1,48</option><option value="cournot216">Cournot, ε = −2,16</option><option value="manual">Escolher κ</option>
                </select>
              </Controle>
              {conduta === 'manual' && <Controle rotulo="κ" valor={fmtN(kManual, 2)}><Deslizante v={kManual} set={setKManual} min={0} max={1} passo={0.01} /></Controle>}
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <Kpi rotulo="Tarifa média" valor={fmtP(sim.efeito)} sub="nas 300 maiores rotas, ponderada pela receita" tom={sim.efeito > 0 ? 'neg' : 'pos'} />
                <Kpi rotulo="HHI médio" valor={`${fmtN(10000 * sim.hhi0)} → ${fmtN(10000 * sim.hhi1)}`} sub="ponderado pelos assentos" />
                <Kpi rotulo="Presunção de poder (CADE)" valor={`${sim.presuncao}`} sub={`de ${sim.afetadas} rotas afetadas`} />
                <Kpi rotulo="Monopólios" valor={`${sim.monopolios}`} sub={sim.semOferta ? `${sim.semOferta} rota(s) ficariam sem oferta` : 'rotas com uma só companhia'} />
              </div>
              <div className="cartao">
                <h3 className="mb-2 text-[1.3rem]">Projeção da tarifa média no Brasil</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer><ComposedChart data={proj} margin={{ top: 6, right: 12, left: 0 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="periodo" tickFormatter={fmtMes} tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => fmtR(v)} width={78} tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
                    <Tooltip labelFormatter={(l) => fmtMes(String(l))} formatter={(v: number) => fmtR(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line dataKey="base" name="Previsão base" stroke="var(--nom)" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                    <Line dataKey="cenario" name={`Com a saída da ${sai}`} stroke="var(--warn)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                  </ComposedChart></ResponsiveContainer>
                </div>
                <p className="nota">A saída acontece no primeiro mês previsto; o efeito segue a dinâmica observada depois da saída da Avianca (mais forte nos primeiros meses).
                  Média de 12 meses: {fmtR(proj.reduce((a, x) => a + x.base, 0) / Math.max(proj.length, 1))} na base e {fmtR(proj.reduce((a, x) => a + x.cenario, 0) / Math.max(proj.length, 1))} no cenário.</p>
              </div>
            </div>
          </div>
          <div className="cartao overflow-x-auto">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[1.3rem]">Rotas afetadas</h3>
              <div className="flex gap-2">{(['preco', 'delta', 'assentos'] as const).map((o) => <button key={o} className={ordem === o ? 'botao' : 'botao-sec'} onClick={() => setOrdem(o)}>{o === 'preco' ? 'efeito na tarifa' : o === 'delta' ? 'variação do HHI' : 'assentos'}</button>)}</div>
            </div>
            <table className="tabela">
              <thead><tr><th>Rota</th><th>Segmento</th><th className="text-right">Assentos (12m)</th><th className="text-right">Participação de quem sai</th><th className="text-right">HHI antes</th><th className="text-right">HHI depois</th><th>CADE</th><th className="text-right">Tarifa</th></tr></thead>
              <tbody>{tabela.map((l) => (
                <tr key={l.r.rota}><td>{l.r.nome} <span className="text-muted">{l.r.cidades}</span></td><td className="text-xs">{l.r.segmento}</td>
                  <td className="text-right">{fmtN(l.r.assentos_12m)}</td><td className="text-right">{fmtN(100 * l.ss, 0)}%</td>
                  <td className="text-right">{fmtN(10000 * l.h0)}</td><td className="text-right">{fmtN(10000 * l.h1)}</td>
                  <td className={`text-xs ${l.alerta.startsWith('Presun') ? 'text-warn' : 'text-muted'}`}>{l.alerta}</td>
                  <td className="text-right">{fmtP(l.ratio - 1)}</td></tr>))}</tbody>
            </table>
          </div>
          <SalvarCenario tipo="fusao" parametros={{ pagina: '/saida', sai, regra, conduta, kappa }}
            resumo={{ companhia: sai, regra, efeito_tarifa: sim.efeito, hhi_antes: Math.round(10000 * sim.hhi0), hhi_depois: Math.round(10000 * sim.hhi1), presuncao_cade: sim.presuncao }} />
        </>
      )}
    </div>
  );
}
