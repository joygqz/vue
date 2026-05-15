#!/usr/bin/env node
/**
 * 自动发布一轮 2.7.16-security.N 安全补丁。
 *
 * 用法：
 *   node scripts/release-security.js                  自动算 N（远端最新 tag + 1）
 *   node scripts/release-security.js --n 5            手动指定 N
 *   node scripts/release-security.js --no-push        本地发布，不推到远端
 *   node scripts/release-security.js --no-build       跳过 pnpm run build（假设产物已就绪）
 *   node scripts/release-security.js --remote upstream
 *   node scripts/release-security.js --clean --n 2    清理 N=2 的本地残留（tag/branch/worktree）
 *
 * 前置：当前分支 = main、工作区干净、所有源码改动已 commit。
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const execa = require('execa')
const chalk = require('chalk')
const minimist = require('minimist')

// ── 配置 ────────────────────────────────────────────────────────────────
const REPO_URL = 'https://github.com/joygqz/vue.git'
const BASE_VERSION = '2.7.16'
const TAG_PREFIX = `v${BASE_VERSION}-security`
const SUBPACKAGES = ['template-compiler', 'server-renderer', 'compiler-sfc']

const PKG_FILES = [
  'package.json',
  'packages/compiler-sfc/package.json',
  'packages/server-renderer/package.json',
  'packages/template-compiler/package.json'
]
const DOC_FILES = [
  'README.md',
  'demo-vue/README.md',
  'demo-vue/package.json',
  'demo-vue/public/index.html'
]
const MAIN_RELEASE_PRODUCTS = [
  'dist',
  'packages/server-renderer/basic.js',
  'packages/server-renderer/build.dev.js',
  'packages/server-renderer/build.prod.js',
  'packages/server-renderer/server-plugin.js',
  'packages/server-renderer/client-plugin.js',
  'packages/template-compiler/build.js',
  'packages/template-compiler/browser.js',
  'packages/compiler-sfc/dist',
  'types/v3-generated.d.ts'
]

// ── 参数解析 ────────────────────────────────────────────────────────────
// 用 process.argv.includes 直接探测 --no-push / --no-build，避开 minimist 的
// `--no-X => argv.X=false` 反转规则带来的歧义。
const argv = minimist(process.argv.slice(2), {
  string: ['n', 'remote'],
  boolean: ['clean', 'help'],
  alias: { h: 'help' },
  default: { remote: 'origin', clean: false }
})

const DO_PUSH = !process.argv.includes('--no-push')
const DO_BUILD = !process.argv.includes('--no-build')
const DO_CLEAN = argv.clean
const REMOTE = argv.remote

// ── 工具函数 ────────────────────────────────────────────────────────────
const say = msg => console.log(chalk.cyan.bold('▶'), msg)
const ok = msg => console.log(chalk.green.bold('✓'), msg)
const warn = msg => console.error(chalk.yellow.bold('!'), msg)
const die = msg => {
  console.error(chalk.red.bold('✗'), msg)
  process.exit(1)
}

const run = (bin, args = [], opts = {}) =>
  execa(bin, args, { stdio: 'inherit', ...opts })

const capture = (bin, args = [], opts = {}) => execa(bin, args, opts)

async function refExists(ref) {
  const r = await capture('git', ['rev-parse', '--verify', '--quiet', ref], {
    reject: false
  })
  return r.exitCode === 0
}

// ── --help ─────────────────────────────────────────────────────────────
function printHelp() {
  const src = fs.readFileSync(__filename, 'utf8')
  const m = src.match(/\/\*\*([\s\S]*?)\*\//)
  if (m) {
    console.log(m[1].replace(/^[ \t]*\*[ \t]?/gm, '').trim())
  }
}

// ── --clean 模式 ───────────────────────────────────────────────────────
async function runClean() {
  const n = parseInt(argv.n, 10)
  if (!Number.isInteger(n) || n < 1)
    die('--clean 需要配合 --n <N>（要清理的轮次）')

  const cleanVer = `${BASE_VERSION}-security.${n}`
  say(`清理本地引用：${cleanVer}`)

  await deleteRef('tag', `v${cleanVer}`)
  await deleteRef('branch', `release/${cleanVer}`)
  for (const p of SUBPACKAGES) {
    await deleteRef('tag', `${p}-v${cleanVer}`)
    await deleteRef('branch', `release/${p}-${cleanVer}`)
    const wt = path.join(os.tmpdir(), `wt-vue-${p}-${cleanVer}`)
    fs.rmSync(wt, { recursive: true, force: true })
  }
  await capture('git', ['worktree', 'prune', '--verbose'])

  // 若 main 上 HEAD 正好是本轮的 chore: release commit，则一并撤销
  await revertChoreCommitIfPresent(cleanVer)

  ok(
    `本地清理完成（远端 ref 未动；若已 push 需手动 git push ${REMOTE} :refs/...）`
  )
}

async function revertChoreCommitIfPresent(cleanVer) {
  const expected = `chore: release ${cleanVer}`

  const branchR = await capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    reject: false
  })
  if (branchR.exitCode !== 0 || branchR.stdout.trim() !== 'main') {
    warn(`当前不在 main 分支，跳过 chore commit 检查`)
    return
  }

  const statusR = await capture('git', ['status', '--porcelain'], {
    reject: false
  })
  if (statusR.exitCode !== 0 || statusR.stdout.trim()) {
    warn(`工作区不干净，跳过 chore commit 回退（请手动处理 "${expected}"）`)
    return
  }

  const subjectR = await capture('git', ['log', '-1', '--pretty=%s', 'HEAD'], {
    reject: false
  })
  if (subjectR.exitCode !== 0) return
  const subject = subjectR.stdout.trim()
  if (subject !== expected) return

  await run('git', ['reset', '--hard', 'HEAD~1'])
  ok(`已撤销 main 上 "${expected}" commit（git reset --hard HEAD~1）`)
}

async function deleteRef(type, name) {
  const flag = type === 'tag' ? '-d' : '-D'
  const r = await capture('git', [type, flag, name], { reject: false })
  if (r.exitCode === 0) ok(`删除 ${type} ${name}`)
}

// ── 前置检查 ────────────────────────────────────────────────────────────
async function preflightChecks() {
  const { stdout: branch } = await capture('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD'
  ])
  if (branch.trim() !== 'main') die('当前分支不是 main')
  const { stdout: status } = await capture('git', ['status', '--porcelain'])
  if (status.trim()) die('工作区不干净，请先 commit 或 stash')
}

// ── 算 N ────────────────────────────────────────────────────────────────
async function calculateN() {
  say('拉取远端 tag...')
  try {
    await capture('git', ['fetch', REMOTE, '--tags', '--quiet'])
  } catch {
    warn('fetch 失败，沿用本地 tag')
  }

  if (argv.n) {
    const n = parseInt(argv.n, 10)
    if (!Number.isInteger(n) || n < 1) die(`无效 N: ${argv.n}（必须为正整数）`)
    return n
  }

  const { stdout } = await capture('git', ['tag', '--list', `${TAG_PREFIX}.*`])
  const ns = stdout
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => parseInt(t.replace(`${TAG_PREFIX}.`, ''), 10))
    .filter(Number.isInteger)
  const maxN = ns.length > 0 ? Math.max(...ns) : 0
  return maxN + 1
}

// ── 冲突检查（本地 + 远端）───────────────────────────────────────────────
async function checkConflicts(newVer) {
  const mainTag = `v${newVer}`
  const mainBranch = `release/${newVer}`

  // 本地
  const localChecks = [
    [mainTag, `本地 tag ${mainTag}`],
    [`refs/heads/${mainBranch}`, `本地分支 ${mainBranch}`]
  ]
  for (const p of SUBPACKAGES) {
    localChecks.push([`${p}-v${newVer}`, `本地 tag ${p}-v${newVer}`])
    localChecks.push([
      `refs/heads/release/${p}-${newVer}`,
      `本地分支 release/${p}-${newVer}`
    ])
  }
  for (const [ref, label] of localChecks) {
    if (await refExists(ref))
      die(
        `${label} 已存在（用 --clean --n ${
          argv.n || newVer.split('.').pop()
        } 清理或换一个 N）`
      )
  }

  // 远端
  if (DO_PUSH) {
    const refs = [`refs/tags/${mainTag}`, `refs/heads/${mainBranch}`]
    for (const p of SUBPACKAGES) {
      refs.push(`refs/tags/${p}-v${newVer}`)
      refs.push(`refs/heads/release/${p}-${newVer}`)
    }
    const r = await capture('git', ['ls-remote', '--refs', REMOTE, ...refs], {
      reject: false
    })
    if (r.exitCode === 0 && r.stdout.trim()) {
      warn(`远端 ${REMOTE} 已有以下同名 ref：`)
      r.stdout.split('\n').forEach(l => console.error('    ' + l))
      die(`请换一个 N，或先 git push ${REMOTE} :refs/... 删除远端 ref`)
    }
  }
}

// ── 更新 version + 文档 + commit ─────────────────────────────────────────
function updatePackageVersion(file, newVer) {
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  pkg.version = newVer
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
}

function updateDocFile(file, newVer) {
  if (!fs.existsSync(file)) return
  const content = fs.readFileSync(file, 'utf8')
  const pattern = new RegExp(
    BASE_VERSION.replace(/\./g, '\\.') + '-security\\.\\d+',
    'g'
  )
  const updated = content.replace(pattern, newVer)
  if (content !== updated) fs.writeFileSync(file, updated)
}

async function updateVersionsAndCommit(newVer) {
  say(
    `更新版本号到 ${newVer}（${PKG_FILES.length} 个 package.json + ${DOC_FILES.length} 个文档）`
  )
  PKG_FILES.forEach(f => updatePackageVersion(f, newVer))
  DOC_FILES.forEach(f => updateDocFile(f, newVer))

  await run('git', ['add', '--', ...PKG_FILES, ...DOC_FILES])
  const r = await capture('git', ['diff', '--cached', '--quiet'], {
    reject: false
  })
  if (r.exitCode === 0) {
    ok(`版本号已是 ${newVer}（无需 commit）`)
  } else {
    await run('git', ['commit', '-m', `chore: release ${newVer}`])
    ok(`已 commit 版本号 + 文档同步`)
  }
}

// ── 构建 ──────────────────────────────────────────────────────────────
async function build() {
  if (!DO_BUILD) return
  say('构建主包 + 子包产物（pnpm run build + build:types）...')
  await run('pnpm', ['run', 'build'])
  await run('pnpm', ['run', 'build:types'])
}

function assertBuildArtifacts() {
  if (!fs.existsSync('dist/vue.runtime.common.js')) {
    die(
      'dist/vue.runtime.common.js 不存在（先跑 pnpm run build 或去掉 --no-build）'
    )
  }
  if (!fs.existsSync('packages/compiler-sfc/dist')) {
    die('packages/compiler-sfc/dist 不存在')
  }
}

// ── 主包发布 ─────────────────────────────────────────────────────────
async function releaseMainPackage(newVer) {
  const mainTag = `v${newVer}`
  const mainBranch = `release/${newVer}`
  say(`发布主包 → ${mainBranch} + ${mainTag}`)

  await run('git', ['checkout', '-b', mainBranch])
  await run('git', ['add', '-f', ...MAIN_RELEASE_PRODUCTS])

  // 把 @vue/compiler-sfc 的 workspace:* 替换为 git URL
  const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  rootPkg.dependencies[
    '@vue/compiler-sfc'
  ] = `git+${REPO_URL}#compiler-sfc-v${newVer}`
  fs.writeFileSync('package.json', JSON.stringify(rootPkg, null, 2) + '\n')

  await run('git', ['add', 'package.json'])
  await run('git', ['commit', '-m', `build: ${newVer} build artifacts`])
  await run('git', ['tag', mainTag])

  if (DO_PUSH) {
    await run('git', ['push', REMOTE, mainBranch, mainTag])
  }
  ok('主包已发布')

  await run('git', ['checkout', 'main'])
}

// ── 子包发布（孤儿分支）────────────────────────────────────────────────
async function releaseSubpackage(p, newVer, mainBranch) {
  const pBranch = `release/${p}-${newVer}`
  const pTag = `${p}-v${newVer}`
  const wt = path.join(os.tmpdir(), `wt-vue-${p}-${newVer}`)

  say(`发布子包 ${p} → ${pBranch} + ${pTag}`)

  fs.rmSync(wt, { recursive: true, force: true })
  await capture('git', ['worktree', 'prune'])
  await run('git', ['worktree', 'add', '--detach', wt])

  try {
    await run('git', ['checkout', '--orphan', pBranch], { cwd: wt })
    await capture('git', ['rm', '-rf', '.'], { cwd: wt, reject: false })

    // git archive ... | tar -x --strip-components=2 in worktree dir
    // 注意：不在 tar 的 options 里设 stdin（会让 tar.stdin = null 然后 .pipe 报错），
    // 用 stream.pipe() 连接。
    const archive = execa('git', ['archive', mainBranch, '--', `packages/${p}`])
    const tar = execa('tar', ['-x', '--strip-components=2'], { cwd: wt })
    archive.stdout.pipe(tar.stdin)
    await Promise.all([archive, tar])

    // 删 src / test / api-extractor.json
    for (const f of ['src', 'test', 'api-extractor.json']) {
      fs.rmSync(path.join(wt, f), { recursive: true, force: true })
    }

    await run('git', ['add', '-A'], { cwd: wt })
    await run('git', ['commit', '-m', `release: ${p} ${newVer}`], { cwd: wt })
    await run('git', ['tag', pTag], { cwd: wt })
    if (DO_PUSH) {
      await run('git', ['push', REMOTE, pBranch, pTag], { cwd: wt })
    }
  } finally {
    await capture('git', ['worktree', 'remove', '--force', wt], {
      reject: false
    })
  }

  ok(`子包 ${p} 已发布`)
}

// ── 还原 tracked 产物（保持 main 工作区干净）─────────────────────────────
async function restoreTrackedArtifacts() {
  await capture(
    'git',
    [
      'checkout',
      '--',
      'dist',
      'packages/server-renderer/index.js',
      'packages/template-compiler/index.js'
    ],
    { reject: false }
  )
}

// ── 完成提示 ─────────────────────────────────────────────────────────
function printSummary(newVer) {
  const mainTag = `v${newVer}`
  const mainBranch = `release/${newVer}`

  console.log()
  ok(`全部发布完成：${newVer}`)
  console.log()
  console.log('依赖方接入示例：')
  console.log(
    JSON.stringify(
      {
        dependencies: {
          vue: `git+${REPO_URL}#${mainTag}`,
          'vue-template-compiler': `git+${REPO_URL}#template-compiler-v${newVer}`,
          'vue-server-renderer': `git+${REPO_URL}#server-renderer-v${newVer}`,
          '@vue/compiler-sfc': `git+${REPO_URL}#compiler-sfc-v${newVer}`
        }
      },
      null,
      2
    )
  )

  if (!DO_PUSH) {
    console.log()
    warn('已跳过 push。手动推送命令：')
    console.log(
      `  git push ${REMOTE} main                              # 含 chore: release ${newVer} commit`
    )
    console.log(`  git push ${REMOTE} ${mainBranch} ${mainTag}`)
    for (const p of SUBPACKAGES) {
      console.log(`  git push ${REMOTE} release/${p}-${newVer} ${p}-v${newVer}`)
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────
async function main() {
  if (argv.help) {
    printHelp()
    return
  }

  // cd to git root
  const { stdout: gitRoot } = await capture('git', [
    'rev-parse',
    '--show-toplevel'
  ])
  process.chdir(gitRoot.trim())

  if (DO_CLEAN) {
    await runClean()
    return
  }

  await preflightChecks()
  await capture('git', ['worktree', 'prune'])

  const n = await calculateN()
  const newVer = `${BASE_VERSION}-security.${n}`
  const mainTag = `v${newVer}`
  const mainBranch = `release/${newVer}`

  say(`本轮版本：${newVer}`)
  const fmt = (label, tag, branch) =>
    console.log(`  ${label.padEnd(22)} tag=${tag.padEnd(40)} branch=${branch}`)
  fmt('vue (主包)', mainTag, mainBranch)
  for (const p of SUBPACKAGES) {
    fmt(p, `${p}-v${newVer}`, `release/${p}-${newVer}`)
  }

  await checkConflicts(newVer)
  await updateVersionsAndCommit(newVer)
  await build()
  assertBuildArtifacts()
  await releaseMainPackage(newVer)

  for (const p of SUBPACKAGES) {
    await releaseSubpackage(p, newVer, mainBranch)
  }

  if (DO_PUSH) {
    await run('git', ['push', REMOTE, 'main'])
    ok('已推送 main')
  }

  await restoreTrackedArtifacts()
  printSummary(newVer)
}

main().catch(err => {
  console.error()
  warn(`中途失败（${err.shortMessage || err.message}）。可能需要手动清理：`)
  warn(`  git worktree list`)
  warn(`  git tag    --list "*v${BASE_VERSION}-security.*"`)
  warn(`  git branch --list "release/*${BASE_VERSION}-security.*"`)
  process.exit(1)
})
