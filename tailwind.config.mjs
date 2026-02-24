/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        paper: '#f7f7f5',
        ink: '#1f1f1d',
        grid: '#d8d7d2',
        accent: '#0d4b7c',
        muted: '#6f6d67'
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular']
      },
      letterSpacing: {
        report: '0.08em'
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
};
