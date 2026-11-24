import { useCallback, useEffect, useMemo, useState } from 'react'
import { diffLines } from 'diff'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  List,
  Modal,
  Row,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  CheckCircleOutlined,
  CodeOutlined,
  DiffOutlined,
  ReloadOutlined,
  SaveOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { ApiError, api } from '../api'
import { SchemaForm, TagsWidget } from '../components/SchemaForm'
import type { ConfigResponse, JsonObject, ValidationResult } from '../types'
import { formatDateTime, providerLabels, shortPath } from '../utils'

const { Paragraph, Text } = Typography

const sections = [
  { key: 'ai', label: 'AI 模型', keys: ['ai'] },
  { key: 'sources', label: '新闻源', keys: ['sources'] },
  { key: 'processing', label: '处理与日报配额', keys: ['collection', 'processing', 'digest', 'display'] },
  { key: 'delivery', label: '投递与高级设置', keys: ['extractors', 'email', 'webhook', 'wechat'] },
]

const schemaTitleLabels: Record<string, string> = {
  Config: 'Horizon 配置',
  Extractors: '内容提取器',
  AIConfig: 'AI 模型设置',
  AIProvider: 'AI 服务商',
  'Provider Chain': '供应商备选链',
  Model: '模型名称',
  'Base Url': 'API 基础地址',
  'Api Key Env': 'API 密钥环境变量',
  'Chatgpt Account': 'ChatGPT 账户',
  'Extra Body': '额外请求体',
  Temperature: '温度',
  'Max Tokens': '最大 Token 数',
  'Throttle Sec': '请求间隔（秒）',
  'Analysis Concurrency': '分析并发数',
  'Enrichment Concurrency': '内容增强并发数',
  Languages: '语言',
  'Azure Endpoint Env': 'Azure 端点环境变量',
  'Api Version': 'API 版本',
  SourcesConfig: '新闻源设置',
  Github: 'GitHub',
  GitHubSourceConfig: 'GitHub 仓库',
  Type: '类型',
  Username: '用户名',
  Owner: '仓库所有者',
  Repo: '仓库名称',
  Enabled: '启用',
  Category: '分类',
  Profile: 'Profile',
  HackerNewsConfig: 'Hacker News',
  'Fetch Top Stories': '抓取热门文章数',
  'Min Score': '最低分数',
  Rss: 'RSS',
  RSSSourceConfig: 'RSS 订阅源',
  Name: '名称',
  Url: 'URL',
  'Content Extractor': '内容提取器',
  RedditConfig: 'Reddit',
  Subreddits: 'Subreddit 列表',
  RedditSubredditConfig: 'Subreddit',
  Subreddit: 'Subreddit 名称',
  Sort: '排序方式',
  'Time Filter': '时间范围',
  'Fetch Limit': '抓取数量',
  Users: '用户列表',
  RedditUserConfig: 'Reddit 用户',
  'Fetch Comments': '抓取评论数',
  TelegramConfig: 'Telegram',
  Channels: '频道列表',
  TelegramChannelConfig: 'Telegram 频道',
  Channel: '频道',
  TwitterConfig: 'Twitter / X',
  Mode: '模式',
  Keywords: '关键词',
  'Fetch Reply Text': '抓取回复正文',
  'Max Replies Per Tweet': '每条推文最多回复数',
  'Max Tweets To Expand': '最多展开推文数',
  'Reply Min Likes': '回复最低点赞数',
  'Apify Token Env': 'Apify Token 环境变量',
  'Actor Id': 'Apify Actor ID',
  'Cookie Dir': 'Cookie 目录',
  'Cookie File Pattern': 'Cookie 文件名匹配',
  OpenBBConfig: 'OpenBB',
  Watchlists: '观察列表',
  OpenBBWatchlist: 'OpenBB 观察列表',
  Symbols: '股票代码列表',
  Provider: '数据服务商',
  'Fetch Filings': '抓取财报文件',
  'Filings Provider': '财报数据服务商',
  OSSInsightConfig: 'OSS Insight',
  Period: '统计周期',
  'Min Stars': '最低 Star 数',
  'Max Items': '最大条目数',
  GDELTConfig: 'GDELT',
  Query: '查询关键词',
  'Max Records': '最大记录数',
  Timespan: '时间跨度',
  Language: '语言',
  Country: '国家或地区',
  GoogleNewsConfig: 'Google News',
  Ceid: 'Google News 地区标识',
  'Max Results': '最大结果数',
  CollectionConfig: '抓取设置',
  'Time Window Hours': '抓取时间窗口（小时）',
  DigestConfig: '日报设置',
  'Category Groups': '分类分组',
  CategoryGroupConfig: '分类配额组',
  Limit: '数量上限',
  Categories: '分类列表',
  'Group By': '分组方式',
  'Default Group': '默认分组',
  'Default Group Limit': '默认分组上限',
  'Profile Order': 'Profile 顺序',
  ProcessingConfig: '处理设置',
  'Profiles Dir': 'Profile 目录',
  'Default Profile': '默认 Profile',
  'Profile Settings': 'Profile 参数',
  ProfileSettingsConfig: '处理偏好',
  Threshold: '评分阈值',
  'Topic Dedup': '主题去重',
  DisplayConfig: '显示设置',
  'Icon Style': '图标样式',
  EmailConfig: '邮件设置',
  'Imap Server': 'IMAP 服务器',
  'Imap Port': 'IMAP 端口',
  'Imap Enabled': '启用 IMAP',
  'Smtp Server': 'SMTP 服务器',
  'Smtp Port': 'SMTP 端口',
  'Smtp Username': 'SMTP 用户名',
  'Email Address': '邮件地址',
  'Password Env': '密码环境变量',
  'Sender Name': '发件人名称',
  'Subscribe Keyword': '订阅关键词',
  'Unsubscribe Keyword': '退订关键词',
  WebhookConfig: 'Webhook 设置',
  'Url Env': 'Webhook 地址环境变量',
  'Request Body': '请求体',
  Headers: '请求头',
  Delivery: '投递内容',
  'Overview Position': '日报概览位置',
  Platform: '平台',
  Layout: '布局',
  'Fallback Layout': '备用布局',
  WeChatConfig: '微信设置',
  'Chunk Size': '分片大小',
}

const schemaDescriptionLabels: Record<string, string> = {
  AIConfig: 'AI 客户端配置。',
  AIProvider: '支持的 AI 服务商。',
  SourcesConfig: '全部新闻源配置。',
  GitHubSourceConfig: 'GitHub 新闻源配置。',
  HackerNewsConfig: 'Hacker News 新闻源配置。',
  RSSSourceConfig: 'RSS 订阅源配置。',
  RedditConfig: 'Reddit 新闻源配置。',
  RedditSubredditConfig: '监控指定 Subreddit 的配置。',
  RedditUserConfig: '监控指定 Reddit 用户的配置。',
  TelegramConfig: 'Telegram 新闻源配置。',
  TelegramChannelConfig: '监控指定 Telegram 频道的配置。',
  TwitterConfig: '支持两种模式：Apify 使用 scweet Actor（需要 APIFY_TOKEN，较稳定）；Playwright 使用浏览器 Cookie（免费，无需 Token）。关键词仅用于 Apify 搜索模式。',
  OpenBBConfig: '使用已安装的 openbb SDK 获取股票新闻和财报文件；未安装该可选依赖时，仅 OpenBB 新闻源会失败。数据服务商凭证由 openbb 自行从环境变量或用户设置中解析。',
  OpenBBWatchlist: '从指定 OpenBB 数据服务商获取的股票观察列表。每个列表每次运行会产生一次新闻查询，请按数据服务商分组股票代码。',
  OSSInsightConfig: '通过 OSS Insight 公共 API 抓取 Star 增长最快的仓库。关键词按描述、仓库名或集合名进行不区分大小写的包含匹配；留空则抓取全部热门仓库。',
  GDELTConfig: '通过无需密钥的 GDELT DOC API 查询近期新闻文章。每次请求最多返回 250 条记录，请保持较少的查询数量。',
  GoogleNewsConfig: '为查询词构建 Google News RSS 搜索地址并解析订阅源，无需 API 密钥。',
  CollectionConfig: '控制抓取哪些新闻源条目。',
  DigestConfig: '控制最终日报的分组和数量限制。',
  CategoryGroupConfig: '包含一个或多个来源分类的配额分组。',
  ProcessingConfig: 'Profile 发现与回退设置。',
  ProfileSettingsConfig: '运行时应用于处理 Profile 的用户偏好。',
  DisplayConfig: '控制终端输出显示。',
  EmailConfig: '邮件更新与订阅配置。',
  WebhookConfig: 'Webhook 通知配置。',
  WeChatConfig: '可选的 iLink 投递配置；凭证保存在数据目录的会话文件中。',
}

const schemaEnumLabels: Record<string, Record<string, string>> = {
  AIProvider: providerLabels,
  'Group By': { category: '按分类', profile: '按 Profile' },
  'Icon Style': { emoji: 'Emoji', nerd: 'Nerd Font', ascii: 'ASCII' },
  Delivery: { summary: '仅日报', summary_and_items: '日报与条目' },
  'Overview Position': { first: '顶部', last: '底部' },
  Platform: { generic: '通用', feishu: '飞书', lark: 'Lark', dingtalk: '钉钉', slack: 'Slack', discord: 'Discord' },
  Layout: { markdown: 'Markdown', collapsible: '可折叠' },
  'Fallback Layout': { markdown: 'Markdown', collapsible: '可折叠' },
}

function normalizeNullableSchema(value: any): any {
  if (Array.isArray(value)) return value.map(normalizeNullableSchema)
  if (!value || typeof value !== 'object') return value
  const sourceTitle = typeof value.title === 'string' ? value.title : undefined
  let normalized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeNullableSchema(item)]),
  )
  delete normalized.default
  if (Array.isArray(normalized.anyOf)) {
    const concrete = normalized.anyOf.filter((option: JsonObject) => option.type !== 'null')
    const hasNull = normalized.anyOf.some((option: JsonObject) => option.type === 'null')
    if (hasNull && concrete.length === 1) {
      const { anyOf: _, ...metadata } = normalized
      normalized = { ...concrete[0], ...metadata }
    } else if (
      hasNull
      && concrete.length === 2
      && concrete.some((option: JsonObject) => option.type === 'string')
      && concrete.some((option: JsonObject) => option.type === 'array')
    ) {
      const { anyOf: _, ...metadata } = normalized
      normalized = { ...metadata, type: 'string' }
    }
  }
  if (sourceTitle) {
    normalized.title = schemaTitleLabels[sourceTitle] || sourceTitle
    if (schemaDescriptionLabels[sourceTitle]) normalized.description = schemaDescriptionLabels[sourceTitle]
  }
  if (Array.isArray(normalized.enum) && sourceTitle) {
    const labels = schemaEnumLabels[sourceTitle]
    if (labels) normalized.enumNames = normalized.enum.map((option: any) => labels[String(option)] || String(option))
  }
  return normalized
}

function makeSectionSchema(root: JsonObject, keys: string[], title: string) {
  const { description: _, ...schema } = root
  return {
    ...schema,
    title,
    type: 'object',
    properties: Object.fromEntries(keys.filter((key) => root.properties?.[key]).map((key) => [key, root.properties[key]])),
    required: (root.required || []).filter((key: string) => keys.includes(key)),
  }
}

function pickSection(data: JsonObject, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]))
}

function sortJson(value: any): any {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]))
}

function serializeConfig(value: JsonObject) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`
}

export function ConfigPage() {
  const [data, setData] = useState<ConfigResponse | null>(null)
  const [draft, setDraft] = useState<JsonObject>({})
  const [jsonText, setJsonText] = useState('')
  const [mode, setMode] = useState<'form' | 'json'>('form')
  const [revision, setRevision] = useState('')
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffParts, setDiffParts] = useState<{ value: string; added?: boolean; removed?: boolean }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.config()
      setData(result)
      setDraft(result.raw || {})
      setJsonText(result.raw_text)
      setRevision(result.revision)
      setValidation(null)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '读取配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sectionSchemas = useMemo(() => {
    if (!data) return []
    const schema = normalizeNullableSchema(data.schema)
    return sections.map((section) => ({
      ...section,
      schema: makeSectionSchema(schema, section.keys, section.label),
    }))
  }, [data])

  const currentText = mode === 'json' ? jsonText : serializeConfig(draft)
  const originalText = data?.raw ? serializeConfig(data.raw) : ''
  const dirty = Boolean(data?.raw && (() => {
    if (mode === 'form') return currentText !== originalText
    try {
      return serializeConfig(JSON.parse(jsonText)) !== originalText
    } catch {
      return jsonText !== (data?.raw_text || '')
    }
  })())

  const parseDraft = () => {
    try {
      const parsed = JSON.parse(mode === 'json' ? jsonText : JSON.stringify(draft))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('配置顶层必须是 JSON 对象。')
      return parsed as JsonObject
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'JSON 格式错误')
      throw error
    }
  }

  const updateDraft = (next: JsonObject) => {
    setDraft(next)
    setJsonText(`${JSON.stringify(next, null, 2)}\n`)
    setValidation(null)
  }

  const changeMode = (nextMode: string) => {
    if (nextMode === 'form' && mode === 'json') {
      try {
        const parsed = JSON.parse(jsonText)
        setDraft(parsed)
      } catch {
        message.warning('JSON 仍无法解析，请先修正格式。')
        return
      }
    }
    setMode(nextMode as 'form' | 'json')
  }

  const handleValidate = async () => {
    let raw: JsonObject
    try {
      raw = parseDraft()
    } catch {
      return
    }
    setValidating(true)
    try {
      const result = await api.validateConfig(raw)
      setValidation(result)
      if (result.ok) message.success('配置校验通过')
      else message.warning(result.message || '配置校验未通过')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '校验失败')
    } finally {
      setValidating(false)
    }
  }

  const handleDiff = () => {
    let raw: JsonObject
    try {
      raw = parseDraft()
    } catch {
      return
    }
    setDiffParts(diffLines(originalText, serializeConfig(raw)))
    setDiffOpen(true)
  }

  const handleSave = async () => {
    let raw: JsonObject
    try {
      raw = parseDraft()
    } catch {
      return
    }
    setSaving(true)
    try {
      const result = await api.saveConfig(raw, revision)
      setRevision(result.revision)
      setDraft(raw)
      setJsonText(`${JSON.stringify(raw, null, 2)}\n`)
      message.success(`配置已保存，备份：${shortPath(result.backup_path, 42)}`)
      await load()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        message.error('配置已被其他程序修改，请刷新后重新应用变更。')
      } else if (error instanceof ApiError && error.status === 422) {
        setValidation(error.payload)
        message.warning(error.payload.message || '配置校验未通过')
      } else {
        message.error(error instanceof Error ? error.message : '保存失败')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <Spin size="large" />
      </div>
    )
  }

  if (!data) {
    return <Alert type="error" message="无法读取 Horizon 配置" description="请前往设置检查 Horizon 路径。" showIcon />
  }

  return (
    <div className="page config-page">
      <div className="page-heading">
        <div>
          <h1>配置管理</h1>
          <p>修改 Horizon 运行时配置，保存前自动校验并保留备份。</p>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={load}>重新读取</Button>
          <Button icon={<DiffOutlined />} onClick={handleDiff} disabled={!dirty}>查看变更</Button>
          <Button icon={<SafetyCertificateOutlined />} loading={validating} onClick={handleValidate}>校验配置</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={handleSave}>
            保存配置
          </Button>
        </Space>
      </div>

      {data.parse_error && (
        <Alert type="error" showIcon message="配置文件不是有效 JSON" description={data.parse_error} className="page-alert" />
      )}
      {data.profile_error && (
        <Alert type="warning" showIcon message="Profile 加载异常" description={data.profile_error} className="page-alert" />
      )}

      <Row gutter={16} className="config-summary">
        <Col xs={24} lg={16}>
          <Card size="small">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="配置文件">{shortPath(data.config_path, 90)}</Descriptions.Item>
              <Descriptions.Item label="当前版本">
                <Text code>{revision.slice(0, 12)}</Text>
                <span className="descriptor-gap">修改于 {formatDateTime(data.modified_at)}</span>
              </Descriptions.Item>
              <Descriptions.Item label="备份文件">{data.backup ? shortPath(data.backup.path, 90) : '暂无备份'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="可用 Profile">
            <Space wrap>
              {data.profiles.map((profile) => <Tag key={profile.id} color="blue">{profile.name}</Tag>)}
            </Space>
          </Card>
        </Col>
      </Row>

      {validation && (
        <Card size="small" className="validation-card" title="校验结果">
          {validation.ok ? (
            <Alert type="success" showIcon message="配置有效" description="字段、Profile 引用和环境变量检查已完成。" />
          ) : (
            <Alert type="error" showIcon message={validation.message || '配置校验未通过'} />
          )}
          {validation.result?.warnings?.length ? (
            <Alert type="warning" showIcon className="validation-warning" message="警告" description={validation.result.warnings.join('；')} />
          ) : null}
          {validation.result?.missing_env?.length ? (
            <Alert type="error" showIcon className="validation-warning" message="缺少环境变量" description={validation.result.missing_env.join('、')} />
          ) : null}
          {validation.errors?.length ? (
            <List
              size="small"
              className="validation-errors"
              dataSource={validation.errors}
              renderItem={(error) => (
                <List.Item>
                  <Text code>{error.location.join('.') || 'root'}</Text>
                  <span>{error.message}</span>
                </List.Item>
              )}
            />
          ) : null}
        </Card>
      )}

      <Card className="config-editor-card">
        <Tabs
          activeKey={mode}
          onChange={changeMode}
          items={[
            {
              key: 'form',
              label: <span><SafetyCertificateOutlined /> 可视化配置</span>,
              children: (
                <Tabs
                  type="card"
                  items={sectionSchemas.map((section) => ({
                    key: section.key,
                    label: section.label,
                    children: (
                      <SchemaForm
                        schema={section.schema}
                        formData={pickSection(draft, section.keys)}
                        uiSchema={{
                          ...(section.key === 'sources' && { sources: { 'ui:options': { platformTabs: true } } }),
                          ai: { languages: { 'ui:widget': TagsWidget } },
                          webhook: { headers: { 'ui:widget': 'textarea' } },
                        }}
                        onChange={(next) => updateDraft({ ...draft, ...next })}
                      />
                    ),
                  }))}
                />
              ),
            },
            {
              key: 'json',
              label: <span><CodeOutlined /> JSON 编辑器</span>,
              children: (
                <div className="json-editor-wrap">
                  <Paragraph type="secondary">
                    高级编辑模式。环境变量请继续使用 <Text code>{'${VAR_NAME}'}</Text>，不要直接填入密钥。
                  </Paragraph>
                  <Input.TextArea
                    className="json-editor"
                    value={jsonText}
                    onChange={(event) => setJsonText(event.target.value)}
                    spellCheck={false}
                    autoSize={{ minRows: 26, maxRows: 50 }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="配置变更"
        open={diffOpen}
        onCancel={() => setDiffOpen(false)}
        footer={<Button onClick={() => setDiffOpen(false)}>关闭</Button>}
        width={900}
      >
        <div className="diff-view">
          {diffParts.map((part, index) => (
            <div key={index} className={`diff-line ${part.added ? 'added' : part.removed ? 'removed' : ''}`}>
              <span className="diff-symbol">{part.added ? '+' : part.removed ? '-' : ' '}</span>
              <code>{part.value.replace(/\n$/, '') || ' '}</code>
            </div>
          ))}
        </div>
      </Modal>

      {validation?.ok && <CheckCircleOutlined className="sr-only" />}
    </div>
  )
}
