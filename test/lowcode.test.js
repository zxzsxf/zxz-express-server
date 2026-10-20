const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const bcrypt = require('bcryptjs')
process.env.LOWCODE_SESSION_SECRET = 'test-secret-with-at-least-thirty-two-characters'
const { sequelize, models } = require('../src/models')
const router = require('../src/routes/lowcode')

test('M publishes config and template, B publishes a form, C submits values', async () => {
  const docs = new Map()
  const versions = new Map()
  const originals = []
  const replace = (object, key, value) => { originals.push([object, key, object[key]]); object[key] = value }
  const row = value => ({ ...value, updated_at: new Date(), toJSON() { return { ...this } }, async update(next) { Object.assign(this, next); return this } })
  const user = { id: 'user-1', username: 'tester', roles: ['M', 'B', 'C'], active: true, passwordHash: bcrypt.hashSync('test-password-123', 4) }
  const respondent = { ...user, id: 'user-2', username: 'respondent', roles: ['C'] }
  replace(models.LowCodeUser, 'findOne', async ({ where }) => where.username === 'respondent' ? respondent : user)
  replace(models.LowCodeUser, 'findByPk', async id => id === respondent.id ? respondent : user)
  replace(models.LowCodeDocument, 'create', async data => { const saved = row({ revision: 1, publishedVersion: null, bindings: {}, ...data }); docs.set(data.id, saved); return saved })
  replace(models.LowCodeDocument, 'findByPk', async id => docs.get(id) || null)
  replace(models.LowCodeDocument, 'findAll', async ({ where }) => [...docs.values()].filter(item => item.kind === where.kind))
  replace(models.LowCodeVersion, 'create', async data => { const saved = row(data); versions.set(`${data.documentId}:${data.version}`, saved); return saved })
  replace(models.LowCodeVersion, 'findOne', async ({ where }) => versions.get(`${where.documentId}:${where.version}`) || null)
  replace(models.LowCodeSubmission, 'create', async data => row({ id: 'submission-1', ...data }))
  replace(models.Component, 'findOne', async ({ where }) => where.componentName === 'Input' && where.version === '1.0.0' ? row({ componentName: 'Input', version: '1.0.0', status: 'published', metadata: { lowcode: { schemaComponent: 'Input' } } }) : null)
  let activeVersion = '1.0.0'
  replace(models.ActiveComponent, 'findOne', async ({ where }) => where.componentName === 'Input' && where.version === activeVersion ? row(where) : null)
  replace(sequelize, 'transaction', async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }))
  const app = express()
  app.use(express.json())
  app.use('/api/lowcode', router)
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}/api/lowcode`
  try {
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'tester', password: 'test-password-123' }) })
    assert.equal(login.status, 200)
    const body = await login.json()
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const request = async (path, method = 'GET', data) => {
      const response = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json', 'x-lowcode-csrf': body.data.csrf }, body: data === undefined ? undefined : JSON.stringify(data) })
      return [response.status, await response.json()]
    }
    let status
    // Button configuration uses Input as the editor and label as the binding.
    ;[status] = await request('/component-configs', 'POST', { id: 'button:1.0.0', title: 'Button 配置', schema: { type: 'object', properties: { label: { type: 'string', 'x-component': 'Input' } } }, bindings: { label: 'x-component-props.label' } })
    assert.equal(status, 200)
    const button = { type: 'void', 'x-component': 'Button', 'x-component-props': { label: '提交' } }
    const buttonLocks = { Button: { remoteName: 'button', version: '1.0.0', configVersion: 1 } }
    ;[status] = await request('/templates', 'POST', { id: 'buttonTemplate', title: '按钮模板', schema: { type: 'object', properties: { submit: button } }, componentLocks: buttonLocks })
    assert.equal(status, 200)
    ;[status] = await request('/templates', 'POST', { id: 'invalidButton', title: '非法按钮', schema: { type: 'object', properties: { submit: { ...button, 'x-component-props': { placeholder: '不支持' } } } }, componentLocks: buttonLocks })
    assert.equal(status, 400)
    ;[status] = await request('/templates', 'POST', { id: 'unlockedButton', title: '缺失锁定', schema: { type: 'object', properties: { submit: button } } })
    assert.equal(status, 400)
    ;[status] = await request('/component-configs', 'POST', { id: 'Input:1.0.0', title: 'Input 配置', schema: { type: 'object', properties: { placeholder: { type: 'string', 'x-component': 'Input' } } }, bindings: { placeholder: 'x-component-props.placeholder' } })
    assert.equal(status, 200)
    ;[status] = await request('/component-configs/Input%3A1.0.0/publish', 'POST', { revision: 1 })
    assert.equal(status, 200)
    const field = { type: 'string', title: '姓名', required: true, 'x-component': 'Input', 'x-component-props': { placeholder: '请输入' } }
    const locks = { Input: { remoteName: 'Input', version: '1.0.0', configVersion: 1 } }
    ;[status] = await request('/templates', 'POST', { id: 'customer', title: '客户模板', schema: { type: 'object', properties: { name: field } }, componentLocks: locks })
    assert.equal(status, 200)
    ;[status] = await request('/templates/customer/publish', 'POST', { revision: 1 })
    assert.equal(status, 200)
    ;[status] = await request('/forms', 'POST', { id: 'form1', title: '客户登记', templateId: 'customer' })
    assert.equal(status, 200)
    ;[status] = await request('/forms/form1/publish', 'POST', { revision: 1 })
    assert.equal(status, 200)
    const [editStatus] = await request('/forms/form1', 'PUT', { revision: 1, title: '未发布的新标题', schema: { type: 'object', properties: { name: field } }, componentLocks: locks })
    assert.equal(editStatus, 200)
    const [, published] = await request('/forms/form1/published')
    assert.equal(published.data.title, '客户登记')
    ;[status] = await request('/forms/form1/submissions', 'POST', { publishVersion: 1, values: {} })
    assert.equal(status, 400)
    const [submitStatus, submit] = await request('/forms/form1/submissions', 'POST', { publishVersion: 1, values: { name: '张三' } })
    assert.equal(submitStatus, 200)
    assert.equal(submit.data.id, 'submission-1')
    assert.equal(submit.data.publishVersion, 1)
    ;[status] = await request('/forms/form1/submissions', 'POST', { publishVersion: 2, values: { name: '张三' } })
    assert.equal(status, 400)
    const [conflict] = await request('/forms/form1', 'PUT', { revision: 0, title: '旧标题', schema: { type: 'object', properties: { name: field } }, componentLocks: locks })
    assert.equal(conflict, 409)
    // Bundled templates persist unused selected components and private config schemas.
    const configSchema = { type: 'object', properties: { hint: { type: 'string', title: '提示', 'x-component': 'Input' } } }
    const bundle = { Input: { remoteName: 'Input', version: '1.0.0', configVersion: 0, defaultFieldSchema: field, configSchema, configBindings: { hint: 'x-component-props.placeholder' } } }
    const [bundleStatus, bundleResult] = await request('/templates', 'POST', { id: 'bundled', title: '组合模板', schema: { type: 'object', properties: {} }, componentLocks: bundle })
    assert.equal(bundleStatus, 200)
    assert.deepEqual(bundleResult.data.componentLocks, bundle)
    activeVersion = '2.0.0'
    assert.equal((await request('/templates', 'POST', { id: 'inactiveBundle', title: '已失活组件', componentLocks: bundle }))[0], 400)
    assert.equal(docs.has('template:inactiveBundle'), false)
    activeVersion = '1.0.0'
    assert.equal((await request('/templates/bundled/publish', 'POST', { revision: 1 }))[0], 200)
    const [derivedStatus, derived] = await request('/forms', 'POST', { id: 'derived', title: '模板业务表单', templateId: 'bundled' })
    assert.equal(derivedStatus, 200)
    assert.deepEqual(derived.data.componentLocks, bundle)
    assert.equal((await request('/forms/derived/publish', 'POST', { revision: 1 }))[0], 200)
    const invalid = { Input: { ...bundle.Input, configBindings: { hint: 'x-component-props.script' } } }
    assert.equal((await request('/templates', 'POST', { id: 'invalidBundle', title: '非法绑定', componentLocks: invalid }))[0], 400)
    // Editing another template does not mutate an already published snapshot.
    const changedBundle = { Input: { ...bundle.Input, configSchema: { type: 'object', properties: {} }, configBindings: {} } }
    assert.equal((await request('/templates/bundled', 'PUT', { revision: 1, title: '修改配置', schema: { type: 'object', properties: {} }, componentLocks: changedBundle }))[0], 200)
    const [, frozen] = await request('/templates/bundled/versions/1')
    assert.deepEqual(frozen.data.componentLocks, bundle)
    assert.equal((await request('/templates/bundled', 'PUT', { revision: 1, title: '过期', schema: { type: 'object', properties: {} }, componentLocks: bundle }))[0], 409)
    const cLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'respondent', password: 'test-password-123' }) })
    const cBody = await cLogin.json()
    const cCookie = cLogin.headers.get('set-cookie').split(';')[0]
    const cRequest = (path, method = 'GET', data, csrf = cBody.data.csrf) => fetch(`${base}${path}`, { method, headers: { cookie: cCookie, 'content-type': 'application/json', ...(csrf ? { 'x-lowcode-csrf': csrf } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) })
    assert.equal((await cRequest('/forms/published')).status, 200)
    assert.equal((await cRequest('/templates', 'POST', { id: 'blocked', title: 'No' })).status, 403)
    assert.equal((await cRequest('/forms/form1/submissions', 'POST', { publishVersion: 1, values: { name: '李四' } }, '')).status, 403)
    assert.equal((await cRequest('/forms/form1/submissions', 'POST', { publishVersion: 1, values: { name: '李四' } })).status, 200)
  } finally {
    await new Promise(resolve => server.close(resolve))
    originals.reverse().forEach(([object, key, original]) => { object[key] = original })
  }
})
