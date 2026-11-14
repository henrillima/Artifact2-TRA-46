'use client';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Boxplots, Correlograma, Dendrograma } from '@/components/Avaliacao';
import { Estado, Titulo } from '@/components/ui';
import { getParametros, getTopRotas, Rota } from '@/lib/dados';
import { fmtN, fmtR } from '@/lib/sim';

const CORES = ['var(--sig)', 'var(--warn)', 'var(--azu)', 'var(--sun)', 'var(--one)', 'var(--nom)', 'var(--cool)'];
const NOME_VAR: Record<string, string> = {
  ln_dist: 'Distância (log)', ln_assentos_mes: 'Assentos por mês (log)', ln_tarifa_km: 'Tarifa por km (log)',
  sazonalidade: 'Sazonalidade', volatilidade: 'Volatilidade', hhi: 'Concentração (HHI)', crescimento: 'Crescimento',
};
const CAIXAS: Record<string, [string, (v: number) => string]> = {
  tarifa_real: ['Tarifa real (R$)', (v) => fmtR(v)], distancia_km: ['Distância (km)', (v) => `${fmtN(v)} km`],
  tarifa_km: ['Tarifa por km (R$)', (v) => `R$ ${fmtN(v, 2)}`], hhi_: ['Concentração (HHI)', (v) => fmtN(10000 * v)],
};
const METODOS: Record<string, string> = { average: 'Média (average)', complete: 'Completa (complete)', single: 'Simples (single)', ward: 'Ward' };

export default function PaginaSegmentos() {
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [par, setPar] = useState<Record<string, any> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('todos');
  const [varCaixa, setVarCaixa] = useState('tarifa_real');
  useEffect(() => { Promise.all([getTopRotas(300), getParametros()]).then(([r, p]) => { setRotas(r); setPar(p); }).catch((e) => setErro((e as Error).message)); }, []);
  const cl = par?.clusters;
  const segs = useMemo(() => (cl?.centroides ?? []).map((c: any) => c.nome as string), [cl]);
  const comSeg = rotas.filter((r) => r.segmento);
  const sil = cl ? Object.entries(cl.silhueta as Record<string, number>).map(([k, v]) => ({ k: `k = ${k}`, silhueta: v })) : [];
  const cotovelo = cl?.inercia ? Object.keys(cl.inercia).map((k) => ({ k: Number(k), inercia: cl.inercia[k], silhueta: cl.silhueta[k] })) : [];
  const bic = cl?.gmm_bic ? Object.keys(cl.gmm_bic.bic.full).map((n) => ({ n: Number(n), full: cl.gmm_bic.bic.full[n], diag: cl.gmm_bic.bic.diag[n] })) : [];
  const nomeRota = useMemo(() => new Map(rotas.map((r) => [r.rota, `${r.nome} · ${r.cidades}`])), [rotas]);
  const corSeg = (c: number) => { const nome = (cl?.centroides ?? []).find((x: any) => x.cluster === c)?.nome; return CORES[Math.max(0, segs.indexOf(nome)) % CORES.length]; };
  return (
    <div className="space-y-5">
      <Titulo titulo="Segmentos de rotas"
        sub={<>Agrupamento não supervisionado (k-médias) das 300 maiores rotas por distância, densidade, tarifa por quilômetro, sazonalidade,
          volatilidade, concentração e crescimento. O número de grupos foi escolhido pelo índice de silhueta e conferido com clusterização hierárquica e mistura gaussiana.</>} />
      <Estado carregando={!rotas.length && !erro} erro={erro} />
      {cl && (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="cartao">
              <div className="mb-2 font-semibold">Distância × tarifa real por rota (bolha = assentos)</div>
              <div style={{ width: '100%', height: 420 }}>
                <ResponsiveContainer><ScatterChart margin={{ left: 10, right: 10 }}>
                  <CartesianGrid stroke="var(--line)" /><XAxis type="number" dataKey="distancia_km" name="Distância (km)" tick={{ fontSize: 12 }} unit=" km" />
                  <YAxis type="number" dataKey="tarifa_real_12m" name="Tarifa real" tick={{ fontSize: 12 }} tickFormatter={(v) => fmtR(v)} width={80} />
                  <ZAxis dataKey="assentos_12m" range={[15, 400]} name="Assentos" />
                  <Tooltip formatter={(v: number, n: string) => [n === 'Tarifa real' ? fmtR(v) : fmtN(v), n]} />
                  <Legend />
                  {segs.map((s: string, i: number) => (
                    <Scatter key={s} name={s} data={comSeg.filter((r) => r.segmento === s && (filtro === 'todos' || filtro === s))} fill={CORES[i % CORES.length]} fillOpacity={0.65} />
                  ))}
                </ScatterChart></ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-4">
              <div className="cartao">
                <div className="mb-2 font-semibold">Escolha de k (silhueta)</div>
                <div style={{ width: '100%', height: 180 }}>
                  <ResponsiveContainer><BarChart data={sil}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="k" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 'auto']} /><Tooltip formatter={(v: number) => fmtN(v, 3)} /><Bar dataKey="silhueta" fill="var(--sig)" /></BarChart></ResponsiveContainer>
                </div>
                <p className="nota">k escolhido = {cl.k}. Concordância com a mistura gaussiana: {fmtN(100 * cl.acordo_gmm, 0)}% das rotas no mesmo grupo. Silhueta baixa indica grupos com fronteiras difusas: os segmentos descrevem tendências, não categorias estanques.</p>
              </div>
              <div className="cartao">
                <div className="rotulo mb-1">Filtrar</div>
                <select className="campo w-full" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                  <option value="todos">Todos os segmentos</option>{segs.map((s: string) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
          {cl.inercia && (
            <>
              <h2 className="pt-4 text-[1.8rem]">Validação dos grupos</h2>
              <p className="-mt-2 max-w-[75ch] text-muted">Como na TRA-48 (Aulas 2 e 3): método do cotovelo e silhueta para o k do k-médias, BIC para o número de componentes da mistura gaussiana,
                clusterização hierárquica para conferir a partição e PCA para enxergar os grupos em duas dimensões.</p>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="cartao">
                  <h3 className="mb-2 text-[1.3rem]">Cotovelo e silhueta</h3>
                  <div style={{ width: '100%', height: 240 }}>
                    <ResponsiveContainer><LineChart data={cotovelo} margin={{ right: 8 }}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="k" tick={{ fontSize: 12 }} tickFormatter={(v) => `k = ${v}`} />
                      <YAxis yAxisId="i" tick={{ fontSize: 12 }} width={50} tickFormatter={(v) => fmtN(v)} />
                      <YAxis yAxisId="s" orientation="right" tick={{ fontSize: 12 }} width={44} tickFormatter={(v) => fmtN(v, 2)} />
                      <Tooltip formatter={(v: number, n: string) => [n === 'Silhueta' ? fmtN(v, 3) : fmtN(v), n]} labelFormatter={(l) => `k = ${l}`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line yAxisId="i" dataKey="inercia" name="Variância intra-grupo (inércia)" stroke="var(--ink)" strokeWidth={2} isAnimationActive={false} />
                      <Line yAxisId="s" dataKey="silhueta" name="Silhueta" stroke="var(--sig)" strokeWidth={2} isAnimationActive={false} />
                    </LineChart></ResponsiveContainer>
                  </div>
                  <p className="nota mt-1">O cotovelo não é nítido: a inércia cai de forma suave. A silhueta é mais alta com 2 grupos, mas 2 grupos só separam curtas de longas;
                    entre 3 e 7 o máximo é k = {cl.k} (silhueta {fmtN(cl.silhueta[cl.k], 2)}).</p>
                </div>
                <div className="cartao">
                  <h3 className="mb-2 text-[1.3rem]">Mistura gaussiana: BIC</h3>
                  <div style={{ width: '100%', height: 240 }}>
                    <ResponsiveContainer><LineChart data={bic} margin={{ right: 8 }}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="n" tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}`} label={{ value: 'componentes', position: 'insideBottomRight', offset: -2, fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} width={56} tickFormatter={(v) => fmtN(v)} domain={['auto', 'auto']} />
                      <Tooltip formatter={(v: number) => fmtN(v)} labelFormatter={(l) => `${l} componentes`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line dataKey="full" name="Covariância completa" stroke="var(--sig)" strokeWidth={2} isAnimationActive={false} />
                      <Line dataKey="diag" name="Covariância diagonal" stroke="var(--warn)" strokeWidth={2} isAnimationActive={false} />
                    </LineChart></ResponsiveContainer>
                  </div>
                  <p className="nota mt-1">Menor BIC: {cl.gmm_bic.escolhido.componentes} componentes ({cl.gmm_bic.escolhido.covariancia === 'full' ? 'covariância completa' : 'covariância diagonal'}).
                    A concordância com o k-médias é baixa (índice de Rand ajustado {fmtN(cl.gmm_bic.ari_kmedias, 2)}): a mistura gaussiana não vê grupos bem separados,
                    o que confirma a leitura da silhueta.</p>
                </div>
                <div className="cartao">
                  <h3 className="mb-2 text-[1.3rem]">Clusterização hierárquica (average linkage)</h3>
                  <Dendrograma icoord={cl.dendrograma.icoord} dcoord={cl.dendrograma.dcoord} corte={cl.dendrograma.corte} />
                  <table className="tabela mt-2">
                    <thead><tr><th>Ligação</th><th className="text-right">Tamanho dos {cl.k} grupos</th><th className="text-right">Concordância com o k-médias (ARI)</th></tr></thead>
                    <tbody>{Object.entries(cl.hierarquica as Record<string, any>).map(([k, h]) => (
                      <tr key={k}><td>{METODOS[k] ?? k}</td><td className="text-right">{(h.tamanhos as number[]).join(' · ')}</td><td className="text-right">{fmtN(h.ari_kmedias, 2)}</td></tr>))}</tbody>
                  </table>
                  <p className="nota mt-2">Distância euclidiana nos atributos padronizados, como no Lab 2. Cortando o dendrograma em {cl.k} grupos (linha tracejada), a ligação média isola
                    poucas rotas atípicas e deixa quase todas num grupo só; a de Ward, que minimiza a variância dentro dos grupos como o k-médias, é a que mais concorda com ele.</p>
                </div>
                <div className="cartao">
                  <h3 className="mb-2 text-[1.3rem]">Componentes principais (PCA)</h3>
                  <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer><ScatterChart margin={{ left: 0, right: 10 }}>
                      <CartesianGrid stroke="var(--line)" />
                      <XAxis type="number" dataKey="pc1" name="CP1" tick={{ fontSize: 12 }} tickFormatter={(v) => fmtN(v, 1)} />
                      <YAxis type="number" dataKey="pc2" name="CP2" tick={{ fontSize: 12 }} width={36} tickFormatter={(v) => fmtN(v, 1)} />
                      <Tooltip formatter={(v: number) => fmtN(v, 2)} labelFormatter={() => ''}
                        content={({ payload }) => payload?.[0] ? <div className="cartao !p-2 text-sm">{nomeRota.get((payload[0].payload as any).rota) ?? (payload[0].payload as any).rota}</div> : null} />
                      {segs.map((sg: string) => {
                        const c = (cl.centroides as any[]).find((x) => x.nome === sg)?.cluster;
                        return <Scatter key={sg} name={sg} data={(cl.pca.pontos as any[]).filter((p) => p.cluster === c)} fill={corSeg(c)} fillOpacity={0.7} />;
                      })}
                    </ScatterChart></ResponsiveContainer>
                  </div>
                  <p className="nota mt-1">Os dois primeiros componentes explicam {fmtN(100 * cl.pca.variancia[0], 0)}% e {fmtN(100 * cl.pca.variancia[1], 0)}% da variância dos sete atributos padronizados.
                    Os grupos aparecem como regiões que se tocam, sem fronteira clara.</p>
                </div>
              </div>
              <h2 className="pt-4 text-[1.8rem]">Exploração dos atributos</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="cartao">
                  <h3 className="mb-2 text-[1.3rem]">Correlograma dos atributos</h3>
                  <Correlograma nomes={(cl.correlacao.variaveis as string[]).map((v) => NOME_VAR[v] ?? v)} matriz={cl.correlacao.matriz} />
                  <p className="nota mt-1">Correlação de Pearson entre os atributos usados no agrupamento (300 rotas). Laranja: positiva; azul: negativa.</p>
                </div>
                <div className="cartao">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[1.3rem]">Boxplots por segmento</h3>
                    <select className="campo" value={varCaixa} onChange={(e) => setVarCaixa(e.target.value)}>
                      {Object.entries(CAIXAS).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}
                    </select>
                  </div>
                  <Boxplots itens={segs.map((sg: string, i: number) => ({ nome: sg, caixa: cl.caixas[varCaixa][sg], cor: CORES[i % CORES.length] })).filter((x: any) => x.caixa)}
                    formato={CAIXAS[varCaixa][1]} />
                  <p className="nota mt-1">Caixa: do 1º ao 3º quartil, com a mediana; bigodes até 1,5 vez a distância interquartil (como no boxplot da Aula 1).</p>
                </div>
              </div>
            </>
          )}
          <div className="cartao overflow-x-auto">
            <div className="mb-2 font-semibold">Perfil médio de cada segmento</div>
            <table className="tabela">
              <thead><tr><th>Segmento</th><th className="text-right">Rotas</th><th className="text-right">Assentos (12m)</th><th className="text-right">Distância</th>
                <th className="text-right">Tarifa real</th><th className="text-right">HHI</th><th className="text-right">Sazonalidade</th><th className="text-right">Volatilidade</th><th className="text-right">Crescimento</th></tr></thead>
              <tbody>{(cl.centroides as any[]).map((c, i) => (
                <tr key={c.nome}><td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: CORES[i % CORES.length] }} />{c.nome}</td>
                  <td className="text-right">{c.n_rotas}</td><td className="text-right">{fmtN(c.assentos_12m / 1e6, 1)} mi</td><td className="text-right">{fmtN(c.dist_km)} km</td>
                  <td className="text-right">{fmtR(c.tarifa_real)}</td><td className="text-right">{fmtN(10000 * c.hhi)}</td><td className="text-right">{fmtN(c.sazonalidade, 3)}</td>
                  <td className="text-right">{fmtN(c.volatilidade, 3)}</td><td className="text-right">{fmtN(100 * c.crescimento, 1)}%</td></tr>))}
              </tbody>
            </table>
            <p className="nota mt-2">Sazonalidade: desvio-padrão do perfil mensal do log da tarifa. Volatilidade: desvio-padrão da variação mensal do log da tarifa. Crescimento: variação em log dos assentos dos últimos 12 meses sobre os 12 anteriores.</p>
          </div>
          <div className="cartao max-h-96 overflow-auto">
            <table className="tabela">
              <thead><tr><th>#</th><th>Rota</th><th>Segmento</th><th className="text-right">Assentos (12m)</th><th className="text-right">Tarifa real</th><th className="text-right">Distância</th></tr></thead>
              <tbody>{comSeg.filter((r) => filtro === 'todos' || r.segmento === filtro).map((r) => (
                <tr key={r.rota}><td>{r.rank}</td><td>{r.nome} <span className="text-muted">{r.cidades}</span></td><td className="text-xs">{r.segmento}</td>
                  <td className="text-right">{fmtN(r.assentos_12m)}</td><td className="text-right">{fmtR(r.tarifa_real_12m)}</td><td className="text-right">{fmtN(r.distancia_km ?? 0)} km</td></tr>))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
