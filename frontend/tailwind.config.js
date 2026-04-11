/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
      },

      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        violet: {
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
        surface: {
          DEFAULT: '#0f0f17',
          50:  '#1a1a2e',
          100: '#16162a',
          200: '#111120',
          300: '#0d0d1a',
          400: '#0a0a0f',
        },
      },

      boxShadow: {
        'soft':        '0 4px 24px rgba(2, 6, 23, 0.12)',
        'glow':        '0 0 0 1px rgba(99,102,241,0.3), 0 8px 32px rgba(99,102,241,0.25)',
        'glow-lg':     '0 0 0 1px rgba(99,102,241,0.4), 0 16px 48px rgba(99,102,241,0.35)',
        'card':        '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.24)',
        'inner-glow':  'inset 0 1px 0 rgba(255,255,255,0.06)',
      },

      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },

      backgroundImage: {
        'grid-dots':    'radial-gradient(circle, rgba(99,102,241,0.18) 1px, transparent 1px)',
        'glow-radial':  'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.3) 0%, transparent 70%)',
        'mesh-brand':   'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%)',
        'auth-panel':   'linear-gradient(160deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)',
        'app-bg':       'linear-gradient(135deg, #0a0a0f 0%, #0f0d1f 50%, #0a0a0f 100%)',
        'hero-bg':      'linear-gradient(160deg, #0a0a0f 0%, #0f0d1f 60%, #0a0a0f 100%)',
        'card-border':  'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.1))',
      },

      backgroundSize: {
        'grid': '24px 24px',
      },

      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        'ping-slow': {
          '0%':   { transform: 'scale(1)',   opacity: '0.6' },
          '70%':  { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'ping-slower': {
          '0%':   { transform: 'scale(1)',   opacity: '0.4' },
          '70%':  { transform: 'scale(1.9)', opacity: '0' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        'bar-bounce': {
          '0%, 100%': { transform: 'scaleY(0.25)' },
          '50%':      { transform: 'scaleY(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        'slide-down': {
          '0%':   { transform: 'translateY(0)',    opacity: '1' },
          '100%': { transform: 'translateY(16px)', opacity: '0' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
      },

      animation: {
        shimmer:          'shimmer 2s linear infinite',
        'ping-slow':      'ping-slow 2s cubic-bezier(0,0,0.2,1) infinite',
        'ping-slower':    'ping-slower 2s cubic-bezier(0,0,0.2,1) infinite 0.4s',
        float:            'float 4s ease-in-out infinite',
        'slide-up':       'slide-up 0.2s ease-out',
        'slide-down':     'slide-down 0.2s ease-in',
        'fade-in':        'fade-in 0.3s ease-out',
        blink:            'blink 1s step-end infinite',
        'gradient-shift': 'gradient-shift 4s ease infinite',
        'bar-1': 'bar-bounce 1.1s ease-in-out infinite 0.0s',
        'bar-2': 'bar-bounce 1.1s ease-in-out infinite 0.1s',
        'bar-3': 'bar-bounce 1.1s ease-in-out infinite 0.2s',
        'bar-4': 'bar-bounce 1.1s ease-in-out infinite 0.3s',
        'bar-5': 'bar-bounce 1.1s ease-in-out infinite 0.15s',
        'bar-6': 'bar-bounce 1.1s ease-in-out infinite 0.25s',
        'bar-7': 'bar-bounce 1.1s ease-in-out infinite 0.05s',
        'bar-8': 'bar-bounce 1.1s ease-in-out infinite 0.35s',
      },
    },
  },
  plugins: [],
}
