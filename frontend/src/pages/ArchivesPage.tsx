import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import { FileTextOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { api } from '../api'
import { MarkdownView } from '../components/MarkdownView'
import type { ArchiveEntry } from '../types'
import { formatBytes, formatDateTime, shortPath } from '../utils'

const { Text } = Typography

export function ArchivesPage() {
  const [archives, setArchives] = useState<ArchiveEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [language, setLanguage] = useState('')
  const [selected, setSelected] = useState<ArchiveEntry | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [contentLoading, setContentLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const result = await api.archives(appliedQuery)
      setArchives(result.items)
      if (selected && !result.items.some((item) => item.filename === selected.filename)) setSelected(null)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '读取历史日报失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [appliedQuery])

  useEffect(() => {
    if (!selected) {
      setMarkdown('')
      return
    }
    let cancelled = false
    setContentLoading(true)
    api
      .archive(selected.filename)
      .then((result) => {
        if (!cancelled) setMarkdown(result.markdown)
      })
      .catch((error) => {
        if (!cancelled) message.error(error instanceof Error ? error.message : '读取日报失败')
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  const languages = [...new Set(archives.map((item) => item.language))]
  const visible = language ? archives.filter((item) => item.language === language) : archives

  return (
    <div className="page archives-page">
      <div className="page-heading">
        <div>
          <h1>历史日报</h1>
          <p>浏览已经归档到 Horizon data/summaries 的 Markdown 日报。</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </div>

      <Card className="archive-toolbar">
        <Space wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索标题、标签或日报内容"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onPressEnter={() => setAppliedQuery(query)}
            style={{ width: 360 }}
          />
          <Button type="primary" onClick={() => setAppliedQuery(query)}>搜索</Button>
          <Select
            allowClear
            placeholder="语言"
            value={language || undefined}
            onChange={(value) => setLanguage(value || '')}
            options={languages.map((value) => ({ label: value, value }))}
            style={{ width: 130 }}
          />
          <Text type="secondary">共 {visible.length} 份日报</Text>
        </Space>
      </Card>

      <Row gutter={16} className="archive-layout">
        <Col xs={24} lg={8}>
          <Card title="日报列表" loading={loading}>
            {visible.length ? (
              <List
                dataSource={visible}
                renderItem={(item) => (
                  <List.Item
                    className={`archive-list-item ${selected?.filename === item.filename ? 'active' : ''}`}
                    onClick={() => setSelected(item)}
                  >
                    <List.Item.Meta
                      avatar={<FileTextOutlined className="archive-icon" />}
                      title={item.date}
                      description={
                        <Space direction="vertical" size={2}>
                          <Text ellipsis>{item.title}</Text>
                          <Space wrap>
                            <Tag>{item.language}</Tag>
                            <Text type="secondary">{formatBytes(item.size)}</Text>
                          </Space>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="没有匹配的日报" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card
            title={selected ? `${selected.date} · ${selected.language}` : '日报预览'}
            extra={selected ? <Text type="secondary">{formatDateTime(selected.modified_at)}</Text> : null}
            className="archive-preview"
          >
            {selected ? (
              <>
                <Alert
                  type="info"
                  showIcon
                  className="archive-path"
                  message="归档路径"
                  description={shortPath(selected.path, 110)}
                />
                {contentLoading ? <div className="page-loading"><Spin size="large" /></div> : <MarkdownView markdown={markdown} />}
              </>
            ) : (
              <Empty description="从左侧选择一份日报" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
