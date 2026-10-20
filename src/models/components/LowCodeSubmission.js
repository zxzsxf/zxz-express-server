const { DataTypes } = require('sequelize')
const BaseModel = require('../base_model')
class LowCodeSubmission extends BaseModel {}
LowCodeSubmission.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  formCode: { type: DataTypes.STRING(160), allowNull: false },
  publishVersion: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.UUID, allowNull: false },
  values: { type: DataTypes.JSON, allowNull: false }
}, { modelName: 'LowCodeSubmission', tableName: 'lowcode_submissions', timestamps: true, createdAt: 'created_at', updatedAt: false, indexes: [{ fields: ['formCode', 'created_at'] }] })
module.exports = LowCodeSubmission
