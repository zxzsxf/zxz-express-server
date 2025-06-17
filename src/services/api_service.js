'use strict'

const BaseService = require('./base_service')
const { Api } = require('../models')
const { dbHelper } = require('../utils/db_helper')

class ApiService extends BaseService {
  constructor() {
    super(Api)
  }

  /**
   * 根据 API ID 获取脚本信息
   * @param {number} apiId API ID
   * @returns {Promise<Object>} 脚本信息
   */
  async getScriptByApiId(apiId) {
    const resData = { script: '', script_type: '', exec_type: '', exec_count: 0 }
    try {
      if (!apiId) return resData
      
      const attributes = ['script', 'script_type', 'exec_type', 'exec_count']
      const data = await this.model.findOne({
        attributes,
        where: { id: apiId },
        raw: true
      })

      if (!data) return resData
      
      const { script, script_type, exec_type, exec_count } = data
      return {
        script,
        script_type,
        exec_type,
        exec_count: exec_count ? parseInt(exec_count) : 0
      }
    } catch (error) {
      console.error('getScriptByApiId error:', error)
      return resData
    }
  }

  /**
   * 执行 API 脚本并获取数据
   * @param {Object} params 参数
   * @param {number} params.apiId API ID
   * @param {Object} params.params 脚本参数
   * @param {string} params.restype 返回类型
   * @returns {Promise<Object>} 执行结果
   */
  async getDataByApiId({ apiId, params, restype }) {
    const resData = { data: [], script_type: '' }
    try {
      if (!apiId) return resData

      const { script, script_type, exec_type, exec_count } = await this.getScriptByApiId(apiId)
      resData.script_type = script_type

      if (!script) return resData

      if (exec_type === 'exec') {
        // 执行增删改操作
        const resTmp = await dbHelper.execParam(script, params, script_type)
        console.log('execParam result:', resTmp)
        resData.data = true
      } else {
        let data = []
        // 根据返回类型执行不同的查询
        const execType = exec_type || restype
        if (execType === 'scalar') {
          data = await dbHelper.queryScalarParam(script, params)
        } else if (execType === 'one') {
          data = await dbHelper.queryOne(script, params)
        } else {
          // 表格数据
          data = await dbHelper.sqlQuery(script, params, script_type)
        }
        resData.data = data
      }

      // 更新执行次数
      if (process.env.DEBUG) {
        await this.model.update(
          { exec_count: parseInt(exec_count) + 1 },
          { where: { id: apiId } }
        )
      }
    } catch (err) {
      console.error('getDataByApiId error:', err)
      resData.data = false
    }
    return resData
  }

  /**
   * 创建或更新 API
   * @param {Object} params API 参数
   * @returns {Promise<Object>} 操作结果
   */
  async upsertApi(params) {
    const { script, script_type, exec_type, name, description } = params
    return await this.upsert({
      script,
      script_type,
      exec_type,
      name,
      description,
      exec_count: 0
    })
  }
}

// 导出单例
module.exports = new ApiService() 