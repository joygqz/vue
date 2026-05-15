// Web Worker：调用 vue-template-compiler/browser（纯字符串编译，
// 不依赖 DOM）执行 compile，避免 ReDoS 卡死主线程。
import * as compiler from 'vue-template-compiler/browser'

self.onmessage = e => {
  const { payload } = e.data
  const t0 = performance.now()
  try {
    compiler.compile(payload)
    self.postMessage({ ok: true, dt: performance.now() - t0 })
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) })
  }
}
