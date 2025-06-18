const { DataTypes } = require('sequelize')
const BaseModel = require('../base_model')

class ActiveComponent extends BaseModel {}

ActiveComponent.init(
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
      unique: true,
      comment: '组件名称'
    },
    componentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '关联的组件ID'
    },
    path: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: '文件路径'
    },
    time: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: '时间戳'
    },
    version: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '组件版本'
    },
    publishInfo: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '发布信息'
    },
    buildDetails: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '构建详情'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '元数据'
    }
  },
  {
    modelName: 'ActiveComponent',
    tableName: 'active_components',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['componentName']
      },
      {
        fields: ['componentId']
      }
    ]
  }
)

// 定义模型关联
ActiveComponent.associate = function(models) {
  ActiveComponent.belongsTo(models.Component, {
    foreignKey: 'componentId',
    as: 'component'
  })
}

module.exports = ActiveComponent 