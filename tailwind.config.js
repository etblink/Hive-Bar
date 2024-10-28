/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./views/**/*.ejs", "./public/**/*.js"],
  theme: {
    extend: {
      colors: {
        'bar-gold': '#f4a460',
      },
    },
  },
  plugins: [],
}