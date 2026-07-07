/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── GreenTouch.Pro brand system (extracted from logo) ──
        bg: '#0B120E',            // near-black green-tinted canvas
        surface: '#111A13',       // card surface
        'surface-2': '#18241B',   // raised surface
        border: '#1F2E24',        // hairline borders
        // Primary brand green (the "G") — repurposes the old `gold` token
        // so every existing page rebrands to green automatically.
        gold: '#6DB33F',
        'gold-light': '#8FD65A',
        brand: '#6DB33F',
        'brand-light': '#8FD65A',
        'brand-deep': '#2E5C1E',
        'brand-glow': 'rgba(109,179,63,0.18)',
        muted: '#7C8B80',         // secondary text
        text: '#EAF1E9',          // primary text (near-white)
        green: '#22c55e',
        red: '#ef4444',
        amber: '#f59e0b',
        blue: '#3b82f6',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,.45)',
        glow: '0 0 0 1px rgba(109,179,63,.25), 0 8px 32px rgba(109,179,63,.12)',
        'glow-lg': '0 8px 40px rgba(109,179,63,.20)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #8FD65A 0%, #6DB33F 45%, #2E5C1E 100%)',
        'brand-radial': 'radial-gradient(ellipse at 50% -10%, rgba(109,179,63,.14), transparent 55%)',
      },
      animation: {
        'fade-in': 'fade-in .4s cubic-bezier(0.16,1,0.3,1) both',
        'rise': 'rise .5s cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
};
