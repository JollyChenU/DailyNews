export function formatDateTime(value?: string | number | null) {
  if (!value) return '—'
  const date = new Date(typeof value === 'number' && value < 10_000_000_000 ? value * 1000 : value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function formatBytes(value?: number | null) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function shortPath(value?: string | null, max = 54) {
  if (!value) return '—'
  if (value.length <= max) return value
  return `…${value.slice(-(max - 1))}`
}

export const runStatusLabels: Record<string, string> = {
  completed: '已完成',
  enriched: '已 enrichment',
  filtered: '已筛选',
  scored: '已评分',
  fetched: '已抓取',
  created: '已创建',
}

export const runStatusColors: Record<string, string> = {
  completed: 'green',
  enriched: 'cyan',
  filtered: 'blue',
  scored: 'geekblue',
  fetched: 'gold',
  created: 'default',
}

export const stageLabels: Record<string, string> = {
  raw: '原始条目',
  scored: '评分结果',
  filtered: '筛选结果',
  enriched: 'Enrichment',
  summary: '日报预览',
  meta: '运行元数据',
}

export const providerLabels: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  'openai-chatgpt': 'ChatGPT',
  azure: 'Azure OpenAI',
  ali: 'qwen',
  gemini: 'Gemini',
  doubao: '豆包',
  minimax: 'MiniMax',
  deepseek: 'DeepSeek',
  ollama: 'Ollama',
}
