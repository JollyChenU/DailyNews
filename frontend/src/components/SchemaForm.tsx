import type { ReactNode } from 'react'
import Form, { getDefaultRegistry } from '@rjsf/core'
import type { FieldProps, WidgetProps } from '@rjsf/utils'
import validator from '@rjsf/validator-ajv8'
import { Button, Card, Input, InputNumber, Select, Switch } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'

const TextWidget = ({ id, value, onChange, placeholder }: WidgetProps) => (
  <Input id={id} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
)

const TextareaWidget = ({ id, value, onChange, placeholder }: WidgetProps) => (
  <Input.TextArea
    id={id}
    value={value ?? ''}
    placeholder={placeholder}
    autoSize={{ minRows: 3, maxRows: 10 }}
    onChange={(event) => onChange(event.target.value)}
  />
)

const SelectWidget = ({ id, value, onChange, options }: WidgetProps) => (
  <Select
    id={id}
    value={value}
    style={{ width: '100%' }}
    options={(options.enumOptions || []).map((option: any) => ({ label: option.label, value: option.value }))}
    onChange={(next) => onChange(next)}
  />
)

const CheckboxWidget = ({ id, value, onChange }: WidgetProps) => (
  <div className="switch-field">
    <Switch id={id} checked={Boolean(value)} onChange={(checked) => onChange(checked)} />
  </div>
)

const NumberWidget = ({ id, value, onChange, schema }: WidgetProps) => (
  <InputNumber
    id={id}
    value={value}
    style={{ width: '100%' }}
    min={schema.minimum}
    max={schema.maximum}
    step={schema.type === 'integer' ? 1 : 0.1}
    onChange={onChange}
  />
)

const TagsWidget = ({ id, value, onChange, placeholder, disabled }: Pick<WidgetProps, 'id' | 'value' | 'onChange' | 'placeholder' | 'disabled'>) => (
  <Select
    id={id}
    mode="tags"
    value={Array.isArray(value) ? value : []}
    placeholder={placeholder}
    disabled={disabled}
    style={{ width: '100%' }}
    onChange={(next) => onChange(next)}
  />
)

const widgets = {
  TextWidget,
  TextareaWidget,
  SelectWidget,
  CheckboxWidget,
  UpDownWidget: NumberWidget,
  BaseInputTemplate: TextWidget,
}

const DefaultArrayField = getDefaultRegistry().fields.ArrayField

function ArrayField(props: FieldProps) {
  const { schema, formData, onChange, idSchema, disabled, readonly } = props
  if (schema.items && !Array.isArray(schema.items) && schema.items.type === 'string') {
    return (
      <TagsWidget
        id={idSchema.$id}
        value={formData}
        onChange={onChange}
        placeholder="输入后按回车添加"
        disabled={disabled || readonly}
      />
    )
  }
  return <DefaultArrayField {...props} />
}

function ArrayFieldTemplate(props: any) {
  const { items, canAdd, onAddClick, title, description, registry } = props
  const itemSchema = registry?.schema?.items
  const itemRef = itemSchema?.$ref?.split('/').pop()
  const itemTitle = itemSchema?.title || registry?.rootSchema?.$defs?.[itemRef]?.title
  const addLabel = title ? `添加 ${title}` : itemTitle ? `添加 ${itemTitle}` : '添加配置项'
  return (
    <div className="rjsf-array">
      {description && <p className="field-description">{description}</p>}
      {items.length === 0 && <div className="rjsf-array-empty">暂无配置项</div>}
      {items.length > 0 && (
        <div className="rjsf-array-items">
          {items.map((item: any, index: number) => (
            <Card
              key={item.key}
              size="small"
              className="rjsf-array-item"
              title={`${title || '列表'} ${index + 1}`}
              extra={
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => props.onDropClick(index)}
                  aria-label="删除配置项"
                />
              }
            >
              {item.children}
            </Card>
          ))}
        </div>
      )}
      {canAdd && (
        <Button type="dashed" block icon={<PlusOutlined />} onClick={onAddClick} className="rjsf-array-add">
          {addLabel}
        </Button>
      )}
    </div>
  )
}

const cardGridTitles = new Set(['新闻源设置', 'Profile 参数', '分类分组'])

function ObjectFieldTemplate(props: any) {
  const { title, description, properties } = props
  const cardGrid = cardGridTitles.has(title)
  const wideProperties = title === '新闻源设置' ? properties : []
  const compactProperties = cardGrid
    ? properties.filter((element: any) => !wideProperties.some((wide: any) => wide.name === element.name))
    : properties
  const renderProperty = (element: any, wide = false) => (
    <div key={element.name} className={`rjsf-property ${wide ? 'rjsf-card-wide' : ''}`}>
      {element.content}
    </div>
  )
  return (
    <Card size="small" className="rjsf-object" title={title && !title.endsWith('Config') ? title : undefined} bordered>
      {description && <p className="field-description">{description}</p>}
      {wideProperties.map((element: any) => renderProperty(element, true))}
      <div className={cardGrid ? 'rjsf-card-properties' : undefined}>
        {compactProperties.map((element: any) => renderProperty(element))}
      </div>
    </Card>
  )
}

function FieldTemplate(props: any): ReactNode {
  const { id, classNames, label, help, description, errors, children, hidden, schema } = props
  if (hidden) return children
  const isObject = schema?.type === 'object' || Boolean(schema?.properties)
  return (
    <div className={`rjsf-field ${classNames || ''}`}>
      {!isObject && label && <label htmlFor={id}>{label}</label>}
      {!isObject && description && <p className="field-description">{description}</p>}
      {children}
      {errors}
      {help && <p className="field-help">{help}</p>}
    </div>
  )
}

export function SchemaForm({
  schema,
  formData,
  onChange,
  uiSchema,
}: {
  schema: any
  formData: any
  onChange: (data: any) => void
  uiSchema?: any
}) {
  return (
    <Form
      schema={schema}
      formData={formData}
      validator={validator}
      onChange={({ formData }) => onChange(formData)}
      widgets={widgets as any}
      fields={{ ArrayField }}
      templates={{ ArrayFieldTemplate, ObjectFieldTemplate, FieldTemplate }}
      uiSchema={uiSchema}
      experimental_defaultFormStateBehavior={{ emptyObjectFields: 'skipDefaults', constAsDefaults: 'never' }}
      noHtml5Validate
      showErrorList={false}
    >
      <div />
    </Form>
  )
}

export { TagsWidget }
