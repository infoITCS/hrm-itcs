/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: "#662d91", // Example purple from the screenshot
                secondary: "#f1f5f9",
                accent: "#f97316", // Example orange
            }
        },
    },
    plugins: [],
}
