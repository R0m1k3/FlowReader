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
                    DEFAULT: '#F8F9FA', // Alabaster
                    light: '#FFFFFF',   // White for cards
                    dark: '#E9ECEF',    // Light gray for borders/inputs
                },
                gold: {
                    DEFAULT: '#d4af37',
                    glow: 'rgba(212, 175, 55, 0.4)',
                },
                paper: {
                    white: '#1A1A1A',   // Dark text
                    muted: '#6B7280',   // Gray text
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
    plugins: [],
}
