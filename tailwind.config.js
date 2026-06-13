/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        udeg: {
          naranja: '#E87722',
          'naranja-dark': '#C9621A',
          'naranja-light': '#FCEEE2',
          azul: '#003DA5',
          'azul-dark': '#002D7A',
          'azul-light': '#E5EBF6',
        },
        fondo: '#F7F7F7',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
