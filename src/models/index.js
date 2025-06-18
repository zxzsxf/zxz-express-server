'use strict'

const fs = require('fs')
const path = require('path')
const { Sequelize } = require('sequelize')
const BaseModel = require('./base_model')

const { sequelizeConfig, DEBUG } = require('../config')

const logging = DEBUG ? console : false

// 创建sequelize实例
const sequelize = new Sequelize(
  sequelizeConfig.database,
  sequelizeConfig.username,
  sequelizeConfig.password,
  {
    ...sequelizeConfig.connect,
    logging: logging ? console.log : false
  }
)

// 设置sequelize实例到BaseModel
BaseModel.setSequelize(sequelize)

// 加载模型文件
const models = {}
const modelsDir = path.join(__dirname, 'components')

if (fs.existsSync(modelsDir)) {
  const modelFiles = fs.readdirSync(modelsDir)
  modelFiles.forEach(file => {
    if (file.endsWith('.js') && file !== 'index.js') {
      const model = require(path.join(modelsDir, file))
      models[model.name] = model
    }
  })
}

// 建立模型关联
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models)
  }
})

// 同步数据库表结构
const syncDatabase = async () => {
  try {
    await sequelize.sync({ alter: true })
    console.log('数据库表结构同步成功')
  } catch (error) {
    console.error('数据库表结构同步失败:', error)
  }
}

module.exports = {
  sequelize,
  models,
  syncDatabase
} 