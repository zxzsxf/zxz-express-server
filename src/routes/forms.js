const express = require('express')
const { fn, col, where, UniqueConstraintError } = require('sequelize')
const { models } = require('../models')

const router = express.Router()
const { FlowForm } = models
const formCodePattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const routePattern = /^\/forms\/[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\/[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)*$/

const invalid = (message, status = 400) => { const error = new Error(message); error.status = status; throw error }
const metadata = row => {
  const form = row.toJSON()
  return {
    formCode: form.formCode,
    title: form.title,
    placement: form.placement,
    ...(form.path ? { path: form.path } : {}),
    updatedAt: new Date(form.updated_at).getTime()
  }
}
const handleError = (error, res) => {
  if (error instanceof UniqueConstraintError) return res.status(409).json({ code: 409, msg: 'Form code or route path already exists' })
  const status = error.status || 500
  if (status === 500) console.error(error)
  return res.status(status).json({ code: status, msg: status === 500 ? 'Failed to access forms' : error.message })
}
const validate = body => {
  const { formCode, title, placement, schema } = body || {}
  if (typeof formCode !== 'string' || !formCodePattern.test(formCode) || formCode.toLowerCase() === 'index') invalid('Invalid formCode')
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 100) invalid('Invalid title')
  if (placement !== 'inline' && placement !== 'route') invalid('Invalid placement')
  if (!schema || schema.type !== 'object' || !schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) invalid('Invalid form schema')
  const path = placement === 'route' ? body.path : null
  if (placement === 'route' && (typeof path !== 'string' || !routePattern.test(path))) invalid('Route path must be under /forms/ with lowercase URL segments')
  return { formCode, title: title.trim(), placement, path, schema }
}

router.get('/', async (_req, res) => {
  try {
    const rows = await FlowForm.findAll({ order: [['updated_at', 'DESC']] })
    res.json({ code: 0, data: rows.map(metadata) })
  } catch (error) { handleError(error, res) }
})

router.get('/:formCode', async (req, res) => {
  try {
    if (!formCodePattern.test(req.params.formCode) || req.params.formCode.toLowerCase() === 'index') invalid('Invalid formCode')
    const row = await FlowForm.findByPk(req.params.formCode)
    if (!row) invalid('Form not found', 404)
    res.json({ code: 0, data: { ...metadata(row), schema: row.schema } })
  } catch (error) { handleError(error, res) }
})

router.post('/', async (req, res) => {
  try {
    const input = validate(req.body)
    if (input.placement !== 'route') invalid('Only route forms can be created or edited here')
    const existingCode = await FlowForm.findOne({ where: where(fn('lower', col('formCode')), input.formCode.toLowerCase()) })
    if (existingCode && existingCode.formCode !== input.formCode) invalid('formCode already exists', 409)
    if (existingCode && existingCode.placement !== input.placement) invalid('Form placement cannot be changed', 409)
    if (input.path) {
      const existingPath = await FlowForm.findOne({ where: { path: input.path } })
      if (existingPath && existingPath.formCode !== input.formCode) invalid('Route path already exists', 409)
    }
    const row = existingCode
      ? await existingCode.update(input)
      : await FlowForm.create(input)
    res.json({ code: 0, data: metadata(row) })
  } catch (error) { handleError(error, res) }
})

module.exports = router
