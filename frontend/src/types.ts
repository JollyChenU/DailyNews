export type JsonObject = Record<string, any>

export interface AppContext {
  active: {
    horizon_path: string
    config_path: string
    runs_root: string
    summaries_dir: string
  } | null
  saved: {
    horizon_path: string
    config_path: string
    port: number
  }
  error: string | null
  restart_required: boolean
}

export interface ProfileInfo {
  id: string
  name: string
  display_names: Record<string, string>
  blocks: JsonObject[]
}

export interface ConfigResponse {
  raw_text: string
  raw: JsonObject | null
  revision: string
  modified_at: number
  parse_error: string | null
  schema: JsonObject
  profiles: ProfileInfo[]
  profile_error: string | null
  backup: { path: string; size: number; modified_at: number } | null
  config_path: string
}

export interface ValidationResult {
  ok: boolean
  message?: string
  code?: string
  errors?: { location: (string | number)[]; message: string; type: string }[]
  result?: {
    ai: JsonObject
    collection: JsonObject
    digest: JsonObject
    enabled_sources: string[]
    selected_sources: string[]
    unknown_sources: string[]
    missing_env: string[]
    warnings: string[]
    processing: JsonObject
  }
  profiles?: string[]
}

export interface RunSummary {
  run_id: string
  created_at: string
  updated_at: string
  stages: Record<'raw' | 'scored' | 'filtered' | 'enriched', boolean>
  summary_languages: string[]
  status: string
  meta: JsonObject
}

export interface RunDetail extends RunSummary {
  run_id: string
  meta: JsonObject
}

export interface StageItem {
  id: string
  source_type: string
  title: string
  url: string
  author: string | null
  published_at: string
  fetched_at: string
  category: string | null
  profile: string | null
  classification: JsonObject
  score: number | null
  reason: string | null
  summary: string | null
  tags: string[]
  artifact_languages: string[]
  has_content: boolean
  content_preview: string
}

export interface StageResponse {
  run_id: string
  stage: string
  total: number
  offset: number
  limit: number
  items: StageItem[]
  sources: string[]
  profiles: string[]
}

export interface ArchiveEntry {
  filename: string
  date: string
  language: string
  title: string
  size: number
  modified_at: number
  path: string
}
