
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        roam: {
          orange: "#ff5a1f",
          dark: "#1f2937"
        }
      },
      borderRadius: {
        '2xl': '1rem'
      }
    },
  },
  plugins: [],
}
