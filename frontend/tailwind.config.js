/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef0ff',
          100: '#e0e2ff',
          200: '#c7caff',
          300: '#a5a8fb',
          400: '#8486f5',
          500: '#6467e8',
          600: '#5457ce',
          700: '#4648ab',
          800: '#3a3c8a',
          900: '#33356e',
        },
        accent: {
          50: '#effcf8',
          100: '#d7f7ee',
          200: '#b0eee0',
          300: '#7ce0cb',
          400: '#3ecfab',
          500: '#23b894',
          600: '#179a7d',
          700: '#147b66',
          800: '#126253',
          900: '#105145',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 40 / 0.05), 0 1px 3px rgb(16 24 40 / 0.06)',
        pop: '0 12px 32px -8px rgb(51 53 110 / 0.18), 0 4px 12px -4px rgb(16 24 40 / 0.08)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease both',
        'fade-in': 'fade-in 0.25s ease both',
      },
    },
  },
  plugins: [],
};
