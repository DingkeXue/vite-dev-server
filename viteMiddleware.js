const parseUrl = require('parseurl')
const vueCompiler = require('@vue/component-compiler')
const { readSource } = require('./utils/readSource')
const { transformModuleImports } = require('./utils/transformModuleImport')
const { loadPkg } = require('./utils/loadPkg')

const defaultOptions = {
  cache: true
}

const vueMiddleware = (options = defaultOptions) => {

  let cache
  if (options.cache) {
    const LRU = require('lru-cache')
    cache = new LRU()
  }

  /** 获取缓存数据 */
  function tryCache(key) {
    return cache.get(key)
  }

  /** 设置缓存 */
  function cacheData(key, source) {
    const old = tryCache(key)
    if (old !== source) {
      cache.set(key, source)
      return true
    } else return false
  }

  /** 封装send方法 */
  function send(res, source, mime = "application/javascript") {
    res.setHeader('Content-Type', mime)
    res.end(source)
  }

  /** 将vue文件装成js文件 */
  async function bundleSFC(req) {
    const compiler = vueCompiler.createDefaultCompiler()
    const { source , updateTime, filepath } = await readSource(req)
    const descriptorResult = compiler.compileToDescriptor(filepath, source)
    const assembleResult = vueCompiler.assemble(compiler, filepath, {
      ...descriptorResult
    })
    return { ...assembleResult, updateTime }
  }

  return async (req, res, next) => {
    const { path } = req
    if (path.endsWith('.js')) { // 处理 js 文件。替换引入方式
      const key = parseUrl(req).pathname
      let out = tryCache(key)
      if (!out) {
        const result = await readSource(req)
        out = transformModuleImports(result.source)
        cacheData(key, out)
      }
      send(res, out)
    } else if (path.endsWith('.vue')) { // 处理vue文件，将文件转成js
      const out = await bundleSFC(req)
      send(res, out.code)
    } else if (path.startsWith('/__modules/')) { // 处理 vue 包
      const pkg = path.replace(/^\/__modules\//g, '') // /__modules/vue ==> vue
      const out = await loadPkg(pkg)
      send(res, out)
    } else { 
      next()
    }
    
  }
}

exports.vueMiddleware = vueMiddleware
