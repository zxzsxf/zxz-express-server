const express = require('express');
const router = express.Router();

// 获取微服务列表
router.get('/list', (req, res) => {
  res.json({
    status: 'success',
    data: [],
    message: '获取微服务列表成功'
  });
});

// 获取微服务详情
router.get('/detail/:id', (req, res) => {
  const { id } = req.params;
  res.json({
    status: 'success',
    data: { id },
    message: '获取微服务详情成功'
  });
});

module.exports = router; 