const { Sequelize } = require('sequelize');
const config = require('../config/index').database;

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    ...config,
    logging: process.env.NODE_ENV === 'dev' ? console.log : false
  }
);

const db = {
  sequelize,
  Sequelize
};

// 在这里导入模型
// db.User = require('./user')(sequelize, Sequelize);

// 同步所有模型
sequelize.sync({ alter: process.env.NODE_ENV === 'dev' }).then(() => {
  console.log('数据库模型同步完成');
}).catch(err => {
  console.error('数据库模型同步失败:', err);
});

module.exports = db; 