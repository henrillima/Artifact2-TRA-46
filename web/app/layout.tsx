import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Tarifas aéreas: previsão e cenários',
  description: 'ARTEF2 · TRA-46 Economia Aplicada (ITA) · Grupo 02 — previsão de tarifas e simulação de cenários a partir dos microdados da ANAC.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans">
        <Nav />
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 md:px-6">
          <p className="nota">
            ARTEF2 · TRA-46 Economia Aplicada · ITA · Grupo 02 (Antônio, Henri, Karbage e Vitor) · Prof. Alessandro V. M. Oliveira.
            Dados: ANAC (tarifas aéreas domésticas comercializadas), IBGE (IPCA), Banco Central (PTAX), EIA/FRED (querosene de aviação) e AvDataBr (QAV no Brasil).
          </p>
        </footer>
      </body>
    </html>
  );
}
