// worker_threads 内执行 compile，并通过 parentPort 回传耗时
const { parentPort, workerData } = require('worker_threads')
const compiler = require('vue-template-compiler')

const t0 = Date.now()
compiler.compile(workerData.payload)
parentPort.postMessage({ dt: Date.now() - t0 })
