const { DataTypes } = require('sequelize')
const BaseModel = require('../base_model')
class LowCodeVersion extends BaseModel {}
LowCodeVersion.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  documentId: { type: DataTypes.STRING(160), allowNull: false },
  version: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(160), allowNull: false },
  schema: { type: DataTypes.JSON, allowNull: false },
  componentLocks: { type: DataTypes.JSON, allowNull: false },
  bindings: { type: DataTypes.JSON, allowNull: true },
  publishedBy: { type: DataTypes.UUID, allowNull: false }
}, { modelName: 'LowCodeVersion', tableName: 'lowcode_versions', timestamps: true, createdAt: 'created_at', updatedAt: false, indexes: [{ unique: true, fields: ['documentId', 'version'] }] })
module.exports = LowCodeVersion
