const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { sequelize, models } = require('../models')

const {
  LowCodeUser: User,
  LowCodeDocument: Document,
  LowCodeVersion: Version,
  LowCodeSubmission: Submission,
  Component
} = models

const secret = process.env.LOWCODE_SESSION_SECRET

const fail = (status, message) => {
  const error = new Error(message)
  error.status = status
  throw error
}

const noScript = value => {
  if (value === undefined) return false
  const serialized = JSON.stringify(value)
  if (serialized.length > 256 * 1024) return false

  let safe = true
  JSON.parse(serialized, (key, entry) => {
    if (['x-data', 'onClick', 'onChange', 'script'].includes(key)) {
      safe = false
    }
    if (['x-validator', 'x-reactions'].includes(key)) {
      const empty = entry === null || entry === '' ||
        (typeof entry === 'object' && Object.keys(entry).length === 0)
      if (!empty) safe = false
    }
    return entry
  })
  return safe
}

const schemaComponents = (node, depth = 0, found = new Set()) => {
  if (!node || typeof node !== 'object' || Array.isArray(node) || depth > 12) fail(400, 'Invalid schema')
  if (node['x-component']) {
    if (!['Input', 'Card', 'Button'].includes(node['x-component'])) fail(400, 'Unsupported component')
    found.add(node['x-component'])
    const allowed = {
      Input: ['placeholder', 'disabled'],
      Card: ['title'],
      Button: ['label']
    }[node['x-component']]
    const props = node['x-component-props'] || {}
    if (Object.keys(props).some(key => !allowed.includes(key))) fail(400, 'Unsupported component property')
  }
  if (node.properties) {
    if (typeof node.properties !== 'object' || Array.isArray(node.properties)) fail(400, 'Invalid properties')
    for (const child of Object.values(node.properties)) {
      schemaComponents(child, depth + 1, found)
    }
  }
  return found
}

const validateSchema = (schema, locks = {}) => {
  if (schema?.type !== 'object' || !schema.properties || !noScript(schema)) fail(400, 'Invalid schema')
  if (!locks || typeof locks !== 'object' || Array.isArray(locks)) fail(400, 'Invalid component locks')
  const used = schemaComponents(schema)
  for (const name of used) {
    if (!locks[name]?.version || !locks[name]?.remoteName) fail(400, `Missing component lock: ${name}`)
  }
  for (const name of Object.keys(locks)) {
    if (!used.has(name) && !locks[name]?.configSchema) fail(400, `Unused component lock: ${name}`)
  }
}

const validateBundle = async (locks, requireActive = false) => {
  if (!locks || typeof locks !== 'object' || Array.isArray(locks) || !noScript(locks)) fail(400, 'Invalid component definitions')
  for (const [name, lock] of Object.entries(locks)) {
    if (!lock || typeof lock !== 'object' || typeof lock.remoteName !== 'string' || typeof lock.version !== 'string') fail(400, 'Invalid component definition')
    if (!lock.configSchema) continue
    validateConfig(lock.configSchema, lock.configBindings || {}, `${lock.remoteName}:${lock.version}`, false)
    if (!lock.defaultFieldSchema || lock.defaultFieldSchema['x-component'] !== name) fail(400, 'Invalid component schema')
    schemaComponents(lock.defaultFieldSchema)
    const component = await Component.findOne({
      where: { componentName: lock.remoteName, version: lock.version, status: 'published' }
    })
    if (!component || component.metadata?.lowcode?.schemaComponent !== name) fail(400, `Unavailable component: ${name}`)
    if (requireActive) {
      const active = await models.ActiveComponent.findOne({
        where: { componentName: lock.remoteName, version: lock.version }
      })
      if (!active) fail(400, `Component is no longer active: ${name}`)
    }
  }
}

// 以组件锁中的配置为准，确保 Schema 与配置表单同步，包含尚未放入画布的已选组件。
const withComponentConfigs = (schema, locks) => {
  const configs = Object.fromEntries(
    Object.entries(locks)
      .filter(([, lock]) => Boolean(lock.configSchema))
      .map(([name, lock]) => [name, {
        schema: lock.configSchema,
        bindings: lock.configBindings || {}
      }])
  )
  const next = { ...schema }
  delete next['x-component-configs']
  if (Object.keys(configs).length) next['x-component-configs'] = configs
  return next
}

const publicDoc = row => {
  const value = row.toJSON()
  return {
    id: value.id,
    kind: value.kind,
    title: value.title,
    schema: value.schema,
    componentLocks: value.componentLocks || {},
    bindings: value.bindings || {},
    revision: value.revision,
    publishedVersion: value.publishedVersion,
    sourceTemplateId: value.sourceTemplateId,
    sourceTemplateVersion: value.sourceTemplateVersion,
    createdAt: value.created_at,
    updatedAt: value.updated_at
  }
}

const docId = (kind, id) => `${kind}:${id}`
const getDoc = async (kind, id, options = {}) => {
  const row = await Document.findByPk(docId(kind, id), options)
  if (!row || row.kind !== kind) fail(404, 'Document not found')
  return row
}

const getVersion = async (documentId, version) => {
  const row = await Version.findOne({ where: { documentId, version } })
  if (!row) fail(404, 'Published version not found')
  return row
}

const validateBindings = bindings => {
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) fail(400, 'Invalid bindings')
  const allowed = [
    'title',
    'description',
    'required',
    'x-component-props.placeholder',
    'x-component-props.disabled',
    'x-component-props.title',
    'x-component-props.label'
  ]
  if (Object.values(bindings).some(path => !allowed.includes(path))) fail(400, 'Unsupported binding')
}

const validateConfig = (schema, bindings, id, requireBindings = true) => {
  if (schema?.type !== 'object' || !schema.properties || !noScript(schema)) fail(400, 'Invalid configuration schema')
  validateBindings(bindings)
  const fields = Object.entries(schema.properties)
  if (fields.some(([key, field]) => (requireBindings && !bindings[key]) || !['Input', 'Switch'].includes(field?.['x-component']))) fail(400, 'Configuration fields need supported controls and bindings')
  if (Object.keys(bindings).some(key => !schema.properties[key])) fail(400, 'Unknown configuration binding')
  const componentName = id.split(':')[0]
  const allowed = {
    card: ['title', 'x-component-props.title'],
    button: ['title', 'x-component-props.label']
  }[componentName.toLowerCase()] || ['title', 'required', 'x-component-props.placeholder', 'x-component-props.disabled']
  if (Object.values(bindings).some(path => !allowed.includes(path))) fail(400, 'Binding is not supported by this component')
}

const validateSubmission = (schema, values) => {
  for (const [name, field] of Object.entries(schema.properties || {})) {
    const value = values?.[name]
    if (field.required && (value === undefined || value === null || value === '')) fail(400, `${field.title || name} is required`)
    if (field['x-component'] === 'Input' && value !== undefined && value !== null && typeof value !== 'string') fail(400, `Invalid value for ${name}`)
    if (field.properties) validateSubmission(field, field.type === 'void' ? values : (value || {}))
  }
}

const verifyLocks = async locks => {
  for (const [name, lock] of Object.entries(locks)) {
    const component = await Component.findOne({
      where: { componentName: lock.remoteName, version: lock.version, status: 'published' }
    })
    if (!component || component.metadata?.lowcode?.schemaComponent !== name) fail(400, `Unavailable component: ${name}`)
    if (lock.configSchema) {
      validateConfig(lock.configSchema, lock.configBindings || {}, `${lock.remoteName}:${lock.version}`, false)
      continue
    }
    const config = await getDoc('config', `${lock.remoteName}:${lock.version}`)
    if (!lock.configVersion || !config.publishedVersion || lock.configVersion > config.publishedVersion) fail(400, `Unavailable configuration: ${name}`)
    await getVersion(config.id, lock.configVersion)
  }
}

const login = async body => {
  if (!secret || secret.length < 32) fail(503, 'Session secret is not configured')
  const { username, password } = body || {}
  const user = typeof username === 'string' ? await User.findOne({ where: { username, active: true } }) : null
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) fail(401, 'Invalid credentials')
  const csrf = crypto.randomBytes(24).toString('hex')
  const token = jwt.sign({ sub: user.id, csrf }, secret, { expiresIn: '8h' })
  return { token, user, csrf }
}

const authenticate = async token => {
  if (!secret || secret.length < 32) fail(503, 'Session secret is not configured')
  if (!token) fail(401, 'Login required')
  let payload
  try {
    payload = jwt.verify(token, secret)
  } catch {
    fail(401, 'Session expired')
  }
  const user = await User.findByPk(payload.sub)
  if (!user?.active) fail(401, 'Login required')
  return { user, csrf: payload.csrf }
}

const listComponents = async () => {
  const rows = await Component.findAll({
    where: { status: 'published' },
    order: [['componentName', 'ASC'], ['created_at', 'DESC']]
  })
  return rows.map(row => ({
    componentName: row.componentName,
    version: row.version,
    manifest: row.metadata?.lowcode
  }))
    .filter(item => item.manifest?.platforms?.includes('mobile'))
}

const listDocs = async kind => {
  const rows = await Document.findAll({ where: { kind }, order: [['updated_at', 'DESC']] })
  return rows.map(publicDoc)
}

const readDoc = async (kind, id) => publicDoc(await getDoc(kind, id))

const createDoc = async (kind, body) => {
  const { id, title, schema, componentLocks = {}, bindings = {}, templateId, templateVersion } = body || {}
  const validId = kind === 'config'
    ? /^[A-Za-z][A-Za-z0-9_-]{0,63}:[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/.test(id || '')
    : /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id || '')
  if (!validId || typeof title !== 'string' || !title.trim()) fail(400, 'Invalid document identity')
  let initialSchema = schema || { type: 'object', properties: {} }
  let initialLocks = componentLocks
  let sourceTemplateVersion = null
  if (kind === 'form' && templateId) {
    const template = await getDoc('template', templateId)
    if (!template.publishedVersion) fail(404, 'Not published')
    sourceTemplateVersion = templateVersion || template.publishedVersion
    const source = await getVersion(template.id, sourceTemplateVersion)
    initialSchema = source.schema
    initialLocks = source.componentLocks
  }
  if (kind === 'config') validateConfig(initialSchema, bindings, id)
  else validateSchema(initialSchema, initialLocks)
  await validateBundle(initialLocks, kind === 'template')
  if (kind !== 'config') {
    initialSchema = withComponentConfigs(initialSchema, initialLocks)
    validateSchema(initialSchema, initialLocks)
  }
  const row = await Document.create({
    id: docId(kind, id),
    kind,
    title: title.trim(),
    schema: initialSchema,
    componentLocks: initialLocks,
    bindings,
    sourceTemplateId: templateId || null,
    sourceTemplateVersion
  })
  return publicDoc(row)
}

const updateDoc = async (kind, id, body) => {
  const { revision, title, schema, componentLocks = {}, bindings = {} } = body || {}
  if (!Number.isInteger(revision) || typeof title !== 'string' || !title.trim()) fail(400, 'Invalid update')
  if (kind === 'config') validateConfig(schema, bindings, id)
  else validateSchema(schema, componentLocks)
  await validateBundle(componentLocks)
  if (kind === 'template') {
    const previous = await getDoc(kind, id)
    const additions = Object.fromEntries(Object.entries(componentLocks).filter(([name, lock]) =>
      !previous.componentLocks?.[name] ||
      previous.componentLocks[name].version !== lock.version ||
      previous.componentLocks[name].remoteName !== lock.remoteName
    ))
    await validateBundle(additions, true)
  }
  const savedSchema = kind === 'config' ? schema : withComponentConfigs(schema, componentLocks)
  if (kind !== 'config') validateSchema(savedSchema, componentLocks)
  return sequelize.transaction(async transaction => {
    const row = await getDoc(kind, id, { transaction, lock: transaction.LOCK.UPDATE })
    if (row.revision !== revision) fail(409, 'Document changed; reload before saving')
    await row.update({ title: title.trim(), schema: savedSchema, componentLocks, bindings, revision: revision + 1 }, { transaction })
    return publicDoc(row)
  })
}

const publishDoc = async (kind, id, body, userId) => sequelize.transaction(async transaction => {
  const row = await getDoc(kind, id, { transaction, lock: transaction.LOCK.UPDATE })
  if (row.revision !== body?.revision) fail(409, 'Document changed; reload before publishing')
  if (kind === 'config') {
    validateConfig(row.schema, row.bindings, id)
    const [componentName, componentVersion] = id.split(':')
    if (!await Component.findOne({ where: { componentName, version: componentVersion, status: 'published' } })) fail(400, 'Component version is not published')
  } else {
    validateSchema(row.schema, row.componentLocks)
    await verifyLocks(row.componentLocks)
  }
  const latestVersion = await Version.max('version', { where: { documentId: row.id }, transaction })
  const version = (latestVersion || 0) + 1
  await Version.create({ documentId: row.id, version, title: row.title, schema: row.schema, componentLocks: row.componentLocks, bindings: row.bindings, publishedBy: userId }, { transaction })
  await row.update({ publishedVersion: version }, { transaction })
  return { version }
})

const unpublishTemplate = async (id, body) => sequelize.transaction(async transaction => {
  const row = await getDoc('template', id, { transaction, lock: transaction.LOCK.UPDATE })
  if (row.revision !== body?.revision) fail(409, 'Document changed; reload before unpublishing')
  await row.update({ publishedVersion: null }, { transaction })
  return publicDoc(row)
})

const publishedDoc = async (kind, id, version) => {
  const doc = await getDoc(kind, id)
  if (!doc.publishedVersion) fail(404, 'Not published')
  const snapshot = await getVersion(doc.id, version ? Number(version) : doc.publishedVersion)
  return {
    id,
    title: snapshot.title,
    version: snapshot.version,
    schema: snapshot.schema,
    componentLocks: snapshot.componentLocks,
    bindings: snapshot.bindings || {}
  }
}

const listPublishedForms = async () => {
  const rows = await Document.findAll({ where: { kind: 'form' }, order: [['updated_at', 'DESC']] })
  return rows.filter(row => row.publishedVersion)
    .map(row => ({
      id: row.id.slice('form:'.length),
      title: row.title,
      version: row.publishedVersion
    }))
}

const createSubmission = async (id, body, userId) => {
  const doc = await getDoc('form', id)
  if (!doc.publishedVersion) fail(404, 'Not published')
  const values = body?.values
  const requestedVersion = body?.publishVersion
  if (!Number.isInteger(requestedVersion) || requestedVersion < 1 || requestedVersion > doc.publishedVersion) fail(400, 'Invalid publish version')
  if (!values || typeof values !== 'object' || Array.isArray(values) || !noScript(values)) fail(400, 'Invalid values')
  const snapshot = await getVersion(doc.id, requestedVersion)
  validateSubmission(snapshot.schema, values)
  const row = await Submission.create({ formCode: id, publishVersion: requestedVersion, userId, values })
  return { id: row.id, publishVersion: row.publishVersion }
}

module.exports = {
  fail,
  login,
  authenticate,
  listComponents,
  listDocs,
  readDoc,
  createDoc,
  updateDoc,
  publishDoc,
  unpublishTemplate,
  publishedDoc,
  listPublishedForms,
  createSubmission
}
