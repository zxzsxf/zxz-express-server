const { DataTypes } = require('sequelize')
const BaseModel = require('../base_model')

class ComponentFile extends BaseModel {}

ComponentFile.init(
  {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    componentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      comment: '关联的组件版本 ID'
    },
    filePath: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
      comment: '组件下载路径'
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: '文件大小（字节）'
    },
    content: {
      type: DataTypes.BLOB('long'),
      allowNull: false,
      comment: '组件 JS 文件内容'
    }
  },
  {
    modelName: 'ComponentFile',
    tableName: 'component_files',
    timestamps: false
  }
)

ComponentFile.associate = function(models) {
  ComponentFile.belongsTo(models.Component, {
    foreignKey: 'componentId',
    as: 'component',
    onDelete: 'CASCADE'
  })
}

module.exports = ComponentFile
