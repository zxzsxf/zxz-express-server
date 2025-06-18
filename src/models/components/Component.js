const { DataTypes } = require('sequelize')
const BaseModel = require('../base_model')

class Component extends BaseModel {}

Component.init(
  {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    componentName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '组件名称'
    },
    version: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '组件版本'
    },
    filePath: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: '文件路径'
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: '文件大小'
    },
    buildTime: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '构建时间'
    },
    publishTime: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '发布时间'
    },
    publisher: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: '发布者'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '描述'
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'deprecated'),
      defaultValue: 'draft',
      comment: '状态'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '元数据'
    },
    buildDetails: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '构建详情'
    },
    publishInfo: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '发布信息'
    },
    time: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: '时间戳'
    }
  },
  {
    modelName: 'Component',
    tableName: 'components',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['componentName', 'version']
      },
      {
        fields: ['componentName']
      },
      {
        fields: ['status']
      }
    ]
  }
)

// 定义模型关联
Component.associate = function(models) {
  Component.hasMany(models.ActiveComponent, {
    foreignKey: 'componentId',
    as: 'activeVersions'
  })
}

module.exports = Component 