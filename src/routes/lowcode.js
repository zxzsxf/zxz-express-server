const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { sequelize, models } = require('../models')

const router = express.Router()
const { LowCodeUser: User, LowCodeDocument: Document, LowCodeVersion: Version, LowCodeSubmission: Submission, Component } = models
const secret = process.env.LOWCODE_SESSION_SECRET
const cookieName = 'lowcode_session'
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error }
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const send = (res, data) => res.json({ code: 0, data })
const parseCookie = (header = '') => Object.fromEntries(header.split(';').map(entry => entry.trim().split('=')).filter(parts => parts.length === 2))
const role = (...allowed) => (req, _res, next) => req.user?.roles?.some(item => allowed.includes(item)) ? next() : next(Object.assign(new Error('Forbidden'), { status: 403 }))
const noScript = value => value !== undefined && JSON.stringify(value).length <= 256 * 1024 && !/"(?:x-reactions|x-validator|x-data|onClick|onChange|script)"\s*:/.test(JSON.stringify(value))
const schemaComponents = (node, depth = 0, found = new Set()) => {
  if (!node || typeof node !== 'object' || Array.isArray(node) || depth > 12) fail(400, 'Invalid schema')
  if (node['x-component']) {
    if (!['Input', 'Card', 'Button'].includes(node['x-component'])) fail(400, 'Unsupported component')
    found.add(node['x-component'])
    const allowed = { Input: ['placeholder', 'disabled'], Card: ['title'], Button: ['label'] }[node['x-component']]
    const props = node['x-component-props'] || {}
    if (Object.keys(props).some(key => !allowed.includes(key))) fail(400, 'Unsupported component property')
  }
  if (node.properties) {
    if (typeof node.properties !== 'object' || Array.isArray(node.properties)) fail(400, 'Invalid properties')
    for (const child of Object.values(node.properties)) schemaComponents(child, depth + 1, found)
  }
  return found
}
const validateSchema = (schema, locks = {}) => {
  if (schema?.type !== 'object' || !schema.properties || !noScript(schema)) fail(400, 'Invalid schema')
  if (!locks || typeof locks !== 'object' || Array.isArray(locks)) fail(400, 'Invalid component locks')
  const used = schemaComponents(schema)
  for (const name of used) if (!locks[name]?.version || !locks[name]?.remoteName) fail(400, `Missing component lock: ${name}`)
  for (const name of Object.keys(locks)) if (!used.has(name) && !locks[name]?.configSchema) fail(400, `Unused component lock: ${name}`)
}
const validateBundle = async (locks, requireActive = false) => {
  if (!locks || typeof locks !== 'object' || Array.isArray(locks) || !noScript(locks)) fail(400, 'Invalid component definitions')
  for (const [name, lock] of Object.entries(locks)) {
    if (!lock || typeof lock !== 'object' || typeof lock.remoteName !== 'string' || typeof lock.version !== 'string') fail(400, 'Invalid component definition')
    if (!lock.configSchema) continue
    validateConfig(lock.configSchema, lock.configBindings, `${lock.remoteName}:${lock.version}`)
    if (!lock.defaultFieldSchema || lock.defaultFieldSchema['x-component'] !== name) fail(400, 'Invalid component schema')
    schemaComponents(lock.defaultFieldSchema)
    const component = await Component.findOne({ where: { componentName: lock.remoteName, version: lock.version, status: 'published' } })
    if (!component || component.metadata?.lowcode?.schemaComponent !== name) fail(400, `Unavailable component: ${name}`)
    if (requireActive) {
      const active = await models.ActiveComponent.findOne({ where: { componentName: lock.remoteName, version: lock.version } })
      if (!active) fail(400, `Component is no longer active: ${name}`)
    }
  }
}
const publicDoc = row => {
  const value = row.toJSON()
  return { id: value.id, kind: value.kind, title: value.title, schema: value.schema, componentLocks: value.componentLocks || {}, bindings: value.bindings || {}, revision: value.revision, publishedVersion: value.publishedVersion, sourceTemplateId: value.sourceTemplateId, sourceTemplateVersion: value.sourceTemplateVersion, createdAt: value.created_at, updatedAt: value.updated_at }
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
  const allowed = ['title', 'description', 'required', 'x-component-props.placeholder', 'x-component-props.disabled', 'x-component-props.title', 'x-component-props.label']
  if (Object.values(bindings).some(path => !allowed.includes(path))) fail(400, 'Unsupported binding')
}
const validateConfig = (schema, bindings, id) => {
  if (schema?.type !== 'object' || !schema.properties || !noScript(schema)) fail(400, 'Invalid configuration schema')
  validateBindings(bindings)
  const fields = Object.entries(schema.properties)
  if (fields.some(([key, field]) => !bindings[key] || !['Input', 'Switch'].includes(field?.['x-component']))) fail(400, 'Configuration fields need supported controls and bindings')
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
    const component = await Component.findOne({ where: { componentName: lock.remoteName, version: lock.version, status: 'published' } })
    if (!component || component.metadata?.lowcode?.schemaComponent !== name) fail(400, `Unavailable component: ${name}`)
    if (lock.configSchema) {
      validateConfig(lock.configSchema, lock.configBindings, `${lock.remoteName}:${lock.version}`)
      continue
    }
    const config = await getDoc('config', `${lock.remoteName}:${lock.version}`)
    if (!lock.configVersion || !config.publishedVersion || lock.configVersion > config.publishedVersion) fail(400, `Unavailable configuration: ${name}`)
    await getVersion(config.id, lock.configVersion)
  }
}

router.post('/auth/login', wrap(async (req, res) => {
  if (!secret || secret.length < 32) fail(503, 'Session secret is not configured')
  const { username, password } = req.body || {}
  const user = typeof username === 'string' ? await User.findOne({ where: { username, active: true } }) : null
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) fail(401, 'Invalid credentials')
  const csrf = crypto.randomBytes(24).toString('hex')
  const token = jwt.sign({ sub: user.id, csrf }, secret, { expiresIn: '8h' })
  res.cookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600 * 1000, path: '/api/lowcode' })
  send(res, { id: user.id, username: user.username, roles: user.roles, csrf })
}))
router.use(wrap(async (req, _res, next) => {
  if (!secret || secret.length < 32) fail(503, 'Session secret is not configured')
  const token = parseCookie(req.headers.cookie)[cookieName]
  if (!token) fail(401, 'Login required')
  let payload
  try { payload = jwt.verify(token, secret) } catch { fail(401, 'Session expired') }
  const user = await User.findByPk(payload.sub)
  if (!user?.active) fail(401, 'Login required')
  req.user = user
  req.csrf = payload.csrf
  next()
}))
router.get('/auth/me', wrap(async (req, res) => send(res, { id: req.user.id, username: req.user.username, roles: req.user.roles, csrf: req.csrf })))
router.post('/auth/logout', wrap(async (req, res) => { res.clearCookie(cookieName, { path: '/api/lowcode' }); send(res, true) }))
router.use((req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-lowcode-csrf'] !== req.csrf) fail(403, 'Invalid CSRF token')
  next()
})

router.get('/components', role('M', 'B'), wrap(async (_req, res) => {
  const rows = await Component.findAll({ where: { status: 'published' }, order: [['componentName', 'ASC'], ['created_at', 'DESC']] })
  send(res, rows.map(row => ({ componentName: row.componentName, version: row.version, manifest: row.metadata?.lowcode })).filter(item => item.manifest?.platforms?.includes('mobile')))
}))

const listDocs = kind => wrap(async (_req, res) => {
  const rows = await Document.findAll({ where: { kind }, order: [['updated_at', 'DESC']] })
  send(res, rows.map(publicDoc))
})
const readDoc = kind => wrap(async (req, res) => send(res, publicDoc(await getDoc(kind, req.params.id))))
const createDoc = kind => wrap(async (req, res) => {
  const { id, title, schema, componentLocks = {}, bindings = {}, templateId, templateVersion } = req.body || {}
  const validId = kind === 'config' ? /^[A-Za-z][A-Za-z0-9_-]{0,63}:[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/.test(id || '') : /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id || '')
  if (!validId || typeof title !== 'string' || !title.trim()) fail(400, 'Invalid document identity')
  let initialSchema = schema || { type: 'object', properties: {} }
  let initialLocks = componentLocks
  let sourceTemplateVersion = null
  if (kind === 'form' && templateId) {
    const template = await getDoc('template', templateId)
    sourceTemplateVersion = templateVersion || template.publishedVersion
    const source = await getVersion(template.id, sourceTemplateVersion)
    initialSchema = source.schema
    initialLocks = source.componentLocks
  }
  if (kind === 'config') validateConfig(initialSchema, bindings, id)
  else validateSchema(initialSchema, initialLocks)
  await validateBundle(initialLocks, kind === 'template')
  const row = await Document.create({ id: docId(kind, id), kind, title: title.trim(), schema: initialSchema, componentLocks: initialLocks, bindings, sourceTemplateId: templateId || null, sourceTemplateVersion })
  send(res, publicDoc(row))
})
const updateDoc = kind => wrap(async (req, res) => {
  const { revision, title, schema, componentLocks = {}, bindings = {} } = req.body || {}
  if (!Number.isInteger(revision) || typeof title !== 'string' || !title.trim()) fail(400, 'Invalid update')
  if (kind === 'config') validateConfig(schema, bindings, req.params.id)
  else validateSchema(schema, componentLocks)
  await validateBundle(componentLocks)
  if (kind === 'template') {
    const previous = await getDoc(kind, req.params.id)
    const additions = Object.fromEntries(Object.entries(componentLocks).filter(([name, lock]) => !previous.componentLocks?.[name] || previous.componentLocks[name].version !== lock.version || previous.componentLocks[name].remoteName !== lock.remoteName))
    await validateBundle(additions, true)
  }
  const data = await sequelize.transaction(async transaction => {
    const row = await getDoc(kind, req.params.id, { transaction, lock: transaction.LOCK.UPDATE })
    if (row.revision !== revision) fail(409, 'Document changed; reload before saving')
    await row.update({ title: title.trim(), schema, componentLocks, bindings, revision: revision + 1 }, { transaction })
    return publicDoc(row)
  })
  send(res, data)
})
const publishDoc = kind => wrap(async (req, res) => {
  const data = await sequelize.transaction(async transaction => {
    const row = await getDoc(kind, req.params.id, { transaction, lock: transaction.LOCK.UPDATE })
    if (row.revision !== req.body?.revision) fail(409, 'Document changed; reload before publishing')
    if (kind === 'config') {
      validateConfig(row.schema, row.bindings, req.params.id)
      const [componentName, componentVersion] = req.params.id.split(':')
      if (!await Component.findOne({ where: { componentName, version: componentVersion, status: 'published' } })) fail(400, 'Component version is not published')
    }
    else { validateSchema(row.schema, row.componentLocks); await verifyLocks(row.componentLocks) }
    const version = (row.publishedVersion || 0) + 1
    await Version.create({ documentId: row.id, version, title: row.title, schema: row.schema, componentLocks: row.componentLocks, bindings: row.bindings, publishedBy: req.user.id }, { transaction })
    await row.update({ publishedVersion: version }, { transaction })
    return { version }
  })
  send(res, data)
})
const publishedDoc = kind => wrap(async (req, res) => {
  const doc = await getDoc(kind, req.params.id)
  if (!doc.publishedVersion) fail(404, 'Not published')
  const snapshot = await getVersion(doc.id, req.params.version ? Number(req.params.version) : doc.publishedVersion)
  send(res, { id: req.params.id, title: snapshot.title, version: snapshot.version, schema: snapshot.schema, componentLocks: snapshot.componentLocks, bindings: snapshot.bindings || {} })
})

router.get('/templates', role('M', 'B'), listDocs('template'))
router.post('/templates', role('M'), createDoc('template'))
router.get('/templates/:id', role('M'), readDoc('template'))
router.put('/templates/:id', role('M'), updateDoc('template'))
router.post('/templates/:id/publish', role('M'), publishDoc('template'))
router.get('/templates/:id/published', role('M', 'B'), publishedDoc('template'))
router.get('/templates/:id/versions/:version', role('M', 'B'), publishedDoc('template'))

router.get('/component-configs', role('M', 'B'), listDocs('config'))
router.post('/component-configs', role('M'), createDoc('config'))
router.get('/component-configs/:id', role('M'), readDoc('config'))
router.put('/component-configs/:id', role('M'), updateDoc('config'))
router.post('/component-configs/:id/publish', role('M'), publishDoc('config'))
router.get('/component-configs/:id/published', role('M', 'B'), publishedDoc('config'))
router.get('/component-configs/:id/versions/:version', role('M', 'B'), publishedDoc('config'))

router.get('/forms', role('B'), listDocs('form'))
router.get('/forms/published', role('M', 'B', 'C'), wrap(async (_req, res) => {
  const rows = await Document.findAll({ where: { kind: 'form' }, order: [['updated_at', 'DESC']] })
  send(res, rows.filter(row => row.publishedVersion).map(row => ({ id: row.id.slice('form:'.length), title: row.title, version: row.publishedVersion })))
}))
router.post('/forms', role('B'), createDoc('form'))
router.get('/forms/:id/published', role('M', 'B', 'C'), publishedDoc('form'))
router.post('/forms/:id/submissions', role('M', 'B', 'C'), wrap(async (req, res) => {
  const doc = await getDoc('form', req.params.id)
  if (!doc.publishedVersion) fail(404, 'Not published')
  const values = req.body?.values
  const requestedVersion = req.body?.publishVersion
  if (!Number.isInteger(requestedVersion) || requestedVersion < 1 || requestedVersion > doc.publishedVersion) fail(400, 'Invalid publish version')
  if (!values || typeof values !== 'object' || Array.isArray(values) || !noScript(values)) fail(400, 'Invalid values')
  const snapshot = await getVersion(doc.id, requestedVersion)
  validateSubmission(snapshot.schema, values)
  const row = await Submission.create({ formCode: req.params.id, publishVersion: requestedVersion, userId: req.user.id, values })
  send(res, { id: row.id, publishVersion: row.publishVersion })
}))
router.get('/forms/:id', role('B'), readDoc('form'))
router.get('/forms/:id/versions/:version', role('M', 'B', 'C'), publishedDoc('form'))
router.put('/forms/:id', role('B'), updateDoc('form'))
router.post('/forms/:id/publish', role('B'), publishDoc('form'))

router.use((error, _req, res, _next) => {
  const status = error.status || (error.name === 'SequelizeUniqueConstraintError' ? 409 : 500)
  if (status === 500) console.error(error)
  res.status(status).json({ code: status, msg: status === 500 ? 'Low-code service unavailable' : error.message })
})
module.exports = router
