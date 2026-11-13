'use client';
import { ReactNode, useState } from 'react';
import { salvarCenario } from '@/lib/dados';

export function Kpi({ rotulo, valor, sub, tom }: { rotulo: string; valor: string; sub?: string; tom?: 'pos' | 'neg' }) {
  return (
    <div className="cartao">
      <div className="rotulo">{rotulo}</div>
      <div className={`mt-2 font-disp text-[2rem] font-semibold leading-none tabular-nums ${tom === 'pos' ? 'text-cool' : tom === 'neg' ? 'text-warn' : ''}`}>{valor}</div>
      {sub && <div className="mt-2 text-[.82rem] leading-snug text-muted">{sub}</div>}
    </div>
  );
}

export function Controle({ rotulo, valor, children, ajuda }: { rotulo: string; valor?: string; children: ReactNode; ajuda?: string }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{rotulo}</span>
        {valor && <span className="text-sm font-semibold tabular-nums text-ceu">{valor}</span>}
      </div>
      <div className="mt-1">{children}</div>
      {ajuda && <div className="nota mt-1">{ajuda}</div>}
    </label>
  );
}

export function Deslizante({ v, set, min, max, passo }: { v: number; set: (x: number) => void; min: number; max: number; passo: number }) {
  return <input type="range" className="w-full" value={v} min={min} max={max} step={passo} onChange={(e) => set(Number(e.target.value))} />;
}

export function Titulo({ titulo, sub }: { titulo: string; sub?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-[clamp(2rem,4.4vw,3rem)]">{titulo}</h1>
      {sub && <p className="mt-3 max-w-[70ch] text-[1.04rem] text-muted">{sub}</p>}
    </div>
  );
}

export function Estado({ carregando, erro }: { carregando: boolean; erro: string | null }) {
  if (erro) return <div className="cartao text-warn">Não foi possível ler os dados: {erro}</div>;
  if (carregando) return <div className="cartao animate-pulse text-muted">Carregando dados…</div>;
  return null;
}

export function SalvarCenario({ tipo, parametros, resumo }: { tipo: string; parametros: Record<string, unknown>; resumo: Record<string, unknown> }) {
  const [nome, setNome] = useState('');
  const [autor, setAutor] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function salvar() {
    setOcupado(true); setMsg(null);
    try {
      await salvarCenario({ tipo, nome: nome.trim(), autor: autor.trim(), parametros, resumo });
      setMsg('Cenário salvo. Ele aparece em "Cenários salvos" para todo o grupo.');
      setNome('');
    } catch (e) {
      setMsg('Erro ao salvar: ' + (e as Error).message);
    } finally { setOcupado(false); }
  }
  return (
    <div className="cartao">
      <div className="rotulo mb-2">Salvar este cenário no banco</div>
      <div className="flex flex-col gap-2 md:flex-row">
        <input className="campo md:w-48" placeholder="Seu nome" maxLength={60} value={autor} onChange={(e) => setAutor(e.target.value)} />
        <input className="campo flex-1" placeholder="Nome do cenário (ex.: QAV +30% em 2026)" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
        <button className="botao" disabled={ocupado || !nome.trim() || !autor.trim()} onClick={salvar}>Salvar</button>
      </div>
      {msg && <div className="nota mt-2">{msg}</div>}
    </div>
  );
}

export const COR: Record<string, string> = { LATAM: 'var(--tam)', Gol: 'var(--glo)', Azul: 'var(--azu)', Outras: 'var(--out)', Avianca: 'var(--one)' };
