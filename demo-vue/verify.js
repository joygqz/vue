// Node 侧验证：使用官方披露的 PoC 形式验证安全修复版是否真正修补。
//   * CVE-2024-9506：未闭合 <textarea>/<script>/<style> + 大量 '<'，
//     ReDoS 编译会卡死。放进 worker_threads 加硬超时，超时即 FAIL。
//   * CVE-2024-6783：污染 Object.prototype 上的 staticClass / classBinding /
//     staticStyle / styleBinding，再 compile 最小模板 `<div></div>`，
//     漏洞版 render 中会出现 alert("Polluted")。

const path = require('path')
const { Worker } = require('worker_threads')
const vue = require('vue')
const compiler = require('vue-template-compiler')

console.log('================================================')
console.log(' vue                   :', vue.version)
console.log(
  ' vue-template-compiler :',
  require('vue-template-compiler/package.json').version
)
console.log('================================================')

let allPass = true
const report = (name, pass, detail) => {
  console.log(
    `  [${pass ? 'PASS' : 'FAIL'}] ${name}` + (detail ? `  — ${detail}` : '')
  )
  if (!pass) allPass = false
}

function compileWithTimeout(payload, timeoutMs) {
  return new Promise(resolve => {
    const worker = new Worker(path.join(__dirname, 'verify-worker.js'), {
      workerData: { payload }
    })
    const timer = setTimeout(() => {
      worker.terminate()
      resolve({ timedOut: true, dt: timeoutMs })
    }, timeoutMs)
    worker.once('message', msg => {
      clearTimeout(timer)
      worker.terminate()
      resolve({ timedOut: false, dt: msg.dt })
    })
    worker.once('error', err => {
      clearTimeout(timer)
      worker.terminate()
      resolve({ timedOut: false, dt: -1, error: err })
    })
  })
}

async function main() {
  // ─── CVE-2024-9506 ────────────────────────────────────────────
  console.log('\nCVE-2024-9506  parseHTML stackedTag 正则 ReDoS')
  const THRESHOLD = 1000
  const HARD_TIMEOUT = 5000
  const cases = [
    {
      name: '<textarea> 未闭合 + 100,000 个 "<"（Snyk 官方 PoC 形式）',
      payload: '<textarea>' + '<'.repeat(100_000)
    },
    {
      name: '<script> 未闭合 + 100,000 个 "<"',
      payload: '<script>' + '<'.repeat(100_000)
    },
    {
      name: '<style> 未闭合 + 100,000 个 "<"',
      payload: '<style>' + '<'.repeat(100_000)
    }
  ]
  for (const c of cases) {
    const { timedOut, dt, error } = await compileWithTimeout(
      c.payload,
      HARD_TIMEOUT
    )
    if (error) {
      report(c.name, false, `worker error: ${error.message}`)
    } else if (timedOut) {
      report(c.name, false, `超时 >${HARD_TIMEOUT}ms（ReDoS 挂死，已强制终止）`)
    } else {
      report(c.name, dt < THRESHOLD, `${dt} ms（阈值 <${THRESHOLD}ms）`)
    }
  }

  // ─── CVE-2024-6783 ────────────────────────────────────────────
  console.log('\nCVE-2024-6783  vue-template-compiler 原型污染 XSS')
  const PAYLOAD = 'alert("Polluted")'
  // 每个属性对应的最小模板（Snyk PoC 形式）：节点必须显式带上
  // 空 class / :class / style / :style，让模块从 attrsList 中摘掉该属性，
  // 但 own staticClass 等并未被赋值，codegen 的 `if (el.X)` 才会沿原型读到污染值。
  const pollutionCases = [
    { prop: 'staticClass', template: '<div class=""></div>' },
    { prop: 'classBinding', template: '<div :class=""></div>' },
    { prop: 'staticStyle', template: '<div style=""></div>' },
    { prop: 'styleBinding', template: '<div :style=""></div>' }
  ]
  for (const { prop, template } of pollutionCases) {
    Object.prototype[prop] = PAYLOAD
    try {
      const { render } = compiler.compile(template)
      const clean = render.indexOf(PAYLOAD) === -1
      report(
        `Object.prototype.${prop} 原型污染检测  compile('${template}')`,
        clean,
        clean
          ? `已修复 — render 不含 PAYLOAD: ${render}`
          : `⚠️ 漏洞触发 — render 含 PAYLOAD: ${render}`
      )
    } finally {
      delete Object.prototype[prop]
    }
  }

  console.log(
    '\n  说明：原 PoC 的 new Vue() 运行时验证请打开 dist/poc.html（npm run build 后）。'
  )

  console.log('\n================================================')
  console.log(
    allPass
      ? ' ✅ 全部通过：CVE-2024-9506 与 CVE-2024-6783 均已修复'
      : ' ❌ 存在未修复项'
  )
  console.log('================================================')
  process.exit(allPass ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
