'use client';
import { useEffect, useState } from 'react';
import { Titulo } from '@/components/ui';

export default function Analises() {
  const [src, setSrc] = useState('/analises/index.html');
  useEffect(() => { if (window.location.hash) setSrc('/analises/index.html' + window.location.hash); }, []);
  return (
    <div className="space-y-4">
      <Titulo titulo="Análises"
        sub={<>Todas as análises do ARTEF1 (panorama, casos reais, sazonalidade, faixas de preço, companhias, rotas, aeroportos e método),
          agora sobre a base completa: jan/2015 a set/2026, em R$ de set/2026, com a Avianca separada e um caso novo sobre a saída dela em 2019.</>} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <a className="botao-sec" href={src} target="_blank" rel="noreferrer">Abrir em tela cheia ↗</a>
        <span className="nota">Mesma base, mesma limpeza e mesmo mês de referência dos módulos de previsão e cenários.</span>
      </div>
      <iframe src={src} title="Análises da base completa" className="w-full rounded-xl border border-linha bg-white"
        style={{ height: 'calc(100vh - 120px)', minHeight: 640 }} />
    </div>
  );
}
