import type { Config } from 'tailwindcss';

/**
 * Authentik HK Tailwind preset — L3 「Tech-Verified」design system.
 *
 * Source of truth for tokens: `design-samples/final-L3/theme.css` (v4 定稿).
 * All extension groups are additive — existing utilities (brand.*, ink.*,
 * shadow-card, shadow-card-lg) stay stable so the pre-L3 pages keep working
 * until they are individually rewritten in Phases 3–6.
 */
const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // L3 驗證綠 brand 色階（600 = 核心行動色，400 = 提亮 accent）
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#00c48c',
          500: '#00a37d',
          600: '#008766',
          700: '#00745a',
          800: '#045c48',
          900: '#0a4a3b',
        },
        // 深板岩藍 secondary — 標題 / 結構強調 + navy button
        ink: {
          DEFAULT: '#0a2540',
          700: '#123056',
          900: '#0a2540',
        },
        // 中性文字色階 —— L3 spec 三層（body / muted / hint）
        // Kept separate from `ink` (brand-navy) so future maintainers don't
        // conflate accent colour with neutral grey.
        'neutral-text': {
          DEFAULT: '#16233a', // body copy
          muted: '#505b6b',   // secondary label
          hint: '#8b95a3',    // tertiary / caption
        },
        // 面 / 線 tokens
        surface: {
          DEFAULT: '#ffffff',
          2: '#f7f9fb',
        },
        line: {
          DEFAULT: '#e8ebef',
          2: '#d7dce2',
        },
        // 驗證信任訊號 (verify pill、seller-declared bg)
        verify: {
          DEFAULT: '#008766',
          soft: '#e3f4ee',
          border: '#b6e2d3',
        },
        // 鑑定師 Portal 專用 indigo brand scale (source: design-samples/authenticator-L3/theme.css).
        // Kept SEPARATE from `brand` so consumer=green + authenticator=indigo signal
        // portal identity to the user (designer's explicit differentiation intent).
        // Nav-badge default uses authBrand-400 (light indigo) for brand consistency;
        // IM unread badge stays red for urgency (founder ruling 2026-07-05).
        authBrand: {
          50: '#f3f4ff',
          100: '#e0e3fe',
          200: '#c7cdfd',
          300: '#a5b4fc', // --accent (light indigo, nav badges, hover accent)
          400: '#8b95fa',
          500: '#6366f1', // --action (primary button, active nav)
          600: '#4f46e5', // --action-2 (button hover)
          700: '#4338ca',
          800: '#3730a3',
          900: '#26305e', // --primary (sidebar top of gradient, headline)
          950: '#191d42', // sidebar bottom of gradient
          soft: '#eef1fe', // --brand-soft (row hover / active bg on white)
          border: '#d7ddfb', // --brand-border (soft card border for authBrand cards)
        },
        // Verdict semantic colors — kept intentionally separate from brand tokens
        // per authenticator-L3 designer note: 「跨系統直覺，不被 brand 蓋過」.
        // Used by both consumer verdicts (buyer sees result) and authenticator
        // (authenticator submits verdict). SSOT for pass/fail/inconclusive.
        verdict: {
          pass: '#0f9d58',
          'pass-soft': '#e6f5ec',
          'pass-border': '#bfe4cd',
          fail: '#d93025',
          'fail-soft': '#fbeae8',
          'fail-border': '#f2cbc6',
          incon: '#c2870b',
          'incon-soft': '#fbf1dd',
          'incon-border': '#f0dcae',
        },
        // 危險 / 警告 pill + note-warn
        danger: {
          DEFAULT: '#b23b2b',
          soft: '#f7e9e6',
        },
        gold: '#b98a2e',
        trust: {
          green: '#008766',
          gold: '#b98a2e',
          red: '#b23b2b',
        },
      },
      fontFamily: {
        sans: ['Inter', '"PingFang HK"', '"Noto Sans HK"', '"Microsoft JhengHei"', 'system-ui', 'sans-serif'],
        // Existing `display` = Plus Jakarta Sans (used across many pre-L3 pages).
        // DO NOT change — new L3 headings should adopt `font-display-serif` explicitly.
        display: ['"Plus Jakarta Sans"', 'Inter', '"PingFang HK"', '"Noto Sans HK"', '"Microsoft JhengHei"', 'sans-serif'],
        // L3 serif display headline (loaded via next/font in consumer/layout.tsx).
        'display-serif': ['var(--font-noto-serif-hk)', '"Noto Serif HK"', '"Songti SC"', 'Georgia', 'serif'],
      },
      boxShadow: {
        // L3 三階梯（sh-1 subtle → sh-3 hero card）
        sh1: '0 6px 20px -14px rgba(10,37,64,.28)',
        sh2: '0 12px 34px -18px rgba(10,37,64,.34)',
        sh3: '0 20px 50px -22px rgba(10,37,64,.42)',
        // Legacy aliases — kept so existing usages don't break during migration.
        card: '0 6px 20px -14px rgba(10,37,64,.28)',
        'card-lg': '0 20px 50px -22px rgba(10,37,64,.42)',
        // Authenticator portal shadow scale — indigo-tinted per authenticator-L3/theme.css.
        'auth-sh1': '0 8px 24px -12px rgba(38,48,94,.30)',
        'auth-sh2': '0 14px 36px -16px rgba(38,48,94,.34)',
        'auth-sh3': '0 22px 52px -20px rgba(38,48,94,.42)',
        // Authenticator primary-button glow ring.
        'auth-btn': '0 8px 20px -10px rgba(99,102,241,.55)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      maxWidth: {
        // L3 container = 1140px (theme.css --maxw)
        'container-l3': '1140px',
      },
    },
  },
  plugins: [require('tailwind-scrollbar-hide')],
};

export default preset;
