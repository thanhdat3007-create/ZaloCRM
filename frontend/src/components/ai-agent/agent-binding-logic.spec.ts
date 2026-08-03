// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
import { describe, it, expect } from 'vitest';
import {
  buildGroupOptions,
  buildGroupAgentMap,
  planGroupSync,
  isTriggerRulesActive,
} from './agent-binding-logic';
import type { AiAgentBinding } from '@/api/ai-agent';

function binding(over: Partial<AiAgentBinding>): AiAgentBinding {
  return {
    id: 'b-1',
    orgId: 'org-1',
    agentId: 'agent-A',
    zaloAccountId: 'za-1',
    scope: 'group',
    targetThreadId: null,
    enabled: true,
    groupTriggerMode: 'mention_or_keyword',
    triggerKeywords: [],
    replyToAllMention: false,
    ...over,
  };
}

/** Sắp xếp để so sánh không phụ thuộc thứ tự duyệt Set. */
function sortPlan(plan: Array<{ agentId: string; groupIds: string[] }>) {
  return plan
    .map((p) => ({ agentId: p.agentId, groupIds: [...p.groupIds].sort() }))
    .sort((a, b) => a.agentId.localeCompare(b.agentId));
}

describe('buildGroupOptions', () => {
  it('thiếu name thì lấy groupName, thiếu cả hai thì hiện mã thô', () => {
    const out = buildGroupOptions([
      { id: 'g1', name: 'Nhóm 1' },
      { id: 'g2', groupName: 'Tên phụ' },
      { id: 'g3' },
    ]);
    expect(out).toEqual([
      { id: 'g1', name: 'Nhóm 1' },
      { id: 'g2', name: 'Tên phụ' },
      { id: 'g3', name: 'g3' },
    ]);
  });
});

describe('buildGroupAgentMap', () => {
  it('mỗi nhóm map tới agent đang phụ trách', () => {
    const map = buildGroupAgentMap([
      binding({ targetThreadId: 'g1', agentId: 'agent-A' }),
      binding({ targetThreadId: 'g2', agentId: 'agent-B' }),
    ]);
    expect(map).toEqual({ g1: 'agent-A', g2: 'agent-B' });
  });

  // account_group là mặc định của NICK. Tính nhầm thì mọi nhóm hiện như đã giao riêng,
  // và bấm Lưu sẽ đẻ ra binding scope 'group' cho từng nhóm mà người dùng không hề chọn.
  it('bỏ qua account_group và account_dm', () => {
    const map = buildGroupAgentMap([
      binding({ scope: 'account_group', targetThreadId: null }),
      binding({ scope: 'account_dm', targetThreadId: null }),
    ]);
    expect(map).toEqual({});
  });

  it('bỏ qua binding scope group thiếu targetThreadId (dữ liệu hỏng)', () => {
    expect(buildGroupAgentMap([binding({ scope: 'group', targetThreadId: null })])).toEqual({});
  });
});

describe('planGroupSync', () => {
  it('không đổi gì → không gọi lưu agent nào', () => {
    expect(planGroupSync({ g1: 'agent-A' }, { g1: 'agent-A' })).toEqual([]);
  });

  it('giao nhóm mới cho 1 agent → chỉ agent đó cần lưu', () => {
    expect(sortPlan(planGroupSync({ g1: 'agent-A' }, {}))).toEqual([
      { agentId: 'agent-A', groupIds: ['g1'] },
    ]);
  });

  // Ca chính người dùng cần: 1 nick, nhóm 1 giao agent A, nhóm 2 giao agent B, một lần lưu.
  it('mỗi nhóm một agent khác nhau → mỗi agent một lệnh lưu riêng', () => {
    expect(sortPlan(planGroupSync({ g1: 'agent-A', g2: 'agent-B' }, {}))).toEqual([
      { agentId: 'agent-A', groupIds: ['g1'] },
      { agentId: 'agent-B', groupIds: ['g2'] },
    ]);
  });

  // Chủ CŨ phải được gọi lại với danh sách mới, nếu không replaceMissing không ai chạy cho
  // agent đó và binding cũ nằm lại DB → giao diện nói nhóm đã chuyển, thực tế agent cũ vẫn trả lời.
  it('chuyển nhóm từ agent này sang agent khác → gọi lưu CẢ chủ cũ lẫn chủ mới', () => {
    expect(sortPlan(planGroupSync({ g1: 'agent-B' }, { g1: 'agent-A' }))).toEqual([
      { agentId: 'agent-A', groupIds: [] },
      { agentId: 'agent-B', groupIds: ['g1'] },
    ]);
  });

  it('trả nhóm về "theo mặc định" → chủ cũ được gọi với danh sách rỗng để dọn', () => {
    expect(sortPlan(planGroupSync({ g1: '' }, { g1: 'agent-A' }))).toEqual([
      { agentId: 'agent-A', groupIds: [] },
    ]);
  });

  it('agent giữ nhóm khác vẫn được gửi đủ danh sách còn lại, không bị gỡ oan', () => {
    const plan = planGroupSync(
      { g1: 'agent-A', g2: 'agent-B', g3: 'agent-A' },
      { g1: 'agent-A', g2: 'agent-A', g3: 'agent-A' },
    );
    expect(sortPlan(plan)).toEqual([
      { agentId: 'agent-A', groupIds: ['g1', 'g3'] },
      { agentId: 'agent-B', groupIds: ['g2'] },
    ]);
  });

  it('nhóm không đụng tới không kéo agent của nó vào danh sách lưu', () => {
    const plan = planGroupSync({ g1: 'agent-A', g2: 'agent-B' }, { g1: 'agent-A' });
    expect(plan.map((p) => p.agentId)).toEqual(['agent-B']);
  });
});

describe('isTriggerRulesActive', () => {
  const base = {
    defaultAgentId: '',
    defaultEnabled: true,
    hasSpecificGroups: false,
    specificEnabled: true,
  };

  it('không bên nào có agent → tắt', () => {
    expect(isTriggerRulesActive(base)).toBe(false);
  });

  it('nhóm mặc định có agent đang bật → còn hiệu lực', () => {
    expect(isTriggerRulesActive({ ...base, defaultAgentId: 'agent-A' })).toBe(true);
  });

  it('nhóm mặc định có agent nhưng tắt → không tính', () => {
    expect(isTriggerRulesActive({ ...base, defaultAgentId: 'agent-A', defaultEnabled: false })).toBe(false);
  });

  // Ca dễ sót: nick không dùng AI cho nhóm mặc định, chỉ giao riêng vài nhóm. Nếu làm mờ
  // khối quy tắc thì không đặt được từ khoá cho chính những nhóm đó.
  it('chỉ có nhóm giao riêng đang bật → vẫn còn hiệu lực', () => {
    expect(isTriggerRulesActive({ ...base, hasSpecificGroups: true })).toBe(true);
  });

  it('có nhóm giao riêng nhưng tắt trả lời → không tính', () => {
    expect(isTriggerRulesActive({ ...base, hasSpecificGroups: true, specificEnabled: false })).toBe(false);
  });
});
