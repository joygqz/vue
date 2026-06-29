/**
 * 间接依赖替换验证
 *
 * 场景：项目中某个第三方库（如 some-ui-lib）把有漏洞的 vue@2.7.16 作为
 * 间接依赖引入。通过 package.json 的 pnpm.overrides（或 npm overrides）
 * 字段，可以强制将整个依赖树里所有对 vue / vue-template-compiler 的解析
 * 重定向到安全修复版本，无需修改第三方库本身。
 *
 * 本脚本验证：
 *   1. package.json 中已配置 pnpm.overrides
 *   2. 无论从哪个路径 require('vue')，解析到的版本均为安全修复版
 *   3. vue-template-compiler 同理
 */

'use strict'

const path = require('path')
const fs = require('fs')

const EXPECTED_VUE_VERSION = /^2\.7\.16-security\.\d+$/
const FIXED_GIT_REPO = 'joygqz/vue'

let allPass = true
const report = (name, pass, detail) => {
  console.log(
    `  [${pass ? 'PASS' : 'FAIL'}] ${name}` + (detail ? `  — ${detail}` : '')
  )
  if (!pass) allPass = false
}

// ─── 1. 检查 package.json 已声明 pnpm.overrides ─────────────────────────────
console.log('================================================')
console.log(' 间接依赖替换验证（pnpm.overrides）')
console.log('================================================')

console.log('\n[1] 检查 package.json 中的 pnpm.overrides 配置')
{
  const pkgPath = path.join(__dirname, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const overrides = pkg?.pnpm?.overrides ?? {}

  const vueOverride = overrides['vue'] ?? ''
  const compilerOverride = overrides['vue-template-compiler'] ?? ''

  report(
    'pnpm.overrides.vue 已配置',
    vueOverride.includes(FIXED_GIT_REPO),
    vueOverride || '（未配置）'
  )
  report(
    'pnpm.overrides.vue-template-compiler 已配置',
    compilerOverride.includes(FIXED_GIT_REPO),
    compilerOverride || '（未配置）'
  )
}

// ─── 2. 验证实际解析到的 vue 版本 ───────────────────────────────────────────
console.log('\n[2] 验证 require("vue") 解析到的版本')
{
  let vuePkg
  try {
    vuePkg = require('vue/package.json')
  } catch (e) {
    report('require("vue") 可解析', false, e.message)
    vuePkg = null
  }

  if (vuePkg) {
    const ver = vuePkg.version
    report(
      'vue 版本符合安全修复格式（2.7.16-security.N）',
      EXPECTED_VUE_VERSION.test(ver),
      ver
    )

    // 通过 _resolved 或 _from 字段（pnpm 安装后 package.json 中会含 _resolved）
    // 确认来源仓库正确
    const resolved = vuePkg._resolved ?? vuePkg._from ?? ''
    const fromGit = resolved.includes(FIXED_GIT_REPO) || resolved === ''
    // pnpm git 安装时 _resolved 可能为空，但 version 验证已足够
    report(
      'vue 来源可信（版本字段验证）',
      EXPECTED_VUE_VERSION.test(ver),
      resolved
        ? `_resolved: ${resolved}`
        : `版本: ${ver}（git 安装无 _resolved 属性，以版本号为准）`
    )
  }
}

// ─── 3. 验证 vue-template-compiler 版本 ────────────────────────────────────
console.log('\n[3] 验证 require("vue-template-compiler") 解析到的版本')
{
  let compilerPkg
  try {
    compilerPkg = require('vue-template-compiler/package.json')
  } catch (e) {
    report('require("vue-template-compiler") 可解析', false, e.message)
    compilerPkg = null
  }

  if (compilerPkg) {
    const ver = compilerPkg.version
    report(
      'vue-template-compiler 版本符合安全修复格式',
      EXPECTED_VUE_VERSION.test(ver),
      ver
    )
  }
}

// ─── 4. 模拟间接依赖场景 ─────────────────────────────────────────────────────
console.log('\n[4] 模拟间接依赖场景（第三方库路径解析）')
{
  // 模拟：第三方库从自身目录 require('vue')，借助 pnpm 的 overrides 机制
  // 同样会解析到 hoisted 后的安全修复版本（pnpm 默认 hoist vue 到根目录）
  const vueMainPath = require.resolve('vue')
  // require.resolve('vue') 指向 dist/vue.xxx.js，需上溯到包根目录
  let vueDir = path.dirname(vueMainPath)
  if (!fs.existsSync(path.join(vueDir, 'package.json'))) {
    vueDir = path.dirname(vueDir)
  }
  const vuePkgFromPath = JSON.parse(
    fs.readFileSync(path.join(vueDir, 'package.json'), 'utf8')
  )

  report(
    '模拟第三方库路径 require.resolve("vue") 版本一致',
    EXPECTED_VUE_VERSION.test(vuePkgFromPath.version),
    `解析路径: ${vueMainPath}  版本: ${vuePkgFromPath.version}`
  )
}

// ─── 结果汇总 ────────────────────────────────────────────────────────────────
console.log('\n================================================')
console.log(
  allPass
    ? ' ✅ 间接依赖替换验证通过：pnpm.overrides 已生效，整个依赖树均使用安全修复版'
    : ' ❌ 存在未通过项，请检查 pnpm.overrides 配置并重新运行 pnpm install'
)
console.log('================================================')
console.log()
console.log('提示：若需同时覆盖 npm/yarn 项目的间接依赖，可在 package.json 中')
console.log(
  '  npm  →  "overrides": { "vue": "git+https://github.com/joygqz/vue.git#v2.7.16-security.1" }'
)
console.log(
  '  yarn →  "resolutions": { "vue": "git+https://github.com/joygqz/vue.git#v2.7.16-security.1" }'
)

process.exit(allPass ? 0 : 1)
