/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#585858",
        mist: "#c5c5c4",
        tide: "#046eaf",
        sun: "#ef7807",
        coral: "#ef7807",
        mint: "#0e4e78"
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body: ["DM Sans", "sans-serif"]
      },
      boxShadow: {
        card: "0 20px 45px rgba(4, 110, 175, 0.18)",
        soft: "0 10px 30px rgba(14, 78, 120, 0.15)"
      }
    }
  },
  plugins: []
};
