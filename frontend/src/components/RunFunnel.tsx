import { Fragment } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Card, Col, Row, Statistic, Tag } from 'antd'
import type { JsonObject } from '../types'

export function RunFunnel({ meta, compact = false }: { meta: JsonObject; compact?: boolean }) {
  const steps = [
    { label: '抓取', value: meta.raw_count ?? meta.raw_count_before_merge ?? 0, color: '#6366f1' },
    { label: '评分', value: meta.scored_count ?? 0, color: '#0ea5e9' },
    { label: '筛选', value: meta.filtered_count ?? 0, color: '#14b8a6' },
    { label: 'Enrichment', value: meta.enriched_count ?? 0, color: '#f59e0b' },
  ]
  return (
    <div className={`run-funnel ${compact ? 'compact' : ''}`}>
      <Row gutter={12}>
        {steps.map((step, index) => (
          <Fragment key={step.label}>
            <Col xs={12} md={compact ? 12 : 6}>
              <Card className="funnel-card" bordered={false}>
                <Statistic title={step.label} value={step.value} valueStyle={{ color: step.color }} />
                {index === 2 && typeof meta.topic_dedup_removed === 'number' && (
                  <div className="funnel-note">主题去重移除 {meta.topic_dedup_removed}</div>
                )}
                {index === 2 && typeof meta.balanced_digest_removed === 'number' && (
                  <div className="funnel-note">配额移除 {meta.balanced_digest_removed}</div>
                )}
                {index === 3 && typeof meta.enrichment_failed_count === 'number' && (
                  <div className="funnel-note">失败 {meta.enrichment_failed_count}</div>
                )}
              </Card>
            </Col>
            {index < steps.length - 1 && !compact && (
              <Col md={1} className="funnel-arrow">
                <ArrowRightOutlined />
              </Col>
            )}
          </Fragment>
        ))}
      </Row>
      {meta.fetch_status && meta.fetch_status !== 'success' && (
        <Tag color="red">抓取状态：{meta.fetch_status}</Tag>
      )}
    </div>
  )
}
