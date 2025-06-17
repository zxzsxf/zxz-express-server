'use strict'

const fs = require('fs')
const path = require('path')
const { Sequelize, DataTypes } = require('sequelize')
const Knex = require('knex')
// 用于管理数据库 查询数据库，查询表结构，主外键等信息
// const { SchemaInspector } = require('../knex-schema-inspector')
// 用于处理分页
const { attachPaginate } = require('knex-paginate')

const getFileName = file => {
  const extension = path.extname(file)
  const fileName = path.basename(file, extension)
  return fileName
}

function filterFile(file) {
  // 获取文件后缀名
  const extension = path.extname(file)
  return file.indexOf('.') !== 0 && file !== 'index.js' && extension == '.js'
}

exports.DB = class DB {
  constructor(db_cfg, logger, debug = true) {
    //创建一个sequelize实例
    this.sequelize = new Sequelize(db_cfg.database, db_cfg.username, db_cfg.password, db_cfg.connect, {
      logging: logger.info,
      isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
    })
    this.tabs = []
    this.models = {}
    this.dbType = this.sequelize.options.dialect
    this.dbName = this.sequelize.config.database || db_cfg.database
    this.knex = null
    this.init(db_cfg, debug)
    // this.knex_kit = SchemaInspector(this.knex)
  }

  init(db_cfg, _debug) {
    let dialect = this.dbType
    let knex_options = {
      client: '',
      connection: { timezone: '+08:00', useNullAsDefault: true },
      debug: _debug,
      log: {
        debug(msg) {
          //
          if (msg) {
            let { sql, bindings } = msg
            if (!sql) return
            if (bindings) {
              if (bindings.length == 0) logger.info(`【knex ${dialect}】` + sql)
              else logger.info(`【knex ${dialect}】` + sql, `[ ${bindings.join(', ')} ]`)
            } else {
              logger.info(`【knex ${dialect}】` + sql)
            }
          }
        }
      }
    }

    switch (dialect) {
      case 'mysql':
        knex_options.client = 'mysql2'
        knex_options.connection = {
          host: db_cfg.connect.host,
          port: db_cfg.connect.port,
          user: db_cfg.username,
          password: db_cfg.password,
          database: db_cfg.database,
          timezone: db_cfg.connect.timezone,
          // 方法一
          dateStrings: true
          // 方法二
          // typeCast: function (field, next) {
          //   if (field.type == 'DATETIME') {
          //     return moment(field.string()).format('YYYY-MM-DD HH:mm:ss')
          //   }
          //   return next()
          // }
          // charset: db_cfg.connect.charset
        }
        break

      case 'mssql':
        knex_options.client = dialect
        knex_options.connection = {
          // 此处是server 不是host
          server: db_cfg.connect.host,
          port: db_cfg.connect.port,
          user: db_cfg.username,
          password: db_cfg.password,
          database: db_cfg.database
          // charset: db_cfg.connect.charset
        }
        break

      case 'sqlite':
        knex_options.client = 'sqlite3'
        knex_options.connection = { filename: db_cfg.connect.storage }
        break
      default:
        break
    }
    let knex = Knex(knex_options)
    attachPaginate()
    this.knex = knex
  }

  async loadModel(_path) {
    fs.readdirSync(_path) //读取当前文件夹的文件
      .filter(filterFile)
      .forEach(file => {
        let model = require(path.join(_path, file))(this.sequelize, DataTypes) // 6.x 版本写法
        this.models[model.name] = model
        this.tabs.push(model.name)
      })
  }

  async load_model(_path) {
    fs.readdirSync(_path) //读取当前文件夹的文件
      .filter(filterFile)
      .forEach(file => {
        const model_path = path.join(_path, file)
        const modelDef = require(model_path)
        const modelName = modelDef.modelName || getFileName(file)
        this.models[modelName] = modelDef
        this.tabs.push(modelName)
      })
  }

  async loadModelList(_path_list) {
    _path_list.forEach(_path => {
      this.loadModel(_path)
    })
  }

  async load_model_list(_path_list) {
    _path_list.forEach(_path => {
      this.load_model(_path)
    })
  }

  // 加载所有模型后调用 associate 方法以避免依赖性问题
  async modelAssociate() {
    let _models = this.models
    Object.keys(_models).forEach(function (modelName) {
      if ('associate' in _models[modelName]) {
        _models[modelName].associate(_models)
      }
    })
    this.models = _models
  }

  async hasConection() {
    try {
      await sequelize.authenticate()
      console.log('connect to db ok!')
    } catch (error) {
      console.error('connect to db error ', error)
    }
  }

  // 同步表结构
  async sync() {
    this.sequelize.sync({
      // force: true
    })
  }
}
