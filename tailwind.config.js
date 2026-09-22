/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#0e1111',       // Deep rich obsidian charcoal
          paper: '#f9f6f0',      // Warm rice paper ivory
          card: '#161a1d',       // Elevated dark card background
          accent: '#dc2626',     // Vermilion Red
          gold: '#d97706',       // Handcrafted Asian Gold
          bamboo: '#15803d',     // Fresh Bamboo Green
          muted: '#8892b0',      // Soft slate blue gray text
          border: '#2a3038',     // Subtle dark border
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        heading: ['var(--font-heading)', 'serif'],
      },
      backgroundImage: {
        'rice-pattern': "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0C13.4315 0 0 13.4315 0 30C0 46.5685 13.4315 60 30 60C46.5685 60 60 46.5685 60 30C60 13.4315 46.5685 0 30 0ZM30 58C14.536 58 2 45.464 2 30C2 14.536 14.536 2 30 2C45.464 2 58 14.536 58 30C58 45.464 45.464 58 30 58Z' fill='%23ffffff' fill-opacity='0.02'/%3E%3C/svg%3E\")"
      }
    },
  },
  plugins: [],
};
