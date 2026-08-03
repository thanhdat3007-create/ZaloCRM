<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  AiAgentsPage.vue — quản lý AI agent chăm sóc khách hàng tự động (2026-08-03).
  3 tab: Agent (cấu hình + khung chạy thử), Mô phỏng (chat giả lập theo nick, kiểm
  cả binding lẫn cổng kích hoạt) và Nhật ký (debug "sao AI không trả lời").
-->
<template>
  <div class="aa-page">
    <header class="aa-header">
      <div>
        <h1 class="aa-title">🤖 AI chăm sóc tự động</h1>
        <p class="aa-sub">
          Tạo agent ở tab <b>Agent</b>, rồi sang tab <b>Gán theo nick</b> để chọn agent cho chat
          riêng và chat nhóm của từng nick Zalo.
        </p>
      </div>
      <div class="aa-tabs">
        <button :class="{ active: tab === 'agents' }" @click="tab = 'agents'">Agent</button>
        <button :class="{ active: tab === 'scope' }" @click="switchToScope">Gán theo nick</button>
        <button :class="{ active: tab === 'simulate' }" @click="tab = 'simulate'">Mô phỏng</button>
        <button :class="{ active: tab === 'runs' }" @click="switchToRuns">Nhật ký</button>
      </div>
    </header>

    <div v-if="error" class="aa-alert err">{{ error }}</div>

    <!-- ── Tab Agent ─────────────────────────────────────────────────────── -->
    <div v-if="tab === 'agents'" class="aa-split">
      <aside class="aa-list">
        <button class="aa-new" @click="startCreate">+ Tạo agent</button>
        <div v-if="loading" class="aa-empty">⏳ Đang tải…</div>
        <div v-else-if="agents.length === 0" class="aa-empty">Chưa có agent nào.</div>
        <button
          v-for="a in agents"
          :key="a.id"
          class="aa-item"
          :class="{ active: draft?.id === a.id }"
          @click="select(a)"
        >
          <span class="aa-item-dot" :class="a.enabled ? 'on' : 'off'" />
          <span class="aa-item-body">
            <span class="aa-item-name">{{ a.name }}</span>
            <span class="aa-item-meta">{{ a.model }}</span>
          </span>
        </button>
      </aside>

      <section v-if="draft" class="aa-form">
        <div class="aa-row2">
          <label class="aa-field">
            <span>Tên agent</span>
            <input v-model="draft.name" placeholder="VD: Tư vấn BĐS" />
          </label>
          <label class="aa-field aa-toggle">
            <input type="checkbox" v-model="draft.enabled" />
            <span>Bật agent</span>
          </label>
        </div>

        <label class="aa-field">
          <span>Mô tả</span>
          <input v-model="draft.description" placeholder="Ghi chú nội bộ, khách không thấy" />
        </label>

        <fieldset class="aa-group">
          <legend>Bộ não</legend>
          <div class="aa-row2">
            <label class="aa-check">
              <input type="radio" value="openrouter" v-model="draft.provider" />
              <span>OpenRouter (đám mây)</span>
            </label>
            <label class="aa-check">
              <input type="radio" value="rocket" v-model="draft.provider" />
              <span>Rocket Agent (máy này)</span>
            </label>
          </div>

          <template v-if="draft.provider === 'rocket'">
            <label class="aa-field">
              <span>
                Profile Rocket
                <button
                  class="aa-link"
                  type="button"
                  @click="loadRocketProfiles(true)"
                  :disabled="rocketProfilesLoading"
                >
                  {{ rocketProfilesLoading ? 'đang tải…' : 'tải lại danh sách' }}
                </button>
              </span>
              <div class="aa-test-row">
                <select v-if="rocketProfileOptions.length" v-model="rocketProfileText">
                  <option value="">— dùng profile mặc định của Rocket —</option>
                  <option v-for="p in rocketProfileOptions" :key="p.name" :value="p.name">
                    {{ rocketProfileLabel(p) }}
                  </option>
                </select>
                <input v-else v-model="rocketProfileText" placeholder="để trống = profile mặc định" />
                <button class="aa-btn" type="button" @click="runRocketProbe" :disabled="rocketProbing">
                  {{ rocketProbing ? '⏳' : 'Kiểm tra kết nối' }}
                </button>
              </div>
              <small v-if="rocketProfilesError" class="aa-hint err">
                {{ rocketProfilesError }} — gõ tay tên profile cũng được.
              </small>
              <small v-if="rocketProfileWarning" class="aa-hint err">{{ rocketProfileWarning }}</small>
              <small
                v-if="rocketProbeResult"
                class="aa-hint"
                :class="rocketProbeResult.ok ? 'ok' : 'err'"
              >{{ rocketProbeResult.message }}</small>
            </label>

            <label class="aa-field">
              <span>Model</span>
              <input v-model="draft.model" list="rocket-models" placeholder="để trống = dùng mặc định của Rocket" />
              <datalist id="rocket-models">
                <option v-for="m in rocketProbeResult?.models ?? []" :key="m" :value="m" />
              </datalist>
            </label>

            <small class="aa-hint">
              Temperature và độ dài trả lời tối đa do profile Rocket tự quản (cấu hình phía Rocket) — không chỉnh ở đây.
            </small>
          </template>

          <label v-else class="aa-field">
            <span>
              Model (OpenRouter)
              <button class="aa-link" type="button" @click="loadModels" :disabled="modelsLoading">
                {{ modelsLoading ? 'đang tải…' : 'tải danh sách' }}
              </button>
            </span>
            <input v-model="draft.model" list="openrouter-models" placeholder="anthropic/claude-sonnet-4.5" />
            <datalist id="openrouter-models">
              <option v-for="m in models" :key="m.value" :value="m.value">{{ m.title }}</option>
            </datalist>
            <small v-if="modelsError" class="aa-hint err">{{ modelsError }} — gõ tay id model cũng được.</small>
            <small v-else class="aa-hint">{{ models.length }} model khả dụng. Gõ để lọc.</small>
          </label>
        </fieldset>

        <fieldset class="aa-group">
          <legend>Dự phòng khi lỗi</legend>
          <label class="aa-field">
            <span>Dùng khi bộ não chính lỗi</span>
            <select v-model="draft.fallbackProvider">
              <option :value="null">Không dùng</option>
              <option value="openrouter">OpenRouter</option>
              <option value="rocket">Rocket Agent</option>
            </select>
          </label>

          <label v-if="draft.fallbackProvider" class="aa-field">
            <span>Model dự phòng</span>
            <input v-model="fallbackModelText" placeholder="VD: anthropic/claude-haiku-4.5 (để trống = mặc định)" />
          </label>

          <div v-if="draft.fallbackProvider === 'openrouter' && !openRouterHasKey" class="aa-alert warn">
            ⚠ Chưa nhập API key OpenRouter — dự phòng sẽ không chạy.
            <RouterLink to="/settings/dev/api">Nhập key</RouterLink>
          </div>

          <small class="aa-hint">
            Chỉ dùng khi bộ não chính (Rocket hoặc OpenRouter) lỗi/timeout — tránh bỏ rơi khách. Bật dự phòng có thể
            phát sinh chi phí OpenRouter, admin tự cân nhắc bật.
          </small>
        </fieldset>

        <label class="aa-field">
          <span>
            System prompt
            <button class="aa-link" type="button" @click="insertTemplate">chèn mẫu</button>
          </span>
          <textarea v-model="draft.systemPrompt" rows="14" spellcheck="false" class="aa-mono" />
          <small class="aa-hint">
            Quy tắc an toàn (không bịa giá, không chắc thì chuyển nhân viên) được hệ thống tự nối vào cuối —
            không cần viết lại.
          </small>
        </label>

        <div v-if="draft.provider !== 'rocket'" class="aa-row2">
          <label class="aa-field">
            <span>Temperature ({{ draft.temperature }})</span>
            <input type="range" min="0" max="1" step="0.1" v-model.number="draft.temperature" />
          </label>
          <label class="aa-field">
            <span>Độ dài tối đa câu trả lời (token)</span>
            <input type="number" min="50" max="4000" v-model.number="draft.maxTokens" />
          </label>
        </div>

        <fieldset class="aa-group">
          <legend>An toàn cho nick Zalo</legend>
          <div class="aa-row2">
            <label class="aa-field">
              <span>Trễ tối thiểu (giây)</span>
              <input type="number" min="1" v-model.number="delayMinSec" />
            </label>
            <label class="aa-field">
              <span>Trễ tối đa (giây)</span>
              <input type="number" min="1" v-model.number="delayMaxSec" />
            </label>
          </div>
          <small class="aa-hint">
            Trả lời tức thì 24/7 là dấu hiệu bot rõ nhất. Giữ độ trễ ngẫu nhiên để nick an toàn.
          </small>
          <div class="aa-row2">
            <label class="aa-field">
              <span>Tối đa tin/ngày (agent)</span>
              <input type="number" min="0" v-model.number="draft.maxRepliesPerDay" />
            </label>
            <label class="aa-field">
              <span>Tối đa tin/hội thoại/ngày</span>
              <input type="number" min="0" v-model.number="draft.maxRepliesPerConversationDay" />
            </label>
          </div>
          <label class="aa-field">
            <span>Nhường sale sau khi họ vừa nhắn (phút, 0 = không nhường)</span>
            <input type="number" min="0" v-model.number="draft.pauseAfterHumanReplyMinutes" />
          </label>
        </fieldset>

        <label class="aa-field">
          <span>Từ khoá bàn giao người thật (mỗi dòng 1 từ khoá)</span>
          <textarea v-model="handoffKeywordsText" rows="3" />
          <small class="aa-hint">Khách nhắn trúng → agent im lặng và báo chủ nick, không trả lời.</small>
        </label>

        <label class="aa-field">
          <span>Regex bỏ qua tin rác</span>
          <input v-model="draft.skipNoisePattern" class="aa-mono" spellcheck="false" />
          <small v-if="regexInvalid" class="aa-hint err">Regex không hợp lệ.</small>
        </label>

        <fieldset class="aa-group">
          <legend>Tài liệu agent được dùng</legend>
          <div v-if="documents.length === 0" class="aa-hint">
            Chưa có tài liệu nào. Thêm ở <RouterLink to="/settings/crm/ai-knowledge">Kho tài liệu AI</RouterLink>.
          </div>
          <label v-for="d in documents" :key="d.id" class="aa-check">
            <input type="checkbox" :value="d.id" v-model="selectedDocumentIds" />
            <span>{{ d.title }}</span>
            <span class="aa-check-meta">{{ d.chunkCount }} đoạn · ~{{ d.tokenCount }} token</span>
          </label>
          <small v-if="selectedTokens > 3500" class="aa-hint err">
            Tổng {{ selectedTokens }} token vượt ngưỡng nhồi prompt (3500). Khi tìm kiếm không khớp,
            agent sẽ không có tài liệu để trả lời. Nên tách tài liệu nhỏ hơn.
          </small>
        </fieldset>

        <div class="aa-actions">
          <button v-if="draft.id" class="aa-btn danger" @click="remove" :disabled="saving">Xoá</button>
          <span class="aa-spacer" />
          <button class="aa-btn" @click="cancel" :disabled="saving">Huỷ</button>
          <button class="aa-btn primary" @click="save" :disabled="saving || regexInvalid">
            {{ saving ? '⏳ Đang lưu…' : '💾 Lưu' }}
          </button>
        </div>

        <!-- Khung thử nghiệm -->
        <fieldset v-if="draft.id" class="aa-group">
          <legend>🧪 Thử nghiệm (không gửi Zalo)</legend>
          <div class="aa-test-row">
            <input v-model="testQuestion" placeholder="Gõ câu khách hay hỏi…" @keyup.enter="runTest" />
            <button class="aa-btn primary" @click="runTest" :disabled="testing">
              {{ testing ? '⏳' : 'Chạy thử' }}
            </button>
          </div>
          <div v-if="testError" class="aa-alert err">{{ testError }}</div>
          <div v-if="testResult" class="aa-test-result">
            <div v-if="testResult.handoff" class="aa-alert warn">
              Agent chọn chuyển nhân viên: {{ testResult.handoffReason }}
            </div>
            <p v-else class="aa-test-reply">{{ testResult.reply }}</p>
            <div class="aa-test-meta">
              {{ testResult.latencyMs }}ms · {{ testResult.promptTokens ?? '—' }} token vào ·
              {{ testResult.completionTokens ?? '—' }} token ra
            </div>
            <details v-if="testResult.chunks.length">
              <summary>{{ testResult.chunks.length }} đoạn tài liệu đã dùng</summary>
              <div v-for="c in testResult.chunks" :key="c.id" class="aa-chunk">
                <div class="aa-chunk-title">{{ c.docTitle }}{{ c.heading ? ` › ${c.heading}` : '' }}</div>
                <div class="aa-chunk-body">{{ c.content }}</div>
              </div>
            </details>
            <details v-else>
              <summary>Không tìm thấy đoạn tài liệu nào khớp</summary>
              <p class="aa-hint">
                Agent trả lời không dựa trên tài liệu. Kiểm tra đã gán tài liệu chưa, hoặc thử từ khoá khác
                ở trang Kho tài liệu AI.
              </p>
            </details>
          </div>
        </fieldset>
      </section>

      <section v-else class="aa-form aa-placeholder">Chọn một agent bên trái, hoặc tạo agent mới.</section>
    </div>

    <!-- ── Tab Phạm vi (gán agent cho nhiều nhóm cùng lúc) ──────────────────── -->
    <div v-else-if="tab === 'scope'" class="aa-scope">
      <p class="aa-hint">
        Mỗi nick Zalo cấu hình riêng chat 1-1 và chat nhóm. Nhóm cho phép chọn nhiều nhóm cùng lúc;
        một nhóm chỉ thuộc đúng một agent.
      </p>

      <div v-if="agents.length === 0" class="aa-empty">
        Chưa có agent nào — tạo agent ở tab <b>Agent</b> trước.
      </div>
      <div v-else-if="bindingsLoading" class="aa-empty">⏳ Đang tải…</div>
      <div v-else-if="scopeAccounts.length === 0" class="aa-empty">Chưa có nick Zalo nào.</div>

      <template v-else>
        <div class="aa-search-row">
          <input
            v-model="scopeNickSearch"
            type="text"
            class="aa-search-input"
            placeholder="🔍 Tìm kiếm nick Zalo..."
          />
          <button
            v-if="scopeNickSearch"
            type="button"
            class="aa-search-clear"
            @click="scopeNickSearch = ''"
            title="Xoá tìm kiếm"
          >
            ✕
          </button>
        </div>

        <div v-if="filteredScopeAccounts.length === 0" class="aa-empty">
          Không tìm thấy nick Zalo nào khớp với "{{ scopeNickSearch }}".
        </div>
        <table v-else class="aa-table">
          <thead>
            <tr>
              <th>Nick Zalo</th>
              <th>Chat riêng (1-1)</th>
              <th>Chat nhóm (mặc định)</th>
              <th>Nhóm gán riêng</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in filteredScopeAccounts" :key="a.id">
              <td>{{ a.displayName || a.zaloUid || a.id }}</td>
              <td :class="{ 'aa-muted': !nickSummary(a.id).dm }">{{ nickSummary(a.id).dm ?? '— chưa gán —' }}</td>
              <td :class="{ 'aa-muted': !nickSummary(a.id).allGroups }">
                {{ nickSummary(a.id).allGroups ?? '— chưa gán —' }}
              </td>
              <td :class="{ 'aa-muted': nickSummary(a.id).specificCount === 0 }">
                {{ nickSummary(a.id).specificCount === 0 ? '—' : `${nickSummary(a.id).specificCount} nhóm` }}
              </td>
              <td>
                <button class="aa-link" type="button" @click="openNickConfig(a)">Cấu hình</button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <div v-if="scopeError" class="aa-alert err">{{ scopeError }}</div>
    </div>

    <!-- ── Tab Mô phỏng ──────────────────────────────────────────────────── -->
    <div v-else-if="tab === 'simulate'" class="aa-sim-wrap">
      <AgentSimulator />
    </div>

    <!-- ── Tab Nhật ký ───────────────────────────────────────────────────── -->
    <div v-else class="aa-runs">
      <div class="aa-filters">
        <select v-model="runFilterAgent" @change="loadRuns">
          <option value="">Mọi agent</option>
          <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
        <select v-model="runFilterStatus" @change="loadRuns">
          <option value="">Mọi trạng thái</option>
          <option value="sent">Đã gửi</option>
          <option value="skipped">Bỏ qua</option>
          <option value="handoff">Chuyển nhân viên</option>
          <option value="failed">Lỗi</option>
        </select>
        <label class="aa-check">
          <input type="checkbox" v-model="runFilterFallbackOnly" @change="loadRuns" />
          <span>Chỉ lượt dùng dự phòng</span>
        </label>
        <button class="aa-btn" @click="loadRuns">Tải lại</button>
        <span class="aa-hint">{{ runsTotal }} lượt</span>
      </div>
      <table class="aa-table">
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>Agent</th>
            <th>Trạng thái</th>
            <th>Model trả lời</th>
            <th>Lý do bỏ qua</th>
            <th>Token</th>
            <th>Câu trả lời</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in runs" :key="r.id">
            <td>{{ formatTime(r.createdAt) }}</td>
            <td>{{ r.agent?.name ?? '—' }}</td>
            <td>
              <span class="aa-status" :class="r.status">{{ statusLabel(r.status) }}</span>
              <span v-if="r.fallbackUsed" class="aa-status fallback">Dự phòng</span>
            </td>
            <td>{{ r.model ?? '—' }}</td>
            <td>{{ r.skipReason ? skipReasonLabel(r.skipReason) : '—' }}</td>
            <td>{{ r.promptTokens ?? '—' }}/{{ r.completionTokens ?? '—' }}</td>
            <td class="aa-reply-cell">{{ r.error || r.replyText || '—' }}</td>
          </tr>
          <tr v-if="runs.length === 0">
            <td colspan="7" class="aa-empty">Chưa có lượt nào.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Dùng lại đúng dialog của trang Tài khoản Zalo — logic gán binding chỉ tồn tại
         một chỗ, sửa một lần là cả hai lối vào cùng đổi. -->
    <AgentBindingDialog
      v-if="nickConfigAccount"
      :zalo-account-id="nickConfigAccount.id"
      :account-label="nickConfigAccount.label"
      mode="account"
      @saved="loadNickBindings"
      @close="nickConfigAccount = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AgentSimulator from '@/components/ai-agent/AgentSimulator.vue';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';
import AgentBindingDialog from '@/components/ai-agent/AgentBindingDialog.vue';
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  testAgent,
  listAgentDocuments,
  getAgentDocumentIds,
  setAgentDocuments,
  listRuns,
  listOpenRouterModels,
  getAvailableProviders,
  probeRocketAgent,
  listRocketProfiles,
  listBindings,
  type AiAgent,
  type AiAgentDocument,
  type AiAgentRun,
  type AgentTestResult,
  type AiProviderInfo,
  type RocketProbeResult,
  type RocketProfileInfo,
  type AiAgentBinding,
} from '@/api/ai-agent';

const PROMPT_TEMPLATE = `Bạn là nhân viên tư vấn của công ty, đang nhắn tin với khách trên Zalo.

Nhiệm vụ:
- Chào hỏi thân thiện, xưng "em", gọi khách là "anh/chị".
- Trả lời đúng câu hỏi của khách dựa trên tài liệu được cung cấp.
- Khi khách quan tâm, xin số điện thoại và hẹn lịch gặp/gọi.

Giọng điệu: gần gũi, ngắn gọn, không dùng từ chuyên ngành khó hiểu.`;

const tab = ref<'agents' | 'scope' | 'simulate' | 'runs'>('agents');
const loading = ref(true);
const saving = ref(false);
const error = ref('');

const agents = ref<AiAgent[]>([]);
const documents = ref<AiAgentDocument[]>([]);
const draft = ref<(AgentDraft & { id?: string }) | null>(null);
const selectedDocumentIds = ref<string[]>([]);
const handoffKeywordsText = ref('');

const models = ref<Array<{ title: string; value: string }>>([]);
const modelsLoading = ref(false);
const modelsError = ref('');

const testQuestion = ref('');
const testing = ref(false);
const testError = ref('');
const testResult = ref<AgentTestResult | null>(null);

const runs = ref<AiAgentRun[]>([]);
const runsTotal = ref(0);
const runFilterAgent = ref('');
const runFilterStatus = ref('');
const runFilterFallbackOnly = ref(false);

// Rocket Agent — kiểm tra kết nối + danh sách model của profile.
const rocketProbing = ref(false);
const rocketProbeResult = ref<RocketProbeResult | null>(null);

// Danh sách profile Rocket cho dropdown (backend đọc bằng `hermes profile list`).
const rocketProfiles = ref<RocketProfileInfo[]>([]);
const rocketProfilesLoading = ref(false);
const rocketProfilesError = ref('');

/**
 * Dropdown = profile CLI trả về + profile agent đang lưu (nếu CLI không thấy nó, ví dụ
 * profile vừa bị xoá hoặc backend chạy máy khác). Thiếu bước ghép này, ô select rơi về
 * rỗng và lần Lưu kế tiếp âm thầm xoá cấu hình profile của agent.
 */
const rocketProfileOptions = computed<RocketProfileInfo[]>(() => {
  const current = draft.value?.rocketProfile ?? '';
  const items = rocketProfiles.value;
  if (!current || items.some((p) => p.name === current)) return items;
  return [
    ...items,
    { name: current, model: null, gateway: null, apiServerEnabled: false, port: null, hasKey: false },
  ];
});

function rocketProfileLabel(p: RocketProfileInfo): string {
  const parts = [p.name];
  if (p.model) parts.push(p.model);
  // Ba trạng thái khiến agent im lặng dù profile "có tồn tại" — phải thấy ngay lúc chọn,
  // đừng để phát hiện qua tin nhắn khách không được trả lời.
  if (!p.apiServerEnabled) parts.push('CHƯA bật cổng API');
  else if (p.port) parts.push(`cổng ${p.port}`);
  if (p.apiServerEnabled && !p.hasKey) parts.push('thiếu khoá');
  if (p.gateway === 'stopped') parts.push('gateway đang tắt');
  return parts.join(' · ');
}

/** Profile đang chọn nhưng không gọi được — cảnh báo ngay dưới ô select. */
const rocketProfileWarning = computed<string>(() => {
  const current = draft.value?.rocketProfile ?? '';
  if (!current) return '';
  const p = rocketProfiles.value.find((x) => x.name === current);
  if (!p) return '';
  if (!p.apiServerEnabled)
    return `Profile "${current}" chưa bật cổng API của Rocket (platforms.api_server.enabled), agent sẽ không gọi được. Bật rồi chạy: hermes gateway start`;
  if (!p.port) return `Profile "${current}" bật api_server nhưng chưa khai cổng (extra.port).`;
  if (!p.hasKey) return `Profile "${current}" chưa có khoá api_server (extra.key) — gateway sẽ trả 401.`;
  if (p.gateway === 'stopped')
    return `Gateway của profile "${current}" đang tắt. Bật bằng: hermes gateway start`;
  return '';
});

// Provider per-org (để cảnh báo thiếu key OpenRouter khi chọn dự phòng).
const providersInfo = ref<AiProviderInfo[]>([]);
const openRouterHasKey = computed(
  () => providersInfo.value.find((p) => p.id === 'openrouter')?.hasKey ?? false,
);

// ── Tab Theo nick: mỗi nick 1 dòng, bấm Cấu hình mở dialog gán agent ─────────
const { accounts: scopeAccounts, fetchAccounts: fetchScopeAccounts } = useZaloAccounts();
const scopeNickSearch = ref('');
const filteredScopeAccounts = computed(() => {
  const q = scopeNickSearch.value.trim().toLowerCase();
  if (!q) return scopeAccounts.value;
  return scopeAccounts.value.filter((a: any) => {
    const name = (a.displayName || a.zaloUid || a.id || '').toLowerCase();
    return name.includes(q);
  });
});

const orgBindings = ref<AiAgentBinding[]>([]);
const bindingsLoading = ref(false);
const scopeError = ref('');
const nickConfigAccount = ref<{ id: string; label: string } | null>(null);
let scopeAccountsLoaded = false;

interface NickSummary {
  /** Tên agent phụ trách chat 1-1, null = chưa gán. */
  dm: string | null;
  /** Tên agent mặc định cho mọi nhóm, null = chưa gán. */
  allGroups: string | null;
  /** Số nhóm được gán riêng (đè lên mặc định). */
  specificCount: number;
}

/**
 * Tóm tắt cấu hình của 1 nick cho bảng. Agent bị tắt hiện kèm chú thích — binding còn đó
 * nhưng hội thoại vẫn im lặng, không nói ra thì rất khó hiểu vì sao AI không trả lời.
 */
function nickSummary(accountId: string): NickSummary {
  const rows = orgBindings.value.filter((b) => b.zaloAccountId === accountId);
  const label = (b: AiAgentBinding | undefined): string | null => {
    if (!b) return null;
    const name = b.agent?.name ?? b.agentId;
    if (!b.enabled) return `${name} (binding tắt)`;
    if (b.agent && !b.agent.enabled) return `${name} (agent tắt)`;
    return name;
  };
  return {
    dm: label(rows.find((b) => b.scope === 'account_dm')),
    allGroups: label(rows.find((b) => b.scope === 'account_group')),
    specificCount: rows.filter((b) => b.scope === 'group' && b.targetThreadId).length,
  };
}

function openNickConfig(account: { id: string; displayName?: string | null; zaloUid?: string | null }): void {
  nickConfigAccount.value = {
    id: account.id,
    label: account.displayName || account.zaloUid || 'Nick Zalo',
  };
}

interface AgentDraft {
  name: string;
  description: string;
  provider: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  replyDelayMinMs: number;
  replyDelayMaxMs: number;
  maxRepliesPerDay: number;
  maxRepliesPerConversationDay: number;
  pauseAfterHumanReplyMinutes: number;
  skipNoisePattern: string;
  rocketProfile: string | null;
  fallbackProvider: string | null;
  fallbackModel: string | null;
}

function emptyDraft(): AgentDraft {
  return {
    name: '',
    description: '',
    provider: 'openrouter',
    model: '',
    systemPrompt: PROMPT_TEMPLATE,
    temperature: 0.6,
    maxTokens: 600,
    enabled: true,
    replyDelayMinMs: 3000,
    replyDelayMaxMs: 12000,
    maxRepliesPerDay: 500,
    maxRepliesPerConversationDay: 30,
    pauseAfterHumanReplyMinutes: 0,
    skipNoisePattern: '^(ok|oke|okay|uhm|um|ờ|à|ừ|a|o|yes|no|y|n|\\.|\\.\\.|\\.\\.\\.)\\s*$',
    rocketProfile: null,
    // Không tự chọn dự phòng cho agent mới — tự bật là tự tiêu tiền của org mà họ không biết.
    fallbackProvider: null,
    fallbackModel: null,
  };
}

// input text 2 chiều cho profile Rocket / model dự phòng: rỗng ⇄ null.
const rocketProfileText = computed({
  get: () => draft.value?.rocketProfile ?? '',
  set: (v: string) => { if (draft.value) draft.value.rocketProfile = v.trim() || null; },
});
const fallbackModelText = computed({
  get: () => draft.value?.fallbackModel ?? '',
  set: (v: string) => { if (draft.value) draft.value.fallbackModel = v.trim() || null; },
});

// Người dùng nghĩ bằng giây, DB lưu ms.
const delayMinSec = computed({
  get: () => Math.round((draft.value?.replyDelayMinMs ?? 3000) / 1000),
  set: (v: number) => { if (draft.value) draft.value.replyDelayMinMs = Math.max(1, v) * 1000; },
});
const delayMaxSec = computed({
  get: () => Math.round((draft.value?.replyDelayMaxMs ?? 12000) / 1000),
  set: (v: number) => { if (draft.value) draft.value.replyDelayMaxMs = Math.max(1, v) * 1000; },
});

const regexInvalid = computed(() => {
  if (!draft.value?.skipNoisePattern) return false;
  try {
    new RegExp(draft.value.skipNoisePattern, 'i');
    return false;
  } catch {
    return true;
  }
});

const selectedTokens = computed(() =>
  documents.value
    .filter((d) => selectedDocumentIds.value.includes(d.id))
    .reduce((sum, d) => sum + d.tokenCount, 0),
);

/** Reset trạng thái riêng của agent trước đó (kết quả probe Rocket) khi đổi/huỷ chọn agent. */
function resetPerAgentState(): void {
  rocketProbeResult.value = null;
}

function startCreate(): void {
  draft.value = emptyDraft();
  selectedDocumentIds.value = [];
  handoffKeywordsText.value = ['gặp nhân viên', 'gặp người thật', 'khiếu nại'].join('\n');
  testResult.value = null;
  resetPerAgentState();
}

async function select(agent: AiAgent): Promise<void> {
  draft.value = { ...emptyDraft(), ...agent, description: agent.description ?? '', id: agent.id };
  handoffKeywordsText.value = (agent.handoffKeywords ?? []).join('\n');
  testResult.value = null;
  resetPerAgentState();
  selectedDocumentIds.value = await getAgentDocumentIds(agent.id).catch(() => []);
}

function cancel(): void {
  draft.value = null;
  testResult.value = null;
  resetPerAgentState();
}

function insertTemplate(): void {
  if (draft.value) draft.value.systemPrompt = PROMPT_TEMPLATE;
}

async function loadModels(): Promise<void> {
  modelsLoading.value = true;
  modelsError.value = '';
  try {
    models.value = await listOpenRouterModels();
    if (models.value.length === 0) modelsError.value = 'OpenRouter không trả về model nào';
  } catch (e: any) {
    modelsError.value = e?.response?.data?.error || e?.message || 'Không tải được danh sách model';
  } finally {
    modelsLoading.value = false;
  }
}

async function runRocketProbe(): Promise<void> {
  if (!draft.value || rocketProbing.value) return;
  rocketProbing.value = true;
  rocketProbeResult.value = null;
  try {
    rocketProbeResult.value = await probeRocketAgent(draft.value.rocketProfile ?? '');
  } catch (e: any) {
    // Endpoint backend LUÔN trả 200 (kể cả lỗi) — rơi vào catch nghĩa là bản thân ZaloCRM lỗi.
    rocketProbeResult.value = {
      ok: false,
      status: 'error',
      message: e?.response?.data?.error || e?.message || 'Không kiểm tra được kết nối Rocket Agent',
      models: [],
    };
  } finally {
    rocketProbing.value = false;
  }
}

async function loadRocketProfiles(refresh = false): Promise<void> {
  if (rocketProfilesLoading.value) return;
  rocketProfilesLoading.value = true;
  rocketProfilesError.value = '';
  try {
    const res = await listRocketProfiles(refresh);
    rocketProfiles.value = res.profiles;
    // ok=false vẫn là 200: thư mục profile chưa mount / chưa có profile nào. Hiện lời chẩn
    // đoán của backend và để ô nhập tay thay cho dropdown.
    if (!res.ok) rocketProfilesError.value = res.message;
  } catch (e: any) {
    rocketProfiles.value = [];
    rocketProfilesError.value =
      e?.response?.data?.error || e?.message || 'Không đọc được danh sách profile Rocket';
  } finally {
    rocketProfilesLoading.value = false;
  }
}

async function loadProviders(): Promise<void> {
  try {
    providersInfo.value = await getAvailableProviders();
  } catch {
    providersInfo.value = [];
  }
}

// ── Tab Theo nick ─────────────────────────────────────────────────────────

async function loadNickBindings(): Promise<void> {
  bindingsLoading.value = true;
  scopeError.value = '';
  try {
    orgBindings.value = await listBindings();
  } catch (e: any) {
    scopeError.value = e?.response?.data?.error || e?.message || 'Lỗi tải danh sách gán agent';
  } finally {
    bindingsLoading.value = false;
  }
}

function switchToScope(): void {
  tab.value = 'scope';
  if (!scopeAccountsLoaded) {
    scopeAccountsLoaded = true;
    void fetchScopeAccounts();
  }
  void loadNickBindings();
}

async function save(): Promise<void> {
  if (!draft.value || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      ...draft.value,
      handoffKeywords: handoffKeywordsText.value.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    delete (payload as Record<string, unknown>).id;
    const saved = draft.value.id
      ? await updateAgent(draft.value.id, payload)
      : await createAgent(payload);
    await setAgentDocuments(saved.id, selectedDocumentIds.value);
    await load();
    await select(saved);
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Lỗi lưu agent';
  } finally {
    saving.value = false;
  }
}

async function remove(): Promise<void> {
  if (!draft.value?.id) return;
  if (!confirm(`Xoá agent "${draft.value.name}"? Mọi cấu hình gán nick/nhóm của agent này cũng bị xoá.`)) return;
  saving.value = true;
  try {
    await deleteAgent(draft.value.id);
    draft.value = null;
    await load();
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Lỗi xoá agent';
  } finally {
    saving.value = false;
  }
}

async function runTest(): Promise<void> {
  if (!draft.value?.id || !testQuestion.value.trim() || testing.value) return;
  testing.value = true;
  testError.value = '';
  testResult.value = null;
  try {
    testResult.value = await testAgent(draft.value.id, testQuestion.value);
  } catch (e: any) {
    testError.value = e?.response?.data?.error || e?.message || 'Chạy thử lỗi';
  } finally {
    testing.value = false;
  }
}

function switchToRuns(): void {
  tab.value = 'runs';
  void loadRuns();
}

async function loadRuns(): Promise<void> {
  try {
    const res = await listRuns({
      agentId: runFilterAgent.value || undefined,
      status: runFilterStatus.value || undefined,
      fallbackUsed: runFilterFallbackOnly.value ? true : undefined,
      limit: 100,
    });
    runs.value = res.items;
    runsTotal.value = res.total;
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Lỗi tải nhật ký';
  }
}

const STATUS_LABELS: Record<string, string> = {
  sent: 'Đã gửi',
  skipped: 'Bỏ qua',
  handoff: 'Chuyển NV',
  failed: 'Lỗi',
};
function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}

const SKIP_LABELS: Record<string, string> = {
  no_binding: 'Nick/nhóm chưa gán agent',
  org_disabled: 'AI của tổ chức đang tắt',
  agent_disabled: 'Agent đang tắt',
  binding_disabled: 'Cấu hình gán đang tắt',
  not_inbound: 'Không phải tin của khách',
  internal_nick: 'Tin từ nick nội bộ (chống lặp AI↔AI)',
  unsupported_type: 'Không phải tin văn bản',
  noise: 'Tin rác (khớp regex bỏ qua)',
  not_mentioned: 'Nhóm không nhắc tên / không trúng từ khoá',
  handoff_active: 'Đang chờ nhân viên xử lý',
  conversation_paused: 'Hội thoại đang tạm dừng AI',
  human_active: 'Sale vừa trả lời',
  handoff_keyword: 'Khách xin gặp nhân viên',
  quota: 'Hết hạn mức của agent',
  nick_cap: 'Nick chạm trần tin/ngày',
  no_api_key: 'Chưa cấu hình API key OpenRouter',
  chat_disabled: 'Nick đang ở chế độ CHỈ NHẬN (đã tắt gửi tin)',
};
function skipReasonLabel(r: string): string {
  return SKIP_LABELS[r] ?? r;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN');
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    [agents.value, documents.value] = await Promise.all([listAgents(), listAgentDocuments()]);
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Lỗi tải dữ liệu';
  } finally {
    loading.value = false;
  }
}

watch(tab, (t) => {
  if (t === 'runs' && runs.value.length === 0) void loadRuns();
});

// Chỉ gọi CLI khi thực sự mở form Rocket — org dùng OpenRouter không phải trả phí spawn
// tiến trình mỗi lần vào trang. Tải 1 lần, muốn làm mới thì bấm "tải lại danh sách".
watch(
  () => draft.value?.provider,
  (p) => {
    if (p === 'rocket' && rocketProfiles.value.length === 0) void loadRocketProfiles();
  },
);

onMounted(() => {
  void load();
  void loadProviders();
});
</script>

<style scoped>
.aa-page { padding: 20px; max-width: 1280px; }
.aa-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px;
}
.aa-title { font-size: 18px; font-weight: 700; margin: 0 0 6px; }
.aa-sub { margin: 0; color: #64748b; font-size: 13px; }
.aa-tabs { display: flex; gap: 4px; }
.aa-tabs button {
  padding: 6px 14px; border: 1px solid #e2e8f0; background: #fff; border-radius: 6px;
  font-size: 13px; cursor: pointer; color: #64748b;
}
.aa-tabs button.active { background: #3b82f6; border-color: #3b82f6; color: #fff; font-weight: 600; }

.aa-alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; }
.aa-alert.err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
.aa-alert.warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }

.aa-split { display: grid; grid-template-columns: 260px 1fr; gap: 16px; align-items: start; }
.aa-list { display: flex; flex-direction: column; gap: 6px; }
.aa-new {
  padding: 8px; border: 1px dashed #94a3b8; background: #fff; border-radius: 6px;
  font-size: 13px; cursor: pointer; color: #334155;
}
.aa-item {
  display: flex; gap: 8px; align-items: center; text-align: left;
  padding: 8px 10px; border: 1px solid #e2e8f0; background: #fff; border-radius: 6px; cursor: pointer;
}
.aa-item.active { border-color: #3b82f6; background: #eff6ff; }
.aa-item-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.aa-item-dot.on { background: #22c55e; }
.aa-item-dot.off { background: #cbd5e1; }
.aa-item-body { display: flex; flex-direction: column; min-width: 0; }
.aa-item-name { font-size: 13px; font-weight: 600; }
.aa-item-meta { font-size: 11px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.aa-form {
  display: flex; flex-direction: column; gap: 12px;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;
}
.aa-placeholder { color: #64748b; font-size: 13px; }
.aa-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.aa-field { display: flex; flex-direction: column; gap: 4px; }
.aa-field > span { font-size: 12px; font-weight: 600; color: #1f2937; }
.aa-field input[type='text'], .aa-field input:not([type]), .aa-field input[type='number'], .aa-field select, .aa-field textarea {
  padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; width: 100%;
}
.aa-toggle { flex-direction: row; align-items: center; gap: 6px; padding-top: 20px; }
.aa-toggle input { width: auto; }
.aa-mono { font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace; font-size: 12px; }
.aa-hint { font-size: 11px; color: #64748b; }
.aa-hint.err { color: #b91c1c; }
.aa-link { background: none; border: none; color: #3b82f6; cursor: pointer; font-size: 11px; padding: 0 4px; }

.aa-group { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.aa-group legend { font-size: 12px; font-weight: 600; padding: 0 6px; color: #334155; }
.aa-check { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.aa-check-meta { color: #94a3b8; font-size: 11px; margin-left: auto; }

.aa-actions { display: flex; gap: 8px; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
.aa-spacer { flex: 1; }
.aa-btn {
  padding: 7px 14px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff;
  font-size: 13px; cursor: pointer; color: #334155;
}
.aa-btn.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; font-weight: 600; }
.aa-btn.danger { border-color: #fecaca; color: #b91c1c; }
.aa-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.aa-test-row { display: flex; gap: 8px; }
.aa-test-row input, .aa-test-row select {
  flex: 1; min-width: 0; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px;
}
.aa-test-result { display: flex; flex-direction: column; gap: 8px; }
.aa-test-reply {
  margin: 0; padding: 10px 12px; background: #f0fdf4; border: 1px solid #bbf7d0;
  border-radius: 8px; font-size: 13px; white-space: pre-wrap;
}
.aa-test-meta { font-size: 11px; color: #64748b; }
.aa-chunk { border-left: 2px solid #cbd5e1; padding-left: 8px; margin: 6px 0; }
.aa-chunk-title { font-size: 11px; font-weight: 600; color: #475569; }
.aa-chunk-body { font-size: 12px; color: #334155; white-space: pre-wrap; }

.aa-sim-wrap {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;
}
.aa-runs { display: flex; flex-direction: column; gap: 10px; }
.aa-filters { display: flex; gap: 8px; align-items: center; }
.aa-filters select { padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; }
.aa-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
.aa-table th, .aa-table td { padding: 8px 10px; font-size: 12px; text-align: left; border-bottom: 1px solid #f1f5f9; }
.aa-table th { background: #f8fafc; font-weight: 600; color: #475569; }
.aa-reply-cell { max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aa-status { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.aa-status.sent { background: #dcfce7; color: #166534; }
.aa-status.skipped { background: #f1f5f9; color: #475569; }
.aa-status.handoff { background: #fef3c7; color: #92400e; }
.aa-status.failed { background: #fee2e2; color: #b91c1c; }
.aa-status.fallback { background: #ede9fe; color: #5b21b6; margin-left: 4px; }
.aa-empty { padding: 16px; text-align: center; color: #94a3b8; font-size: 13px; }

/* Tab Phạm vi — tái dùng bố cục aa-form/aa-group/aa-table hiện có */
.aa-scope { display: flex; flex-direction: column; gap: 16px; }
.aa-search-row {
  position: relative;
  display: flex;
  align-items: center;
  max-width: 320px;
}
.aa-search-input {
  width: 100%;
  padding: 6px 28px 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  background: #fff;
  transition: border-color 0.15s ease;
}
.aa-search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}
.aa-search-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  font-size: 12px;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px 4px;
}
.aa-search-clear:hover {
  color: #475569;
}
.aa-hint.ok { color: #16a34a; }
.aa-alert.ok { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
</style>
