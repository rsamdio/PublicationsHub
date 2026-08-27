/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#d81a6a',
        'primary-dark': '#b81458',
        'background-light': '#f6f3ed',
        'background-dark': '#101922',
        'surface-dark': '#192430',
        'surface-dark-hover': '#223040',
        'card-dark': '#182430',
        'text-secondary': '#94a3b8',
        'reader-bg': '#0b1219'
      },
      fontFamily: {
        display: ['var(--font-inter)', 'sans-serif']
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px'
      },
      boxShadow: {
        page: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
        'primary-glow': '0 0 40px -10px rgba(216, 26, 106, 0.35)'
      }
    }
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')]
};
