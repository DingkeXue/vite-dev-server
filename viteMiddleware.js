const vueCompiler = require('@vue/component-compiler')
const fs = require('fs')
const stat = require('util').promisify(fs.stat)
const root = process.cwd()
const path = require('path')
const parseUrl = require('parseurl')
const { transformModuleImports } = require('./utils/transformModuleImport')
const { loadPkg } = require('./utils/loadPkg')
const { readSource } = require('./utils/readSource')

const defaultOptions = {
  cache: true
}

const vueMiddleware = (options = defaultOptions) => {
  let cache
  let time = {}
  if (options.cache) {
    const LRU = require('lru-cache')

    cache = new LRU({
      max: 500,
      length: function (n, key) { return n * 2 + key.length }
    })
  }

  // vue 编译器
  const compiler = vueCompiler.createDefaultCompiler()

  function send(res, source, mime = 'application/javascript') {
    res.setHeader('Content-Type', mime)
    res.end(source)
  }

  function injectSourceMapToBlock (block, lang) {
    const map = Base64.toBase64(JSON.stringify(block.map))
    let mapInject
    switch (lang) {
      case 'js':
        mapInject = `//# sourceMappingURL=data:application/json;base64,${map}\n`;
        break;
      case 'css':
        mapInject = `/*# sourceMappingURL=data:application/json;base64,${map}*/\n`;
      default:
        break;
    }
    return { ...block, code: mapInject + block.code }
  }

  function injectSourceMapToScript (script) {
    return injectSourceMapToBlock(script, 'js')
  }

  function injectSourceMapsToStyles (styles) {
    return styles.map(style => injectSourceMapToBlock(style, 'css'))
  }
  
  async function tryCache (key, checkUpdateTime = true) {
    const data = cache.get(key)

    if (checkUpdateTime) {
      const cacheUpdateTime = time[key]
      const fileUpdateTime = (await stat(path.resolve(root, key.replace(/^\//, '')))).mtime.getTime()
      if (cacheUpdateTime < fileUpdateTime) return null
    }

    return data
  }

  function cacheData (key, data, updateTime) {
    const old = cache.peek(key)

    if (old != data) {
      cache.set(key, data)
      if (updateTime) time[key] = updateTime
      return true
    } else return false
  }

  async function bundleSFC (req) {
    // 读取文件，获取相关信息
    const { source, updateTime, filepath } = await readSource(req)
    const descriptorResult = compiler.compileToDescriptor(filepath, source)
    const assembleResult = vueCompiler.assemble(compiler, filepath, {
      ...descriptorResult,
      script: injectSourceMapToScript(descriptorResult.script),
      styles: injectSourceMapsToStyles(descriptorResult.styles)
    })
    return { ...assembleResult, updateTime }
  }

  return async (req, res, next) => {
    const { path } = req
    if(path.endsWith('.js')) { // 处理 js 文件
      const result = await readSource(req)

      const out = transformModuleImports(result.source)

      send(res, out)
    } else if (path.endsWith('.vue')) { // 处理 .vue 文件
      // 将 vue 文件转成 单文件组件
      const out = await bundleSFC(req)
      send(res, out.code)

    } else if (path.startsWith('/__modules/')) {
      const pkg = path.replace(/^\/__modules\//g, '')
      const out = (await loadPkg(pkg)).toString()
      send(res, out)
    } else {
      next()
    }
  }
}

exports.vueMiddleware = vueMiddleware
