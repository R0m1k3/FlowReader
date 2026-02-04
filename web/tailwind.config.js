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
                    DEFAULT: '#1a1a1a',
                    light: '#262626',
                    dark: '#121212',
                },
                gold: {
                    DEFAULT: '#d4af37',
                    glow: 'rgba(212, 175, 55, 0.4)',
                },
                paper: {
                    white: '#e5e5e5',
                    muted: '#a3a3a3',
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
