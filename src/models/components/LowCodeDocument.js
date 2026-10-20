const { DataTypes } = require('sequelize')
const BaseModel = require('../base_model')
class LowCodeDocument extends BaseModel {}
LowCodeDocument.init({
  id: { type: DataTypes.STRING(160), primaryKey: true },
  kind: { type: DataTypes.ENUM('form', 'template', 'config'), allowNull: false },
  title: { type: DataTypes.STRING(160), allowNull: false },
  schema: { type: DataTypes.JSON, allowNull: false },
  componentLocks: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  bindings: { type: DataTypes.JSON, allowNull: true },
  revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  publishedVersion: { type: DataTypes.INTEGER, allowNull: true },
  sourceTemplateId: { type: DataTypes.STRING(160), allowNull: true },
  sourceTemplateVersion: { type: DataTypes.INTEGER, allowNull: true }
}, { modelName: 'LowCodeDocument', tableName: 'lowcode_documents', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', indexes: [{ fields: ['kind'] }] })
module.exports = LowCodeDocument
