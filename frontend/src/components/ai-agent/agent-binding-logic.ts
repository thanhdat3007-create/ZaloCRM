// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * agent-binding-logic.ts — LOGIC THUẦN cho khối "gán agent theo từng nhóm" trong
 * AgentBindingDialog (tách khỏi Vue để unit-test).
 *
 * Mô hình: mỗi nhóm của nick có MỘT ô chọn agent riêng. Nhóm 1 giao agent A, nhóm 2 giao
 * agent B, nhóm 3 để "theo mặc định của nick" — tất cả trong một lần lưu. Ràng buộc "mỗi
 * nhóm đúng một agent" (index unique nick+nhóm ở DB) trở thành hiển nhiên trên giao diện,
 * không cần cảnh báo chuyển chủ nữa: đổi ô chọn CHÍNH LÀ hành động chuyển.
 *
 * Các hàm dưới đây THUẦN (không Vue, không API, không DOM).
 */
import type { AiAgentBinding } from '@/api/ai-agent';

/** Nhóm Zalo thô từ API — tên nằm ở `name` hoặc `groupName` tuỳ nguồn. */
export interface RawGroup {
  id: string;
  name?: string;
  groupName?: string;
}

export interface GroupOption {
  id: string;
  name: string;
}

/** groupId → agentId. Thiếu key hoặc giá trị rỗng = "theo mặc định của nick". */
export type GroupAgentMap = Record<string, string>;

export function buildGroupOptions(groups: RawGroup[]): GroupOption[] {
  // Thiếu tên thì hiện mã thô còn hơn hiện ô trống — người dùng vẫn đối chiếu được.
  return groups.map((g) => ({ id: g.id, name: g.name || g.groupName || g.id }));
}

/**
 * Dựng bảng "nhóm nào đang giao agent nào" từ binding đã lưu.
 * Chỉ xét scope 'group' — 'account_group' là mặc định của nick, không phải chủ của một
 * nhóm cụ thể; tính nhầm thì mọi nhóm sẽ hiện như đã gán riêng.
 */
export function buildGroupAgentMap(bindings: AiAgentBinding[]): GroupAgentMap {
  const map: GroupAgentMap = {};
  for (const b of bindings) {
    if (b.scope === 'group' && b.targetThreadId) map[b.targetThreadId] = b.agentId;
  }
  return map;
}

export interface AgentGroupSync {
  agentId: string;
  /** Danh sách nhóm agent này phụ trách SAU khi lưu. Rỗng = gỡ hết nhóm của agent này. */
  groupIds: string[];
}

/**
 * Lên danh sách lệnh lưu: mỗi agent một lệnh `bulkBindGroups(replaceMissing: true)`.
 *
 * Phải gồm cả agent bị gỡ sạch nhóm (`groupIds: []`), nếu không nhóm cũ của họ sẽ nằm lại
 * trong DB: `replaceMissing` chỉ dọn theo agentId, không agent nào gọi thì không ai dọn.
 * Đó là cách một nhóm "đã chuyển sang agent khác" trên giao diện nhưng thực tế vẫn do
 * agent cũ trả lời.
 *
 * Chỉ trả về agent thực sự có thay đổi — không đụng vào agent mà người dùng không sửa gì.
 */
export function planGroupSync(current: GroupAgentMap, original: GroupAgentMap): AgentGroupSync[] {
  const changed = new Set<string>();
  for (const groupId of new Set([...Object.keys(current), ...Object.keys(original)])) {
    const before = original[groupId] || '';
    const after = current[groupId] || '';
    if (before === after) continue;
    // Cả chủ cũ lẫn chủ mới đều cần gọi lại: chủ mới để nhận, chủ cũ để dọn.
    if (before) changed.add(before);
    if (after) changed.add(after);
  }

  return [...changed].map((agentId) => ({
    agentId,
    groupIds: Object.entries(current)
      .filter(([, id]) => id === agentId)
      .map(([groupId]) => groupId),
  }));
}

/**
 * Khối quy tắc lên tiếng (mention/từ khoá) có còn hiệu lực không — dùng chung cho nhóm mặc
 * định lẫn nhóm gán riêng, nên chỉ cần MỘT bên đang bật là còn tác dụng. Làm mờ khi cả hai
 * đều tắt để khỏi ai chỉnh một khối không ảnh hưởng gì.
 */
export function isTriggerRulesActive(input: {
  defaultAgentId: string;
  defaultEnabled: boolean;
  /** Có ít nhất một nhóm được giao agent riêng. */
  hasSpecificGroups: boolean;
  specificEnabled: boolean;
}): boolean {
  const byDefault = !!input.defaultAgentId && input.defaultEnabled;
  const bySpecific = input.hasSpecificGroups && input.specificEnabled;
  return byDefault || bySpecific;
}
