import { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Descriptions, Form, Input, InputNumber, Row, Space, Spin, Typography, message } from 'antd'
import { FolderOpenOutlined, SaveOutlined } from '@ant-design/icons'
import { api } from '../api'
import type { AppContext } from '../types'
import { shortPath } from '../utils'

const { Text } = Typography

export function SettingsPage() {
  const [context, setContext] = useState<AppContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const result = await api.context()
      setContext(result)
      form.setFieldsValue(result.saved)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '读取设置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const result = await api.saveSettings(values)
      message.success('设置已保存，重启 Horizon Console 后生效。')
      setContext((current) => (current ? { ...current, saved: result.saved, restart_required: true } : current))
      form.setFieldsValue(result.saved)
    } catch (error) {
      if (error instanceof Error && 'errorFields' in error) return
      message.error(error instanceof Error ? error.message : '保存设置失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-loading"><Spin size="large" /></div>

  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <h1>设置</h1>
          <p>Horizon 路径在程序启动时加载，修改后需要重启本地服务。</p>
        </div>
      </div>

      {context?.error && <Alert type="error" showIcon message="当前 Horizon 连接异常" description={context.error} className="page-alert" />}
      {context?.restart_required && (
        <Alert type="warning" showIcon message="路径设置尚未生效" description="保存的新路径会在下次启动 Horizon Console 时使用。" className="page-alert" />
      )}

      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Card title="Horizon 工作区">
            <Form form={form} layout="vertical" onFinish={save}>
              <Form.Item
                label="Horizon 路径"
                name="horizon_path"
                rules={[{ required: true, message: '请输入 Horizon checkout 路径' }]}
                extra="目录中应包含 pyproject.toml 和 src/mcp/service.py。"
              >
                <Input placeholder="C:\path\to\Horizon" />
              </Form.Item>
              <Form.Item
                label="配置文件"
                name="config_path"
                rules={[{ required: true, message: '请输入配置文件路径' }]}
                extra="可以使用绝对路径，也可以使用相对于 Horizon 目录的路径。"
              >
                <Input placeholder="data/config.json" />
              </Form.Item>
              <Form.Item label="本地端口" name="port" rules={[{ required: true, message: '请输入端口' }]}>
                <InputNumber min={1024} max={65535} style={{ width: '100%' }} />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存设置</Button>
                <Button icon={<FolderOpenOutlined />} onClick={load}>重新读取</Button>
              </Space>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="当前生效路径">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Horizon">{shortPath(context?.active?.horizon_path, 72)}</Descriptions.Item>
              <Descriptions.Item label="配置">{shortPath(context?.active?.config_path, 72)}</Descriptions.Item>
              <Descriptions.Item label="运行目录">{shortPath(context?.active?.runs_root, 72)}</Descriptions.Item>
              <Descriptions.Item label="日报目录">{shortPath(context?.active?.summaries_dir, 72)}</Descriptions.Item>
            </Descriptions>
            <Text type="secondary">修改路径不会移动或复制任何 Horizon 文件。</Text>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
