const express = require('express');
const router = express.Router();
const microController = require('../controllers/micro');

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

// 查找组件
router.post('/components/find', async (req, res) => {
  const result = await microController.findComponent(req, res);
  res.json(result);
});

// 发布组件
router.post('/components/publish', async (req, res) => {
  const result = await microController.publishComponent(req, res);
  res.json(result);
});

// 新增组件信息
router.post('/components/:componentName', async (req, res) => {
  const result = await microController.addComponentInfo(req, res);
  res.json(result);
});

// 上传组件文件
router.post('/upload', (req, res) => {
  res.json({
    status: 'success',
    data: null,
    message: '上传组件文件成功'
  });
});

// 获取组件列表
router.get('/components', async (req, res) => {
  const result = await microController.getComponents(req, res);
  res.json(result);
});

// 获取特定组件的所有版本信息
router.get('/components/:componentName/info', async (req, res) => {
  const result = await microController.getComponentVersions(req, res);
  res.json(result);
});

// 获取组件文件
router.get('/components/:componentName/:filename', (req, res) => {
  res.json({
    status: 'success',
    data: null,
    message: '获取组件文件成功'
  });
});

// 获取组件信息文件
router.get('/components-info', async (req, res) => {
  const result = await microController.getComponentsInfo(req, res);
  res.json(result);
});

// 更新组件信息
router.put('/components/:componentName/:timestamp', async (req, res) => {
  const result = await microController.updateComponentInfo(req, res);
  res.json(result);
});

// 删除组件信息
router.delete('/components/:componentName/:timestamp', async (req, res) => {
  const result = await microController.deleteComponentInfo(req, res);
  res.json(result);
});

// 获取活跃组件配置
router.get('/active-components', async (req, res) => {
  const result = await microController.getActiveComponents(req, res);
  res.json(result);
});

// 手动更新活跃组件配置
router.post('/active-components/update', async (req, res) => {
  const result = await microController.updateActiveComponentsConfig(req, res);
  res.json(result);
});

module.exports = router; 