'use strict'

const fs = require('fs')
const path = require('path')
const moment = require('moment')
const componentService = require('../services/componentService')

// 组件存储目录
const componentsDir = path.join(__dirname, '..','data', 'components')

// 确保组件目录存在
if (!fs.existsSync(componentsDir)) {
  fs.mkdirSync(componentsDir, { recursive: true })
}

// 组件信息文件路径
const componentsInfoPath = path.join(componentsDir, 'components-info.json')
// 活跃组件配置文件路径
const activeComponentsPath = path.join(componentsDir, 'active-components.json')

// 确保文件存在
function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}), 'utf-8')
  }
}

ensureFile(componentsInfoPath)
ensureFile(activeComponentsPath)

// 读取组件信息（兼容旧版本）
const readComponentsInfo = () => {
  try {
    return JSON.parse(fs.readFileSync(componentsInfoPath, 'utf-8'))
  } catch (error) {
    return {}
  }
}

// 保存组件信息（兼容旧版本）
const saveComponentsInfo = (info) => {
  fs.writeFileSync(componentsInfoPath, JSON.stringify(info, null, 2), 'utf-8')
}

// 读取活跃组件配置（兼容旧版本）
const readActiveComponents = () => {
  try {
    return JSON.parse(fs.readFileSync(activeComponentsPath, 'utf-8'))
  } catch (error) {
    return {}
  }
}

// 保存活跃组件配置（兼容旧版本）
const saveActiveComponents = (info) => {
  fs.writeFileSync(activeComponentsPath, JSON.stringify(info, null, 2), 'utf-8')
}

// 更新活跃组件配置（兼容旧版本）
const updateActiveComponents = () => {
  const componentsInfo = readComponentsInfo()
  const activeComponents = {}

  for (const [componentName, versions] of Object.entries(componentsInfo)) {
    if (versions.length > 0) {
      activeComponents[componentName] = versions[0]
    }
  }

  saveActiveComponents(activeComponents)
  return activeComponents
}

// 查找组件
const findComponent = async (req, res) => {
  try {
    const { componentName, version } = req.body
    
    if (!componentName || !version) {
      return res.status(400).json({ error: '组件名称和版本都是必需的' })
    }

    const component = await componentService.findComponent(componentName, version)
    
    if (!component) {
      return res.status(404).json({ error: '未找到该组件' })
    }

    // 获取服务器的域名和端口
    const protocol = req.protocol
    const host = req.get('host')
    const baseUrl = `${protocol}://${host}`

    // 返回完整的组件信息，包括完整的URL
    const result = {
      ...component,
      path: `${baseUrl}${component.filePath}`
    }

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// 发布组件
const publishComponent = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const { componentName, version } = req.body
    
    if (!componentName || !version) {
      res_data.code = 400
      res_data.msg = '组件名称和版本都是必需的'
      return res_data
    }

    const component = await componentService.publishComponent(componentName, version)
    
    res_data.data = {
      component: component
    }
    res_data.code = 200
    res_data.msg = '发布组件成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

// 新增组件信息
const addComponentInfo = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const { componentName } = req.params
    const componentData = req.body
    
    // 添加组件名称到数据中
    componentData.componentName = componentName
    
    const component = await componentService.addComponent(componentData)

    res_data.data = component
    res_data.code = 200
    res_data.msg = '新增组件信息成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

// 获取组件列表
const getComponents = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const components = await componentService.getAllComponents()
    res_data.data = components
    res_data.code = 200
    res_data.msg = '获取组件列表成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

// 获取组件版本列表
const getComponentVersions = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const { componentName } = req.params
    const versions = await componentService.getComponentVersions(componentName)
    res_data.data = versions
    res_data.code = 200
    res_data.msg = '获取组件版本列表成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

// 获取组件信息配置
const getComponentsInfo = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const components = await componentService.getAllComponents()
    res_data.data = components
    res_data.code = 200
    res_data.msg = '获取组件信息配置成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

// 更新组件信息
const updateComponentInfo = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const { componentName, timestamp } = req.params
    const updateData = req.body
    
    const component = await componentService.updateComponent(componentName, timestamp, updateData)
    
    res_data.data = component
    res_data.code = 200
    res_data.msg = '更新组件信息成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

// 删除组件信息
const deleteComponentInfo = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const { componentName, timestamp } = req.params
    
    await componentService.deleteComponent(componentName, timestamp)
    
    res_data.code = 200
    res_data.msg = '删除组件信息成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

// 获取活跃组件配置
const getActiveComponents = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const activeComponents = await componentService.getActiveComponents()
    res_data.data = activeComponents
    res_data.code = 200
    res_data.msg = '获取活跃组件配置成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

// 更新活跃组件配置
const updateActiveComponentsConfig = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const activeComponents = await componentService.updateActiveComponents()
    res_data.data = activeComponents
    res_data.code = 200
    res_data.msg = '更新活跃组件配置成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

// 获取组件文件
const getComponentFile = async (req, res) => {
  try {
    const { componentName, filename } = req.params
    const filePath = path.join(componentsDir, componentName, filename)
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        status: 'error',
        message: '文件不存在'
      })
    }
    
    res.sendFile(filePath)
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    })
  }
}

// 上传组件文件
const uploadComponentFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: '未上传文件'
      })
    }

    const componentName = req.body.componentName
    const version = req.body.version || 'unknown'
    const timestamp = req.body.timestamp || Date.now()
    const buildInfo = req.body.buildInfo || ''
    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {}
    
    // 创建组件数据
    const componentData = {
      componentName,
      version,
      filePath: `/micro/components/file/${componentName}/${req.file.filename}`,
      time: timestamp.toString(),
      publisher: req.body.publisher || 'system',
      description: req.body.description || `Version ${version}`,
      status: 'published',
      metadata: {
        name: metadata.name,
        dependencies: metadata.dependencies || {},
        peerDependencies: metadata.peerDependencies || {},
        author: metadata.author,
        license: metadata.license,
        repository: metadata.repository || {}
      },
      buildDetails: metadata.buildDetails || {},
      publishInfo: {
        publisher: req.body.publisher || 'system',
        publishTime: timestamp.toString(),
        description: req.body.description || `Version ${version}`,
        buildInfo: buildInfo,
        status: 'published'
      },
      buildTime: metadata.buildDetails?.buildTime ? new Date(metadata.buildDetails.buildTime) : null,
      publishTime: new Date(parseInt(timestamp))
    }

    // 添加组件到数据库
    const component = await componentService.addComponent(componentData)
    
    // 更新活跃组件配置
    await componentService.updateActiveComponents()
    
    res.json({
      status: 'success',
      data: {
        filename: req.file.filename,
        path: component.filePath,
        info: component
      },
      message: '上传组件文件成功'
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    })
  }
}

// 数据迁移接口
const migrateData = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    await componentService.migrateFromFileSystem()
    res_data.code = 200
    res_data.msg = '数据迁移成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

module.exports = {
  getComponents,
  findComponent,
  publishComponent,
  addComponentInfo,
  getComponentVersions,
  updateComponentInfo,
  deleteComponentInfo,
  getComponentFile,
  uploadComponentFile,
  getComponentsInfo,
  getActiveComponents,
  updateActiveComponentsConfig,
  migrateData
}
