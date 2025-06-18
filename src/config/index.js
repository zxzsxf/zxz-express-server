'use strict';

const path = require('path');
const _package = require('../../package.json');

const APP_ROOT = process.cwd();
const APP_NAME = 'ZXZ-SERVER';

// 数据库配置 - 请根据你的实际数据库配置修改这些值
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || 3306;
const DB_NAME = process.env.DB_NAME || 'goview';
const DB_USER = process.env.DB_USER || 'root';
const DB_PWD = process.env.DB_PWD || 'your_new_password'; // 请设置正确的密码

let config = {
  APP_ROOT: APP_ROOT,
  APP_NAME: APP_NAME,
  APP_PORT: process.env.PORT || 3000,
  APP_SECRET: Buffer.from(APP_NAME, 'base64'),
  DEBUG: process.env.NODE_ENV !== 'production',
  VERSION: _package.version,
  LOG_DIR: path.join(APP_ROOT, 'logs'),
  UPLOAD_PATH: path.join(APP_ROOT, 'uploads'),
  sessionExpiresIn: '100y',
  SALT_WORK_FACTOR: 10,
  API_RES_TYPE: 'datagrid',

  sequelizeConfig: {
    username: DB_USER,
    password: DB_PWD,
    database: DB_NAME,
    connect: {
      host: DB_HOST,
      port: DB_PORT,
      dialect: 'mysql',
      dialectOptions: {
        dateStrings: true,
        typeCast: true,
        multipleStatements: true,
        charset: 'utf8mb4',
        supportBigNumbers: true,
        bigNumberStrings: true,
        decimalNumbers: true
      },
      timezone: '+08:00',
      define: {
        charset: 'utf8mb4',
        freezeTableName: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      },
      hooks: {
        afterFind: async (result, options, fn) => {
          return result;
        }
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  }
};

module.exports = config;
