// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

/**
 * Vuetify theme — RESKIN Shopify Polaris (2026-08-03).
 * `polaris` (default) = token Polaris v12/v13 verify từ polaris-react.shopify.com,
 * mirror polaris-tokens.css. Primary là near-black #303030 (Polaris hiện tại đã
 * bỏ xanh lá #008060 của v9–v11); xanh lá chỉ còn vai trò success.
 *
 * `hsLight`/`smax-light`/`legacy-dark` còn khai báo ở đây nhưng THỰC TẾ ĐÃ KHÔNG
 * CÒN VỚI TỚI ĐƯỢC: DefaultLayout ép `polaris` trong onMounted, MobileLayout chỉ
 * cho `polaris`/`dark`. Giữ lại để cụm cleanup xoá kèm hs-crm-theme.css/tokens.css
 * trong 1 lần, không phải để đối chiếu — muốn xem theme cũ phải sửa code.
 */
export const vuetify = createVuetify({
  components,
  directives,
  theme: {
    // polaris làm mặc định. Bỏ đọc localStorage cũ (tránh kẹt theme cũ).
    defaultTheme: 'polaris',
    themes: {
      'polaris': {
        dark: false,
        colors: {
          primary: '#303030',          // --p-color-bg-fill-brand
          'primary-darken-1': '#1a1a1a',
          secondary: '#616161',        // --p-color-text-secondary
          accent: '#005bd3',           // --p-color-bg-fill-emphasis
          background: '#f1f1f1',       // --p-color-bg
          surface: '#ffffff',
          'surface-variant': '#f7f7f7',
          success: '#047b5d',
          warning: '#ffb800',
          error: '#c70a24',
          info: '#005bd3',
          'nav-a': '#1a1a1a',
          'nav-b': '#303030',
          'nav-accent': '#005bd3',
          'on-surface': '#303030',
          'on-background': '#303030',
          'on-primary': '#ffffff',
        },
        variables: {
          'border-color': '#e3e3e3',
          'border-opacity': 1,
          'high-emphasis-opacity': 1,
          'medium-emphasis-opacity': 1,   // Polaris dùng màu text riêng thay vì hạ opacity
          'theme-radius': '8px',
        },
      },
      'hsLight': {
        dark: false,
        colors: {
          primary: '#1786be',          // --brand
          'primary-darken-1': '#0f6fa0',
          secondary: '#5bb8e5',        // --brand-bright
          accent: '#0b5880',           // --brand-700
          background: '#f7f9fc',       // --surface-2
          surface: '#ffffff',
          'surface-variant': '#f1f4f9',
          success: '#12b76a',
          warning: '#f5a524',
          error: '#f04438',
          info: '#1786be',
          'nav-a': '#0e445a',
          'nav-b': '#06222f',
          'nav-accent': '#5bb8e5',
          'on-surface': '#141a24',
          'on-background': '#141a24',
          'on-primary': '#ffffff',
        },
        variables: {
          'border-color': '#e7eaf0',
          'border-opacity': 1,
          'high-emphasis-opacity': 1,
          'medium-emphasis-opacity': 0.78,
          'theme-radius': '8px',
        },
      },
      'smax-light': {
        dark: false,
        colors: {
          background: '#f5f6fa',
          surface: '#ffffff',
          'surface-variant': '#fafbfc',
          primary: '#1786be',
          secondary: '#1f2330',
          accent: '#1786be',
          error: '#ff3d00',
          warning: '#ff9100',
          success: '#00c853',
          info: '#2196f3',
          'on-background': '#212121',
          'on-surface': '#212121',
          'on-primary': '#ffffff',
          'on-secondary': '#ffffff',
        },
      },
      'legacy-dark': {
        dark: true,
        colors: {
          background: '#0A192F',
          surface: '#112240',
          'surface-variant': '#1D2D50',
          primary: '#00F2FF',
          secondary: '#E6F1FF',
          accent: '#00F2FF',
          error: '#FF5252',
          warning: '#FFB74D',
          success: '#4CAF50',
          info: '#00F2FF',
          'on-background': '#E6F1FF',
          'on-surface': '#E6F1FF',
          'on-primary': '#0A192F',
        },
      },
    },
  },
  defaults: {
    // Polaris defaults: nút bo 8px không uppercase, card phẳng viền 1px, chip pill.
    // Kích thước/màu chi tiết nằm ở polaris-crm-theme.css (load cuối cùng).
    VBtn: { variant: 'flat', rounded: 'lg', style: 'text-transform:none;letter-spacing:0;' },
    VTextField: { variant: 'outlined', density: 'compact' },
    VSelect: { variant: 'outlined', density: 'compact' },
    VAutocomplete: { variant: 'outlined', density: 'compact' },
    VTextarea: { variant: 'outlined', density: 'compact' },
    VCard: { rounded: 'lg', variant: 'flat' },
    VChip: { rounded: 'pill', size: 'small' },
    VDialog: { maxWidth: 600 },
  },
});

/* ── HS helpers (mirror hs-vuetify-theme.ts) — dùng trong template ── */
export function scoreLevel(score: number): 'zero' | 'low' | 'mid' | 'high' {
  if (score === 0) return 'zero';
  if (score < 40) return 'low';
  if (score < 70) return 'mid';
  return 'high';
}
export const SCORE_COLORS = {
  zero: { bg: '#eef1f6', fg: '#94a3b8' },
  low: { bg: '#fdf3e2', fg: '#b45309' },
  mid: { bg: '#e9f3ff', fg: '#1565c0' },
  high: { bg: '#e7f7ef', fg: '#157f3c' },
} as const;
export const REL_KIND = {
  friend: { label: 'Đã kết bạn', dot: '#12b76a', bg: '#e7f7ef', fg: '#157f3c' },
  pending_friend: { label: 'Đã gửi mời', dot: '#f5a524', bg: '#fdf3e2', fg: '#b45309' },
  chatting_stranger: { label: 'Đang nhắn lạ', dot: '#1786be', bg: '#e4f1f8', fg: '#1565c0' },
  ghost: { label: 'Đã ngắt', dot: '#9aa3b2', bg: '#f1f4f9', fg: '#475066' },
} as const;
