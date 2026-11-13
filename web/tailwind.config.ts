import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinta: '#14213d', ceu: '#1f6feb', areia: '#f5f1e8', linha: '#e4e0d6',
        latam: '#c8102e', gol: '#ff7a00', azul: '#1a4f9c', outras: '#6b7280', avianca: '#b5121b',
      },
      fontFamily: { sans: ['var(--fonte)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
