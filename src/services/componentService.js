const { models } = require('../models')
const fs = require('fs')
const path = require('path')

const { Component, ActiveComponent } = models

class ComponentService {
  // 获取所有组件信息
  async getAllComponents() {
    try {
      const components = await Component.findAll({
        order: [['componentName', 'ASC'], ['created_at', 'DESC']]
      })
      
      // 按组件名称分组
      const groupedComponents = {}
      components.forEach(component => {
        const componentData = component.toJSON()
        if (!groupedComponents[componentData.componentName]) {
          groupedComponents[componentData.componentName] = []
        }
        groupedComponents[componentData.componentName].push(componentData)
      })
      
      return groupedComponents
    } catch (error) {
      throw new Error(`获取组件信息失败: ${error.message}`)
    }
  }

  // 获取指定组件的所有版本
  async getComponentVersions(componentName) {
    try {
      const components = await Component.findAll({
        where: { componentName },
        order: [['created_at', 'DESC']]
      })
      return components.map(component => component.toJSON())
    } catch (error) {
      throw new Error(`获取组件版本失败: ${error.message}`)
    }
  }

  // 查找指定组件和版本
  async findComponent(componentName, version) {
    try {
      const component = await Component.findOne({
        where: { componentName, version }
      })
      return component ? component.toJSON() : null
    } catch (error) {
      throw new Error(`查找组件失败: ${error.message}`)
    }
  }

  // 添加组件信息
  async addComponent(componentData) {
    try {
      const component = await Component.create(componentData)
      return component.toJSON()
    } catch (error) {
      throw new Error(`添加组件失败: ${error.message}`)
    }
  }

  // 更新组件信息
  async updateComponent(componentName, time, updateData) {
    try {
      const component = await Component.findOne({
        where: { componentName, time }
      })
      
      if (!component) {
        throw new Error('组件不存在')
      }
      
      await component.update(updateData)
      return component.toJSON()
    } catch (error) {
      throw new Error(`更新组件失败: ${error.message}`)
    }
  }

  // 删除组件信息
  async deleteComponent(componentName, time) {
    try {
      const result = await Component.destroy({
        where: { componentName, time }
      })
      
      if (result === 0) {
        throw new Error('组件不存在')
      }
      
      return true
    } catch (error) {
      throw new Error(`删除组件失败: ${error.message}`)
    }
  }

  // 获取活跃组件配置
  async getActiveComponents() {
    try {
      const activeComponents = await ActiveComponent.findAll({
        include: [{
          model: Component,
          as: 'component',
          attributes: ['id', 'componentName', 'version', 'filePath', 'metadata']
        }]
      })
      
      const result = {}
      activeComponents.forEach(active => {
        const activeData = active.toJSON()
        result[activeData.componentName] = {
          path: activeData.path,
          time: activeData.time,
          version: activeData.version,
          publishInfo: activeData.publishInfo,
          buildDetails: activeData.buildDetails,
          metadata: activeData.metadata
        }
      })
      
      return result
    } catch (error) {
      throw new Error(`获取活跃组件配置失败: ${error.message}`)
    }
  }

  // 更新活跃组件配置
  async updateActiveComponents() {
    try {
      // 获取所有组件的最新版本
      const components = await Component.findAll({
        where: { status: 'published' },
        order: [['componentName', 'ASC'], ['created_at', 'DESC']]
      })
      
      const latestComponents = {}
      components.forEach(component => {
        const componentData = component.toJSON()
        if (!latestComponents[componentData.componentName]) {
          latestComponents[componentData.componentName] = componentData
        }
      })
      
      // 清空现有活跃组件
      await ActiveComponent.destroy({ where: {} })
      
      // 添加新的活跃组件
      const activeComponents = []
      for (const [componentName, componentData] of Object.entries(latestComponents)) {
        const activeComponent = await ActiveComponent.create({
          componentName,
          componentId: componentData.id,
          path: componentData.filePath,
          time: componentData.time,
          version: componentData.version,
          publishInfo: componentData.publishInfo,
          buildDetails: componentData.buildDetails,
          metadata: componentData.metadata
        })
        activeComponents.push(activeComponent.toJSON())
      }
      
      return latestComponents
    } catch (error) {
      throw new Error(`更新活跃组件配置失败: ${error.message}`)
    }
  }

  // 发布组件
  async publishComponent(componentName, version) {
    try {
      const component = await Component.findOne({
        where: { componentName, version }
      })
      
      if (!component) {
        throw new Error('组件不存在')
      }
      
      // 更新组件状态为已发布
      await component.update({
        status: 'published',
        publishTime: new Date()
      })
      
      // 更新活跃组件配置
      await this.updateActiveComponents()
      
      return component.toJSON()
    } catch (error) {
      throw new Error(`发布组件失败: ${error.message}`)
    }
  }

  // 从文件系统迁移数据到数据库
  async migrateFromFileSystem() {
    try {
      const componentsDir = path.join(__dirname, '..', 'data', 'components')
      const componentsInfoPath = path.join(componentsDir, 'components-info.json')
      const activeComponentsPath = path.join(componentsDir, 'active-components.json')
      
      if (!fs.existsSync(componentsInfoPath)) {
        console.log('components-info.json 文件不存在，跳过迁移')
        return
      }
      
      // 读取现有数据
      const componentsInfo = JSON.parse(fs.readFileSync(componentsInfoPath, 'utf-8'))
      const activeComponents = fs.existsSync(activeComponentsPath) 
        ? JSON.parse(fs.readFileSync(activeComponentsPath, 'utf-8'))
        : {}
      
      // 迁移组件信息
      for (const [componentName, versions] of Object.entries(componentsInfo)) {
        for (const versionData of versions) {
          try {
            await Component.create({
              componentName,
              version: versionData.version,
              filePath: versionData.path,
              time: versionData.time,
              publisher: versionData.publishInfo?.publisher || 'system',
              description: versionData.publishInfo?.description || '',
              status: versionData.publishInfo?.status || 'published',
              metadata: versionData.metadata || {},
              buildDetails: versionData.buildDetails || {},
              publishInfo: versionData.publishInfo || {},
              buildTime: versionData.buildDetails?.buildTime ? new Date(versionData.buildDetails.buildTime) : null,
              publishTime: versionData.publishInfo?.publishTime ? new Date(parseInt(versionData.publishInfo.publishTime)) : null
            })
          } catch (error) {
            if (error.name === 'SequelizeUniqueConstraintError') {
              console.log(`组件 ${componentName} 版本 ${versionData.version} 已存在，跳过`)
            } else {
              console.error(`迁移组件 ${componentName} 版本 ${versionData.version} 失败:`, error.message)
            }
          }
        }
      }
      
      // 迁移活跃组件配置
      for (const [componentName, activeData] of Object.entries(activeComponents)) {
        try {
          const component = await Component.findOne({
            where: { componentName, version: activeData.version }
          })
          
          if (component) {
            await ActiveComponent.create({
              componentName,
              componentId: component.id,
              path: activeData.path,
              time: activeData.time,
              version: activeData.version,
              publishInfo: activeData.publishInfo || {},
              buildDetails: activeData.buildDetails || {},
              metadata: activeData.metadata || {}
            })
          }
        } catch (error) {
          if (error.name === 'SequelizeUniqueConstraintError') {
            console.log(`活跃组件 ${componentName} 已存在，跳过`)
          } else {
            console.error(`迁移活跃组件 ${componentName} 失败:`, error.message)
          }
        }
      }
      
      console.log('数据迁移完成')
    } catch (error) {
      throw new Error(`数据迁移失败: ${error.message}`)
    }
  }
}

module.exports = new ComponentService() 