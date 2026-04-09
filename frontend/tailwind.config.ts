import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy:  { 50:'#eef2ff', 100:'#e0e7ff', 200:'#c7d2fe', 300:'#a5b4fc', 400:'#818cf8', 500:'#6366f1', 600:'#4f46e5', 700:'#4338ca', 800:'#3730a3', 900:'#312e81', 950:'#1e1b4b' },
        amber: { 50:'#fffbeb', 100:'#fef3c7', 200:'#fde68a', 300:'#fcd34d', 400:'#fbbf24', 500:'#f59e0b', 600:'#d97706', 700:'#b45309', 800:'#92400e' },
      },
      fontFamily: {
        sans:    ['var(--font-inter)','system-ui','sans-serif'],
        display: ['var(--font-sora)','system-ui','sans-serif'],
      },
      animation: {
        'fade-in':  'fadeIn .35s ease-out',
        'slide-up': 'slideUp .4s ease-out',
        'spin-slow':'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity:'0' }, to: { opacity:'1' } },
        slideUp: { from: { opacity:'0', transform:'translateY(14px)' }, to: { opacity:'1', transform:'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
export default config
