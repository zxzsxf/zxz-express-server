const { DataTypes } = require('sequelize')
const BaseModel = require('../base_model')

class FlowForm extends BaseModel {}

FlowForm.init({
  formCode: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
  title: { type: DataTypes.STRING(100), allowNull: false },
  placement: { type: DataTypes.ENUM('inline', 'route'), allowNull: false },
  path: { type: DataTypes.STRING(500), allowNull: true, unique: true },
  schema: { type: DataTypes.JSON, allowNull: false }
}, {
  modelName: 'FlowForm',
  tableName: 'flow_forms',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
})

module.exports = FlowForm
