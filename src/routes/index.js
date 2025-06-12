const express = require('express');
const router = express.Router();
const microRouter = require('./micro');
const goviewRouter = require('./goview');

// 测试路由
router.get('/test', (req, res) => {
  res.json({
    status: 'success',
    message: 'API 测试成功',
    timestamp: new Date().toISOString()
  });
});

// 微件API
router.use('/micro', microRouter);
router.use('/goview', goviewRouter);

module.exports = router; 