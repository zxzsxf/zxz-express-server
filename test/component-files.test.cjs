const assert = require('assert')
const fs = require('fs')
const http = require('http')
const path = require('path')
const express = require('express')

const root = path.join(__dirname, '..')
let components = []
let files = []
let active = []
let nextId = 1
let failFile = false
let failActive = false
const row = data => ({ ...data, toJSON: () => ({ ...data }) })

const models = {
  Component: {
    async create(data, options) {
      assert(options.transaction)
      if (components.some(item => item.componentName === data.componentName && item.version === data.version)) {
        throw new Error('duplicate version')
      }
      const component = row({ id: nextId++, ...data })
      components.push(component)
      return component
    },
    async findAll(options) {
      if (options.where?.status) return components.filter(item => item.status === options.where.status).slice().reverse()
      return components.slice().reverse()
    }
  },
  ComponentFile: {
    async create(data, options) {
      assert(options.transaction)
      if (failFile) throw new Error('file write failed')
      if (files.some(item => item.filePath === data.filePath)) throw new Error('duplicate path')
      files.push(data)
    },
    async findOne(options) {
      return files.find(item => item.filePath === options.where.filePath) || null
    }
  },
  ActiveComponent: {
    async destroy(options) {
      assert(options.transaction)
      active = []
    },
    async create(data, options) {
      assert(options.transaction)
      if (failActive) throw new Error('active update failed')
      const item = row(data)
      active.push(item)
      return item
    },
    async findAll() { return active }
  }
}

const modelsPath = require.resolve('../src/models')
require.cache[modelsPath] = {
  id: modelsPath,
  filename: modelsPath,
  loaded: true,
  exports: {
    models,
    sequelize: {
      async transaction(callback) {
        const before = { components: components.slice(), files: files.slice(), active: active.slice() }
        try { return await callback({}) } catch (error) {
          components = before.components
          files = before.files
          active = before.active
          throw error
        }
      }
    }
  }
}

const app = express()
app.use('/micro', require('../src/routes/micro'))

function request(port, method, pathname, body, contentType) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, method, path: pathname, headers: body ? {
      'Content-Type': contentType,
      'Content-Length': body.length
    } : {} }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

function uploadBody(fields, content) {
  const boundary = 'component-file-test-boundary'
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
  const server = app.listen(0)
  await new Promise(resolve => server.once('listening', resolve))
  const port = server.address().port
  const name = 'db-file-test'
  const content = Buffer.from('export const value = "数据库";\n')
  const sendUpload = async (fields, file = content) => {
    const multipart = uploadBody(fields, file)
    const response = await request(port, 'POST', '/micro/components/file/upload', multipart.body, multipart.contentType)
    return { ...response, json: JSON.parse(response.body.toString()) }
  }

  try {
    const missing = await sendUpload({ componentName: name }, null)
    assert.strictEqual(missing.status, 400)

    const invalid = await sendUpload({ componentName: name, version: 'bad', metadata: '{' })
    assert.strictEqual(invalid.status, 500)
    assert.strictEqual(components.length, 0)

    const uploaded = await sendUpload({ componentName: name, version: '1.0.0', timestamp: '1792324308048' })
    assert.strictEqual(uploaded.status, 200)
    assert.strictEqual(uploaded.json.data.filename, `${name}-1792324308048.js`)
    assert.strictEqual(uploaded.json.data.path, `/micro/components/file/${name}/${name}-1792324308048.js`)
    assert.strictEqual(uploaded.json.data.info.fileSize, content.length)
    assert.strictEqual(files.length, 1)
    assert.strictEqual(active.length, 1)
    assert.strictEqual(fs.existsSync(path.join(root, 'components', name)), false)

    const downloaded = await request(port, 'GET', uploaded.json.data.path)
    assert.strictEqual(downloaded.status, 200)
    assert(downloaded.headers['content-type'].startsWith('application/javascript'))
    assert(downloaded.body.equals(content))

    const notFound = await request(port, 'GET', `/micro/components/file/${name}/missing.js`)
    assert.strictEqual(notFound.status, 404)
    const oldLocal = await request(port, 'GET', '/micro/components/file/button/button-1748876097257.js')
    assert.strictEqual(oldLocal.status, 404)

    const duplicate = await sendUpload({ componentName: name, version: '1.0.0', timestamp: '1792324308049' })
    assert.strictEqual(duplicate.status, 500)
    assert.strictEqual(components.length, 1)
    assert.strictEqual(files.length, 1)

    const duplicatePath = await sendUpload({ componentName: name, version: '1.1.0', timestamp: '1792324308048' })
    assert.strictEqual(duplicatePath.status, 500)
    assert.strictEqual(components.length, 1)
    assert.strictEqual(files.length, 1)

    failFile = true
    const fileFailure = await sendUpload({ componentName: name, version: '2.0.0', timestamp: '1792324308050' })
    failFile = false
    assert.strictEqual(fileFailure.status, 500)
    assert.strictEqual(components.length, 1)

    failActive = true
    const activeFailure = await sendUpload({ componentName: name, version: '3.0.0', timestamp: '1792324308051' })
    failActive = false
    assert.strictEqual(activeFailure.status, 500)
    assert.strictEqual(components.length, 1)
    assert.strictEqual(files.length, 1)
    assert.strictEqual(active.length, 1)

    const list = await request(port, 'GET', '/micro/components')
    assert.strictEqual(JSON.parse(list.body.toString()).data[name].length, 1)
    const activeList = await request(port, 'GET', '/micro/config/active-components')
    assert.strictEqual(JSON.parse(activeList.body.toString()).data[name].path, uploaded.json.data.path)
    console.log('Component file upload, download, rollback, and list checks passed')
  } finally {
    server.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
