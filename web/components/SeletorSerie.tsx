'use client';
import { useEffect, useState } from 'react';
import { buscarRotas, getTopRotas, Nivel, Rota } from '@/lib/dados';

export type Escolha = { nivel: Nivel; chave: string; rota?: Rota; titulo: string };

const EMPRESAS = ['LATAM', 'Gol', 'Azul', 'Outras'];

export function tituloEscolha(e: Escolha) {
  if (e.nivel === 'brasil') return 'Brasil (todas as rotas)';
  if (e.nivel === 'empresa') return e.chave;
  return e.rota ? `${e.rota.nome} · ${e.rota.cidades}` : e.chave;
}

export default function SeletorSerie({ valor, onChange, soComModelo = false }: { valor: Escolha; onChange: (e: Escolha) => void; soComModelo?: boolean }) {
  const [top, setTop] = useState<Rota[]>([]);
  const [q, setQ] = useState('');
  const [achadas, setAchadas] = useState<Rota[]>([]);
  useEffect(() => { getTopRotas(300).then(setTop).catch(() => {}); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setAchadas([]); return; }
    const t = setTimeout(() => buscarRotas(q.trim()).then(setAchadas).catch(() => setAchadas([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const opcoes = (soComModelo ? top.filter((r) => r.rank <= 60) : top).slice(0, soComModelo ? 60 : 300);
  const escolherRota = (r: Rota) => onChange({ nivel: 'rota', chave: r.rota, rota: r, titulo: '' });
  return (
    <div className="cartao space-y-3">
      <div className="rotulo">Série analisada</div>
      <div className="flex flex-wrap gap-2">
        <button className={valor.nivel === 'brasil' ? 'botao' : 'botao-sec'} onClick={() => onChange({ nivel: 'brasil', chave: 'BR', titulo: '' })}>Brasil</button>
        {EMPRESAS.map((e) => (
          <button key={e} className={valor.nivel === 'empresa' && valor.chave === e ? 'botao' : 'botao-sec'}
            onClick={() => onChange({ nivel: 'empresa', chave: e, titulo: '' })}>{e}</button>
        ))}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <select className="campo" value={valor.nivel === 'rota' ? valor.chave : ''}
          onChange={(e) => { const r = top.find((x) => x.rota === e.target.value); if (r) escolherRota(r); }}>
          <option value="">{soComModelo ? 'Escolha uma das 60 maiores rotas…' : 'Escolha uma das 300 maiores rotas…'}</option>
          {opcoes.map((r) => <option key={r.rota} value={r.rota}>{r.rank}. {r.nome} — {r.cidades}</option>)}
        </select>
        {!soComModelo && (
          <div className="relative">
            <input className="campo w-full" placeholder="Buscar qualquer rota (ex.: POA, Recife, SBKP)" value={q} onChange={(e) => setQ(e.target.value)} />
            {achadas.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-linha bg-surface shadow-lg">
                {achadas.map((r) => (
                  <button key={r.rota} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-soft"
                    onClick={() => { escolherRota(r); setQ(''); setAchadas([]); }}>
                    {r.nome} — {r.cidades} <span className="text-muted">(#{r.rank})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="text-sm text-muted">Selecionada: <b>{tituloEscolha(valor)}</b></div>
    </div>
  );
}
