// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Rocket Team
/**
 * ai-agent.ts — API client cho AI chăm sóc khách hàng tự động (2026-08-03).
 */
import { api } from './index';

export interface AiAgent {
  id: string;
  name: string;
  description: string | null;
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
  handoffKeywords: string[];
  skipNoisePattern: string;
  /** Rocket Agent 2026-08-03 — tên profile Hermes khi provider = 'rocket'. null = profile mặc định. */
  rocketProfile: string | null;
  /** Bộ não dự phòng khi bộ não chính lỗi. null = không dùng dự phòng. */
  fallbackProvider: string | null;
  fallbackModel: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { bindings: number; documents: number };
}

export type AgentPayload = Partial<Omit<AiAgent, 'id' | 'createdAt' | 'updatedAt' | '_count'>>;

export interface AiAgentDocument {
  id: string;
  title: string;
  sourceType: string;
  fileName: string | null;
  tokenCount: number;
  enabled: boolean;
  chunkCount: number;
  agentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type BindingScope = 'contact' | 'group' | 'account_group' | 'account_dm';
export type GroupTriggerMode = 'mention' | 'keyword' | 'mention_or_keyword';

export interface AiAgentBinding {
  id: string;
  orgId: string;
  agentId: string;
  zaloAccountId: string;
  scope: BindingScope;
  targetThreadId: string | null;
  enabled: boolean;
  groupTriggerMode: GroupTriggerMode;
  triggerKeywords: string[];
  replyToAllMention: boolean;
  agent?: { id: string; name: string; enabled: boolean };
}

export interface AiAgentRun {
  id: string;
  agentId: string | null;
  conversationId: string;
  status: 'sent' | 'skipped' | 'failed' | 'handoff';
  skipReason: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  replyText: string | null;
  error: string | null;
  createdAt: string;
  agent?: { id: string; name: string } | null;
  /** true = bộ não chính lỗi, lượt này chạy bằng bộ não dự phòng. */
  fallbackUsed: boolean;
}

export interface RetrievedChunk {
  id: string;
  heading: string | null;
  content: string;
  docTitle: string;
  rank?: number;
}

export interface AgentTestResult {
  reply: string;
  handoff: boolean;
  handoffReason: string | null;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  chunkIds: string[];
  chunks: RetrievedChunk[];
  system: string;
}

// ── Agent ───────────────────────────────────────────────────────────────────

export async function listAgents(): Promise<AiAgent[]> {
  const { data } = await api.get('/ai-agents');
  return data.items as AiAgent[];
}

export async function createAgent(payload: AgentPayload): Promise<AiAgent> {
  const { data } = await api.post('/ai-agents', payload);
  return data as AiAgent;
}

export async function updateAgent(id: string, payload: AgentPayload): Promise<AiAgent> {
  const { data } = await api.put(`/ai-agents/${id}`, payload);
  return data as AiAgent;
}

export async function deleteAgent(id: string): Promise<void> {
  await api.delete(`/ai-agents/${id}`);
}

export async function testAgent(id: string, question: string): Promise<AgentTestResult> {
  const { data } = await api.post(`/ai-agents/${id}/test`, { question });
  return data as AgentTestResult;
}

// ── Mô phỏng hội thoại ──────────────────────────────────────────────────────

export interface SimulateTurn {
  role: 'customer' | 'agent';
  content: string;
  senderName?: string | null;
}

export interface SimulatePayload {
  zaloAccountId: string;
  threadType: 'user' | 'group';
  text: string;
  history: SimulateTurn[];
  senderName?: string | null;
  mentionsNick?: boolean;
  mentionsAll?: boolean;
  replyToNick?: boolean;
}

export interface SimulateResult {
  binding: {
    agentId: string;
    agentName: string;
    agentEnabled: boolean;
    scope: string;
    bindingEnabled: boolean;
    groupTriggerMode: string;
    triggerKeywords: string[];
    replyToAllMention: boolean;
  } | null;
  gate: { ok: boolean; reason: string | null };
  reply: {
    text: string;
    handoff: boolean;
    handoffReason: string | null;
    latencyMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
  } | null;
  chunks: Array<{ id: string; heading: string | null; content: string; documentTitle: string }>;
  system: string | null;
  skippedGates: string[];
}

export async function simulateAgentTurn(payload: SimulatePayload): Promise<SimulateResult> {
  const { data } = await api.post('/ai-agents/simulate', payload);
  return data as SimulateResult;
}

export async function getAgentDocumentIds(id: string): Promise<string[]> {
  const { data } = await api.get(`/ai-agents/${id}/documents`);
  return data.documentIds as string[];
}

export async function setAgentDocuments(id: string, documentIds: string[]): Promise<void> {
  await api.put(`/ai-agents/${id}/documents`, { documentIds });
}

// ── Tài liệu ────────────────────────────────────────────────────────────────

export async function listAgentDocuments(): Promise<AiAgentDocument[]> {
  const { data } = await api.get('/ai-agents/documents');
  return data.items as AiAgentDocument[];
}

export async function createAgentDocument(payload: { title: string; content: string }): Promise<void> {
  await api.post('/ai-agents/documents', payload);
}

export async function uploadAgentDocument(file: File, title: string): Promise<void> {
  const form = new FormData();
  form.append('title', title);
  form.append('file', file);
  await api.post('/ai-agents/documents', form);
}

export async function getAgentDocument(id: string): Promise<AiAgentDocument & { content: string }> {
  const { data } = await api.get(`/ai-agents/documents/${id}`);
  return data;
}

export async function updateAgentDocument(
  id: string,
  payload: { title?: string; content?: string; enabled?: boolean },
): Promise<void> {
  await api.put(`/ai-agents/documents/${id}`, payload);
}

export async function deleteAgentDocument(id: string): Promise<void> {
  await api.delete(`/ai-agents/documents/${id}`);
}

export async function previewDocumentSearch(agentId: string, query: string): Promise<RetrievedChunk[]> {
  const { data } = await api.post('/ai-agents/documents/preview-search', { agentId, query });
  return data.items as RetrievedChunk[];
}

// ── Binding ─────────────────────────────────────────────────────────────────

export async function listBindings(filter?: {
  zaloAccountId?: string;
  agentId?: string;
}): Promise<AiAgentBinding[]> {
  const params: Record<string, string> = {};
  if (filter?.zaloAccountId) params.zaloAccountId = filter.zaloAccountId;
  if (filter?.agentId) params.agentId = filter.agentId;
  const { data } = await api.get('/ai-agents/bindings', { params });
  return data.items as AiAgentBinding[];
}

export async function upsertBinding(payload: {
  agentId: string;
  zaloAccountId: string;
  scope: BindingScope;
  targetThreadId?: string | null;
  enabled?: boolean;
  groupTriggerMode?: GroupTriggerMode;
  triggerKeywords?: string[];
  replyToAllMention?: boolean;
}): Promise<AiAgentBinding> {
  const { data } = await api.put('/ai-agents/bindings', payload);
  return data as AiAgentBinding;
}

export async function deleteBinding(id: string): Promise<void> {
  await api.delete(`/ai-agents/bindings/${id}`);
}

/** Gán agent cho nhiều nhóm của 1 nick trong 1 lần gọi (thay N lần upsertBinding). */
export interface BulkBindGroupsPayload {
  agentId: string;
  zaloAccountId: string;
  scope: 'group';
  targetThreadIds: string[];
  enabled?: boolean;
  groupTriggerMode?: GroupTriggerMode;
  triggerKeywords?: string[];
  replyToAllMention?: boolean;
  /** true = gỡ những binding scope='group' của agent+nick này mà KHÔNG có trong targetThreadIds. */
  replaceMissing?: boolean;
}

export interface BulkBindGroupsResult {
  created: number;
  updated: number;
  removed: number;
}

export async function bulkBindGroups(payload: BulkBindGroupsPayload): Promise<BulkBindGroupsResult> {
  const { data } = await api.put('/ai-agents/bindings/bulk', payload);
  return data as BulkBindGroupsResult;
}

// ── Nhật ký + tạm dừng ──────────────────────────────────────────────────────

export async function listRuns(params: {
  agentId?: string;
  conversationId?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
  skip?: number;
  /** Lọc lượt đã dùng bộ não dự phòng — cách duy nhất phát hiện Rocket chết âm thầm. */
  fallbackUsed?: boolean;
} = {}): Promise<{ items: AiAgentRun[]; total: number }> {
  const { data } = await api.get('/ai-agents/runs', { params });
  return data;
}

export async function getConversationPause(conversationId: string): Promise<string | null> {
  const { data } = await api.get(`/ai-agents/conversations/${conversationId}/pause`);
  return data.pausedReason as string | null;
}

/** minutes = null → tạm dừng tới khi bật lại thủ công. */
export async function pauseConversationAi(conversationId: string, minutes: number | null): Promise<void> {
  await api.post(`/ai-agents/conversations/${conversationId}/pause`, { minutes });
}

export async function resumeConversationAi(conversationId: string): Promise<void> {
  await api.delete(`/ai-agents/conversations/${conversationId}/pause`);
}

// ── Model OpenRouter (dùng lại route provider sẵn có) ───────────────────────

export async function listOpenRouterModels(): Promise<Array<{ title: string; value: string }>> {
  const { data } = await api.get('/ai/providers/openrouter/models');
  return (data.models ?? []) as Array<{ title: string; value: string }>;
}

// ── Provider per-org (dùng để cảnh báo thiếu key khi chọn dự phòng) ─────────

export interface AiProviderInfo {
  id: string;
  name: string;
  baseUrl: string;
  hasKey: boolean;
  keyMask: string;
}

/** Danh sách provider (OpenRouter, OpenAI, …) kèm trạng thái đã cấu hình API key của org chưa. */
export async function getAvailableProviders(): Promise<AiProviderInfo[]> {
  const { data } = await api.get('/ai/providers');
  return data as AiProviderInfo[];
}

// ── Rocket Agent (bộ não local) ──────────────────────────────────────────────

export type RocketProbeStatus = 'ok' | 'unknown_profile' | 'unreachable' | 'unauthorized' | 'error';

export interface RocketProbeResult {
  ok: boolean;
  status: RocketProbeStatus;
  /** Thông báo tiếng Việt viết sẵn từ backend — hiển thị thẳng, không cần map thêm. */
  message: string;
  models: string[];
}

/** profile rỗng = kiểm tra profile mặc định. Endpoint LUÔN trả 200 kể cả khi ok=false. */
export async function probeRocketAgent(profile: string): Promise<RocketProbeResult> {
  const trimmed = profile.trim();
  const { data } = await api.get('/ai-agents/rocket/probe', { params: trimmed ? { profile: trimmed } : {} });
  return data as RocketProbeResult;
}

export interface RocketProfileInfo {
  name: string;
  /** Model mặc định của api_server (model_name). */
  model: string | null;
  /** 'running' | 'stopped' | null — 'stopped' nghĩa là chọn profile này agent sẽ im. */
  gateway: string | null;
  /** false = profile chưa bật cổng API → chọn vào là chắc chắn không gọi được. */
  apiServerEnabled: boolean;
  /** Cổng riêng của profile (mỗi profile Rocket một api_server một cổng). */
  port: number | null;
  /** Có khoá API trong config.yaml không — thiếu khoá thì gateway trả 401. */
  hasKey: boolean;
}

export interface RocketProfileListResult {
  ok: boolean;
  profiles: RocketProfileInfo[];
  /** Thông báo tiếng Việt viết sẵn từ backend — hiển thị thẳng. */
  message: string;
}

/**
 * Danh sách profile Rocket cho dropdown — backend đọc thẳng thư mục cấu hình của Rocket.
 * LUÔN trả 200 kể cả khi ok=false (thư mục chưa mount, chưa có profile…).
 *
 * `refresh` = bỏ cache 30s phía backend, dùng cho nút "tải lại danh sách".
 */
export async function listRocketProfiles(refresh = false): Promise<RocketProfileListResult> {
  const { data } = await api.get('/ai-agents/rocket/profiles', {
    params: refresh ? { refresh: 1 } : {},
  });
  return data as RocketProfileListResult;
}
