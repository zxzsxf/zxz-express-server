const assert = require('assert')
const fs = require('fs')
const http = require('http')
const path = require('path')
const express = require('express')
const { Sequelize } = require('sequelize')
const config = require('../src/config')

const database = `zxz_component_file_test_${process.pid}_${Date.now()}`
const admin = new Sequelize(
  config.sequelizeConfig.database,
  config.sequelizeConfig.username,
  config.sequelizeConfig.password,
  { ...config.sequelizeConfig.connect, logging: false }
)

function request(port, method, pathname, body, contentType) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, method, path: pathname, headers: body ? {
      'Content-Type': contentType,
      'Content-Length': body.length
    } : {} }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

function uploadBody(fields, content) {
  const boundary = 'component-file-mysql-test'
  const chunks = []
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`))
  }
  if (content) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="input.js"\r\nContent-Type: application/javascript\r\n\r\n`))
    chunks.push(content, Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` }
}

async function main() {
  let sequelize
  let server
  let created = false
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    created = true
    config.sequelizeConfig.database = database
    config.DEBUG = false
    const db = require('../src/models')
    sequelize = db.sequelize
    await sequelize.sync({ alter: true })

    const app = express()
    app.use('/micro', require('../src/routes/micro'))
    server = app.listen(0)
    await new Promise(resolve => server.once('listening', resolve))
    const port = server.address().port
    const name = 'mysql-component-file-test'
    const content = Buffer.from('export const value = "数据库";\n')
    const sendUpload = async (fields, file = content) => {
      const multipart = uploadBody(fields, file)
      const response = await request(port, 'POST', '/micro/components/file/upload', multipart.body, multipart.contentType)
      return { ...response, json: JSON.parse(response.body.toString()) }
    }

    const missing = await sendUpload({ componentName: name }, null)
    assert.strictEqual(missing.status, 400)
    const invalid = await sendUpload({ componentName: name, version: 'bad', metadata: '{' })
    assert.strictEqual(invalid.status, 500)

    const uploaded = await sendUpload({ componentName: name, version: '1.0.0', timestamp: '1792324308048' })
    assert.strictEqual(uploaded.status, 200, uploaded.body.toString())
    const pathname = uploaded.json.data.path
    assert.strictEqual(pathname, `/micro/components/file/${name}/${name}-1792324308048.js`)
    assert.strictEqual(uploaded.json.data.info.fileSize, content.length)
    assert.strictEqual(fs.existsSync(path.join(__dirname, '..', 'components', name)), false)

    const downloaded = await request(port, 'GET', pathname)
    assert.strictEqual(downloaded.status, 200)
    assert(downloaded.body.equals(content))
    assert.strictEqual((await request(port, 'GET', '/micro/components/file/button/button-1748876097257.js')).status, 404)
    assert.strictEqual((await request(port, 'GET', `/micro/components/file/${name}/missing.js`)).status, 404)

    const duplicate = await sendUpload({ componentName: name, version: '1.0.0', timestamp: '1792324308049' })
    assert.strictEqual(duplicate.status, 500)
    const duplicatePath = await sendUpload({ componentName: name, version: '1.1.0', timestamp: '1792324308048' })
    assert.strictEqual(duplicatePath.status, 500)

    const originalFileCreate = db.models.ComponentFile.create
    db.models.ComponentFile.create = async () => { throw new Error('simulated file failure') }
    try {
      assert.strictEqual((await sendUpload({ componentName: name, version: '2.0.0', timestamp: '1792324308050' })).status, 500)
    } finally {
      db.models.ComponentFile.create = originalFileCreate
    }

    const originalActiveCreate = db.models.ActiveComponent.create
    db.models.ActiveComponent.create = async () => { throw new Error('simulated active failure') }
    try {
      assert.strictEqual((await sendUpload({ componentName: name, version: '3.0.0', timestamp: '1792324308051' })).status, 500)
    } finally {
      db.models.ActiveComponent.create = originalActiveCreate
    }

    assert.strictEqual(await db.models.Component.count(), 1)
    assert.strictEqual(await db.models.ComponentFile.count(), 1)
    assert.strictEqual(await db.models.ActiveComponent.count(), 1)
    const list = await request(port, 'GET', '/micro/components')
    assert.strictEqual(JSON.parse(list.body.toString()).data[name].length, 1)
    const activeList = await request(port, 'GET', '/micro/config/active-components')
    assert.strictEqual(JSON.parse(activeList.body.toString()).data[name].path, pathname)
    console.log('MySQL component file integration checks passed')
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (sequelize) await sequelize.close()
    if (created) await admin.query(`DROP DATABASE \`${database}\``)
    await admin.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
