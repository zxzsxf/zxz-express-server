const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { sequelize, models, syncDatabase } = require('./models');
const routes = require('./routes');
const config = require('./config/index');

const app = express();
const port = config.APP_PORT;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 路由
app.use('/', routes);

// 测试接口
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '服务器运行正常',
    app: config.APP_NAME,
    env: process.env.NODE_ENV || 'dev'
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'dev' ? err.message : undefined
  });
});

// 启动服务器
async function startServer() {
  try {
    // 测试数据库连接
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 同步数据库表结构
    await syncDatabase();
    console.log('数据库表结构同步完成');

    app.listen(port, () => {
      console.log(`${config.APP_NAME} 服务器运行在 http://localhost:${port}`);
      console.log(`环境: ${process.env.NODE_ENV || 'dev'}`);
    });
  } catch (error) {
    console.error('数据库连接失败:', error.message);
    console.log('请检查数据库配置或设置环境变量:');
    console.log('DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PWD');
    console.log('');
    console.log('或者创建 .env 文件并设置以下变量:');
    console.log('DB_HOST=127.0.0.1');
    console.log('DB_PORT=3306');
    console.log('DB_NAME=goview');
    console.log('DB_USER=root');
    console.log('DB_PWD=your_actual_password');
    console.log('');
    console.log('如果暂时不想使用数据库，可以修改 src/config/index.js 中的配置');
    
    // 即使数据库连接失败，也启动服务器（使用文件系统存储）
    console.log('正在使用文件系统存储模式启动服务器...');
    
    app.listen(port, () => {
      console.log(`${config.APP_NAME} 服务器运行在 http://localhost:${port} (文件系统模式)`);
      console.log(`环境: ${process.env.NODE_ENV || 'dev'}`);
      console.log('注意: 数据库功能不可用，仅支持文件系统存储');
    });
  }
}

startServer(); 