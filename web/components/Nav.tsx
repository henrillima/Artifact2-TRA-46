'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const itens = [
  ['/', 'Visão geral'], ['/analises', 'Análises'], ['/previsao', 'Previsão'], ['/custos', 'Custos'], ['/fusao', 'Fusões'],
  ['/demanda', 'Demanda'], ['/segmentos', 'Segmentos'], ['/cenarios', 'Cenários'], ['/metodo', 'Método'],
];

function alternarTema() {
  const el = document.documentElement;
  const atual = el.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const novo = atual === 'dark' ? 'light' : 'dark';
  el.setAttribute('data-theme', novo);
  try { localStorage.setItem('tarifas-tema', novo); } catch { /* sem armazenamento */ }
}

export default function Nav() {
  const p = usePathname();
  return (
    <header className="topo">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-5 px-4 md:px-5">
        <Link href="/" className="marca">Tarifas aéreas <span>Brasil</span></Link>
        <nav className="menu" aria-label="Páginas">
          {itens.map(([h, t]) => (
            <Link key={h} href={h} aria-current={(h === '/' ? p === '/' : p.startsWith(h)) ? 'page' : undefined}>{t}</Link>
          ))}
        </nav>
        <button type="button" className="tema" onClick={alternarTema} aria-label="Alternar entre tema claro e escuro" title="Alternar tema">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
        </button>
      </div>
    </header>
  );
}
