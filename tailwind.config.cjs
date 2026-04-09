/** Merged theme extensions from HTML entrypoints (previously inline with the Tailwind CDN). */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './admin.html',
    './studio.html',
    './publication.html',
    './terms.html',
    './privacy.html',
    './js/**/*.js'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#137fec',
        'primary-dark': '#106cc9',
        'background-light': '#f6f7f8',
        'background-dark': '#101922',
        'surface-dark': '#192430',
        'surface-dark-hover': '#223040',
        'card-dark': '#182430',
        'text-secondary': '#94a3b8',
        'reader-bg': '#0b1219'
      },
      fontFamily: {
        display: ['Inter', 'sans-serif']
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
        'primary-glow': '0 0 40px -10px rgba(19, 127, 236, 0.35)'
      }
    }
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')]
};
