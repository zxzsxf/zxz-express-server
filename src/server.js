const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { sequelize } = require('./models');
const routes = require('./routes');
const config = require('./config/index');

const app = express();
const port = config.app.port;

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
    app: config.app.name,
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

    app.listen(port, () => {
      console.log(`${config.app.name} 服务器运行在 http://localhost:${port}`);
      console.log(`环境: ${process.env.NODE_ENV || 'dev'}`);
    });
  } catch (error) {
    console.error('无法启动服务器:', error);
    process.exit(1);
  }
}

startServer(); 