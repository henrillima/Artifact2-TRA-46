'use client';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Controle, Deslizante, Estado, Kpi, SalvarCenario, Titulo, COR } from '@/components/ui';
import { getParametros, getRotaEmpresa, getTopRotas, Rota, RotaEmpresa } from '@/lib/dados';
import { fmtN, fmtP, simularFusaoRota } from '@/lib/sim';

const EMPRESAS = ['LATAM', 'Gol', 'Azul', 'Outras'];

export default function PaginaFusao() {
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [re, setRe] = useState<RotaEmpresa[]>([]);
  const [par, setPar] = useState<Record<string, any> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [a, setA] = useState('Azul');
  const [b, setB] = useState('Gol');
  const [eps, setEps] = useState<number | null>(null);
  const [conduta, setConduta] = useState(1);
  const [efic, setEfic] = useState(0);
  const [segmento, setSegmento] = useState('todos');
  const [ordem, setOrdem] = useState<'delta' | 'preco' | 'assentos'>('delta');
  useEffect(() => {
    Promise.all([getTopRotas(300), getRotaEmpresa(), getParametros()]).then(([r, e, p]) => { setRotas(r); setRe(e); setPar(p); })
      .catch((x) => setErro((x as Error).message));
  }, []);
  const epsPadrao = Math.abs(par?.demanda?.elasticidade_2sls_nacional ?? 1.9);
  const e = eps ?? epsPadrao;

  const res = useMemo(() => {
    const shares = new Map<string, Record<string, number>>();
    re.forEach((x) => { const s = shares.get(x.rota) ?? {}; s[x.grupo] = x.share; shares.set(x.rota, s); });
    return rotas.filter((r) => segmento === 'todos' || r.segmento === segmento).map((r) => {
      const s = shares.get(r.rota) ?? {};
      const sim = simularFusaoRota(s, { a, b, elasticidade: e, conduta, eficiencia: efic / 100 });
      return { r, s, ...sim };
    });
  }, [rotas, re, a, b, e, conduta, efic, segmento]);

  const afet = res.filter((x) => x.afetada);
  const assTot = res.reduce((s, x) => s + x.r.assentos_12m, 0);
  const assAf = afet.reduce((s, x) => s + x.r.assentos_12m, 0);
  const precoMedio = afet.length ? afet.reduce((s, x) => s + (x.razaoPreco - 1) * x.r.assentos_12m, 0) / Math.max(assAf, 1) : 0;
  const monop = afet.filter((x) => x.hhiPos > 0.999).length;
  const classes = ['Presunção de poder de mercado', 'Análise detalhada', 'Sem preocupação'].map((c) => ({
    classe: c, rotas: afet.filter((x) => x.alerta === c).length, assentos: afet.filter((x) => x.alerta === c).reduce((s, x) => s + x.r.assentos_12m, 0),
  }));
  const tabela = [...afet].sort((x, y) => ordem === 'delta' ? y.delta - x.delta : ordem === 'preco' ? y.razaoPreco - x.razaoPreco : y.r.assentos_12m - x.r.assentos_12m).slice(0, 60);
  const segs = Array.from(new Set(rotas.map((r) => r.segmento).filter(Boolean))) as string[];
  const dispersao = afet.map((x) => ({ delta: x.delta * 10000, preco: 100 * (x.razaoPreco - 1), ass: x.r.assentos_12m, nome: x.r.nome }));

  return (
    <div className="space-y-5">
      <Titulo titulo="Fusão e concentração"
        sub={<>Simula a fusão de duas companhias nas 300 maiores rotas: concentração antes e depois (HHI), enquadramento pelos limiares do
          Guia de Atos de Concentração Horizontal do CADE e efeito previsto na tarifa por um modelo de Cournot com conduta ajustável.</>} />
      <Estado carregando={!rotas.length && !erro} erro={erro} />
      {rotas.length > 0 && (
        <>
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="cartao space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Controle rotulo="Companhia A"><select className="campo w-full" value={a} onChange={(x) => setA(x.target.value)}>{EMPRESAS.map((k) => <option key={k}>{k}</option>)}</select></Controle>
                <Controle rotulo="Companhia B"><select className="campo w-full" value={b} onChange={(x) => setB(x.target.value)}>{EMPRESAS.filter((k) => k !== a).map((k) => <option key={k}>{k}</option>)}</select></Controle>
              </div>
              <Controle rotulo="Elasticidade-preço da demanda (|ε|)" valor={fmtN(e, 2)} ajuda="Padrão: estimativa por variáveis instrumentais.">
                <Deslizante v={e} set={setEps} min={1.1} max={4} passo={0.05} /></Controle>
              <Controle rotulo="Conduta (θ)" valor={fmtN(conduta, 2)} ajuda="0 = competição em preço (Bertrand, tarifa = custo); 1 = Cournot. Lerner = θ·HHI/|ε|.">
                <Deslizante v={conduta} set={setConduta} min={0} max={1} passo={0.05} /></Controle>
              <Controle rotulo="Eficiência (redução do custo marginal da fundida)" valor={`${efic}%`} ajuda="Só eficiências de custo marginal afetam o preço (Guia do CADE: específicas, verificáveis e repassadas).">
                <Deslizante v={efic} set={setEfic} min={0} max={20} passo={1} /></Controle>
              <Controle rotulo="Segmento de rotas">
                <select className="campo w-full" value={segmento} onChange={(x) => setSegmento(x.target.value)}>
                  <option value="todos">Todos</option>{segs.map((s) => <option key={s}>{s}</option>)}
                </select></Controle>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <Kpi rotulo="Rotas com sobreposição" valor={`${afet.length} de ${res.length}`} sub={`${fmtP(assAf / Math.max(assTot, 1), 0).replace('+', '')} dos assentos`} />
                <Kpi rotulo="Tarifa média prevista" valor={fmtP(precoMedio)} tom={precoMedio > 0 ? 'neg' : 'pos'} sub="nas rotas afetadas, ponderada por assentos" />
                <Kpi rotulo="Rotas que viram monopólio" valor={fmtN(monop)} />
                <Kpi rotulo="Presunção de poder (CADE)" valor={fmtN(classes[0].rotas)} sub="HHI > 2.500 e variação > 200" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="cartao">
                  <div className="mb-2 font-semibold">Enquadramento das rotas afetadas</div>
                  <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer><BarChart data={classes} layout="vertical" margin={{ left: 40 }}>
                      <CartesianGrid stroke="#ece8de" horizontal={false} /><XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="classe" width={170} tick={{ fontSize: 12 }} /><Tooltip />
                      <Bar dataKey="rotas" name="Rotas" fill="#1f6feb" />
                    </BarChart></ResponsiveContainer>
                  </div>
                </div>
                <div className="cartao">
                  <div className="mb-2 font-semibold">Variação do HHI × efeito na tarifa</div>
                  <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer><ScatterChart margin={{ left: 0, right: 10 }}>
                      <CartesianGrid stroke="#ece8de" /><XAxis type="number" dataKey="delta" name="Variação do HHI" tick={{ fontSize: 12 }} />
                      <YAxis type="number" dataKey="preco" name="Tarifa (%)" tick={{ fontSize: 12 }} unit="%" /><ZAxis dataKey="ass" range={[20, 300]} />
                      <Tooltip formatter={(v: number, n: string) => [fmtN(v, 1), n]} />
                      <Scatter data={dispersao} fill={COR[b] ?? '#1f6feb'} fillOpacity={0.6} />
                    </ScatterChart></ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="cartao overflow-x-auto">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">Rotas afetadas</div>
              <div className="flex gap-1 text-sm">Ordenar por:
                {(['delta', 'preco', 'assentos'] as const).map((o) => <button key={o} className={ordem === o ? 'botao' : 'botao-sec'} onClick={() => setOrdem(o)}>{o === 'delta' ? 'variação do HHI' : o === 'preco' ? 'efeito na tarifa' : 'assentos'}</button>)}
              </div>
            </div>
            <table className="tabela">
              <thead><tr><th>Rota</th><th>Segmento</th><th className="text-right">Assentos (12m)</th><th className="text-right">{a}</th><th className="text-right">{b}</th>
                <th className="text-right">HHI antes</th><th className="text-right">HHI depois</th><th className="text-right">Variação</th><th>CADE</th><th className="text-right">Tarifa</th></tr></thead>
              <tbody>
                {tabela.map((x) => (
                  <tr key={x.r.rota}>
                    <td>{x.r.nome} <span className="text-slate-400">{x.r.cidades}</span></td><td className="text-xs">{x.r.segmento ?? '—'}</td>
                    <td className="text-right">{fmtN(x.r.assentos_12m)}</td>
                    <td className="text-right">{fmtN(100 * (x.s[a] ?? 0), 0)}%</td><td className="text-right">{fmtN(100 * (x.s[b] ?? 0), 0)}%</td>
                    <td className="text-right">{fmtN(10000 * x.hhiPre)}</td><td className="text-right">{fmtN(10000 * x.hhiPos)}</td><td className="text-right">{fmtN(10000 * x.delta)}</td>
                    <td className={`text-xs ${x.alerta.startsWith('Presun') ? 'text-rose-700' : x.alerta.startsWith('Análise') ? 'text-amber-700' : 'text-slate-500'}`}>{x.alerta}</td>
                    <td className="text-right">{fmtP(x.razaoPreco - 1)}{x.saturado ? '*' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="nota mt-2">Participações: assentos vendidos nos últimos 12 meses, por par de aeroportos (mercado relevante aproximado). "Outras" é tratada como uma única
              firma. HHI na escala 0–10.000. * Lerner limitado a 0,95: com essa conduta e elasticidade, o modelo de Cournot deixa de ser informativo.
              O efeito na tarifa supõe custo marginal constante e participações pré-fusão como ponto de partida; é uma aproximação de primeira ordem, não uma simulação completa de equilíbrio.</p>
          </div>
          <SalvarCenario tipo="fusao" parametros={{ pagina: '/fusao', a, b, elasticidade: e, conduta, eficiencia: efic, segmento }}
            resumo={{ fusao: `${a} + ${b}`, rotas_afetadas: afet.length, efeito_tarifa: precoMedio, monopolios: monop, presuncao_cade: classes[0].rotas }} />
        </>
      )}
    </div>
  );
}
