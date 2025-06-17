'use strict'

const { sequelize } = require('../models')

class BaseService {
  constructor(model) {
    this.model = model
  }

  /**
   * 根据ID获取单条记录
   * @param {number} id 记录ID
   * @returns {Promise<Object>} 查询结果
   */
  async findById(id) {
    return await this.model.findOne({ where: { id }, raw: true })
  }

  /**
   * 获取列表数据
   * @param {Object} params 查询参数
   * @param {number} params.page 页码
   * @param {number} params.limit 每页条数
   * @param {Object} params.where 查询条件
   * @returns {Promise<Object>} 查询结果
   */
  async list({ page = 1, limit = 10, where = {} }) {
    const pageSize = parseInt(limit)
    const pageStart = pageSize * (parseInt(page) - 1)
    
    const condition = {
      where,
      limit: pageSize,
      offset: pageStart,
      order: [['id', 'ASC']],
      raw: true
    }

    const { count, rows } = await this.model.findAndCountAll(condition)
    return {
      data: rows,
      count
    }
  }

  /**
   * 创建或更新记录
   * @param {Object} params 数据参数
   * @returns {Promise<Object>} 操作结果
   */
  async upsert(params) {
    let data = {}
    try {
      if (params.id) {
        const exists = await this.model.findOne({ where: { id: params.id }, raw: true })
        if (exists) {
          await this.model.update(params, { where: { id: params.id } })
          data = await this.model.findOne({ where: { id: params.id }, raw: true })
        }
      } else {
        data = await this.model.create(params, { returning: true, raw: true })
      }
    } catch (err) {
      console.error('upsert failed due to DB error:', err)
    }
    return data
  }

  /**
   * 删除记录
   * @param {number} id 记录ID
   * @returns {Promise<boolean>} 操作结果
   */
  async delete(id) {
    let ok = true
    try {
      await this.model.destroy({ where: { id } })
    } catch (err) {
      console.error('delete failed due to DB error:', err)
      ok = false
    }
    return ok
  }

  /**
   * 开启事务
   * @returns {Promise<Transaction>} 事务对象
   */
  async beginTransaction() {
    return await sequelize.transaction()
  }
}

module.exports = BaseService 