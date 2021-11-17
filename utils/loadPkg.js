const fs = require('fs')
const path = require('path')
const readFile = require('util').promisify(fs.readFile)

async function loadPkg(pkg) {
  // 这里目前只处理 vue 包
  if (pkg === 'vue') {
    const dir = path.dirname(require.resolve('vue'))
    const filepath = path.join(dir, 'vue.esm.browser.js')
    return (await readFile(filepath)).toString()
  }
  else {
    // TODO 处理其他的包
    throw new Error('npm imports support are not ready yet.')
  }
}

exports.loadPkg = loadPkg
