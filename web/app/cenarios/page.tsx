'use client';
import { Fragment, useEffect, useState } from 'react';
import { Estado, Titulo } from '@/components/ui';
import { Cenario, listarCenarios } from '@/lib/dados';
import { fmtN, fmtP } from '@/lib/sim';

const TIPOS: Record<string, string> = { previsao: 'Previsão', custos: 'Choque de custos', fusao: 'Fusão', demanda: 'Choque de demanda' };

function fmtValor(k: string, v: unknown) {
  if (typeof v !== 'number') return String(v);
  if (['tarifa', 'assentos', 'receita', 'efeito_tarifa'].includes(k)) return fmtP(v);
  return fmtN(v, Number.isInteger(v) ? 0 : 2);
}

export default function PaginaCenarios() {
  const [lista, setLista] = useState<Cenario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState('todos');
  const carregar = () => { setCarregando(true); listarCenarios().then(setLista).catch((e) => setErro((e as Error).message)).finally(() => setCarregando(false)); };
  useEffect(carregar, []);
  const filtrados = lista.filter((c) => tipo === 'todos' || c.tipo === tipo);
  return (
    <div className="space-y-5">
      <Titulo titulo="Cenários salvos" sub="Cenários gravados no banco pelos usuários do artefato. Servem para comparar hipóteses e para registrar as simulações usadas no artigo." />
      <div className="flex flex-wrap gap-2">
        {['todos', ...Object.keys(TIPOS)].map((t) => <button key={t} className={tipo === t ? 'botao' : 'botao-sec'} onClick={() => setTipo(t)}>{t === 'todos' ? 'Todos' : TIPOS[t]}</button>)}
        <button className="botao-sec" onClick={carregar}>Atualizar</button>
      </div>
      <Estado carregando={carregando} erro={erro} />
      {!carregando && filtrados.length === 0 && <div className="cartao text-muted">Nenhum cenário salvo ainda. Use o botão "Salvar" no fim de cada simulador.</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {filtrados.map((c) => (
          <div key={c.id} className="cartao">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-semibold">{c.nome}</div><span className="rounded bg-soft px-2 py-0.5 text-xs">{TIPOS[c.tipo] ?? c.tipo}</span>
            </div>
            <div className="nota">por {c.autor} · {new Date(c.criado_em).toLocaleString('pt-BR')}</div>
            {c.resumo && (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {Object.entries(c.resumo).map(([k, v]) => (<Fragment key={k}><dt className="text-muted">{k.replaceAll('_', ' ')}</dt><dd className="text-right tabular-nums">{fmtValor(k, v)}</dd></Fragment>))}
              </dl>
            )}
            <details className="mt-2"><summary className="cursor-pointer text-xs text-muted">parâmetros</summary>
              <pre className="mt-1 overflow-auto rounded bg-soft p-2 text-xs">{JSON.stringify(c.parametros, null, 2)}</pre></details>
          </div>
        ))}
      </div>
    </div>
  );
}
