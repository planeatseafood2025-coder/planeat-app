import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-ibm-plex-sans-thai)', 'var(--font-prompt)', 'Sarabun', 'sans-serif'],
      },
      colors: {
        // category colors
        labor: {
          DEFAULT: '#f59e0b',
          bg: '#fef3c7',
          dark: '#92400e',
        },
        raw: {
          DEFAULT: '#10b981',
          bg: '#d1fae5',
          dark: '#166534',
        },
        chem: {
          DEFAULT: '#8b5cf6',
          bg: '#ede9fe',
          dark: '#5b21b6',
        },
        repair: {
          DEFAULT: '#f43f5e',
          bg: '#ffe4e6',
          dark: '#9f1239',
        },
      },
      keyframes: {
        fadePageIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 4px 20px rgba(37,99,235,0.4)' },
          '50%': { boxShadow: '0 4px 35px rgba(37,99,235,0.65)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        fadePageIn: 'fadePageIn 0.2s ease',
        slideIn: 'slideIn 0.3s ease-out',
        pulseGlow: 'pulseGlow 2.5s ease-in-out infinite',
        spin: 'spin 1s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
