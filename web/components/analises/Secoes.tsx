import Link from 'next/link';

/**
 * Marcação das telas de análise do ARTEF1. O conteúdo dinâmico (textos com números, gráficos, tabelas e controles)
 * é preenchido por lib/analises/painel.ts a partir dos dados do banco; por isso vários elementos nascem vazios.
 */
export default function Secoes() {
  return (
    <>
      <section id="panorama" className="hero" data-nav>
          <div className="rotulo" style={{ color: 'var(--sig-ink)', marginBottom: '14px' }}>Análises · do ARTEF1, agora para a base completa</div>
          <h1 id="h1"></h1>
          <p className="lead" id="lead1"></p>
          <p className="lead" id="lead2"></p>

          <div className="ctrl">
            <div className="seg" role="group" aria-label="Medida da tarifa" id="heroMetric">
              <button type="button" data-v="media" aria-pressed="true">Média</button>
              <button type="button" data-v="mediana" aria-pressed="false">Mediana</button>
            </div>
            <button type="button" className="chip" id="heroSmooth" aria-pressed="false">Suavizar (média móvel de 12 meses)</button>
          </div>
          <div className="legend" id="heroLegend"></div>
          <div className="chart" id="heroChart" role="img" aria-label="Tarifa média mensal, em valores reais e nominais, com assentos vendidos por mês"></div>
          <p className="note" id="heroNote"></p>
          <Link className="ponte" href="/previsao">Ver a previsão para os próximos 12 meses → <b>ARTEF2</b></Link>
        </section>

        <section id="casos" data-nav>
          <div className="sec-head">
            <h2>Casos reais: quando o mundo aparece nos dados</h2>
            <p className="lead">Cinco momentos em que a tarifa, o volume de vendas ou a concorrência mudaram de forma clara. Escolha um caso: os números vêm dos dados; o contexto vem de fora deles.</p>
          </div>
          <div className="chips" id="caseTabs" role="group" aria-label="Casos reais"></div>
          <h3 id="caseTitle" style={{ marginTop: '26px', fontSize: '1.7rem' }}></h3>
          <div className="case-grid">
            <div>
              <div className="legend" id="caseLegend"></div>
              <div className="chart" id="caseChart" role="img" aria-label="Gráfico do caso selecionado"></div>
            </div>
            <div>
              <ul className="case-facts" id="caseFacts"></ul>
              <div className="case-ctx" id="caseCtx"></div>
              <Link className="ponte" href="/demanda">Simular um choque de demanda parecido → <b>ARTEF2</b></Link>
            </div>
          </div>
        </section>

        <section id="sazonalidade" data-nav>
          <div className="sec-head">
            <h2>Sazonalidade: quando a passagem sai mais barata</h2>
            <p className="lead" id="seasonLead"></p>
          </div>
          <div className="two">
            <div>
              <h3>Tarifa real por mês de venda</h3>
              <p className="h3sub">Cor: quanto o mês ficou acima (laranja) ou abaixo (azul) da média do próprio ano.</p>
              <div id="heat" className="heat" role="table" aria-label="Tarifa média real por mês e ano"></div>
              <div className="dkey"><span>mais barato que a média do ano</span><span className="bar"></span><span>mais caro</span></div>
            </div>
            <div>
              <h3 id="seasonH">Padrão típico</h3>
              <p className="h3sub">Diferença média de cada mês para a média do ano.</p>
              <div className="chips" id="seasonWin" role="group" aria-label="Período do padrão típico" style={{ margin: '6px 0 4px' }}></div>
              <div className="chart" id="seasonChart" role="img" aria-label="Índice sazonal médio por mês"></div>
            </div>
          </div>
          <p className="note">O mês é o da <b>compra</b> da passagem, não o da viagem. Por isso o pico de setembro a dezembro retrata quem compra cedo para as férias e o fim de ano.</p>
        </section>

        <section id="faixas" data-nav>
          <div className="sec-head">
            <h2 id="bandsH">Faixas de preço</h2>
            <p className="lead" id="bandsLead"></p>
          </div>
          <div className="two">
            <div>
              <h3>Como os assentos se distribuem por faixa</h3>
              <p className="h3sub">Participação nos assentos vendidos de cada ano. Valores em R$ de <span className="baseLbl"></span>.</p>
              <div className="legend" id="bandsLegend"></div>
              <div id="bands"></div>
            </div>
            <div>
              <h3>Formato da distribuição</h3>
              <p className="h3sub">Escolha os anos para comparar. A curva mostra a parcela dos assentos vendida em cada faixa de R$ 100.</p>
              <div className="chips" id="distChips" role="group" aria-label="Anos exibidos"></div>
              <div className="chart" id="distChart" role="img" aria-label="Distribuição dos assentos por faixa de preço, por ano"></div>
              <table className="st" id="distTable" aria-label="Estatísticas por ano"></table>
            </div>
          </div>
          <p className="note" id="distNote"></p>
        </section>

        <section id="companhias" data-nav>
          <div className="sec-head">
            <h2>Companhias: de quatro grandes para três</h2>
            <p className="lead" id="empLead"></p>
          </div>
          <div className="two">
            <div>
              <h3>Participação nos assentos vendidos</h3>
              <p className="h3sub">Cada mês soma 100%.</p>
              <div className="chart" id="shareChart" role="img" aria-label="Participação mensal de cada companhia nos assentos vendidos"></div>
            </div>
            <div>
              <h3 id="empLinesH">Tarifa média real por companhia</h3>
              <p className="h3sub" id="empLinesSub"></p>
              <div className="seg" id="empMetric" role="group" aria-label="Medida exibida" style={{ marginBottom: '8px' }}></div>
              <div className="legend" id="empLegend"></div>
              <div className="chart" id="empLines" role="img" aria-label="Séries mensais por companhia: tarifa média real, assentos vendidos ou diferença para a média nacional"></div>
            </div>
          </div>
          <div style={{ marginTop: '34px', maxWidth: '760px' }}>
            <h3>Comparativo do ano</h3>
            <div className="chips" id="empChips" role="group" aria-label="Ano do comparativo"></div>
            <div style={{ overflowX: 'auto' }}><table className="st" id="empTable" aria-label="Companhias no ano selecionado"></table></div>
            <p className="note">Diferenças de preço entre companhias refletem também as rotas que cada uma opera, e não só sua política tarifária. <span id="hhiNote"></span></p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <Link className="ponte" href="/previsao?empresa=LATAM">Prever a tarifa por companhia → <b>ARTEF2</b></Link>
              <Link className="ponte" href="/fusao">Simular uma fusão e o HHI por rota → <b>ARTEF2</b></Link>
            </div>
          </div>
        </section>

        <section id="rotas" data-nav>
          <div className="sec-head">
            <h2>Rotas: compare qualquer uma das <span id="nRotas">250</span> maiores ligações</h2>
            <p className="lead">Cada ligação reúne os dois sentidos e considera origem e destino final, com ou sem conexão. As 250 maiores respondem por <span id="cov"></span> dos assentos vendidos.</p>
          </div>
          <div className="two rt2">
            <div>
              <div className="picker"><label htmlFor="rsel">Ligação</label><select id="rsel"></select></div>
              <div className="picker"><label htmlFor="rsel2">Comparar com</label><select id="rsel2"></select></div>
              <div className="ticket" id="ticket"></div>
              <div className="ctrl" style={{ marginTop: '0' }}>
                <button type="button" className="chip" id="rSmooth" aria-pressed="false">Suavizar (média móvel de 12 meses)</button>
              </div>
              <div className="legend" id="rLegend"></div>
              <div className="chart" id="rChart" role="img" aria-label="Tarifa real mensal da ligação selecionada comparada à média nacional"></div>
              <h3 style={{ marginTop: '30px' }}>Quem cobra mais nesta ligação</h3>
              <p className="h3sub">Tarifa média real por companhia e por ano (R$ de <span className="baseLbl"></span>).</p>
              <div className="legend" id="rAirLg"></div>
              <div className="chart" id="rAir" role="img" aria-label="Tarifa média real por companhia e por ano na ligação selecionada"></div>
              <p className="note" id="rAirTxt"></p>
            </div>
            <div>
              <h3>Todas as ligações</h3>
              <p className="h3sub">Clique numa linha para ver a ligação ao lado. Ordene pelos títulos das colunas.</p>
              <div className="finder"><input id="rfind" type="search" placeholder="Buscar cidade ou código (ex.: Recife, GRU)" aria-label="Buscar ligação" /></div>
              <div className="tblwrap"><table className="rt" id="rtab"></table></div>
            </div>
          </div>

        </section>

        <section id="aeroportos" data-nav>
          <div className="sec-head">
            <h2>Aeroportos: onde a passagem é mais cara</h2>
            <p className="lead">O tamanho de cada bolha é o volume de assentos vendidos com origem no aeroporto; a cor compara a tarifa real com a média nacional. Clique em uma bolha ou em uma barra para abrir o aeroporto em foco.</p>
          </div>
          <div className="ctrl" style={{ margin: '0 0 16px' }}><div className="chips" id="aChips" role="group" aria-label="Ano dos aeroportos"></div></div>
          <div className="two">
            <div>
              <h3>Mapa esquemático</h3>
              <p className="h3sub">Posição aproximada dos aeroportos sobre uma silhueta simplificada do Brasil.</p>
              <div className="chart" id="map"></div>
              <div className="dkey"><span>mais barato que a média nacional</span><span className="bar"></span><span>mais caro</span></div>
            </div>
            <div>
              <h3>Maiores aeroportos de origem</h3>
              <p className="h3sub">Comprimento da barra: volume de assentos. Cor: tarifa real contra a média nacional.</p>
              <div id="aero"></div>
            </div>
          </div>

          <h3 style={{ marginTop: '64px', fontSize: '1.7rem' }}>Aeroporto em foco</h3>
          <div className="picker" style={{ marginTop: '12px' }}><label htmlFor="asel">Aeroporto</label><select id="asel"></select></div>
          <div className="ticket" id="aTicket"></div>
          <div className="two">
            <div>
              <div className="ctrl" style={{ marginTop: '0' }}><button type="button" className="chip" id="aSmooth" aria-pressed="false">Suavizar (média móvel de 12 meses)</button></div>
              <div className="legend" id="aLegend"></div>
              <div className="chart" id="aChart" role="img" aria-label="Tarifa real mensal do aeroporto selecionado comparada à média nacional"></div>
            </div>
            <div>
              <h3>Quem opera aqui</h3>
              <p className="h3sub">Participação de cada companhia nos assentos com origem neste aeroporto, por ano.</p>
              <div className="legend"><span className="lg"><i className="sw box" style={{ background: 'var(--tam)' }}></i>LATAM</span><span className="lg"><i className="sw box" style={{ background: 'var(--glo)' }}></i>Gol</span><span className="lg"><i className="sw box" style={{ background: 'var(--azu)' }}></i>Azul</span><span className="lg"><i className="sw box" style={{ background: 'var(--one)' }}></i>Avianca</span><span className="lg"><i className="sw box" style={{ background: 'var(--out)' }}></i>Outras</span></div>
              <div id="aMix"></div>
              <h3 id="aFaresH" style={{ marginTop: '26px' }}></h3>
              <div style={{ overflowX: 'auto' }}><table className="st" id="aFares"></table></div>
              <p className="note">A tarifa por companhia só aparece com pelo menos 200 assentos no ano. O ano exibido é o escolhido acima do mapa.</p>
            </div>
          </div>
        </section>

        <section id="metodo" data-nav>
          <div className="sec-head"><h2>Como ler estes dados</h2></div>
          <div className="meth">
            <div><h3>Fonte</h3><p>Microdados de <b>tarifas aéreas domésticas comercializadas</b>, da ANAC: <b id="mArq"></b> arquivos mensais (<span id="mPer"></span>), <b id="mLin"></b> linhas. Cada linha é uma combinação de mês, empresa, origem, destino e tarifa, com o número de assentos vendidos nesse valor.</p></div>
            <div><h3>O que a tarifa representa</h3><p>Valor "seco" do transporte, sem taxa de embarque, bagagem ou serviços. Vale para o público adulto em geral: a ANAC exclui milhagem, gratuidades e acordos corporativos. O mês de referência é o <b>mês da venda</b>, e a ligação é origem e destino finais (pode incluir conexão).</p></div>
            <div><h3>Médias e percentis</h3><p>A tarifa média de cada recorte é ponderada pelos assentos vendidos, igual ao cálculo da ANAC. Mediana e percentis também são ponderados. Em out/2025 o cálculo aqui dá <b>R$ 720,44</b>; a ANAC divulgou R$ 720,36 na audiência de 26/11/2025 na Câmara dos Deputados. A série real de janeiro a outubro também reproduz, com diferença de até 0,3%, a divulgada pelo Ministério de Portos e Aeroportos (R$ 721,57 em 2022; R$ 642,19 em 2025).</p></div>
            <div><h3>Valores reais</h3><p>Para comparar anos diferentes, as tarifas são corrigidas mês a mês pelo <b>IPCA</b> (IBGE, série 433 do Banco Central) e expressas em R$ de <span className="baseLbl"></span>. Os índices mensais reproduzem os acumulados anuais oficiais (<span id="mIpca"></span>).</p></div>
            <div><h3>Tratamento dos arquivos</h3><p>Os arquivos vieram com formatos de cabeçalho, codificações de texto e formas de escrever decimais diferentes (vírgula e ponto). Tudo foi unificado e conferido: linhas e assentos de cada mês coincidem com os arquivos originais. A limpeza é a mesma do ARTEF1; nos meses de 2020 a 2025 os totais são idênticos aos do primeiro painel.</p></div>
            <div><h3>Limites da análise</h3><p>Os dados não trazem número de voos, passageiros, ocupação nem distância: “assentos vendidos” é a medida de volume. A Avianca (ONE), que operou até 2019, aparece separada; as companhias pequenas aparecem agrupadas em "Outras". O total de assentos da base cai de 2015 para 2019; ainda vamos conferir, com os Dados Estatísticos da ANAC, se isso reflete o mercado ou uma mudança de cobertura da base. Rotas e aeroportos com nome usam a tabela de códigos ICAO; onde o código não foi identificado com segurança, ele aparece sozinho.</p></div>
            <div><h3>Casos reais e mapa</h3><p>Nos casos reais, os números vêm dos dados e o contexto vem de fora (ANAC, imprensa); a causa nunca é inferida dos dados. “Mesmas rotas e companhias” é uma cesta fixa: só entram combinações presentes nos dois meses, ponderadas pelo mês inicial. O mapa é esquemático: posições aproximadas e silhueta simplificada.</p></div>
          </div>
        </section>
    </>
  );
}
