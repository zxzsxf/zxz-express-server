const express = require('express')
const formsController = require('../controllers/forms')

const router = express.Router()

router.get('/', formsController.list)
router.get('/:formCode', formsController.get)
router.post('/', formsController.save)

module.exports = router
