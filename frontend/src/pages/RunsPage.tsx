import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Empty, Input, Space, Spin, Table, Tag, Typography, message } from 'antd'
import { FolderOpenOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { api } from '../api'
import type { RunSummary } from '../types'
import { formatDateTime, runStatusColors, runStatusLabels } from '../utils'

const { Text } = Typography

export function RunsPage() {
  const navigate = useNavigate()
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.runs()
      setRuns(result.items)
    } catch (err) {
      const text = err instanceof Error ? err.message : '读取运行记录失败'
      setError(text)
      message.error(text)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return runs
    return runs.filter((run) =>
      [run.run_id, run.status, run.meta.fetch_status, ...run.meta.source_selection].some((value) =>
        String(value || '').toLowerCase().includes(keyword),
      ),
    )
  }, [runs, query])

  const columns = [
    {
      title: '开始时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value: string) => <Text>{formatDateTime(value)}</Text>,
    },
    {
      title: '运行 ID',
      dataIndex: 'run_id',
      key: 'run_id',
      render: (value: string) => <Text code>{value}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color={runStatusColors[value]}>{runStatusLabels[value] || value}</Tag>,
    },
    {
      title: '抓取窗口',
      key: 'hours',
      render: (_: unknown, run: RunSummary) => `${run.meta.hours ?? '—'} h`,
    },
    {
      title: '抓取',
      key: 'raw',
      render: (_: unknown, run: RunSummary) => run.meta.raw_count ?? '—',
    },
    {
      title: '评分',
      key: 'scored',
      render: (_: unknown, run: RunSummary) => run.meta.scored_count ?? '—',
    },
    {
      title: '筛选',
      key: 'filtered',
      render: (_: unknown, run: RunSummary) => run.meta.filtered_count ?? '—',
    },
    {
      title: 'Enrichment',
      key: 'enriched',
      render: (_: unknown, run: RunSummary) => run.meta.enriched_count ?? '—',
    },
    {
      title: '日报',
      key: 'summary',
      render: (_: unknown, run: RunSummary) =>
        run.summary_languages.length ? run.summary_languages.map((lang) => <Tag key={lang} color="green">{lang}</Tag>) : '—',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, run: RunSummary) => (
        <Button type="link" onClick={() => navigate(`/runs/${run.run_id}`)}>查看详情</Button>
      ),
    },
  ]

  return (
    <div className="page runs-page">
      <div className="page-heading">
        <div>
          <h1>运行记录</h1>
          <p>查看抓取、评分、筛选和 enrichment 的完整阶段数据。</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </div>

      {error && <Alert type="error" showIcon message="无法读取运行记录" description={error} className="page-alert" />}

      <Card>
        <Space wrap className="table-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索运行 ID、状态或新闻源"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ width: 320 }}
          />
          <Text type="secondary">共 {filtered.length} 次运行</Text>
        </Space>
        {loading ? (
          <div className="page-loading"><Spin size="large" /></div>
        ) : filtered.length ? (
          <Table
            rowKey="run_id"
            columns={columns}
            dataSource={filtered}
            scroll={{ x: 1100 }}
            pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: [15, 30, 50] }}
            onRow={(run) => ({
              onClick: () => navigate(`/runs/${run.run_id}`),
              className: 'clickable-row',
            })}
          />
        ) : (
          <Empty description="暂无运行记录" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button type="primary" icon={<FolderOpenOutlined />} onClick={load}>重新检查</Button>
          </Empty>
        )}
      </Card>
    </div>
  )
}
