const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { models } = require('../src/models')
const formRouter = require('../src/routes/forms')

test('form API validates, saves and reads route schemas', async () => {
  const model = models.FlowForm
  const original = { findAll: model.findAll, findByPk: model.findByPk, findOne: model.findOne, create: model.create }
  const rows = new Map()
  const row = data => ({
    ...data,
    updated_at: new Date(),
    toJSON() { return { ...this } },
    async update(next) { Object.assign(this, next); this.updated_at = new Date(); return this }
  })
  model.findAll = async () => [...rows.values()]
  model.findByPk = async code => rows.get(code) || null
  model.findOne = async ({ where }) => {
    if (where.path) return [...rows.values()].find(item => item.path === where.path) || null
    return [...rows.values()].find(item => item.formCode.toLowerCase() === where.right) || null
  }
  model.create = async data => { const saved = row(data); rows.set(data.formCode, saved); return saved }

  const app = express()
  app.use(express.json())
  app.use('/api/forms', formRouter)
  const server = app.listen(0)
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/forms`
    const post = body => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const valid = { formCode: 'customer', title: '客户登记', placement: 'route', path: '/forms/customer', schema: { type: 'object', properties: {} } }
    assert.equal((await (await fetch(base)).json()).data.length, 0)
    assert.equal((await fetch(`${base}/missing`)).status, 404)
    assert.equal((await post({ ...valid, schema: {} })).status, 400)
    assert.equal((await post({ ...valid, path: '/other/customer' })).status, 400)
    assert.equal((await post({ ...valid, placement: 'inline', path: undefined })).status, 400)
    assert.equal((await post(valid)).status, 200)
    assert.deepEqual((await (await fetch(`${base}/customer`)).json()).data.schema, valid.schema)
    assert.equal((await post({ ...valid, formCode: 'CUSTOMER' })).status, 409)
    assert.equal((await post({ ...valid, formCode: 'other' })).status, 409)
    assert.equal((await post({ ...valid, title: '更新后的名称' })).status, 200)
    assert.equal((await (await fetch(`${base}/customer`)).json()).data.title, '更新后的名称')
  } finally {
    await new Promise(resolve => server.close(resolve))
    Object.assign(model, original)
  }
})
