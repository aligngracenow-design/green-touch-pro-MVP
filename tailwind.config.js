/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#080c18',
        surface: '#0e1426',
        'surface-2': '#141c33',
        border: '#1a2340',
        gold: '#d4af37',
        'gold-light': '#f0d060',
        muted: '#667799',
        text: '#e0e6f0',
        green: '#22c55e',
        red: '#ef4444',
        amber: '#f59e0b',
        blue: '#3b82f6',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,.4)',
      },
    },
  },
  plugins: [],
};
