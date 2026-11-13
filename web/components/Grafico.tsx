'use client';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtMes } from '@/lib/sim';

export type Ponto = {
  periodo: string; real?: number | null; previsto?: number | null; base?: number | null; cenario?: number | null;
  f80?: [number, number] | null; f95?: [number, number] | null;
};

type Props = {
  pontos: Ponto[]; formato: (v: number) => string; altura?: number; corte?: string;
  rotulos?: Partial<Record<'real' | 'previsto' | 'base' | 'cenario', string>>; faixas?: '80' | '95' | 'ambas' | 'nenhuma';
};

export default function Grafico({ pontos, formato, altura = 360, corte, rotulos = {}, faixas = 'ambas' }: Props) {
  const tem = (k: keyof Ponto) => pontos.some((p) => p[k] != null);
  return (
    <div style={{ width: '100%', height: altura }}>
      <ResponsiveContainer>
        <ComposedChart data={pontos} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="periodo" tickFormatter={fmtMes} minTickGap={28} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v) => formato(v)} width={84} tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
          <Tooltip labelFormatter={(l) => fmtMes(String(l))}
            formatter={(v: unknown, n: string) => Array.isArray(v) ? [`${formato(v[0])} a ${formato(v[1])}`, n] : [formato(Number(v)), n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {(faixas === '95' || faixas === 'ambas') && tem('f95') &&
            <Area dataKey="f95" name="Intervalo de 95%" stroke="none" fill="var(--sig)" fillOpacity={0.10} isAnimationActive={false} />}
          {(faixas === '80' || faixas === 'ambas') && tem('f80') &&
            <Area dataKey="f80" name="Intervalo de 80%" stroke="none" fill="var(--sig)" fillOpacity={0.18} isAnimationActive={false} />}
          {tem('real') && <Line dataKey="real" name={rotulos.real ?? 'Observado'} stroke="var(--ink)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
          {tem('previsto') && <Line dataKey="previsto" name={rotulos.previsto ?? 'Previsto'} stroke="var(--sig)" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />}
          {tem('base') && <Line dataKey="base" name={rotulos.base ?? 'Cenário base'} stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />}
          {tem('cenario') && <Line dataKey="cenario" name={rotulos.cenario ?? 'Cenário simulado'} stroke="var(--warn)" strokeWidth={2.2} dot={false} isAnimationActive={false} />}
          {corte && <ReferenceLine x={corte} stroke="var(--nom)" strokeDasharray="3 3" label={{ value: 'último dado', fontSize: 11, fill: 'var(--muted)', position: 'insideTopRight' }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
