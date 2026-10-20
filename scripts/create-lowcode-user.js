const bcrypt = require('bcryptjs')
const { sequelize, models } = require('../src/models')

async function main() {
  const username = process.argv[2]
  const roles = (process.argv[3] || '').split(',').filter(Boolean)
  const password = process.env.LOWCODE_PASSWORD
  if (!username || !/^[A-Za-z][A-Za-z0-9_-]{2,79}$/.test(username) || !password || password.length < 12 || !roles.length || roles.some(role => !['M', 'B', 'C'].includes(role))) {
    throw new Error('Usage: LOWCODE_PASSWORD=<12+ chars> node scripts/create-lowcode-user.js <username> <M,B,C>')
  }
  await sequelize.authenticate()
  const passwordHash = await bcrypt.hash(password, 12)
  const [user, created] = await models.LowCodeUser.findOrCreate({ where: { username }, defaults: { username, passwordHash, roles, active: true } })
  if (!created) await user.update({ passwordHash, roles, active: true })
  console.log(`${created ? 'Created' : 'Updated'} ${username} with roles ${roles.join(',')}`)
  await sequelize.close()
}
main().catch(error => { console.error(error.message); process.exitCode = 1; sequelize.close().catch(() => {}) })
