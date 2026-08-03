<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  AgentBindingDialog.vue — gán AI agent cho 1 nick Zalo (2026-08-03).

  2 chế độ:
    - mode="account": cấu hình mặc định của nick (tin 1-1 + mọi nhóm).
    - mode="group":   cấu hình riêng cho 1 nhóm cụ thể, đè lên mặc định của nick.
                      "Theo mặc định của nick" = xoá binding riêng.
-->
<template>
  <div class="bd-overlay" @click.self="$emit('close')">
    <div class="bd-dialog">
      <header class="bd-header">
        <h3>🤖 AI tự động — {{ accountLabel }}</h3>
        <button class="bd-close" @click="$emit('close')">✕</button>
      </header>

      <div class="bd-body">
        <div v-if="loading" class="bd-empty">⏳ Đang tải…</div>
        <div v-else-if="agents.length === 0" class="bd-alert warn">
          Chưa có agent nào. Tạo trước ở
          <RouterLink to="/settings/crm/ai-agents">AI chăm sóc tự động</RouterLink>.
        </div>

        <template v-else>
          <!-- Tin nhắn cá nhân (chỉ ở chế độ nick) -->
          <fieldset v-if="mode === 'account'" class="bd-group">
            <legend>Tin nhắn cá nhân (1-1)</legend>
            <label class="bd-field">
              <span>Agent phụ trách</span>
              <select v-model="dm.agentId">
                <option value="">— Không dùng AI —</option>
                <option v-for="a in agents" :key="a.id" :value="a.id">
                  {{ a.name }}{{ a.enabled ? '' : ' (đang tắt)' }}
                </option>
              </select>
            </label>
            <label class="bd-check">
              <input type="checkbox" v-model="dm.enabled" :disabled="!dm.agentId" />
              <span>Bật trả lời tự động cho tin 1-1</span>
            </label>
          </fieldset>

          <!-- Nhóm -->
          <fieldset class="bd-group">
            <legend>{{ mode === 'group' ? `Nhóm: ${groupLabel}` : 'Tin nhắn nhóm (mặc định cho mọi nhóm)' }}</legend>

            <label v-if="mode === 'group'" class="bd-check">
              <input type="checkbox" v-model="useAccountDefault" />
              <span>Theo mặc định của nick (xoá cấu hình riêng của nhóm này)</span>
            </label>

            <template v-if="!(mode === 'group' && useAccountDefault)">
              <label class="bd-field">
                <span>Agent phụ trách</span>
                <select v-model="grp.agentId">
                  <option value="">— Không dùng AI —</option>
                  <option v-for="a in agents" :key="a.id" :value="a.id">
                    {{ a.name }}{{ a.enabled ? '' : ' (đang tắt)' }}
                  </option>
                </select>
              </label>
              <label class="bd-check">
                <input type="checkbox" v-model="grp.enabled" :disabled="!grp.agentId" />
                <span>Bật trả lời tự động trong nhóm</span>
              </label>

              <!-- Gán riêng theo nhóm — chỉ ở chế độ nick. Đè lên mặc định phía trên
                   (binding scope 'group' được resolver ưu tiên hơn 'account_group'). -->
              <div v-if="mode === 'account'" class="bd-specific">
                <label class="bd-check">
                  <input type="checkbox" v-model="useSpecific" @change="onToggleSpecific" />
                  <span><b>Giao agent riêng cho từng nhóm</b> (đè lên mặc định ở trên)</span>
                </label>

                <template v-if="useSpecific">
                  <div v-if="groupsLoading" class="bd-empty">⏳ Đang tải danh sách nhóm…</div>
                  <div v-else-if="groupOptions.length === 0" class="bd-hint">
                    Nick này chưa có nhóm nào được đồng bộ.
                  </div>
                  <!-- Mỗi nhóm một ô chọn riêng: nhóm 1 giao agent A, nhóm 2 giao agent B,
                       lưu một lần. Đổi ô chọn CHÍNH LÀ chuyển nhóm sang agent khác — một
                       nhóm chỉ thuộc đúng một agent. -->
                  <template v-else>
                    <div class="bd-search-row">
                      <input
                        v-model="groupSearchQuery"
                        type="text"
                        class="bd-search-input"
                        placeholder="🔍 Tìm kiếm nhóm Zalo..."
                      />
                      <button
                        v-if="groupSearchQuery"
                        type="button"
                        class="bd-search-clear"
                        @click="groupSearchQuery = ''"
                        title="Xoá tìm kiếm"
                      >
                        ✕
                      </button>
                    </div>

                    <div v-if="filteredGroupOptions.length === 0" class="bd-hint bd-no-result">
                      Không tìm thấy nhóm nào khớp với "{{ groupSearchQuery }}".
                    </div>
                    <div v-else class="bd-grouplist">
                      <div v-for="g in filteredGroupOptions" :key="g.id" class="bd-grouprow">
                        <span class="bd-groupname" :title="g.name">{{ g.name }}</span>
                        <select v-model="groupAgentMap[g.id]">
                          <option value="">— theo mặc định của nick —</option>
                          <option v-for="a in agents" :key="a.id" :value="a.id">
                            {{ a.name }}{{ a.enabled ? '' : ' (đang tắt)' }}
                          </option>
                        </select>
                      </div>
                    </div>
                  </template>

                  <label v-if="groupOptions.length > 0" class="bd-check">
                    <input type="checkbox" v-model="specificEnabled" :disabled="!hasSpecificGroups" />
                    <span>Bật trả lời tự động cho các nhóm đã giao agent riêng</span>
                  </label>
                </template>
              </div>

              <div class="bd-sub" :class="{ dim: !triggerRulesActive }">
                <div class="bd-label">Agent chỉ lên tiếng khi:</div>
                <label class="bd-radio">
                  <input type="radio" value="mention" v-model="grp.groupTriggerMode" />
                  <span>Có người @nhắc tên nick (hoặc trả lời tin của nick)</span>
                </label>
                <label class="bd-radio">
                  <input type="radio" value="keyword" v-model="grp.groupTriggerMode" />
                  <span>Tin trúng từ khoá bên dưới</span>
                </label>
                <label class="bd-radio">
                  <input type="radio" value="mention_or_keyword" v-model="grp.groupTriggerMode" />
                  <span>Một trong hai</span>
                </label>

                <label class="bd-field">
                  <span>Từ khoá kích hoạt (mỗi dòng 1 từ khoá, không phân biệt dấu)</span>
                  <textarea v-model="keywordsText" rows="3" placeholder="báo giá&#10;tư vấn" />
                </label>

                <label class="bd-check">
                  <input type="checkbox" v-model="grp.replyToAllMention" />
                  <span>Tính cả @all (cẩn thận: nhóm đông sẽ kích hoạt liên tục)</span>
                </label>
              </div>
            </template>
          </fieldset>

          <p class="bd-hint">
            Nhóm mặc định IM LẶNG — agent không tự chen vào cuộc trò chuyện, chỉ trả lời khi được gọi đúng
            theo quy tắc trên. Quy tắc lên tiếng dùng chung cho cả nhóm mặc định lẫn nhóm gán riêng.
          </p>
        </template>

        <div v-if="error" class="bd-alert err">{{ error }}</div>
      </div>

      <footer class="bd-footer">
        <button class="bd-btn" @click="$emit('close')" :disabled="saving">Huỷ</button>
        <button class="bd-btn primary" @click="save" :disabled="saving || loading">
          {{ saving ? '⏳ Đang lưu…' : '💾 Lưu' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import {
  listAgents,
  listBindings,
  upsertBinding,
  deleteBinding,
  bulkBindGroups,
  type AiAgent,
  type AiAgentBinding,
  type BindingScope,
  type GroupTriggerMode,
} from '@/api/ai-agent';
import { useGroups } from '@/composables/use-groups';
import {
  buildGroupOptions,
  buildGroupAgentMap,
  planGroupSync,
  isTriggerRulesActive,
  type GroupAgentMap,
  type RawGroup,
} from './agent-binding-logic';

const props = defineProps<{
  zaloAccountId: string;
  accountLabel: string;
  /** 'account' = cấu hình mặc định của nick; 'group' = 1 nhóm cụ thể. */
  mode: 'account' | 'group';
  /** Bắt buộc khi mode='group': Conversation.externalThreadId của nhóm. */
  groupThreadId?: string;
  groupLabel?: string;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

interface BindingForm {
  agentId: string;
  enabled: boolean;
  groupTriggerMode: GroupTriggerMode;
  replyToAllMention: boolean;
  existingId: string | null;
}

function emptyForm(): BindingForm {
  return {
    agentId: '',
    enabled: true,
    groupTriggerMode: 'mention_or_keyword',
    replyToAllMention: false,
    existingId: null,
  };
}

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const agents = ref<AiAgent[]>([]);
const dm = ref<BindingForm>(emptyForm());
const grp = ref<BindingForm>(emptyForm());
const keywordsText = ref('');
const useAccountDefault = ref(false);

// ── Giao agent riêng theo từng nhóm (chỉ chế độ nick) ───────────────────────
const useSpecific = ref(false);
const specificEnabled = ref(true);
/** groupId → agentId đang chọn trên giao diện. '' = theo mặc định của nick. */
const groupAgentMap = ref<GroupAgentMap>({});
/** Ảnh chụp lúc mở dialog — so với bản hiện tại để biết agent nào cần gọi lưu lại. */
const originalGroupAgentMap = ref<GroupAgentMap>({});
const { groups: rawGroups, fetchGroups, loading: groupsLoading } = useGroups();
let groupsLoaded = false;

const groupSearchQuery = ref('');

const groupOptions = computed(() => buildGroupOptions(rawGroups.value as RawGroup[]));

const filteredGroupOptions = computed(() => {
  const q = groupSearchQuery.value.trim().toLowerCase();
  if (!q) return groupOptions.value;
  return groupOptions.value.filter((g) => g.name.toLowerCase().includes(q));
});

const hasSpecificGroups = computed(() => Object.values(groupAgentMap.value).some(Boolean));

/** Quy tắc lên tiếng dùng chung — còn hiệu lực khi ít nhất một bên có agent đang bật. */
const triggerRulesActive = computed(() =>
  isTriggerRulesActive({
    defaultAgentId: grp.value.agentId,
    defaultEnabled: grp.value.enabled,
    hasSpecificGroups: useSpecific.value && hasSpecificGroups.value,
    specificEnabled: specificEnabled.value,
  }),
);

/** Ô chọn của nhóm chưa có trong map sẽ là undefined → v-model không hiện "theo mặc định". */
function ensureGroupMapKeys(): void {
  for (const g of groupOptions.value) {
    if (groupAgentMap.value[g.id] === undefined) groupAgentMap.value[g.id] = '';
  }
}

async function loadGroupsOnce(): Promise<void> {
  // Tải danh sách nhóm lần đầu cần tới — không tải sẵn lúc mount để dialog bật nhanh.
  if (groupsLoaded) return;
  groupsLoaded = true;
  await fetchGroups(props.zaloAccountId);
  ensureGroupMapKeys();
}

async function onToggleSpecific(): Promise<void> {
  if (!useSpecific.value) return;
  await loadGroupsOnce();
}

/** Scope của khối "nhóm" khác nhau giữa 2 chế độ. */
const groupScope = computed<BindingScope>(() => (props.mode === 'group' ? 'group' : 'account_group'));
const groupTarget = computed(() => (props.mode === 'group' ? props.groupThreadId ?? null : null));

function fill(form: BindingForm, binding: AiAgentBinding | undefined): void {
  if (!binding) return;
  form.agentId = binding.agentId;
  form.enabled = binding.enabled;
  form.groupTriggerMode = binding.groupTriggerMode;
  form.replyToAllMention = binding.replyToAllMention;
  form.existingId = binding.id;
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [agentList, bindings] = await Promise.all([
      listAgents(),
      listBindings({ zaloAccountId: props.zaloAccountId }),
    ]);
    agents.value = agentList;

    fill(dm.value, bindings.find((b) => b.scope === 'account_dm'));

    if (props.mode === 'account') {
      const map = buildGroupAgentMap(bindings);
      groupAgentMap.value = { ...map };
      originalGroupAgentMap.value = { ...map };
      // Nick đã có nhóm giao riêng → mở sẵn khối để người dùng thấy ngay, khỏi phải đoán.
      if (Object.keys(map).length > 0) {
        useSpecific.value = true;
        specificEnabled.value = bindings.find((b) => b.scope === 'group')?.enabled ?? true;
        await loadGroupsOnce();
      }
    }

    const groupBinding = bindings.find(
      (b) => b.scope === groupScope.value && (b.targetThreadId ?? null) === groupTarget.value,
    );
    fill(grp.value, groupBinding);
    keywordsText.value = (groupBinding?.triggerKeywords ?? []).join('\n');
    // Nhóm chưa có cấu hình riêng → mặc định "theo nick".
    useAccountDefault.value = props.mode === 'group' && !groupBinding;
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Lỗi tải cấu hình';
  } finally {
    loading.value = false;
  }
}

async function persist(form: BindingForm, scope: BindingScope, targetThreadId: string | null): Promise<void> {
  // Bỏ chọn agent = gỡ cấu hình gán (không giữ binding "mồ côi" trỏ agent cũ).
  if (!form.agentId) {
    if (form.existingId) await deleteBinding(form.existingId);
    return;
  }
  await upsertBinding({
    agentId: form.agentId,
    zaloAccountId: props.zaloAccountId,
    scope,
    targetThreadId,
    enabled: form.enabled,
    groupTriggerMode: form.groupTriggerMode,
    triggerKeywords: keywordsText.value.split('\n').map((s) => s.trim()).filter(Boolean),
    replyToAllMention: form.replyToAllMention,
  });
}

/**
 * Lưu phần giao agent theo từng nhóm: mỗi agent có thay đổi được gọi một lệnh bulk với
 * `replaceMissing` (backend chỉ dọn binding CỦA CHÍNH agent đó). Agent bị gỡ sạch nhóm vẫn
 * phải gọi với danh sách rỗng, nếu không nhóm cũ nằm lại DB và agent cũ vẫn trả lời.
 *
 * Không mở khối → không đụng gì, tránh xoá nhầm cấu hình người khác vừa đặt.
 */
async function persistSpecificGroups(): Promise<void> {
  if (!useSpecific.value) return;
  const plan = planGroupSync(groupAgentMap.value, originalGroupAgentMap.value);
  const triggerKeywords = keywordsText.value.split('\n').map((s) => s.trim()).filter(Boolean);

  // Tuần tự chứ không song song: cùng ghi vào bảng binding của một nick, chạy song song
  // dễ chạm nhau ở index unique khi một nhóm đổi chủ giữa 2 agent.
  for (const item of plan) {
    await bulkBindGroups({
      agentId: item.agentId,
      zaloAccountId: props.zaloAccountId,
      scope: 'group',
      targetThreadIds: item.groupIds,
      enabled: specificEnabled.value,
      groupTriggerMode: grp.value.groupTriggerMode,
      triggerKeywords,
      replyToAllMention: grp.value.replyToAllMention,
      replaceMissing: true,
    });
  }
  originalGroupAgentMap.value = { ...groupAgentMap.value };
}

async function save(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    if (props.mode === 'account') {
      await persist(dm.value, 'account_dm', null);
      await persist(grp.value, 'account_group', null);
      await persistSpecificGroups();
    } else if (useAccountDefault.value) {
      if (grp.value.existingId) await deleteBinding(grp.value.existingId);
    } else {
      if (!props.groupThreadId) {
        error.value = 'Nhóm này chưa có mã hội thoại Zalo — không gán được agent riêng.';
        return;
      }
      await persist(grp.value, 'group', props.groupThreadId);
    }
    emit('saved');
    emit('close');
  } catch (e: any) {
    error.value = e?.response?.data?.error || e?.message || 'Lỗi lưu cấu hình';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.bd-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center; z-index: 1200;
}
.bd-dialog {
  background: #fff; border-radius: 8px; width: 60vw; min-width: 560px; max-width: 92vw;
  max-height: 88vh; display: flex; flex-direction: column;
}
.bd-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid #e2e8f0;
}
.bd-header h3 { margin: 0; font-size: 14px; font-weight: 600; }
.bd-close { background: none; border: none; font-size: 16px; cursor: pointer; color: #64748b; }
.bd-body { padding: 16px; overflow: auto; display: flex; flex-direction: column; gap: 14px; }
.bd-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 16px; border-top: 1px solid #e2e8f0;
}
.bd-group { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.bd-group legend { font-size: 12px; font-weight: 600; padding: 0 6px; color: #334155; }
.bd-field { display: flex; flex-direction: column; gap: 4px; }
.bd-field > span { font-size: 12px; font-weight: 600; color: #1f2937; }
.bd-field select, .bd-field textarea {
  padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; width: 100%;
}
.bd-check, .bd-radio { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.bd-sub {
  border-left: 2px solid #e2e8f0; padding-left: 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.bd-sub.dim { opacity: 0.5; pointer-events: none; }
.bd-specific {
  border-top: 1px dashed #e2e8f0; padding-top: 10px;
  display: flex; flex-direction: column; gap: 8px;
}
.bd-search-row {
  position: relative;
  display: flex;
  align-items: center;
}
.bd-search-input {
  width: 100%;
  padding: 6px 28px 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 12px;
  outline: none;
  background: #f8fafc;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.bd-search-input:focus {
  border-color: #3b82f6;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}
.bd-search-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  font-size: 12px;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px 4px;
}
.bd-search-clear:hover {
  color: #475569;
}
.bd-no-result {
  padding: 12px;
  text-align: center;
  color: #64748b;
  font-size: 12px;
}
.bd-grouplist {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bd-grouplist::-webkit-scrollbar {
  width: 6px;
}
.bd-grouplist::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}
.bd-grouplist::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.bd-grouplist::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
.bd-grouprow { display: flex; align-items: center; gap: 8px; }
.bd-groupname {
  flex: 1; min-width: 0; font-size: 13px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bd-grouprow select {
  flex: 0 0 240px; padding: 5px 8px; border: 1px solid #e2e8f0;
  border-radius: 6px; font-size: 12px;
}
.bd-label { font-size: 12px; font-weight: 600; color: #1f2937; }
.bd-hint { font-size: 11px; color: #64748b; margin: 0; }
.bd-empty { padding: 16px; text-align: center; color: #94a3b8; font-size: 13px; }
.bd-alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; }
.bd-alert.err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
.bd-alert.warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.bd-btn {
  padding: 7px 14px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff;
  font-size: 13px; cursor: pointer; color: #334155;
}
.bd-btn.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; font-weight: 600; }
.bd-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
