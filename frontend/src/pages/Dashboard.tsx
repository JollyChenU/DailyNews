import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  ApiOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  RightOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { MarkdownView } from '../components/MarkdownView'
import { RunFunnel } from '../components/RunFunnel'
import type { AppContext, ArchiveEntry, ConfigResponse, RunSummary, ValidationResult } from '../types'
import { formatDateTime, providerLabels, runStatusColors, runStatusLabels, shortPath } from '../utils'

const { Text, Title } = Typography

export function Dashboard() {
  const [context, setContext] = useState<AppContext | null>(null)
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [archives, setArchives] = useState<ArchiveEntry[]>([])
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [latestMarkdown, setLatestMarkdown] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [contextResult, configResult, runsResult, archivesResult] = await Promise.all([
          api.context(),
          api.config(),
          api.runs(),
          api.archives(),
        ])
        if (cancelled) return
        setContext(contextResult)
        setConfig(configResult)
        setRuns(runsResult.items)
        setArchives(archivesResult.items)
        if (configResult.raw) {
          const validationResult = await api.validateConfig(configResult.raw)
          if (!cancelled) setValidation(validationResult)
        }
        const latest = runsResult.items.find((run) => run.summary_languages.length > 0)
        if (latest) {
          const summary = await api.summary(latest.run_id, latest.summary_languages[0])
          if (!cancelled) setLatestMarkdown(summary.summary)
        } else if (archivesResult.items[0]) {
          const archive = await api.archive(archivesResult.items[0].filename)
          if (!cancelled) setLatestMarkdown(archive.markdown)
        }
      } catch (error) {
        if (!cancelled) message.error(error instanceof Error ? error.message : '读取 Horizon 数据失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="page-loading">
        <Spin size="large" />
      </div>
    )
  }

  const latestRun = runs[0]
  const ai = config?.raw?.ai || {}
  const digest = config?.raw?.digest || {}
  const enabledSources = validation?.result?.enabled_sources || []
  const warnings = validation?.result?.warnings || []
  const missingEnv = validation?.result?.missing_env || []

  return (
    <div className="page dashboard-page">
      <div className="page-heading">
        <div>
          <h1>Horizon 总览</h1>
          <p>配置状态、最近一次抓取流程和最新日报一目了然。</p>
        </div>
        <Space>
          <Link to="/config"><Button icon={<ApiOutlined />}>管理配置</Button></Link>
          <Link to="/runs"><Button type="primary" icon={<FolderOpenOutlined />}>查看运行记录</Button></Link>
        </Space>
      </div>

      {context?.error && <Alert type="error" showIcon message="Horizon 连接异常" description={context.error} className="page-alert" />}
      {missingEnv.length > 0 && (
        <Alert type="error" showIcon message="缺少环境变量" description={missingEnv.join('、')} className="page-alert" />
      )}
      {warnings.length > 0 && (
        <Alert type="warning" showIcon message="配置警告" description={warnings.join('；')} className="page-alert" />
      )}

      <Row gutter={16} className="dashboard-stats">
        <Col xs={12} lg={6}>
          <Card className="stat-card" bordered={false}>
            <Statistic title="当前模型" value={ai.model || '未配置'} valueStyle={{ fontSize: 20 }} prefix={<ApiOutlined />} />
            <Text type="secondary">{providerLabels[ai.provider] || ai.provider || '—'}</Text>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="stat-card" bordered={false}>
            <Statistic title="输出语言" value={(ai.languages || []).join(' / ') || '—'} valueStyle={{ fontSize: 20 }} prefix={<GlobalOutlined />} />
            <Text type="secondary">日报与 enrichment 语言</Text>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="stat-card" bordered={false}>
            <Statistic title="日报上限" value={digest.max_items ?? '不限'} valueStyle={{ fontSize: 20 }} prefix={<FileTextOutlined />} />
            <Text type="secondary">分组配额会进一步限制数量</Text>
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card className="stat-card" bordered={false}>
            <Statistic title="启用新闻源" value={enabledSources.length} valueStyle={{ fontSize: 20 }} prefix={<CheckCircleOutlined />} />
            <Space wrap size={[4, 4]} className="source-tags">
              {enabledSources.map((source) => <Tag key={source}>{source}</Tag>)}
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} xl={14}>
          <Card
            title="最近一次运行"
            extra={latestRun ? <Link to={`/runs/${latestRun.run_id}`}><Button type="link">查看详情 <RightOutlined /></Button></Link> : null}
            className="dashboard-card"
          >
            {latestRun ? (
              <>
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="运行 ID"><Text code>{latestRun.run_id}</Text></Descriptions.Item>
                  <Descriptions.Item label="开始时间">{formatDateTime(latestRun.created_at)}</Descriptions.Item>
                  <Descriptions.Item label="抓取窗口">{latestRun.meta.hours ?? '—'} 小时</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={runStatusColors[latestRun.status]}>{runStatusLabels[latestRun.status] || latestRun.status}</Tag>
                  </Descriptions.Item>
                </Descriptions>
                <RunFunnel meta={latestRun.meta} />
              </>
            ) : (
              <Empty description="暂无运行记录" />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="工作区" className="dashboard-card">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Horizon">{shortPath(context?.active?.horizon_path, 64)}</Descriptions.Item>
              <Descriptions.Item label="配置">{shortPath(context?.active?.config_path, 64)}</Descriptions.Item>
              <Descriptions.Item label="运行目录">{shortPath(context?.active?.runs_root, 64)}</Descriptions.Item>
              <Descriptions.Item label="日报目录">{shortPath(context?.active?.summaries_dir, 64)}</Descriptions.Item>
            </Descriptions>
            <Link to="/settings"><Button type="link" icon={<ClockCircleOutlined />}>路径与启动设置</Button></Link>
          </Card>
        </Col>
      </Row>

      <Card title="最新日报" extra={<Link to="/archives"><Button type="link">历史日报 <RightOutlined /></Button></Link>} className="dashboard-card latest-digest">
        {latestMarkdown ? (
          <MarkdownView markdown={latestMarkdown} compact />
        ) : (
          <Empty description="暂无日报，请先在 Horizon 中完成一次运行。" />
        )}
      </Card>

      {archives[0] && (
        <div className="dashboard-footnote">
          <WarningOutlined /> 当前展示 {archives[0].date} 的归档日报；运行详情中的阶段数据仅对 MCP/服务运行保留。
        </div>
      )}
      <Title level={5} className="sr-only">Horizon Console</Title>
    </div>
  )
}
