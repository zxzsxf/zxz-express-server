const { sequelize, models } = require('../src/models')

async function main() {
  await sequelize.authenticate()
  for (const name of ['LowCodeUser', 'LowCodeDocument', 'LowCodeVersion', 'LowCodeSubmission']) {
    await models[name].sync()
    console.log(`Ready: ${models[name].getTableName()}`)
  }
  await sequelize.close()
}
main().catch(error => { console.error(error); process.exitCode = 1; sequelize.close().catch(() => {}) })
