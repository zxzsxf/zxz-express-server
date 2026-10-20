const { UniqueConstraintError } = require('sequelize')
const formsService = require('../services/forms')

const handleError = (error, res) => {
  if (error instanceof UniqueConstraintError) return res.status(409).json({ code: 409, msg: 'Form code or route path already exists' })
  const status = error.status || 500
  if (status === 500) console.error(error)
  return res.status(status).json({ code: status, msg: status === 500 ? 'Failed to access forms' : error.message })
}

const list = async (_req, res) => {
  try {
    const data = await formsService.list()
    res.json({ code: 0, data })
  } catch (error) { handleError(error, res) }
}

const get = async (req, res) => {
  try {
    const data = await formsService.get(req.params.formCode)
    res.json({ code: 0, data })
  } catch (error) { handleError(error, res) }
}

const save = async (req, res) => {
  try {
    const data = await formsService.save(req.body)
    res.json({ code: 0, data })
  } catch (error) { handleError(error, res) }
}

module.exports = { list, get, save }
