import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Input,
  List,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  FileTextOutlined,
  LinkOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { MarkdownView } from '../components/MarkdownView'
import { RunFunnel } from '../components/RunFunnel'
import type { JsonObject, RunDetail, StageItem, StageResponse } from '../types'
import { formatDateTime, runStatusColors, runStatusLabels, shortPath, stageLabels } from '../utils'

const { Paragraph, Text, Title } = Typography

const stageKeys = ['raw', 'scored', 'filtered', 'enriched']

function ItemDetail({ item }: { item: JsonObject }) {
  const processing = item.processing || {}
  const classification = processing.classification || {}
  const analysis = processing.analysis || {}
  const artifacts = processing.artifacts || {}
  return (
    <div className="item-detail">
      <Descriptions column={1} size="small">
        <Descriptions.Item label="来源">{item.source_type} · {item.author || '未知作者'}</Descriptions.Item>
        <Descriptions.Item label="发布时间">{formatDateTime(item.published_at)}</Descriptions.Item>
        <Descriptions.Item label="分类">{item.metadata?.category || '—'}</Descriptions.Item>
        <Descriptions.Item label="Profile">
          {classification.profile || item.profile || '—'}
          {classification.method ? <Tag className="inline-tag">{classification.method}</Tag> : null}
        </Descriptions.Item>
        {classification.reason && <Descriptions.Item label="路由理由">{classification.reason}</Descriptions.Item>}
        {analysis.score !== undefined && analysis.score !== null && (
          <Descriptions.Item label="评分">{analysis.score} / 10</Descriptions.Item>
        )}
        {analysis.reason && <Descriptions.Item label="评分理由">{analysis.reason}</Descriptions.Item>}
        {analysis.tags?.length ? (
          <Descriptions.Item label="标签">
            <Space wrap>{analysis.tags.map((tag: string) => <Tag key={tag}>{tag}</Tag>)}</Space>
          </Descriptions.Item>
        ) : null}
        <Descriptions.Item label="原文链接">
          <a href={item.url} target="_blank" rel="noopener noreferrer"><LinkOutlined /> {item.url}</a>
        </Descriptions.Item>
      </Descriptions>

      {analysis.summary && (
        <Card size="small" title="分析摘要" className="item-section">
          <Paragraph>{analysis.summary}</Paragraph>
        </Card>
      )}

      {item.content && (
        <Card size="small" title="原始内容" className="item-section">
          <pre className="raw-content">{item.content}</pre>
        </Card>
      )}

      {Object.entries(artifacts).map(([language, artifact]: [string, any]) => (
        <Card key={language} size="small" title={`Enrichment · ${language}`} className="item-section">
          <Title level={5}>{artifact.title}</Title>
          {artifact.blocks?.map((block: any) => (
            <div key={block.id} className="artifact-block">
              {!block.primary && <Title level={5}>{block.title}</Title>}
              <MarkdownView markdown={block.content || ''} compact />
            </div>
          ))}
          {artifact.sources?.length ? (
            <div className="artifact-sources">
              <Text strong>参考来源</Text>
              <List
                size="small"
                dataSource={artifact.sources}
                renderItem={(source: any) => (
                  <List.Item>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                  </List.Item>
                )}
              />
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  )
}

export function RunDetailPage() {
  const { runId = '' } = useParams()
  const [run, setRun] = useState<RunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('summary')
  const [summaryLanguage, setSummaryLanguage] = useState('zh')
  const [markdown, setMarkdown] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [stageData, setStageData] = useState<StageResponse | null>(null)
  const [stageLoading, setStageLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [source, setSource] = useState('')
  const [profile, setProfile] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedItem, setSelectedItem] = useState<StageItem | null>(null)
  const [itemDetail, setItemDetail] = useState<JsonObject | null>(null)
  const [itemLoading, setItemLoading] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const loadRun = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.run(runId)
      setRun(result)
      setSummaryLanguage(result.summary_languages[0] || 'zh')
      if (!result.summary_languages.length) setActiveTab('raw')
    } catch (err) {
      const text = err instanceof Error ? err.message : '读取运行详情失败'
      setError(text)
      message.error(text)
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    void loadRun()
  }, [loadRun])

  const stage = stageKeys.includes(activeTab) ? activeTab : ''

  const loadStage = useCallback(async () => {
    if (!runId || !stage) return
    setStageLoading(true)
    try {
      const result = await api.stage(runId, stage, {
        offset: (page - 1) * pageSize,
        limit: pageSize,
        query: appliedQuery,
        source,
        profile,
      })
      setStageData(result)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '读取阶段数据失败')
    } finally {
      setStageLoading(false)
    }
  }, [runId, stage, page, pageSize, appliedQuery, source, profile])

  useEffect(() => {
    if (stage) void loadStage()
  }, [stage, loadStage])

  useEffect(() => {
    if (activeTab !== 'summary' || !runId || !summaryLanguage) return
    let cancelled = false
    setSummaryLoading(true)
    api
      .summary(runId, summaryLanguage)
      .then((result) => {
        if (!cancelled) setMarkdown(result.summary)
      })
      .catch((err) => {
        if (!cancelled) message.error(err instanceof Error ? err.message : '读取日报失败')
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, runId, summaryLanguage])

  const openItem = async (item: StageItem) => {
    setSelectedItem(item)
    setItemDetail(null)
    setDrawerOpen(true)
    setItemLoading(true)
    try {
      const detail = await api.item(runId, stage, item.id)
      setItemDetail(detail)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '读取条目详情失败')
    } finally {
      setItemLoading(false)
    }
  }

  const resetFilters = () => {
    setQuery('')
    setAppliedQuery('')
    setSource('')
    setProfile('')
    setPage(1)
  }

  if (loading) {
    return <div className="page-loading"><Spin size="large" /></div>
  }

  if (error || !run) {
    return (
      <Alert
        type="error"
        showIcon
        message="无法读取运行详情"
        description={error || '运行不存在'}
        action={<Link to="/runs"><Button>返回运行列表</Button></Link>}
      />
    )
  }

  const columns = [
    {
      title: '条目标题',
      dataIndex: 'title',
      key: 'title',
      render: (value: string, item: StageItem) => (
        <div>
          <Button type="link" className="item-title-button" onClick={() => openItem(item)}>{value}</Button>
          <div className="item-url">{shortPath(item.url, 70)}</div>
        </div>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source_type',
      key: 'source_type',
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      render: (value: string | null) => value || '—',
    },
    {
      title: 'Profile',
      dataIndex: 'profile',
      key: 'profile',
      render: (value: string | null) => value ? <Tag color="blue">{value}</Tag> : '—',
    },
    {
      title: '评分',
      dataIndex: 'score',
      key: 'score',
      render: (value: number | null) =>
        value === null || value === undefined ? <Text type="secondary">未评分</Text> : <Tag color={value >= 7 ? 'green' : value >= 4 ? 'gold' : 'red'}>{value}</Tag>,
    },
    {
      title: '发布时间',
      dataIndex: 'published_at',
      key: 'published_at',
      render: (value: string) => formatDateTime(value),
    },
  ]

  const tabItems = [
    ...(run.summary_languages.length
      ? [{
          key: 'summary',
          label: <span><FileTextOutlined /> 日报预览</span>,
          children: (
            <Card>
              <Space wrap className="table-toolbar">
                <Text strong>输出语言</Text>
                <Select value={summaryLanguage} onChange={setSummaryLanguage} options={run.summary_languages.map((lang) => ({ label: lang, value: lang }))} />
                {run.meta.summary_published_path && <Text type="secondary">已归档：{shortPath(run.meta.summary_published_path, 70)}</Text>}
              </Space>
              {summaryLoading ? <div className="page-loading"><Spin /></div> : <MarkdownView markdown={markdown} />}
            </Card>
          ),
        }]
      : []),
    ...stageKeys.filter((key) => run.stages[key as keyof typeof run.stages]).map((key) => ({
      key,
      label: stageLabels[key],
      children: (
        <Card>
          <Space wrap className="table-toolbar stage-filters">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索标题、作者、摘要或评分理由"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onPressEnter={() => { setAppliedQuery(query); setPage(1) }}
              style={{ width: 320 }}
            />
            <Button
              icon={<SearchOutlined />}
              onClick={() => { setAppliedQuery(query); setPage(1) }}
            >
              搜索
            </Button>
            <Select
              allowClear
              placeholder="新闻源"
              value={source || undefined}
              onChange={(value) => { setSource(value || ''); setPage(1) }}
              options={(stageData?.sources || []).map((value) => ({ label: value, value }))}
              style={{ width: 150 }}
            />
            <Select
              allowClear
              placeholder="Profile"
              value={profile || undefined}
              onChange={(value) => { setProfile(value || ''); setPage(1) }}
              options={(stageData?.profiles || []).map((value) => ({ label: value, value }))}
              style={{ width: 170 }}
            />
            <Button onClick={resetFilters}>重置</Button>
            <Text type="secondary">{stageData?.total ?? 0} 条</Text>
          </Space>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={stageData?.items || []}
            loading={stageLoading}
            scroll={{ x: 980 }}
            pagination={{
              current: page,
              pageSize,
              total: stageData?.total || 0,
              showSizeChanger: true,
              pageSizeOptions: [20, 50, 100],
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPage)
                setPageSize(nextPageSize)
              },
            }}
          />
        </Card>
      ),
    })),
    {
      key: 'meta',
      label: stageLabels.meta,
      children: (
        <Card title="运行元数据">
          <pre className="json-view">{JSON.stringify(run.meta, null, 2)}</pre>
        </Card>
      ),
    },
  ]

  return (
    <div className="page run-detail-page">
      <div className="page-heading">
        <div>
          <Link to="/runs" className="back-link"><ArrowLeftOutlined /> 返回运行记录</Link>
          <h1>运行详情</h1>
          <Text code>{run.run_id}</Text>
        </div>
        <Space>
          <Tag color={runStatusColors[run.status]}>{runStatusLabels[run.status] || run.status}</Tag>
          <Button icon={<ReloadOutlined />} onClick={loadRun}>刷新</Button>
        </Space>
      </div>

      <Row gutter={16} className="run-overview">
        <Col xs={24} xl={16}>
          <Card title="处理流程">
            <RunFunnel meta={run.meta} />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="运行信息">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="开始时间">{formatDateTime(run.created_at)}</Descriptions.Item>
              <Descriptions.Item label="抓取窗口">{run.meta.hours ?? '—'} 小时</Descriptions.Item>
              <Descriptions.Item label="抓取状态">{run.meta.fetch_status || '—'}</Descriptions.Item>
              <Descriptions.Item label="配置">{shortPath(run.meta.config_path, 56)}</Descriptions.Item>
              <Descriptions.Item label="日报语言">{run.summary_languages.join(', ') || '—'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      {run.meta.fetch_report?.sources?.length ? (
        <Card title="新闻源抓取诊断" className="fetch-report-card">
          <Table
            size="small"
            rowKey="source"
            pagination={false}
            dataSource={run.meta.fetch_report.sources}
            columns={[
              { title: '新闻源', dataIndex: 'source' },
              {
                title: '状态',
                dataIndex: 'status',
                render: (value: string) => <Tag color={value === 'success' ? 'green' : value === 'empty' ? 'default' : 'red'}>{value}</Tag>,
              },
              { title: '条目数', dataIndex: 'item_count' },
            ]}
          />
        </Card>
      ) : null}

      <Card className="run-tabs-card">
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      <Drawer
        title={selectedItem?.title}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={760}
        destroyOnClose
      >
        {itemLoading ? <div className="page-loading"><Spin size="large" /></div> : itemDetail ? <ItemDetail item={itemDetail} /> : <Empty description="暂无详情" />}
      </Drawer>
    </div>
  )
}
