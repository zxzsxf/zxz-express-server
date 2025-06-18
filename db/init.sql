-- 创建数据库
CREATE DATABASE IF NOT EXISTS `goview` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `goview`;

-- 组件信息表
CREATE TABLE IF NOT EXISTS `components` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `componentName` varchar(100) NOT NULL COMMENT '组件名称',
  `version` varchar(50) NOT NULL COMMENT '组件版本',
  `filePath` varchar(500) NOT NULL COMMENT '文件路径',
  `fileSize` bigint(20) DEFAULT NULL COMMENT '文件大小',
  `buildTime` datetime DEFAULT NULL COMMENT '构建时间',
  `publishTime` datetime DEFAULT NULL COMMENT '发布时间',
  `publisher` varchar(100) DEFAULT NULL COMMENT '发布者',
  `description` text COMMENT '描述',
  `status` enum('draft','published','deprecated') DEFAULT 'draft' COMMENT '状态',
  `metadata` json DEFAULT NULL COMMENT '元数据',
  `buildDetails` json DEFAULT NULL COMMENT '构建详情',
  `publishInfo` json DEFAULT NULL COMMENT '发布信息',
  `time` varchar(20) NOT NULL COMMENT '时间戳',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_component_version` (`componentName`,`version`),
  KEY `idx_component_name` (`componentName`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='组件信息表';

-- 活跃组件配置表
CREATE TABLE IF NOT EXISTS `active_components` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `componentName` varchar(100) NOT NULL COMMENT '组件名称',
  `componentId` int(11) NOT NULL COMMENT '关联的组件ID',
  `path` varchar(500) NOT NULL COMMENT '文件路径',
  `time` varchar(20) NOT NULL COMMENT '时间戳',
  `version` varchar(50) NOT NULL COMMENT '组件版本',
  `publishInfo` json DEFAULT NULL COMMENT '发布信息',
  `buildDetails` json DEFAULT NULL COMMENT '构建详情',
  `metadata` json DEFAULT NULL COMMENT '元数据',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_component_name` (`componentName`),
  KEY `idx_component_id` (`componentId`),
  CONSTRAINT `fk_active_component` FOREIGN KEY (`componentId`) REFERENCES `components` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活跃组件配置表';

-- 插入示例数据（可选）
-- INSERT INTO `components` (`componentName`, `version`, `filePath`, `time`, `publisher`, `description`, `status`, `metadata`, `buildDetails`, `publishInfo`) VALUES
-- ('button', '0.0.4', '/micro/components/file/button/button-1749918964178.js', '1749918964178', 'szy', 'Version 0.0.4', 'published', '{"name":"@zxz-ui/button","dependencies":{},"peerDependencies":{"react":"^16.13.1","react-dom":"^16.13.1"},"author":"zxz","license":"ISC","repository":{"type":"git","url":""}}', '{"componentName":"button","version":"0.0.4","buildTime":"2025/6/15 上午12:35:11","gitCommit":"9388f48e062108677e004d750924d365c81d2262","gitBranch":"master","buildInfo":"$npm_config_buildInfo"}', '{"publisher":"szy","publishTime":"1749918964178","description":"Version 0.0.4","buildInfo":"$npm_config_buildInfo","status":"published"}'),
-- ('card', '0.0.1', '/micro/components/file/card/card-1748879130268.js', '1748879130268', 'szy', 'Version 0.0.1', 'published', '{"name":"@zxz-ui/card","dependencies":{},"peerDependencies":{"react":"^16.13.1","react-dom":"^16.13.1"},"author":"zxz","license":"ISC","repository":{"type":"git","url":""}}', '{"componentName":"card","version":"0.0.1","buildTime":"2025-06-02 23:45:22","gitCommit":"208ead90ec29d28dd39775148b62f489209c9f4e","gitBranch":"master","buildInfo":"$npm_config_buildInfo"}', '{"publisher":"szy","publishTime":"1748879130268","description":"Version 0.0.1","buildInfo":"$npm_config_buildInfo","status":"published"}');

-- 创建索引优化查询性能
CREATE INDEX `idx_components_created_at` ON `components` (`created_at`);
CREATE INDEX `idx_components_publish_time` ON `components` (`publishTime`);
CREATE INDEX `idx_active_components_created_at` ON `active_components` (`created_at`); 