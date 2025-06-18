const { Sequelize, Model, DataTypes } = require('sequelize')

let sequelize = null

const query_raw = true

class BaseModel extends Model {
  static init(attributes, options) {
    if (!sequelize) {
      throw new Error('Sequelize instance not initialized. Please call BaseModel.setSequelize() first.')
    }
    
    options = {
      ...options,
      sequelize
    }
    super.init(attributes, options)
  }

  // 设置sequelize实例
  static setSequelize(sequelizeInstance) {
    sequelize = sequelizeInstance
  }

  // 通用查询方法
  static async findById(id) {
    return this.findOne({ where: { id }, raw: query_raw })
  }

  static async findAllByStatus(status) {
    return this.findAll({ where: { status }, raw: query_raw })
  }

  static async findRecent(limit) {
    return this.findAll({ limit, order: [['created_at', 'DESC']], raw: query_raw })
  }

  static async findWithParams(params) {
    return this.findAll({ where: params, raw: query_raw })
  }

  static async updateById(id, data) {
    return this.update(data, { where: { id } })
  }

  static async deleteById(id) {
    return this.destroy({ where: { id } })
  }

  static async paginate(page, pageSize) {
    const offset = (page - 1) * pageSize
    const limit = pageSize
    return this.findAll({ offset, limit })
  }

  static async executeRawQuery(query) {
    return sequelize.query(query)
  }

  static async upsert(data) {
    return this.upsert(data)
  }

  static async bulkCreate(data) {
    return this.bulkCreate(data)
  }

  static async bulkUpdate(data) {
    const ids = data.map(item => item.id)
    return this.update(data, { where: { id: ids } })
  }

  static async bulkDelete(ids) {
    return this.destroy({ where: { id: ids } })
  }
}

module.exports = BaseModel 