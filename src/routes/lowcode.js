const express = require('express')
const lowcodeController = require('../controllers/lowcode')

const router = express.Router()
const {
  role,
  login,
  authenticate,
  me,
  logout,
  verifyCsrf,
  listComponents,
  listDocs,
  readDoc,
  createDoc,
  updateDoc,
  publishDoc,
  publishedDoc,
  listPublishedForms,
  createSubmission,
  handleError
} = lowcodeController

router.post('/auth/login', login)
router.use(authenticate)
router.get('/auth/me', me)
router.post('/auth/logout', logout)
router.use(verifyCsrf)

router.get('/components', role('M', 'B'), listComponents)

router.get('/templates', role('M', 'B'), listDocs('template'))
router.post('/templates', role('M'), createDoc('template'))
router.get('/templates/:id', role('M'), readDoc('template'))
router.put('/templates/:id', role('M'), updateDoc('template'))
router.post('/templates/:id/publish', role('M'), publishDoc('template'))
router.get('/templates/:id/published', role('M', 'B'), publishedDoc('template'))
router.get('/templates/:id/versions/:version', role('M', 'B'), publishedDoc('template'))

router.get('/component-configs', role('M', 'B'), listDocs('config'))
router.post('/component-configs', role('M'), createDoc('config'))
router.get('/component-configs/:id', role('M'), readDoc('config'))
router.put('/component-configs/:id', role('M'), updateDoc('config'))
router.post('/component-configs/:id/publish', role('M'), publishDoc('config'))
router.get('/component-configs/:id/published', role('M', 'B'), publishedDoc('config'))
router.get('/component-configs/:id/versions/:version', role('M', 'B'), publishedDoc('config'))

router.get('/forms', role('B'), listDocs('form'))
router.get('/forms/published', role('M', 'B', 'C'), listPublishedForms)
router.post('/forms', role('B'), createDoc('form'))
router.get('/forms/:id/published', role('M', 'B', 'C'), publishedDoc('form'))
router.post('/forms/:id/submissions', role('M', 'B', 'C'), createSubmission)
router.get('/forms/:id', role('B'), readDoc('form'))
router.get('/forms/:id/versions/:version', role('M', 'B', 'C'), publishedDoc('form'))
router.put('/forms/:id', role('B'), updateDoc('form'))
router.post('/forms/:id/publish', role('B'), publishDoc('form'))

router.use(handleError)

module.exports = router
