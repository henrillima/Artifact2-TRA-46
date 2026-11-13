'use client';
import { useEffect, useState } from 'react';
import { Titulo } from '@/components/ui';
import { getMetricas, getParametros, Metrica } from '@/lib/dados';
import { fmtMes, fmtN } from '@/lib/sim';

function Secao({ t, children }: { t: string; children: React.ReactNode }) {
  return <section className="cartao space-y-2"><h2 className="text-lg font-semibold">{t}</h2><div className="space-y-2 text-sm leading-relaxed text-slate-700">{children}</div></section>;
}

export default function Metodo() {
  const [par, setPar] = useState<Record<string, any> | null>(null);
  const [met, setMet] = useState<Metrica[]>([]);
  useEffect(() => { getParametros().then(setPar).catch(() => {}); getMetricas().then(setMet).catch(() => {}); }, []);
  const tab = met.filter((m) => m.nivel === 'todas').sort((a, b) => a.mape - b.mape);
  const niveis = ['brasil', 'empresa', 'rota'];
  const menor = (n: string) => Math.min(...met.filter((x) => x.nivel === n && Number.isFinite(x.mape)).map((x) => x.mape));
  return (
    <div className="space-y-5">
      <Titulo titulo="Método" sub="De onde vêm os números, como os modelos foram escolhidos e o que eles não dizem." />
      <Secao t="Dados">
        <p><b>Tarifas:</b> microdados de tarifas aéreas domésticas comercializadas da ANAC{par ? ` (${fmtMes(par.primeiro_mes_dados)} a ${fmtMes(par.ultimo_mes_dados)})` : ''}. Cada linha
          traz companhia, origem, destino, tarifa e assentos vendidos naquela tarifa. A tarifa é o valor do transporte, sem taxas, e o mês é o da venda.
          A limpeza é a mesma do ARTEF1 e, nos meses em comum (2020 a 2025), os totais conferem com ele mês a mês (assentos idênticos; média com diferença relativa abaixo de 0,002%).</p>
        <p><b>Valores reais:</b> IPCA (série 433 do Banco Central), em reais de {par ? fmtMes(par.mes_base_real) : '…'}.</p>
        <p><b>Combustível:</b> preço do QAV no Brasil da base AvDataBr (NECTAR-ITA) até dez/2023, estendido com o querosene de aviação da Costa do Golfo dos EUA (EIA, via FRED)
          convertido pela PTAX (série 3698). A ponte, estimada no período comum, é ln QAV(t) = {par ? fmtN(par.ponte_qav.a, 3) : '…'} + {par ? fmtN(par.ponte_qav.b, 3) : '…'} · ln(preço internacional em reais)(t−1),
          com R² de {par ? fmtN(par.ponte_qav.r2, 3) : '…'} em {par?.ponte_qav.n ?? '…'} meses.</p>
        <p><b>Banco de dados:</b> tudo fica num Postgres (Supabase): séries mensais de Brasil, companhias e todas as rotas, o painel rota × companhia × mês para consultas livres,
          previsões, parâmetros e os cenários salvos pelos usuários.</p>
      </Secao>
      <Secao t="Previsão: seleção de modelos (aprendizado de máquina)">
        <p>Dez candidatos para cada série (Brasil, quatro grupos de companhias e as 60 maiores rotas): sazonal ingênuo; suavização exponencial de Holt-Winters com tendência amortecida;
          hierárquico (previsão nacional × nível relativo da série); e sete modelos supervisionados treinados em conjunto sobre todas as séries — regressão ridge, árvore de decisão,
          floresta aleatória, gradient boosting, k vizinhos mais próximos, máquina de vetores de suporte e rede neural (MLP). Os supervisionados preveem o desvio do log da tarifa
          em relação à média dos 12 meses anteriores a partir de defasagens, mês do ano, variação do QAV e um indicador da pandemia, de forma recursiva.</p>
        <p>Validação com origem móvel: três cortes, cada um prevendo 12 meses sem ver o período testado. O modelo padrão de cada série é o de menor erro percentual médio nessa validação.
          Os intervalos de 80% e 95% vêm dos erros de validação de cada modelo em cada nível (Brasil, companhias, rotas): o erro em log é dividido pela raiz do horizonte, tomam-se os quantis empíricos e o resultado é multiplicado de volta pela raiz do horizonte, de modo que a faixa abre conforme a previsão se afasta.</p>
        <div className="overflow-x-auto">
          <table className="tabela"><thead><tr><th>Modelo</th>{niveis.map((n) => <th key={n} className="text-right">MAPE {n === 'brasil' ? 'Brasil' : n === 'empresa' ? 'companhias' : 'rotas'}</th>)}<th className="text-right">MAPE geral</th></tr></thead>
            <tbody>{tab.map((m) => (
              <tr key={m.modelo}><td>{m.nome}</td>{niveis.map((n) => { const x = met.find((y) => y.modelo === m.modelo && y.nivel === n); return <td key={n} className="text-right">{x ? fmtN(100 * x.mape, 1) + '%' : '—'}</td>; })}
                <td className="text-right font-semibold">{fmtN(100 * m.mape, 1)}%</td></tr>))}</tbody></table>
        </div>
        <p>Leitura dos resultados: na série Brasil, o melhor modelo erra em média {fmtN(100 * menor('brasil'), 1)}% e o sazonal ingênuo, {fmtN(100 * (met.find((x) => x.modelo === 'ingenuo' && x.nivel === 'brasil')?.mape ?? NaN), 1)}%;
          nas rotas, a tarifa média mensal é ruidosa e o melhor modelo erra {fmtN(100 * menor('rota'), 1)}% em até 12 meses.
          A previsão é mais útil para o nível e a sazonalidade do que para um mês específico de uma rota.</p>
      </Secao>
      {par && (
        <Secao t="Parâmetros econômicos estimados (painel de rotas)">
          <table className="tabela"><thead><tr><th>Parâmetro</th><th className="text-right">Estimativa</th><th className="text-right">Erro-padrão</th><th>Como foi estimado</th></tr></thead>
            <tbody>
              <tr><td>Repasse do QAV para a tarifa (elasticidade)</td><td className="text-right">{fmtN(par.repasse.elasticidade_media, 3)}</td><td className="text-right">{fmtN(par.repasse.ep, 3)}</td><td className="text-xs">{par.repasse.nota}</td></tr>
              <tr><td>Elasticidade-preço da demanda (variáveis instrumentais)</td><td className="text-right">{fmtN(par.demanda.elasticidade_2sls_nacional, 3)}</td><td className="text-right">{fmtN(par.demanda.ep_nacional, 3)}</td><td className="text-xs">{par.demanda.nota_nacional} F do primeiro estágio: {fmtN(par.demanda.F_nacional, 1)}.</td></tr>
              {par.demanda.robustez && (<>
                <tr><td className="pl-6">Mesmo instrumento, só de 2020 em diante</td><td className="text-right">{fmtN(par.demanda.robustez.tendencia_desde_2020.elasticidade, 3)}</td><td className="text-right">{fmtN(par.demanda.robustez.tendencia_desde_2020.ep, 3)}</td><td className="text-xs">Robustez. F do primeiro estágio: {fmtN(par.demanda.robustez.tendencia_desde_2020.F, 1)}.</td></tr>
                <tr><td className="pl-6">Mesmo instrumento, com efeito fixo de ano</td><td className="text-right">{fmtN(par.demanda.robustez.ano_fe_amostra_toda.elasticidade, 2)}</td><td className="text-right">{fmtN(par.demanda.robustez.ano_fe_amostra_toda.ep, 2)}</td><td className="text-xs">Robustez. F do primeiro estágio: {fmtN(par.demanda.robustez.ano_fe_amostra_toda.F, 1)}{par.demanda.robustez.ano_fe_amostra_toda.F < 10 ? ' (instrumento fraco: sobra pouca variação do QAV dentro de cada ano)' : ''}.</td></tr>
              </>)}
              <tr><td>Elasticidade-preço da demanda (mínimos quadrados)</td><td className="text-right">{fmtN(par.demanda.elasticidade_mqo, 3)}</td><td className="text-right">{fmtN(par.demanda.ep_mqo, 3)}</td><td className="text-xs">Viesada em direção a zero pela simultaneidade entre oferta e demanda; mostrada para comparação.</td></tr>
              <tr><td>Instrumento alternativo (QAV × distância, com efeito fixo de mês)</td><td className="text-right">{fmtN(par.demanda.elasticidade_2sls, 2)}</td><td className="text-right">{fmtN(par.demanda.ep, 2)}</td><td className="text-xs">Instrumento fraco (F = {fmtN(par.demanda.F_primeiro_estagio, 2)}); descartado.</td></tr>
              <tr><td>HHI e tarifa na mesma rota (associação)</td><td className="text-right">{fmtN(par.hhi.semi_elasticidade, 3)}</td><td className="text-right">{fmtN(par.hhi.ep, 3)}</td><td className="text-xs">{par.hhi.nota} Por isso o simulador de fusão usa o modelo de Cournot, não esta regressão.</td></tr>
            </tbody></table>
          <p>Amostra: {par.amostra.rotas} rotas com pelo menos 36 meses e distância conhecida, {fmtN(par.amostra.obs)} observações rota-mês.</p>
        </Secao>
      )}
      <Secao t="Segmentos e anomalias (aprendizado não supervisionado)">
        <p>Segmentos: k-médias sobre sete atributos padronizados das 300 maiores rotas; k escolhido pela silhueta e conferido por mistura gaussiana. Anomalias: floresta de isolamento sobre
          a variação em 12 meses de assentos e tarifas dos 40 maiores aeroportos, absoluta e relativa ao Brasil, com 2% dos meses classificados como anômalos. Os eventos detectados
          (pandemia, enchente no RS, o salto atípico de movimento no Galeão em 2024) alimentam a biblioteca de choques.</p>
      </Secao>
      <Secao t="Limitações">
        <ul className="list-disc space-y-1 pl-5">
          <li>Os dados da ANAC não têm voos, passageiros transportados nem ocupação: o volume é medido por assentos vendidos.</li>
          <li>O total de assentos na base de tarifas cai de cerca de 49 milhões em 2015 para 38 milhões em 2019. Essa queda ainda precisa ser conferida contra os passageiros pagos dos Dados Estatísticos da ANAC; por isso a elasticidade da demanda aparece também estimada só com 2020 em diante.</li>
          <li>A previsão base mantém o QAV e o câmbio no último valor observado; os choques são aplicados por cima dela.</li>
          <li>O simulador de fusão usa pares de aeroportos como mercado relevante e trata "Outras" como uma firma; não simula entrada, slots nem reação de rivais.</li>
          <li>As elasticidades são médias do mercado doméstico; rotas de negócios e de lazer reagem de forma diferente.</li>
          <li>Diferenças entre companhias refletem também as rotas que cada uma opera.</li>
        </ul>
      </Secao>
    </div>
  );
}
