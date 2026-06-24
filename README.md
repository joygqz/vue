# Vue 2 — Self-maintained Security Fork

> 这是基于 Vue 2.7.16（官方 EOL 最终版）的**自修复安全分支**，仅修复已披露的漏洞，**不引入功能改动**，不保证未来同步官方任何更新。
> 上游已 EOL：<https://github.com/vuejs/vue> · 推荐新项目使用 [Vue 3](https://github.com/vuejs/core)。

## 当前版本

`v2.7.16-security.1`

已修复的漏洞：

| CVE              | 类型           | 涉及       | 修复点                                                             |
| ---------------- | -------------- | ---------- | ------------------------------------------------------------------ |
| CVE-2024-9506    | ReDoS          | 模板编译器 | `src/compiler/parser/html-parser.ts` 给 `reStackedTag` 加 `^` 锚点 |
| CVE-2024-6783    | XSS / 原型污染 | codegen    | `class.ts` / `style.ts` / SSR `codegen.ts` 用 `hasOwn` 防御        |
| 多项传递依赖 CVE | 多种           | 构建链     | `pnpm.overrides` + `pnpm patch`                                    |

`pnpm audit` 结果：仅剩 1 个 low（`elliptic`，上游无修复，无法消除）。

## 业务项目接入

### 第 1 步：替换直接依赖

把 `package.json` `dependencies` 里用到的几项改成 git tag（只装用得到的即可）：

```jsonc
{
  "dependencies": {
    "vue": "git+https://github.com/joygqz/vue.git#v2.7.16-security.1",
    "vue-template-compiler": "git+https://github.com/joygqz/vue.git#template-compiler-v2.7.16-security.1",
    "vue-server-renderer": "git+https://github.com/joygqz/vue.git#server-renderer-v2.7.16-security.1",
    "@vue/compiler-sfc": "git+https://github.com/joygqz/vue.git#compiler-sfc-v2.7.16-security.1"
  }
}
```

### 第 2 步：强制 dedup（**几乎所有项目都需要**）

> ⚠️ 本分支版本号是 **prerelease**（`2.7.16-security.1`）。按 semver 规则，prerelease **不会匹配**普通范围（`^2.7.16`、`^2.7.0`、`>=2.5.0` 全部不命中）。
> 因此，凡是**间接依赖** vue 的包（UI 组件库、被工具链拉取的 `vue-template-compiler` / `vue-server-renderer`、把 `vue` 写进 `dependencies` 的库），其范围匹配不到本补丁版，包管理器会**从 registry 另装一份未打补丁的 vue**——导致双份 Vue 实例（响应式 / `instanceof` 失效）且漏洞依然存在。

除非你的项目**完全没有任何间接 vue 依赖**（极少见），否则必须用 `overrides` / `resolutions` 把所有 vue 引用强制指向本补丁版：

**npm / pnpm**（`package.json` 顶层）：

```jsonc
{
  // pnpm
  "pnpm": {
    "overrides": {
      "vue": "git+https://github.com/joygqz/vue.git#v2.7.16-security.1",
      "vue-template-compiler": "git+https://github.com/joygqz/vue.git#template-compiler-v2.7.16-security.1",
      "vue-server-renderer": "git+https://github.com/joygqz/vue.git#server-renderer-v2.7.16-security.1",
      "@vue/compiler-sfc": "git+https://github.com/joygqz/vue.git#compiler-sfc-v2.7.16-security.1"
    }
  },
  // npm（顶层同级，与 pnpm 二选一按所用包管理器）
  "overrides": {
    "vue": "git+https://github.com/joygqz/vue.git#v2.7.16-security.1",
    "vue-template-compiler": "git+https://github.com/joygqz/vue.git#template-compiler-v2.7.16-security.1",
    "vue-server-renderer": "git+https://github.com/joygqz/vue.git#server-renderer-v2.7.16-security.1",
    "@vue/compiler-sfc": "git+https://github.com/joygqz/vue.git#compiler-sfc-v2.7.16-security.1"
  }
}
```

**yarn**（`package.json` 顶层）：

```jsonc
{
  "resolutions": {
    "vue": "git+https://github.com/joygqz/vue.git#v2.7.16-security.1",
    "vue-template-compiler": "git+https://github.com/joygqz/vue.git#template-compiler-v2.7.16-security.1",
    "vue-server-renderer": "git+https://github.com/joygqz/vue.git#server-renderer-v2.7.16-security.1",
    "@vue/compiler-sfc": "git+https://github.com/joygqz/vue.git#compiler-sfc-v2.7.16-security.1"
  }
}
```

override 列表同样只保留用得到的几项即可。

### 第 3 步：安装并验证

重装锁文件以确保 dedup 生效：

```sh
rm -rf node_modules pnpm-lock.yaml   # 或 package-lock.json / yarn.lock
pnpm install                         # npm install / yarn install
```

验证版本号，并确认全树只有一份 vue：

```sh
node -p "require('vue/package.json').version"
# 2.7.16-security.1

pnpm why vue        # npm ls vue / yarn why vue —— 应只出现 git 补丁版，无 registry 副本
```

参考 `demo-vue/`（webpack + `vue-loader@15` 集成示例）。

## 仓库分支 / Tag 一览

| package                 | git tag                                | release 分支                                  |
| ----------------------- | -------------------------------------- | --------------------------------------------- |
| `vue`                   | `v2.7.16-security.1`                   | `release/2.7.16-security.1`                   |
| `vue-template-compiler` | `template-compiler-v2.7.16-security.1` | `release/template-compiler-2.7.16-security.1` |
| `vue-server-renderer`   | `server-renderer-v2.7.16-security.1`   | `release/server-renderer-2.7.16-security.1`   |
| `@vue/compiler-sfc`     | `compiler-sfc-v2.7.16-security.1`      | `release/compiler-sfc-2.7.16-security.1`      |

`main` 分支只用于源码开发；`release/*` 分支由 `pnpm run release:security` 生成，包含完整构建产物供业务方 git 直接安装。

---

## 开发 / 构建 / 发布流程

### 1. 准备开发环境

```sh
pnpm install                 # 含 pnpm.overrides + patchedDependencies
```

### 2. 改源码

漏洞修复或其他改动均在 `main` 分支进行：

```sh
git checkout main
# 编辑 src/** 或 packages/**
```

### 3. 构建 + 测试

```sh
pnpm run build               # 主包 + 子包产物
pnpm run build:types         # .d.ts
pnpm run test:unit
pnpm run test:ssr
pnpm run test:sfc
pnpm audit                   # 预期：仅剩 1 个 low（elliptic 无上游修复）
```

### 4. 提交源码改动

```sh
git add -A && git commit -m "fix: <CVE-编号或简述>" && git push
```

### 5. 跑发布脚本

```sh
pnpm run release:security
# 等价于：node scripts/release-security.js
```

脚本自动：算 N → 构建 → 主包发 `release/2.7.16-security.<N>` + tag → 3 个子包各发一个孤儿分支 + tag → push → 打印本轮接入示例。

常用选项：

| 选项                | 说明                                  |
| ------------------- | ------------------------------------- |
| `--n 5`             | 手动指定本轮 N（默认远端最大值 +1）   |
| `--no-push`         | 仅本地建分支/tag，最后打印 push 命令  |
| `--no-build`        | 跳过构建（产物已就绪）                |
| `--clean --n 2`     | 清理 N=2 的本地残留 tag/分支/worktree |
| `--remote upstream` | 远端名（默认 `origin`）               |

跑 `node scripts/release-security.js --help` 看完整说明。中途失败时脚本会提示残留 ref 的自查命令。

### 6. 通知业务项目

把新 tag 告知依赖方。业务项目需把 `dependencies` **以及 `overrides` / `resolutions`** 里的 `git+...#...security.<旧 N>` 一并改成新 tag，再重装锁文件（详见上文「业务项目接入」三步）。

---

## 仓库结构

- `src/` — Vue 运行时与编译器源码（漏洞修复在此）
- `packages/` — 子包源码（`server-renderer` / `compiler-sfc` / `template-compiler`）
- `scripts/` — 构建配置与发布脚本（核心：`release-security.js`）
- `patches/` — `pnpm patch` 文件
- `demo-vue/` — webpack 集成 demo（验证可安装）

## License

MIT（沿用原作者 Yuxi (Evan) You 的授权）

<p align="center"><a href="https://vuejs.org" target="_blank" rel="noopener noreferrer"><img width="100" src="https://vuejs.org/images/logo.png" alt="Vue logo"></a></p>
