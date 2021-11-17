#!/usr/bin/env node
// 启动服务
const express = require('express')
const {vueMiddleware} = require('../viteMiddleware.js')

const app = express()
const root = process.cwd()

app.use(vueMiddleware())
app.use(express.static(root))

app.listen(3000, () => {
  console.log(`正在监听3000端口`)
})