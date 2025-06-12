const express = require('express');
const router = express.Router();

// 测试路由
router.get('/test', (req, res) => {
  res.json({
    status: 'success',
    message: 'API 测试成功',
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 