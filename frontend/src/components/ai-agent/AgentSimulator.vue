<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  AgentSimulator.vue — hộp thoại chat giả lập để kiểm tra cấu hình agent.

  Chạy đúng chuỗi của luồng thật (binding → cổng kích hoạt → prompt → model) nhưng
  KHÔNG ghi DB và KHÔNG gửi tin ra Zalo. Mỗi lượt hiện rõ 2 bước đầu để trả lời
  được câu "sao AI không trả lời" ngay tại chỗ, thay vì phải mở tab Nhật ký.
-->
<template>
  <div class="sim">
    <!-- Thanh cấu hình bối cảnh -->
    <div class="sim-bar">
      <label class="sim-field">
        <span>Nick Zalo</span>
        <select v-model="zaloAccountId" :disabled="busy">
          <option value="">— Chọn nick —</option>
          <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.displayName || a.phone || a.id }}</option>
        </select>
      </label>

      <label class="sim-field">
        <span>Loại hội thoại</span>
        <select v-model="threadType" :disabled="busy">
          <option value="user">Tin nhắn 1-1</option>
          <option value="group">Tin nhắn nhóm</option>
        </select>
      </label>

      <label class="sim-field">
        <span>Tên khách (tuỳ chọn)</span>
        <input v-model="senderName" placeholder="Chị Lan" :disabled="busy" />
      </label>
    </div>

    <!-- Công tắc riêng cho nhóm — quyết định cổng kích hoạt có mở hay không -->
    <div v-if="threadType === 'group'" class="sim-flags">
      <label><input type="checkbox" v-model="mentionsNick" :disabled="busy" /> Khách @nhắc nick</label>
      <label><input type="checkbox" v-model="mentionsAll" :disabled="busy" /> Khách dùng @all</label>
      <label><input type="checkbox" v-model="replyToNick" :disabled="busy" /> Khách bấm "Trả lời" tin của nick</label>
    </div>

    <div v-if="error" class="sim-alert err">{{ error }}</div>

    <!-- Khung chat -->
    <div ref="scroller" class="sim-thread">
      <p v-if="turns.length === 0" class="sim-empty">
        Gõ tin nhắn giả lập bên dưới. Không có tin nào được gửi ra Zalo và không có gì ghi vào cơ sở dữ liệu.
      </p>

      <template v-for="(t, i) in turns" :key="i">
        <!-- Tin khách -->
        <div v-if="t.kind === 'customer'" class="sim-msg customer">
          <div class="sim-bubble">{{ t.content }}</div>
        </div>

        <!-- Kết quả 1 lượt của agent -->
        <div v-else class="sim-turn">
          <div class="sim-trace">
            <div class="sim-trace-row">
              <span class="sim-step">1. Chọn agent</span>
              <span v-if="t.result.binding" class="sim-ok">
                {{ t.result.binding.agentName }}
                <em>({{ scopeLabel(t.result.binding.scope) }})</em>
                <span v-if="!t.result.binding.agentEnabled" class="sim-warn-tag">agent đang tắt</span>
              </span>
              <span v-else class="sim-bad">Không có binding — nick này chưa gán agent cho {{ threadLabel }}</span>
            </div>
            <div class="sim-trace-row">
              <span class="sim-step">2. Cổng kích hoạt</span>
              <span v-if="t.result.gate.ok" class="sim-ok">Mở — agent được phép trả lời</span>
              <span v-else class="sim-bad">Chặn: {{ skipReasonLabel(t.result.gate.reason) }}</span>
            </div>
          </div>

          <div v-if="t.result.reply" class="sim-msg agent">
            <div v-if="t.result.reply.handoff" class="sim-bubble handoff">
              🙋 Chuyển nhân viên — {{ t.result.reply.handoffReason || 'không đủ thông tin' }}
            </div>
            <div v-else class="sim-bubble">{{ t.result.reply.text }}</div>
          </div>

          <div v-if="t.result.reply" class="sim-meta">
            {{ t.result.reply.latencyMs }}ms ·
            {{ t.result.reply.promptTokens ?? '—' }} token vào ·
            {{ t.result.reply.completionTokens ?? '—' }} token ra
          </div>

          <details v-if="t.result.chunks.length" class="sim-details">
            <summary>{{ t.result.chunks.length }} đoạn tài liệu đã dùng</summary>
            <div v-for="c in t.result.chunks" :key="c.id" class="sim-chunk">
              <b>{{ c.documentTitle }}<template v-if="c.heading"> › {{ c.heading }}</template></b>
              <p>{{ c.content }}</p>
            </div>
          </details>
          <details v-else-if="t.result.gate.ok" class="sim-details">
            <summary>Không tìm thấy đoạn tài liệu nào khớp</summary>
            <p class="sim-hint">
              Agent trả lời không dựa trên tài liệu. Kiểm tra đã tick tài liệu cho agent ở tab Agent chưa,
              hoặc thêm tài liệu ở
              <RouterLink to="/settings/crm/ai-knowledge">Kho tài liệu AI</RouterLink>.
            </p>
          </details>

          <details v-if="t.result.system" class="sim-details">
            <summary>System prompt đã gửi cho model</summary>
            <pre class="sim-pre">{{ t.result.system }}</pre>
          </details>
        </div>
      </template>

      <div v-if="busy" class="sim-msg agent"><div class="sim-bubble typing">⏳ Đang nghĩ…</div></div>
    </div>

    <!-- Ô nhập -->
    <div class="sim-input">
      <input
        v-model="draft"
        placeholder="Gõ tin khách sẽ nhắn…"
        :disabled="busy || !zaloAccountId"
        @keyup.enter="send"
      />
      <button class="sim-btn primary" :disabled="busy || !zaloAccountId || !draft.trim()" @click="send">Gửi</button>
      <button class="sim-btn" :disabled="busy || turns.length === 0" @click="reset">Xoá hội thoại</button>
    </div>

    <p v-if="skippedGates.length" class="sim-note">
      Mô phỏng không kiểm: {{ skippedGates.join(' · ') }}. Các cổng này cần hội thoại thật để đếm.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '@/api';
import { simulateAgentTurn, type SimulateResult, type SimulateTurn } from '@/api/ai-agent';

interface AccountOption {
  id: string;
  displayName: string | null;
  phone: string | null;
}

/** 1 dòng trong khung chat: tin khách, hoặc trọn kết quả 1 lượt agent. */
type ThreadItem =
  | { kind: 'customer'; content: string }
  | { kind: 'agent'; result: SimulateResult };

const accounts = ref<AccountOption[]>([]);
const zaloAccountId = ref('');
const threadType = ref<'user' | 'group'>('user');
const senderName = ref('');
const mentionsNick = ref(true);
const mentionsAll = ref(false);
const replyToNick = ref(false);

const turns = ref<ThreadItem[]>([]);
const draft = ref('');
const busy = ref(false);
const error = ref('');
const scroller = ref<HTMLElement | null>(null);

const threadLabel = computed(() => (threadType.value === 'group' ? 'tin nhóm' : 'tin 1-1'));

/** Cổng bị bỏ qua — lấy từ lượt gần nhất để không hardcode lại ở frontend. */
const skippedGates = computed<string[]>(() => {
  for (let i = turns.value.length - 1; i >= 0; i--) {
    const t = turns.value[i];
    if (t.kind === 'agent') return t.result.skippedGates ?? [];
  }
  return [];
});

const SCOPE_LABELS: Record<string, string> = {
  contact: 'gán riêng cho 1 khách',
  group: 'gán riêng cho 1 nhóm',
  account_group: 'mặc định nhóm của nick',
  account_dm: 'mặc định tin 1-1 của nick',
};
function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}

const SKIP_LABELS: Record<string, string> = {
  no_binding: 'Nick chưa gán agent cho loại hội thoại này',
  org_disabled: 'AI toàn tổ chức đang tắt (Cài đặt → API & Webhook → Cấu hình AI)',
  agent_disabled: 'Agent đang tắt',
  binding_disabled: 'Binding đang tắt',
  not_inbound: 'Không phải tin đến của khách',
  internal_nick: 'Người gửi là nick nội bộ',
  unsupported_type: 'Không phải tin văn bản',
  noise: 'Tin rác (khớp regex bỏ qua)',
  not_mentioned: 'Nhóm không nhắc tên / không trúng từ khoá',
  handoff_keyword: 'Khách xin gặp nhân viên',
  no_api_key: 'Chưa cấu hình API key OpenRouter',
  chat_disabled: 'Nick đang ở chế độ CHỈ NHẬN (đã tắt gửi tin)',
};
function skipReasonLabel(r: string | null): string {
  if (!r) return 'không rõ';
  return SKIP_LABELS[r] ?? r;
}

async function scrollToEnd(): Promise<void> {
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
}

/** Lịch sử gửi lên server — chỉ các lượt agent ĐÃ thực sự trả lời mới tính. */
function buildHistory(): SimulateTurn[] {
  const history: SimulateTurn[] = [];
  for (const t of turns.value) {
    if (t.kind === 'customer') {
      history.push({ role: 'customer', content: t.content, senderName: senderName.value || null });
    } else if (t.result.reply && !t.result.reply.handoff && t.result.reply.text) {
      history.push({ role: 'agent', content: t.result.reply.text });
    }
  }
  return history;
}

async function send(): Promise<void> {
  const text = draft.value.trim();
  if (!text || !zaloAccountId.value || busy.value) return;

  error.value = '';
  const history = buildHistory();
  turns.value.push({ kind: 'customer', content: text });
  draft.value = '';
  busy.value = true;
  await scrollToEnd();

  try {
    const result = await simulateAgentTurn({
      zaloAccountId: zaloAccountId.value,
      threadType: threadType.value,
      text,
      history,
      senderName: senderName.value || null,
      mentionsNick: mentionsNick.value,
      mentionsAll: mentionsAll.value,
      replyToNick: replyToNick.value,
    });
    turns.value.push({ kind: 'agent', result });
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Lỗi mô phỏng';
  } finally {
    busy.value = false;
    await scrollToEnd();
  }
}

function reset(): void {
  turns.value = [];
  error.value = '';
}

onMounted(async () => {
  try {
    const { data } = await api.get('/zalo-accounts/enriched');
    accounts.value = (Array.isArray(data) ? data : []).map((a: any) => ({
      id: a.id,
      displayName: a.displayName ?? null,
      phone: a.phone ?? null,
    }));
    if (accounts.value.length === 1) zaloAccountId.value = accounts.value[0].id;
  } catch {
    error.value = 'Không tải được danh sách nick Zalo';
  }
});
</script>

<style scoped>
.sim { display: flex; flex-direction: column; gap: 10px; height: 100%; }

.sim-bar { display: flex; gap: 12px; flex-wrap: wrap; }
.sim-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #475569; }
.sim-field select, .sim-field input {
  padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; min-width: 180px;
}

.sim-flags { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: #475569; }
.sim-flags label { display: flex; align-items: center; gap: 5px; cursor: pointer; }

.sim-alert { padding: 8px 10px; border-radius: 6px; font-size: 13px; }
.sim-alert.err { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }

.sim-thread {
  flex: 1; min-height: 320px; max-height: 52vh; overflow-y: auto;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;
  display: flex; flex-direction: column; gap: 10px;
}
.sim-empty { font-size: 13px; color: #94a3b8; margin: auto; text-align: center; max-width: 380px; }

.sim-msg { display: flex; }
.sim-msg.customer { justify-content: flex-start; }
.sim-msg.agent { justify-content: flex-end; }
.sim-bubble {
  max-width: 78%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5;
  white-space: pre-wrap; word-break: break-word; background: #fff; border: 1px solid #e2e8f0;
}
.sim-msg.agent .sim-bubble { background: #3b82f6; border-color: #3b82f6; color: #fff; }
.sim-msg.agent .sim-bubble.handoff { background: #fffbeb; border-color: #fde68a; color: #92400e; }
.sim-bubble.typing { background: #e2e8f0; border-color: #e2e8f0; color: #475569; }

.sim-turn { display: flex; flex-direction: column; gap: 6px; }
.sim-trace {
  background: #fff; border: 1px solid #e2e8f0; border-left: 3px solid #94a3b8;
  border-radius: 6px; padding: 6px 10px; font-size: 12px;
}
.sim-trace-row { display: flex; gap: 8px; align-items: baseline; padding: 2px 0; }
.sim-step { color: #64748b; min-width: 108px; flex-shrink: 0; }
.sim-ok { color: #15803d; }
.sim-bad { color: #b91c1c; }
.sim-warn-tag {
  margin-left: 6px; padding: 0 6px; border-radius: 4px;
  background: #fef3c7; color: #92400e; font-size: 11px;
}

.sim-meta { font-size: 11px; color: #94a3b8; text-align: right; }
.sim-details { font-size: 12px; }
.sim-details summary { cursor: pointer; color: #64748b; }
.sim-chunk { margin: 6px 0; padding: 6px 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; }
.sim-chunk p { margin: 4px 0 0; color: #475569; white-space: pre-wrap; }
.sim-hint { color: #64748b; margin: 6px 0 0; }
.sim-pre {
  margin: 6px 0 0; padding: 8px; background: #0f172a; color: #e2e8f0; border-radius: 6px;
  font-size: 11px; line-height: 1.5; max-height: 260px; overflow: auto; white-space: pre-wrap;
}

.sim-input { display: flex; gap: 8px; }
.sim-input input {
  flex: 1; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;
}
.sim-btn {
  padding: 8px 14px; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px;
  font-size: 13px; cursor: pointer;
}
.sim-btn.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; font-weight: 600; }
.sim-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.sim-note { font-size: 11px; color: #94a3b8; margin: 0; }
</style>
