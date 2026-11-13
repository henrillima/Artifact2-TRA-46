import type { Metadata } from 'next';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Tarifas aéreas: análises, previsão e cenários',
  description: 'ARTEF2 · TRA-46 Economia Aplicada (ITA) · Grupo 02 — análises, previsão de tarifas e simulação de cenários a partir dos microdados da ANAC.',
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9C%88%EF%B8%8F%3C/text%3E%3C/svg%3E" },
};

// aplica o tema salvo antes da primeira pintura (evita piscar)
const temaInicial = `try{var t=localStorage.getItem('tarifas-tema');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: temaInicial }} />
      </head>
      <body className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-[1180px] px-4 py-8 md:px-5">{children}</main>
        <footer className="mx-auto max-w-[1180px] px-4 pb-12 pt-6 md:px-5">
          <p className="nota">
            ARTEF2 · TRA-46 Economia Aplicada · ITA · Grupo 02 (Antônio, Henri, Karbage e Vitor) · Prof. Alessandro V. M. Oliveira.
            Dados: ANAC (tarifas aéreas domésticas comercializadas), IBGE (IPCA), Banco Central (PTAX), EIA/FRED (querosene de aviação) e AvDataBr (QAV no Brasil).
          </p>
        </footer>
      </body>
    </html>
  );
}
