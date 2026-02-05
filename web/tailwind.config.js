/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                carbon: {
                    DEFAULT: '#F9F7F1', // Warm Cream (Newspaper)
                    light: '#FFFFFF',   // Pure White (Cards)
                    dark: '#E7E5E4',    // Stone-200 (Borders/Inputs)
                },
                nature: {
                    DEFAULT: '#166534', // Green-800 (Forest Green - Primary Action)
                    light: '#15803d',   // Green-700 (Hover State)
                    glow: 'rgba(22, 101, 52, 0.2)',
                },
                earth: {
                    DEFAULT: '#A0522D', // Sienna (Secondary/Accent)
                    muted: '#D6CBC7',   // Warm Gray
                },
                paper: {
                    white: '#1C1917',   // Stone-900 (Primary Text - Soft Black)
                    muted: '#57534E',   // Stone-600 (Secondary Text)
                }
            },
            fontFamily: {
                serif: ['"Playfair Display"', 'serif'],
                sans: ['Inter', 'sans-serif'],
                reading: ['Lora', 'serif'],
            },
            lineHeight: {
                'magazine': '1.7',
            },
            maxWidth: {
                'reading': '700px',
            }
        },
    },
    plugins: [
        require('tailwindcss-animate'),
    ],
}
