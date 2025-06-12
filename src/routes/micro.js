const express = require('express');
const router = express.Router();
const microController = require('../controllers/micro');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 配置multer存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const componentName = req.body.componentName;
    const componentDir = path.join(__dirname, '..', '..', 'components', componentName);
    
    if (!fs.existsSync(componentDir)) {
      fs.mkdirSync(componentDir, { recursive: true });
    }
    
    cb(null, componentDir);
  },
  filename: function (req, file, cb) {
    const componentName = req.body.componentName;
    const timestamp = req.body.timestamp || Date.now();
    cb(null, `${componentName}-${timestamp}.js`);
  }
});

const upload = multer({ storage: storage });

// 组件相关接口
// 获取组件列表
router.get('/components', async (req, res) => {
  const result = await microController.getComponents(req, res);
  res.json(result);
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

// 组件版本管理相关接口
// 新增组件版本信息
router.post('/components/version', async (req, res) => {
  const result = await microController.addComponentInfo(req, res);
  res.json(result);
});

// 获取组件版本列表
router.get('/components/version/list/:componentName', async (req, res) => {
  const result = await microController.getComponentVersions(req, res);
  res.json(result);
});

// 更新组件版本信息
router.put('/components/version/:componentName/:timestamp', async (req, res) => {
  const result = await microController.updateComponentInfo(req, res);
  res.json(result);
});

// 删除组件版本信息
router.delete('/components/version/:componentName/:timestamp', async (req, res) => {
  const result = await microController.deleteComponentInfo(req, res);
  res.json(result);
});

// 组件文件相关接口
// 获取组件文件
router.get('/components/file/:componentName/:filename', microController.getComponentFile);

// 上传组件文件
router.post('/components/file/upload', upload.single('file'), microController.uploadComponentFile);

// 配置相关接口
// 获取组件信息配置
router.get('/config/components-info', async (req, res) => {
  const result = await microController.getComponentsInfo(req, res);
  res.json(result);
});

// 获取活跃组件配置
router.get('/config/active-components', async (req, res) => {
  const result = await microController.getActiveComponents(req, res);
  res.json(result);
});

// 更新活跃组件配置
router.post('/config/active-components/update', async (req, res) => {
  const result = await microController.updateActiveComponentsConfig(req, res);
  res.json(result);
});


module.exports = router; 