import type { Config } from 'tailwindcss';
// As cores apontam para as variáveis do tema (claro/escuro) definidas em app/globals.css.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinta: 'var(--ink)', fundo: 'var(--bg)', surface: 'var(--surface)', muted: 'var(--muted)', soft: 'var(--soft)', linha: 'var(--line)',
        ceu: 'var(--sig-ink)', sig: 'var(--sig)', warn: 'var(--warn)', cool: 'var(--cool)', sun: 'var(--sun)', nom: 'var(--nom)',
        latam: 'var(--tam)', gol: 'var(--glo)', azul: 'var(--azu)', avianca: 'var(--one)', outras: 'var(--out)',
      },
      fontFamily: { sans: ['var(--f-body)'], disp: ['var(--f-disp)'] },
    },
  },
  plugins: [],
};
export default config;
