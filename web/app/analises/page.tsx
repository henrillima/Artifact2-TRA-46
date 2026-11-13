'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Secoes from '@/components/analises/Secoes';
import { Estado } from '@/components/ui';
import { getAnalises } from '@/lib/dados';
import { montarPainel } from '@/lib/analises/painel';
import './analises.css';

const SECOES = [
  ['panorama', 'Panorama'], ['casos', 'Casos reais'], ['sazonalidade', 'Sazonalidade'], ['faixas', 'Faixas de preço'],
  ['companhias', 'Companhias'], ['rotas', 'Rotas'], ['aeroportos', 'Aeroportos'], ['metodo', 'Como ler'],
];

export default function Analises() {
  const raiz = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [dados, setDados] = useState<Record<string, any> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { getAnalises().then(setDados).catch((e) => setErro((e as Error).message)); }, []);

  useEffect(() => {
    if (!dados || !raiz.current) return;
    const el = raiz.current;
    const limpar = montarPainel(el, dados);
    // links gerados pelos gráficos (rota → previsão, aeroporto → demanda) navegam dentro do site, sem recarregar
    const interno = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[data-interno]') as HTMLAnchorElement | null;
      if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); router.push(a.getAttribute('href') as string); }
    };
    el.addEventListener('click', interno);
    if (window.location.hash) el.querySelector(window.location.hash)?.scrollIntoView();
    return () => { el.removeEventListener('click', interno); limpar(); };
  }, [dados, router]);

  return (
    <div className="a1" ref={raiz}>
      <div className="a1-sub">
        <nav aria-label="Seções das análises">
          {SECOES.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
        </nav>
      </div>
      <div id="tip" role="tooltip" />
      {!dados ? <div className="a1-carregando"><Estado carregando={!erro} erro={erro} /></div> : <Secoes />}
    </div>
  );
}
