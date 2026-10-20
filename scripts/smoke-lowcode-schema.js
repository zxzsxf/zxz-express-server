const mysql = require('mysql2/promise')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const bcrypt = require('bcryptjs')
const express = require('express')

async function main() {
  const database = `lowcode_smoke_${process.pid}_${Date.now()}`
  if (!/^lowcode_smoke_[0-9]+_[0-9]+$/.test(database)) throw new Error('Unsafe test database name')
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PWD || 'your_new_password'
  })
  let created = false
  let sequelize
  let models
  let server
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`)
    created = true
    process.env.DB_NAME = database
    process.env.NODE_ENV = 'production'
    process.env.LOWCODE_SESSION_SECRET = crypto.randomBytes(32).toString('hex')
    ;({ sequelize, models } = require('../src/models'))
    await sequelize.authenticate()
    for (const name of ['LowCodeUser', 'LowCodeDocument', 'LowCodeVersion', 'LowCodeSubmission']) await models[name].sync()
    const tables = await sequelize.getQueryInterface().showAllTables()
    for (const table of ['lowcode_users', 'lowcode_documents', 'lowcode_versions', 'lowcode_submissions']) {
      if (!tables.includes(table)) throw new Error(`Missing table: ${table}`)
    }
    await models.Component.sync()
    for (const [componentName, schemaComponent] of [['Input', 'Input'], ['card', 'Card']]) {
      await models.Component.create({ componentName, version: '0.0.2', filePath: `/micro/components/file/${componentName}/smoke.js`, time: String(Date.now()), status: 'published', metadata: { lowcode: { schemaComponent, platforms: ['mobile'] } } })
    }
    const password = 'smoke-password-123'
    const passwordHash = await bcrypt.hash(password, 4)
    for (const [username, roles] of [['smoke_m', ['M']], ['smoke_b', ['B']], ['smoke_c', ['C']]]) await models.LowCodeUser.create({ username, passwordHash, roles })

    const app = express()
    app.use(express.json())
    app.use('/api/lowcode', require('../src/routes/lowcode'))
    server = app.listen(0)
    const base = `http://127.0.0.1:${server.address().port}/api/lowcode`
    const login = async username => {
      const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
      assert.equal(response.status, 200)
      const payload = await response.json()
      return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: payload.data.csrf }
    }
    const request = async (session, path, method = 'GET', body) => {
      const response = await fetch(`${base}${path}`, { method, headers: { cookie: session.cookie, 'x-lowcode-csrf': session.csrf, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: response.status, payload: await response.json() }
    }
    const m = await login('smoke_m')
    const b = await login('smoke_b')
    const c = await login('smoke_c')
    for (const [componentName, schemaComponent] of [['Input', 'Input'], ['card', 'Card']]) {
      const id = `${componentName}:0.0.2`
      const field = { type: 'string', 'x-component': 'Input' }
      const binding = schemaComponent === 'Input' ? 'x-component-props.placeholder' : 'x-component-props.title'
      assert.equal((await request(m, '/component-configs', 'POST', { id, title: id, schema: { type: 'object', properties: { setting: field } }, bindings: { setting: binding } })).status, 200)
      assert.equal((await request(m, `/component-configs/${encodeURIComponent(id)}/publish`, 'POST', { revision: 1 })).status, 200)
    }
    const locks = { Input: { remoteName: 'Input', version: '0.0.2', configVersion: 1 }, Card: { remoteName: 'card', version: '0.0.2', configVersion: 1 } }
    const schema = { type: 'object', properties: { card: { type: 'void', 'x-component': 'Card', properties: { name: { type: 'string', title: '姓名', required: true, 'x-component': 'Input' } } } } }
    assert.equal((await request(m, '/templates', 'POST', { id: 'customer', title: '客户模板', schema, componentLocks: locks })).status, 200)
    assert.equal((await request(m, '/templates/customer/publish', 'POST', { revision: 1 })).status, 200)
    assert.equal((await request(b, '/forms', 'POST', { id: 'customer1', title: '客户登记', templateId: 'customer' })).status, 200)
    assert.equal((await request(b, '/forms/customer1/publish', 'POST', { revision: 1 })).status, 200)
    const published = await request(c, '/forms/customer1/published')
    assert.equal(published.status, 200)
    assert.equal(published.payload.data.version, 1)
    assert.equal((await request(c, '/forms/customer1/submissions', 'POST', { publishVersion: 1, values: {} })).status, 400)
    const submission = await request(c, '/forms/customer1/submissions', 'POST', { publishVersion: 1, values: { name: '张三' } })
    assert.equal(submission.status, 200)
    const saved = await models.LowCodeSubmission.findByPk(submission.payload.data.id)
    assert.equal(saved.values.name, '张三')
    assert.equal(saved.publishVersion, 1)
    console.log('Low-code MySQL M→B→C smoke test passed')
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (sequelize) await sequelize.close()
    if (created) await admin.query(`DROP DATABASE \`${database}\``)
    await admin.end()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
