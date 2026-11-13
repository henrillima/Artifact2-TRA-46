'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const itens = [
  ['/', 'Visão geral'], ['/analises', 'Análises'], ['/previsao', 'Previsão'], ['/custos', 'Custos'], ['/fusao', 'Fusões'],
  ['/demanda', 'Demanda'], ['/segmentos', 'Segmentos'], ['/cenarios', 'Cenários'], ['/metodo', 'Método'],
];

export default function Nav() {
  const p = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-linha bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between md:px-6">
        <Link href="/" className="flex shrink-0 items-baseline gap-2">
          <span className="whitespace-nowrap text-lg font-bold">Tarifas aéreas</span>
          <span className="hidden whitespace-nowrap text-sm text-slate-500 xl:inline">previsão e cenários</span>
        </Link>
        <nav className="-mx-1 flex flex-wrap gap-1">
          {itens.map(([h, t]) => (
            <Link key={h} href={h}
              className={`whitespace-nowrap rounded-md px-2 py-1.5 text-sm ${p === h ? 'bg-tinta text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {t}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
