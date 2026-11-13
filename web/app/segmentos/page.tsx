'use client';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Estado, Titulo } from '@/components/ui';
import { getParametros, getTopRotas, Rota } from '@/lib/dados';
import { fmtN, fmtR } from '@/lib/sim';

const CORES = ['#1f6feb', '#e11d48', '#059669', '#d97706', '#7c3aed', '#64748b', '#0891b2'];

export default function PaginaSegmentos() {
  const [rotas, setRotas] = useState<Rota[]>([]);
  const [par, setPar] = useState<Record<string, any> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('todos');
  useEffect(() => { Promise.all([getTopRotas(300), getParametros()]).then(([r, p]) => { setRotas(r); setPar(p); }).catch((e) => setErro((e as Error).message)); }, []);
  const cl = par?.clusters;
  const segs = useMemo(() => (cl?.centroides ?? []).map((c: any) => c.nome as string), [cl]);
  const comSeg = rotas.filter((r) => r.segmento);
  const sil = cl ? Object.entries(cl.silhueta as Record<string, number>).map(([k, v]) => ({ k: `k = ${k}`, silhueta: v })) : [];
  return (
    <div className="space-y-5">
      <Titulo titulo="Segmentos de rotas"
        sub={<>Agrupamento não supervisionado (k-médias) das 300 maiores rotas por distância, densidade, tarifa por quilômetro, sazonalidade,
          volatilidade, concentração e crescimento. O número de grupos foi escolhido pelo índice de silhueta e conferido com mistura gaussiana.</>} />
      <Estado carregando={!rotas.length && !erro} erro={erro} />
      {cl && (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="cartao">
              <div className="mb-2 font-semibold">Distância × tarifa real por rota (bolha = assentos)</div>
              <div style={{ width: '100%', height: 420 }}>
                <ResponsiveContainer><ScatterChart margin={{ left: 10, right: 10 }}>
                  <CartesianGrid stroke="#ece8de" /><XAxis type="number" dataKey="distancia_km" name="Distância (km)" tick={{ fontSize: 12 }} unit=" km" />
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
                  <ResponsiveContainer><BarChart data={sil}><CartesianGrid stroke="#ece8de" vertical={false} /><XAxis dataKey="k" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 'auto']} /><Tooltip formatter={(v: number) => fmtN(v, 3)} /><Bar dataKey="silhueta" fill="#14213d" /></BarChart></ResponsiveContainer>
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
                <tr key={r.rota}><td>{r.rank}</td><td>{r.nome} <span className="text-slate-400">{r.cidades}</span></td><td className="text-xs">{r.segmento}</td>
                  <td className="text-right">{fmtN(r.assentos_12m)}</td><td className="text-right">{fmtR(r.tarifa_real_12m)}</td><td className="text-right">{fmtN(r.distancia_km ?? 0)} km</td></tr>))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
