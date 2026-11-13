// Lógica dos simuladores (roda no navegador). Todos os parâmetros-padrão vêm do banco (tabela parametros).

export const fmtR = (v: number, d = 0) =>
  'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtN = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtP = (v: number, d = 1) => (v >= 0 ? '+' : '') + (100 * v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
export const fmtMes = (p: string) => {
  const [a, m] = p.split('-');
  return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1] + '/' + a.slice(2);
};
export const addMes = (p: string, k: number) => {
  const [a, m] = p.split('-').map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
export const difMes = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (ya * 12 + ma) - (yb * 12 + mb);
};

/* ---------------- choque de custos ---------------- */
/** Elasticidade de repasse por distância: interpola em ln(distância) os pontos estimados (400, 800, 1500, 2500 km). */
export function elasticidadeRepasse(rep: Record<string, number>, km: number | null): number {
  if (!km || !isFinite(km)) return rep.elasticidade_media;
  const pts = [400, 800, 1500, 2500].map((d) => [Math.log(d), rep[`elasticidade_${d}km`]] as const);
  const x = Math.log(Math.min(Math.max(km, 400), 2500));
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return rep.elasticidade_media;
}

export type ParamCustos = {
  jet: number;            // variação % do querosene em dólar (ex.: 0.2 = +20%)
  cambio: number;         // variação % do dólar em reais
  inicio: number;         // mês do horizonte em que o choque começa (1 = primeiro mês previsto)
  repasse: number;        // elasticidade da tarifa ao QAV
  ponte: number;          // elasticidade do QAV brasileiro ao preço internacional em reais
  demanda: number;        // elasticidade-preço da demanda (negativa)
};

/** Fatores multiplicativos de tarifa e assentos por horizonte h (o QAV afeta a tarifa com 1 mês de defasagem). */
export function fatoresCustos(p: ParamCustos, h: number) {
  const dlnQav = p.ponte * (Math.log(1 + p.jet) + Math.log(1 + p.cambio));
  const ativo = h >= p.inicio + 1;
  const dlnTarifa = ativo ? p.repasse * dlnQav : 0;
  return { dlnQav, tarifa: Math.exp(dlnTarifa), assentos: Math.exp(p.demanda * dlnTarifa) };
}

/* ---------------- fusão ---------------- */
export type ParamFusao = { a: string; b: string; elasticidade: number; conduta: number; eficiencia: number };

export function classeCade(hhiPos: number, delta: number) {
  // Guia para Análise de Atos de Concentração Horizontal (CADE, 2016), escala 0-10.000
  const H = hhiPos * 10000, D = delta * 10000;
  const nivel = H < 1500 ? 'Não concentrado' : H <= 2500 ? 'Moderadamente concentrado' : 'Altamente concentrado';
  let alerta = 'Sem preocupação';
  if (D >= 100 && H >= 1500) alerta = 'Análise detalhada';
  if (H > 2500 && D > 200) alerta = 'Presunção de poder de mercado';
  return { nivel, alerta };
}

/** Cournot com conduta θ: índice de Lerner = θ·HHI/|ε|; P = CMg/(1 − L). A eficiência reduz o CMg da firma fundida
 *  (aproximação: aplicada ao custo médio do mercado na proporção da participação da firma fundida). */
export function simularFusaoRota(shares: Record<string, number>, p: ParamFusao) {
  const s = { ...shares };
  const hhiPre = Object.values(s).reduce((a, x) => a + x * x, 0);
  const sa = s[p.a] ?? 0, sb = s[p.b] ?? 0;
  const afetada = sa > 0 && sb > 0;
  const sm = sa + sb;
  const hhiPos = hhiPre - sa * sa - sb * sb + sm * sm;
  const eps = Math.abs(p.elasticidade);
  const L0 = Math.min((p.conduta * hhiPre) / eps, 0.95);
  const L1 = Math.min((p.conduta * hhiPos) / eps, 0.95);
  const custo = 1 - p.eficiencia * sm;
  const razaoPreco = afetada ? (custo * (1 - L0)) / (1 - L1) : 1;
  return { hhiPre, hhiPos, delta: hhiPos - hhiPre, afetada, shareFundida: sm, razaoPreco,
    saturado: (p.conduta * hhiPos) / eps >= 0.95, ...classeCade(hhiPos, hhiPos - hhiPre) };
}

/* ---------------- choques de demanda ---------------- */
export type Trajetoria = { k: number; assentos: number; tarifa: number }[];

/** Choque personalizado: queda máxima no mês do pior momento, recuperação geométrica com meia-vida. */
export function trajetoriaPersonalizada(queda: number, mesesAtePior: number, meiaVida: number, respostaTarifa: number,
  meses = 36): Trajetoria {
  const out: Trajetoria = [];
  for (let k = 0; k < meses; k++) {
    let perda: number;
    if (k <= mesesAtePior) perda = queda * ((k + 1) / (mesesAtePior + 1));
    else perda = queda * Math.pow(0.5, (k - mesesAtePior) / Math.max(meiaVida, 0.1));
    const fa = Math.max(1 - perda, 0.01);
    out.push({ k, assentos: fa, tarifa: Math.exp(respostaTarifa * Math.log(fa)) });
  }
  return out;
}

/** Resposta da tarifa à queda de demanda observada num evento: inclinação de ln(tarifa) em ln(assentos). */
export function respostaTarifaEvento(t: Trajetoria) {
  const x = t.map((v) => Math.log(v.assentos)), y = t.map((v) => Math.log(v.tarifa));
  const mx = x.reduce((a, b) => a + b, 0) / x.length, my = y.reduce((a, b) => a + b, 0) / y.length;
  let num = 0, den = 0;
  x.forEach((xi, i) => { num += (xi - mx) * (y[i] - my); den += (xi - mx) ** 2; });
  return den > 0 ? num / den : 0;
}

export function intensificar(t: Trajetoria, intensidade: number, duracao: number): Trajetoria {
  // intensidade escala a perda (1 = igual ao evento); duracao estica o tempo (1 = igual)
  const n = Math.round(t.length * duracao);
  const out: Trajetoria = [];
  for (let k = 0; k < n; k++) {
    const pos = Math.min(k / duracao, t.length - 1);
    const i0 = Math.floor(pos), i1 = Math.min(i0 + 1, t.length - 1), w = pos - i0;
    const la = (1 - w) * Math.log(t[i0].assentos) + w * Math.log(t[i1].assentos);
    const lt = (1 - w) * Math.log(t[i0].tarifa) + w * Math.log(t[i1].tarifa);
    out.push({ k, assentos: Math.exp(intensidade * la), tarifa: Math.exp(intensidade * lt) });
  }
  return out;
}
