'use strict'

const fs = require('fs')
const path = require('path')
const moment = require('moment')

// 组件信息文件路径
const componentsInfoPath = path.join(__dirname, '..', 'data', 'components', 'components-info.json')
// 活跃组件配置文件路径
const activeComponentsPath = path.join(__dirname, '..', 'data', 'components', 'active-components.json')

// 确保目录存在
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// 确保文件存在
const ensureFile = (filePath, defaultContent = '{}') => {
  const dirPath = path.dirname(filePath)
  ensureDir(dirPath)
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, defaultContent, 'utf-8')
  }
}

// 初始化文件
ensureFile(componentsInfoPath)
ensureFile(activeComponentsPath)

// 读取组件信息
const readComponentsInfo = () => {
  try {
    return JSON.parse(fs.readFileSync(componentsInfoPath, 'utf-8'))
  } catch (error) {
    return {}
  }
}

// 保存组件信息
const saveComponentsInfo = (info) => {
  fs.writeFileSync(componentsInfoPath, JSON.stringify(info, null, 2), 'utf-8')
}

// 读取活跃组件配置
const readActiveComponents = () => {
  try {
    return JSON.parse(fs.readFileSync(activeComponentsPath, 'utf-8'))
  } catch (error) {
    return {}
  }
}

// 保存活跃组件配置
const saveActiveComponents = (info) => {
  fs.writeFileSync(activeComponentsPath, JSON.stringify(info, null, 2), 'utf-8')
}

// 更新活跃组件配置
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
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const { componentName, version } = req.body
    
    if (!componentName || !version) {
      res_data.code = 400
      res_data.msg = '组件名称和版本都是必需的'
      return res_data
    }

    const componentsInfo = readComponentsInfo()
    
    if (!componentsInfo[componentName]) {
      res_data.code = 404
      res_data.msg = '未找到该组件'
      return res_data
    }

    const componentVersion = componentsInfo[componentName].find(v => v.version === version)
    
    if (!componentVersion) {
      res_data.code = 404
      res_data.msg = '未找到该版本的组件'
      return res_data
    }

    const protocol = req.protocol
    const host = req.get('host')
    const baseUrl = `${protocol}://${host}`

    res_data.data = {
      ...componentVersion,
      path: `${baseUrl}${componentVersion.path}`
    }
    res_data.code = 200
    res_data.msg = '查找组件成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

// 发布组件
const publishComponent = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const { componentName, path, version } = req.body
    
    if (!componentName || !path || !version) {
      res_data.code = 400
      res_data.msg = '组件名称、路径和版本都是必需的'
      return res_data
    }

    const componentsInfo = readComponentsInfo()
    const activeComponents = readActiveComponents()
    
    if (!componentsInfo[componentName]) {
      res_data.code = 404
      res_data.msg = '未找到该组件'
      return res_data
    }

    const componentVersion = componentsInfo[componentName].find(v => v.version === version)
    
    if (!componentVersion) {
      res_data.code = 404
      res_data.msg = '未找到该版本的组件'
      return res_data
    }

    componentVersion.publishInfo.status = 'published'
    componentVersion.publishInfo.publishTime = Date.now().toString()
    
    const activeComponentInfo = {
      ...componentVersion,
    }

    activeComponents[componentName] = activeComponentInfo
    saveActiveComponents(activeComponents)

    res_data.data = {
      component: activeComponentInfo,
      activeComponents: activeComponents
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
    const componentsInfo = readComponentsInfo()

    if (!componentsInfo[componentName]) {
      componentsInfo[componentName] = []
    }

    componentsInfo[componentName].unshift(componentData)
    saveComponentsInfo(componentsInfo)

    res_data.data = componentData
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
    const componentsInfo = readComponentsInfo()
    res_data.data = componentsInfo
    res_data.code = 200
    res_data.msg = '获取组件列表成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

// 获取组件版本信息
const getComponentVersions = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const { componentName } = req.params
    const componentsInfo = readComponentsInfo()
    res_data.data = componentsInfo[componentName] || []
    res_data.code = 200
    res_data.msg = '获取组件版本信息成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

// 获取组件信息文件
const getComponentsInfo = async (req, res) => {
  let res_data = { code: 0, msg: '', data: {} }
  try {
    const componentsInfo = readComponentsInfo()
    const protocol = req.protocol
    const host = req.get('host')
    const baseUrl = `${protocol}://${host}`

    const fullPathComponentsInfo = Object.entries(componentsInfo).reduce((acc, [componentName, versions]) => {
      acc[componentName] = versions.map(version => ({
        ...version,
        path: `${baseUrl}${version.path}`
      }))
      return acc
    }, {})

    res_data.data = fullPathComponentsInfo
    res_data.code = 200
    res_data.msg = '获取组件信息文件成功'
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
    const componentsInfo = readComponentsInfo()

    if (!componentsInfo[componentName]) {
      res_data.code = 404
      res_data.msg = '未找到该组件'
      return res_data
    }

    const componentIndex = componentsInfo[componentName].findIndex(c => c.time === timestamp)
    if (componentIndex === -1) {
      res_data.code = 404
      res_data.msg = '未找到该版本的组件'
      return res_data
    }

    componentsInfo[componentName][componentIndex] = {
      ...componentsInfo[componentName][componentIndex],
      ...updateData
    }

    saveComponentsInfo(componentsInfo)
    res_data.data = componentsInfo[componentName][componentIndex]
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
    const componentsInfo = readComponentsInfo()

    if (!componentsInfo[componentName]) {
      res_data.code = 404
      res_data.msg = '未找到该组件'
      return res_data
    }

    const initialLength = componentsInfo[componentName].length
    componentsInfo[componentName] = componentsInfo[componentName].filter(c => c.time !== timestamp)

    if (initialLength === componentsInfo[componentName].length) {
      res_data.code = 404
      res_data.msg = '未找到该版本的组件'
      return res_data
    }

    if (componentsInfo[componentName].length === 0) {
      delete componentsInfo[componentName]
    }

    saveComponentsInfo(componentsInfo)
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
    const activeComponents = readActiveComponents()
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
    const activeComponents = updateActiveComponents()
    res_data.data = activeComponents
    res_data.code = 200
    res_data.msg = '更新活跃组件配置成功'
  } catch (error) {
    res_data.code = 500
    res_data.msg = error.message
  }
  return res_data
}

module.exports = {
  findComponent,
  publishComponent,
  addComponentInfo,
  getComponents,
  getComponentVersions,
  getComponentsInfo,
  updateComponentInfo,
  deleteComponentInfo,
  getActiveComponents,
  updateActiveComponentsConfig
}
