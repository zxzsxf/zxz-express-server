const lowcodeService = require('../services/lowcode')

const cookieName = 'lowcode_session'
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const send = (res, data) => res.json({ code: 0, data })

const parseCookie = (header = '') => Object.fromEntries(
  header.split(';').map(entry => entry.trim().split('=')).filter(parts => parts.length === 2)
)

const role = (...allowed) => (req, _res, next) => req.user?.roles?.some(item => allowed.includes(item))
  ? next()
  : next(Object.assign(new Error('Forbidden'), { status: 403 }))

const login = wrap(async (req, res) => {
  const { token, user, csrf } = await lowcodeService.login(req.body)
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 3600 * 1000,
    path: '/api/lowcode'
  })
  send(res, { id: user.id, username: user.username, roles: user.roles, csrf })
})

const authenticate = wrap(async (req, _res, next) => {
  const token = parseCookie(req.headers.cookie)[cookieName]
  const { user, csrf } = await lowcodeService.authenticate(token)
  req.user = user
  req.csrf = csrf
  next()
})

const me = wrap(async (req, res) => {
  send(res, { id: req.user.id, username: req.user.username, roles: req.user.roles, csrf: req.csrf })
})

const logout = wrap(async (_req, res) => {
  res.clearCookie(cookieName, { path: '/api/lowcode' })
  send(res, true)
})

const verifyCsrf = (req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-lowcode-csrf'] !== req.csrf) {
    lowcodeService.fail(403, 'Invalid CSRF token')
  }
  next()
}

const listComponents = wrap(async (_req, res) => {
  send(res, await lowcodeService.listComponents())
})

const listDocs = kind => wrap(async (_req, res) => {
  send(res, await lowcodeService.listDocs(kind))
})

const readDoc = kind => wrap(async (req, res) => {
  send(res, await lowcodeService.readDoc(kind, req.params.id))
})

const createDoc = kind => wrap(async (req, res) => {
  send(res, await lowcodeService.createDoc(kind, req.body))
})

const updateDoc = kind => wrap(async (req, res) => {
  send(res, await lowcodeService.updateDoc(kind, req.params.id, req.body))
})

const publishDoc = kind => wrap(async (req, res) => {
  send(res, await lowcodeService.publishDoc(kind, req.params.id, req.body, req.user.id))
})

const publishedDoc = kind => wrap(async (req, res) => {
  send(res, await lowcodeService.publishedDoc(kind, req.params.id, req.params.version))
})

const unpublishTemplate = wrap(async (req, res) => {
  send(res, await lowcodeService.unpublishTemplate(req.params.id, req.body))
})

const listPublishedForms = wrap(async (_req, res) => {
  send(res, await lowcodeService.listPublishedForms())
})

const createSubmission = wrap(async (req, res) => {
  send(res, await lowcodeService.createSubmission(req.params.id, req.body, req.user.id))
})

const handleError = (error, _req, res, _next) => {
  const status = error.status || (error.name === 'SequelizeUniqueConstraintError' ? 409 : 500)
  if (status === 500) console.error(error)
  res.status(status).json({ code: status, msg: status === 500 ? 'Low-code service unavailable' : error.message })
}

module.exports = {
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
  unpublishTemplate,
  publishedDoc,
  listPublishedForms,
  createSubmission,
  handleError
}
