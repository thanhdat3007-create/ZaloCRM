<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Rocket Team -->
<!--
  AiPauseControl.vue — nút tạm dừng AI chăm sóc tự động cho 1 hội thoại (2026-08-03).

  Sale cần chen ngang khi đang xử lý ca khó. Trạng thái lưu ở Redis (TTL), không
  đụng DB — xem backend conversation-pause-store.ts.
-->
<template>
  <div class="ap-wrap">
    <button
      class="ap-btn"
      :class="{ paused: !!pauseReason }"
      :disabled="busy"
      :title="pauseReason === 'handoff'
        ? 'AI đã tự dừng và báo bạn hỗ trợ — bấm để cho AI chạy lại'
        : pauseReason
          ? 'AI đang tạm dừng ở hội thoại này — bấm để bật lại'
          : 'Tạm dừng AI trả lời tự động ở hội thoại này'"
      @click="toggleMenu"
    >
      {{ pauseReason ? '🤖 AI đang dừng' : '🤖 AI đang chạy' }}
    </button>

    <div v-if="menuOpen" class="ap-menu">
      <template v-if="pauseReason">
        <button @click="resume">▶ Cho AI chạy lại</button>
      </template>
      <template v-else>
        <button @click="pause(15)">⏸ Dừng 15 phút</button>
        <button @click="pause(60)">⏸ Dừng 1 giờ</button>
        <button @click="pause(null)">⏸ Dừng tới khi bật lại</button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import {
  getConversationPause,
  pauseConversationAi,
  resumeConversationAi,
} from '@/api/ai-agent';

const props = defineProps<{ conversationId: string }>();

const pauseReason = ref<string | null>(null);
const menuOpen = ref(false);
const busy = ref(false);

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
}

async function refresh(): Promise<void> {
  if (!props.conversationId) return;
  // Không có agent nào gán / route lỗi → coi như không tạm dừng, đừng làm hỏng header.
  pauseReason.value = await getConversationPause(props.conversationId).catch(() => null);
}

async function pause(minutes: number | null): Promise<void> {
  busy.value = true;
  try {
    await pauseConversationAi(props.conversationId, minutes);
    await refresh();
    menuOpen.value = false;
  } finally {
    busy.value = false;
  }
}

async function resume(): Promise<void> {
  busy.value = true;
  try {
    await resumeConversationAi(props.conversationId);
    await refresh();
    menuOpen.value = false;
  } finally {
    busy.value = false;
  }
}

watch(() => props.conversationId, () => {
  menuOpen.value = false;
  void refresh();
});
onMounted(refresh);
</script>

<style scoped>
.ap-wrap { position: relative; display: inline-block; }
.ap-btn {
  padding: 3px 9px;
  border-radius: 12px;
  border: 1px solid rgba(20, 184, 166, 0.45);
  background: #f0fdfa;
  color: #115e59;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.ap-btn.paused {
  border-color: rgba(217, 119, 6, 0.45);
  background: #fffbeb;
  color: #92400e;
}
.ap-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.ap-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 40;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  min-width: 190px;
  overflow: hidden;
}
.ap-menu button {
  padding: 8px 12px;
  border: none;
  background: none;
  text-align: left;
  font-size: 12px;
  cursor: pointer;
  color: #334155;
}
.ap-menu button:hover { background: #f1f5f9; }
</style>
