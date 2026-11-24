import type {
  AppContext,
  ArchiveEntry,
  ConfigResponse,
  JsonObject,
  RunDetail,
  RunSummary,
  StageResponse,
  ValidationResult,
} from './types'

export class ApiError extends Error {
  status: number
  payload: any

  constructor(message: string, status: number, payload: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload.detail || payload.message || `请求失败（${response.status}）`
    throw new ApiError(typeof message === 'string' ? message : JSON.stringify(message), response.status, payload)
  }
  return payload as T
}

export const api = {
  context: () => request<AppContext>('/api/context'),
  config: () => request<ConfigResponse>('/api/config'),
  validateConfig: (raw: JsonObject) =>
    request<ValidationResult>('/api/config/validate', { method: 'POST', body: JSON.stringify({ raw }) }),
  saveConfig: (raw: JsonObject, revision: string) =>
    request<{ ok: boolean; revision: string; backup_path: string; config_path: string }>('/api/config', {
      method: 'PUT',
      headers: { 'If-Match': revision },
      body: JSON.stringify({ raw }),
    }),
  runs: () => request<{ count: number; items: RunSummary[] }>('/api/runs'),
  run: (runId: string) => request<RunDetail>(`/api/runs/${encodeURIComponent(runId)}`),
  stage: (runId: string, stage: string, params: Record<string, string | number> = {}) => {
    const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))
    return request<StageResponse>(`/api/runs/${encodeURIComponent(runId)}/stages/${stage}?${query}`)
  },
  item: (runId: string, stage: string, itemId: string) => {
    const query = new URLSearchParams({ stage, item_id: itemId })
    return request<JsonObject>(`/api/runs/${encodeURIComponent(runId)}/item?${query}`)
  },
  summary: (runId: string, language: string) =>
    request<{ run_id: string; language: string; summary: string }>(
      `/api/runs/${encodeURIComponent(runId)}/summary?language=${encodeURIComponent(language)}`,
    ),
  archives: (query = '') => request<{ items: ArchiveEntry[] }>(`/api/archives?query=${encodeURIComponent(query)}`),
  archive: (filename: string) =>
    request<{ filename: string; markdown: string; path: string }>(`/api/archives/${encodeURIComponent(filename)}`),
  saveSettings: (payload: { horizon_path: string; config_path: string; port: number }) =>
    request<{ ok: boolean; saved: AppContext['saved']; restart_required: boolean }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
}
