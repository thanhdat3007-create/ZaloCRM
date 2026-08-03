// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
// ZaloCRM is free software under the GNU Affero General Public License v3.0 (see LICENSE).
// Commercial (dual) licensing available: locnt@rocket.ai
import { createApp, watchEffect } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router/index';
import { vuetify } from './plugins/vuetify';
import '@fontsource-variable/inter'; // Inter — typeface của Polaris, self-host (offline-safe cho deploy on-prem)
import './assets/polaris-tokens.css'; // Token Polaris verify từ polaris-react.shopify.com (2026-08-03)
import './assets/tokens.css';
import './assets/main.css';
import './assets/rbac-page.css';
import './assets/hs-crm-theme.css'; // HS Holding redesign (migration 2026-06-05) — sẽ rút ở cụm cleanup
import './assets/report-kit.css'; // Module Báo cáo — design system scoped .rpt-scope (2026-06-17)
import './assets/polaris-crm-theme.css'; // Polaris reskin — load CUỐI CÙNG trong chuỗi CSS tĩnh

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(vuetify);

/**
 * Đồng bộ theme Vuetify lên <html data-theme="…">.
 *
 * Vuetify chỉ gắn class `v-theme--*` lên gốc <v-app>. Ba nhóm phần tử nằm NGOÀI gốc đó
 * nên không nhận được token nếu scope theo `.v-theme--polaris`:
 *   1. 19 component dùng `<Teleport to="body">` (dialog, panel, modal…) — render thẳng
 *      dưới <body>; custom property kế thừa theo cây DOM chứ không theo cây component.
 *   2. `ConfirmHost` — App.vue render nó là anh em của layout, ngoài <v-app>.
 *   3. Chính <html> và <body>.
 * Đặt token trên `:root[data-theme="polaris"]` khiến chúng kế thừa đúng, đồng thời vẫn
 * đổi được theme (khác với đặt thẳng lên `:root`, sẽ khoá cứng và phá rollback).
 */
watchEffect(() => {
  document.documentElement.dataset.theme = vuetify.theme.global.name.value;
});

app.mount('#app');

// TODO: Re-enable PWA when vite-plugin-pwa supports vite 8
// if ('serviceWorker' in navigator) {
//   import('virtual:pwa-register').then(({ registerSW }) => {
//     registerSW({ immediate: true });
//   });
// }
