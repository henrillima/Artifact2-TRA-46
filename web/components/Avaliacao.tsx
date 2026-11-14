'use client';
/* Gráficos de avaliação de modelos (TRA-48): histograma e boxplot de erros, correlograma, dendrograma,
   curvas ROC e matriz de confusão. SVG simples com as cores do tema. */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtN } from '@/lib/sim';

export type Caixa = { q1: number; mediana: number; q3: number; min: number; max: number; n: number; fora?: number | number[]; media?: number };
export type Barra = { de: number; ate: number; n: number };

const pct = (v: number, d = 0) => `${v > 0 ? '+' : ''}${fmtN(100 * v, d)}%`;

/** Histograma de erros percentuais (faixas de 5 p.p.), com a linha do zero. */
export function Histograma({ hist, altura = 200, cor = 'var(--sig)' }: { hist: Barra[]; altura?: number; cor?: string }) {
  const W = 560, H = altura, m = { l: 36, r: 8, t: 8, b: 30 };
  const mx = Math.max(1, ...hist.map((h) => h.n));
  const lo = hist[0]?.de ?? -0.5, hi = hist[hist.length - 1]?.ate ?? 0.5;
  const X = (v: number) => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);
  const Y = (n: number) => m.t + (1 - n / mx) * (H - m.t - m.b);
  const total = hist.reduce((s, h) => s + h.n, 0) || 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Histograma dos erros de previsão">
      {[0, 0.5, 1].map((f) => <line key={f} x1={m.l} x2={W - m.r} y1={Y(f * mx)} y2={Y(f * mx)} stroke="var(--line)" />)}
      {hist.map((h) => (
        <rect key={h.de} x={X(h.de) + 1} y={Y(h.n)} width={Math.max(0, X(h.ate) - X(h.de) - 2)} height={Y(0) - Y(h.n)} fill={cor} opacity={0.85}>
          <title>{`${pct(h.de)} a ${pct(h.ate)}: ${h.n} previsões (${fmtN((100 * h.n) / total, 1)}%)`}</title>
        </rect>
      ))}
      <line x1={X(0)} x2={X(0)} y1={m.t} y2={H - m.b} stroke="var(--ink)" strokeDasharray="3 3" />
      {[-0.5, -0.25, 0, 0.25, 0.5].filter((v) => v >= lo && v <= hi).map((v) => (
        <text key={v} x={X(v)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--muted)">{pct(v)}</text>
      ))}
      <text x={m.l - 6} y={Y(mx) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{mx}</text>
      <text x={m.l - 6} y={Y(0)} textAnchor="end" fontSize={11} fill="var(--muted)">0</text>
    </svg>
  );
}

/** Boxplots horizontais (um por linha): caixa = Q1 a Q3, traço = mediana, bigodes = 1,5 × IQR. */
export function Boxplots({ itens, formato = (v: number) => pct(v), dominio, destaque }: {
  itens: { nome: string; caixa: Caixa; cor?: string }[]; formato?: (v: number) => string; dominio?: [number, number]; destaque?: string;
}) {
  const W = 640, linha = 30, m = { l: 262, r: 16, t: 6, b: 26 };
  const H = m.t + itens.length * linha + m.b;
  const lo = dominio?.[0] ?? Math.min(...itens.map((i) => i.caixa.min)), hi = dominio?.[1] ?? Math.max(...itens.map((i) => i.caixa.max));
  const X = (v: number) => m.l + ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo || 1)) * (W - m.l - m.r);
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Boxplots">
      {ticks.map((t) => <line key={t} x1={X(t)} x2={X(t)} y1={m.t} y2={H - m.b} stroke="var(--line)" />)}
      {lo < 0 && hi > 0 && <line x1={X(0)} x2={X(0)} y1={m.t} y2={H - m.b} stroke="var(--ink)" strokeDasharray="3 3" opacity={0.6} />}
      {itens.map((it, i) => {
        const y = m.t + i * linha + linha / 2, c = it.cor ?? 'var(--sig)', b = it.caixa;
        const forte = destaque === it.nome;
        return (
          <g key={it.nome}>
            <text x={m.l - 10} y={y + 4} textAnchor="end" fontSize={12} fontWeight={forte ? 700 : 400} fill="var(--ink)">{it.nome}</text>
            <line x1={X(b.min)} x2={X(b.max)} y1={y} y2={y} stroke="var(--muted)" />
            <line x1={X(b.min)} x2={X(b.min)} y1={y - 6} y2={y + 6} stroke="var(--muted)" />
            <line x1={X(b.max)} x2={X(b.max)} y1={y - 6} y2={y + 6} stroke="var(--muted)" />
            <rect x={X(b.q1)} y={y - 9} width={Math.max(1, X(b.q3) - X(b.q1))} height={18} rx={3} fill={c} fillOpacity={forte ? 0.55 : 0.3} stroke={c} />
            <line x1={X(b.mediana)} x2={X(b.mediana)} y1={y - 9} y2={y + 9} stroke="var(--ink)" strokeWidth={2} />
            <title>{`${it.nome}: mediana ${formato(b.mediana)}; Q1 ${formato(b.q1)}; Q3 ${formato(b.q3)}; ${b.n} observações`}</title>
          </g>
        );
      })}
      {ticks.map((t) => <text key={t} x={X(t)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">{formato(t)}</text>)}
    </svg>
  );
}

/** Correlograma: matriz de correlação colorida (azul negativo, laranja positivo). */
export function Correlograma({ nomes, matriz }: { nomes: string[]; matriz: number[][] }) {
  const n = nomes.length, c = 52, m = 150, W = m + n * c + 70, H = m + n * c - 40;
  const cor = (v: number) => (v >= 0 ? `color-mix(in srgb, var(--warn) ${Math.round(Math.abs(v) * 85)}%, var(--surface))`
    : `color-mix(in srgb, var(--cool) ${Math.round(Math.abs(v) * 85)}%, var(--surface))`);
  return (
    <svg viewBox={`0 0 ${W} ${H + 10}`} className="w-full" role="img" aria-label="Correlograma dos atributos das rotas">
      {nomes.map((nm, i) => (
        <g key={nm}>
          <text x={m - 8} y={m - 40 + i * c + c / 2 + 4} textAnchor="end" fontSize={12} fill="var(--ink)">{nm}</text>
          <text transform={`translate(${m + i * c + c / 2},${m - 48}) rotate(-40)`} fontSize={12} fill="var(--ink)">{nm}</text>
        </g>
      ))}
      {matriz.map((lin, i) => lin.map((v, j) => (
        <g key={`${i}-${j}`}>
          <rect x={m + j * c + 1} y={m - 40 + i * c + 1} width={c - 2} height={c - 2} rx={4} fill={cor(v)} />
          <text x={m + j * c + c / 2} y={m - 40 + i * c + c / 2 + 4} textAnchor="middle" fontSize={11.5}
            fill={Math.abs(v) > 0.6 ? 'var(--bg)' : 'var(--ink)'}>{fmtN(v, 2)}</text>
        </g>
      )))}
    </svg>
  );
}

/** Dendrograma (saída do scipy: icoord/dcoord), com a linha de corte para k grupos. */
export function Dendrograma({ icoord, dcoord, corte }: { icoord: number[][]; dcoord: number[][]; corte?: number }) {
  const W = 560, H = 260, m = { l: 36, r: 8, t: 10, b: 16 };
  const xs = icoord.flat(), ys = dcoord.flat();
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = Math.max(...ys, corte ?? 0) * 1.03;
  const X = (v: number) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const Y = (v: number) => m.t + (1 - v / y1) * (H - m.t - m.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Dendrograma da clusterização hierárquica">
      {[0, y1 / 2, y1].map((v) => <text key={v} x={m.l - 6} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{fmtN(v, 1)}</text>)}
      {icoord.map((xx, i) => (
        <polyline key={i} fill="none" stroke="var(--sig)" strokeWidth={1.4}
          points={xx.map((x, k) => `${X(x).toFixed(1)},${Y(dcoord[i][k]).toFixed(1)}`).join(' ')} />
      ))}
      {corte != null && <line x1={m.l} x2={W - m.r} y1={Y(corte)} y2={Y(corte)} stroke="var(--warn)" strokeDasharray="5 4" />}
    </svg>
  );
}

/** Curvas ROC de vários modelos (taxa de verdadeiros positivos × taxa de falsos positivos). */
export function CurvasROC({ curvas, altura = 300 }: { curvas: { nome: string; cor: string; pontos: { fpr: number; tpr: number }[]; auc: number }[]; altura?: number }) {
  return (
    <div style={{ width: '100%', height: altura }}>
      <ResponsiveContainer>
        <LineChart margin={{ top: 6, right: 12, left: 0, bottom: 14 }}>
          <CartesianGrid stroke="var(--line)" />
          <XAxis type="number" dataKey="fpr" domain={[0, 1]} tickFormatter={(v) => fmtN(v, 1)} tick={{ fontSize: 12 }}
            label={{ value: 'Taxa de falsos positivos', position: 'insideBottom', offset: -8, fontSize: 12 }} />
          <YAxis type="number" dataKey="tpr" domain={[0, 1]} tickFormatter={(v) => fmtN(v, 1)} tick={{ fontSize: 12 }} width={40} />
          <Tooltip formatter={(v: number) => fmtN(v, 2)} labelFormatter={(l) => `TFP ${fmtN(Number(l), 2)}`} />
          <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />
          <Line data={[{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }]} dataKey="tpr" name="Acaso" stroke="var(--nom)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          {curvas.map((c) => (
            <Line key={c.nome} data={c.pontos} dataKey="tpr" name={`${c.nome} (AUC ${fmtN(c.auc, 2)})`} stroke={c.cor} strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Matriz de confusão 2 × 2 (linhas = real, colunas = previsto). */
export function MatrizConfusao({ m, rotulos = ['Normal', 'Evento'] }: { m: number[][]; rotulos?: [string, string] | string[] }) {
  const tot = m.flat().reduce((a, b) => a + b, 0) || 1;
  const cel = (v: number, certo: boolean) => (
    <td className="text-center" style={{ background: `color-mix(in srgb, ${certo ? 'var(--sig)' : 'var(--warn)'} ${Math.round(15 + 60 * v / tot)}%, var(--surface))`, fontWeight: 600 }}>{fmtN(v)}</td>
  );
  return (
    <table className="tabela">
      <thead><tr><th>Real ↓ · Previsto →</th><th className="text-center">{rotulos[0]}</th><th className="text-center">{rotulos[1]}</th></tr></thead>
      <tbody>
        <tr><td>{rotulos[0]}</td>{cel(m[0][0], true)}{cel(m[0][1], false)}</tr>
        <tr><td>{rotulos[1]}</td>{cel(m[1][0], false)}{cel(m[1][1], true)}</tr>
      </tbody>
    </table>
  );
}
