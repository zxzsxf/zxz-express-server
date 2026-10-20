const { test } = require('node:test')
const assert = require('node:assert/strict')
const componentService = require('../src/services/componentService')
const micro = require('../src/controllers/micro')
const { sequelize, models } = require('../src/models')

test('upload keeps the mobile manifest in a draft until explicit publish', async () => {
  const originals = []
  const replace = (object, key, value) => { originals.push([object, key, object[key]]); object[key] = value }
  let uploaded
  let activeUpdated = false
  try {
    replace(componentService, 'addComponentFile', async data => { uploaded = data; return data })
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } }
    await micro.uploadComponentFile({
      file: { size: 3, buffer: Buffer.from('abc') },
      body: { componentName: 'Input', version: '0.0.2', timestamp: '1700000000000', metadata: JSON.stringify({ lowcode: { schemaComponent: 'Input', platforms: ['mobile'] } }) }
    }, response)
    assert.equal(response.body.status, 'success')
    assert.equal(uploaded.status, 'draft')
    assert.equal(uploaded.publishInfo.status, 'draft')
    assert.equal(uploaded.publishTime, null)
    assert.equal(uploaded.metadata.lowcode.schemaComponent, 'Input')

    const component = { ...uploaded, async update(next) { Object.assign(this, next) }, toJSON() { return { ...this } } }
    replace(models.Component, 'findOne', async () => component)
    replace(sequelize, 'transaction', async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }))
    replace(componentService, 'updateActiveComponents', async () => { activeUpdated = true })
    const published = await componentService.publishComponent('Input', '0.0.2')
    assert.equal(published.status, 'published')
    assert.equal(published.publishInfo.status, 'published')
    assert.ok(published.publishTime instanceof Date)
    assert.equal(activeUpdated, true)
    await assert.rejects(componentService.publishComponent('Input', '0.0.2'), /只能发布草稿组件/)
  } finally {
    originals.reverse().forEach(([object, key, original]) => { object[key] = original })
  }
})
