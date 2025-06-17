'use strict'

const fs = require('fs')

const { sequelizeConfig, DEBUG } = require('../config')

const logging = DEBUG ? console : false
const { DB } = require('../utils/db_utils/db')
const { DbHelper } = require('../utils/db_utils/dbHelper')

const dbUtil = new DB(sequelizeConfig, logging, DEBUG)
let all_model_list = [__dirname + '/self', __dirname + '/pf']

// 加载model文件
dbUtil.load_model_list(all_model_list)

dbUtil.modelAssociate()

let { sequelize, dbType, dbName, knex, models, tabs } = dbUtil

let dbHelper = new DbHelper(sequelize)
// 同步表结构
dbUtil.sync()

dbUtil.dbHelper = dbHelper

// plg_common 和 smt_xx 都用db作为数据加载的依据

let db = {
  sequelize,
  dbType,
  dbName,
  ...models,
  tabs,
  dbHelper,
  knex
}

global.db = db

module.exports = {
  sequelize,
  dbType,
  dbName,
  models
}
