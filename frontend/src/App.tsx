import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import {
  ApiOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Badge, Button, ConfigProvider, Layout, Menu, Space, Tag, Tooltip, Typography } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { api } from './api'
import { Dashboard } from './pages/Dashboard'
import { ConfigPage } from './pages/ConfigPage'
import { RunsPage } from './pages/RunsPage'
import { RunDetailPage } from './pages/RunDetailPage'
import { ArchivesPage } from './pages/ArchivesPage'
import { SettingsPage } from './pages/SettingsPage'
import type { AppContext } from './types'
import { shortPath } from './utils'

const { Header, Sider, Content, Footer } = Layout
const { Text } = Typography

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: <NavLink to="/">总览</NavLink> },
  { key: '/config', icon: <ApiOutlined />, label: <NavLink to="/config">配置管理</NavLink> },
  { key: '/runs', icon: <FolderOpenOutlined />, label: <NavLink to="/runs">运行记录</NavLink> },
  { key: '/archives', icon: <FileTextOutlined />, label: <NavLink to="/archives">历史日报</NavLink> },
  { key: '/settings', icon: <SettingOutlined />, label: <NavLink to="/settings">设置</NavLink> },
]

export default function App() {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 900)
  const [context, setContext] = useState<AppContext | null>(null)
  const location = useLocation()

  useEffect(() => {
    api.context().then(setContext).catch(() => setContext(null))
  }, [location.pathname])

  const selectedKey = location.pathname.startsWith('/runs') ? '/runs' : location.pathname

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#6366f1',
          colorInfo: '#6366f1',
          borderRadius: 10,
          fontFamily: 'Inter, "Segoe UI", "Microsoft YaHei", sans-serif',
        },
        components: {
          Menu: { darkItemBg: '#111827', darkSubMenuItemBg: '#111827', darkItemSelectedBg: '#312e81' },
          Card: { boxShadowTertiary: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.04)' },
        },
      }}
    >
      <Layout className="app-layout">
        <Sider trigger={null} collapsible collapsed={collapsed} width={232} className="app-sider">
          <div className="brand">
            <div className="brand-mark"><ThunderboltOutlined /></div>
            {!collapsed && (
              <div className="brand-copy">
                <strong>Horizon</strong>
                <span>Console</span>
              </div>
            )}
          </div>
          <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={menuItems} />
          {!collapsed && (
            <div className="sider-note">
              <Badge status="success" text="本地运行" />
              <Text type="secondary">数据不会上传到第三方服务</Text>
            </div>
          )}
        </Sider>
        <Layout>
          <Header className="app-header">
            <Button
              type="text"
              className="collapse-button"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((value) => !value)}
            />
            <div className="header-path">
              <Text type="secondary">Horizon</Text>
              <Tooltip title={context?.active?.horizon_path || '尚未配置 Horizon 路径'}>
                <Text ellipsis className="header-path-value">{shortPath(context?.active?.horizon_path, 72)}</Text>
              </Tooltip>
            </div>
            <Space>
              <Tag color={context?.error ? 'red' : context?.active ? 'green' : 'default'}>
                {context?.error ? '连接异常' : context?.active ? '已连接' : '未配置'}
              </Tag>
            </Space>
          </Header>
          <Content className="app-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/config" element={<ConfigPage />} />
              <Route path="/runs" element={<RunsPage />} />
              <Route path="/runs/:runId" element={<RunDetailPage />} />
              <Route path="/archives" element={<ArchivesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Content>
          <Footer className="app-footer">Horizon Console · 本机配置与结果管理</Footer>
        </Layout>
      </Layout>
    </ConfigProvider>
  )
}
