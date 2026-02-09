/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // ASOS-inspired Palette
                'asos-white': '#FFFFFF',
                'asos-gray-light': '#F8F8F8', // For subtle backgrounds
                'asos-charcoal': '#2D2D2D',   // Primary text
                'asos-black': '#000000',      // Headings/Buttons
                'asos-red': '#D01345',        // Sale/Alerts
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                serif: ['Playfair Display', 'serif'], // Optional for editorial feel
            }
        },
    },
    plugins: [],
}
