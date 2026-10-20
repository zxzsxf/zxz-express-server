const { DataTypes } = require('sequelize')
const BaseModel = require('../base_model')
class LowCodeUser extends BaseModel {}
LowCodeUser.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  username: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING(100), allowNull: false },
  roles: { type: DataTypes.JSON, allowNull: false },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { modelName: 'LowCodeUser', tableName: 'lowcode_users', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' })
module.exports = LowCodeUser
