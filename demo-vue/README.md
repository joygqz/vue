# demo-vue

验证 [joygqz/vue 安全修复版](https://github.com/joygqz/vue) 能正常通过 pnpm + webpack 构建。

## 运行

```sh
cd demo-vue
pnpm install              # 从 git tag 拉取 vue + vue-template-compiler
pnpm run verify           # Node 侧验证两个 CVE 修复有效
pnpm run verify:indirect  # 验证 pnpm.overrides 间接依赖替换已生效
pnpm run build            # webpack 生产构建 → dist/
pnpm run dev              # webpack-dev-server → http://localhost:5173
```

打开 `dist/index.html` 或 dev server 页面，会显示 `当前运行的 Vue 版本：2.7.16-security.1`。

## 关键点

- `package.json` 中 `vue` / `vue-template-compiler` 均用 git URL，与公共 npm registry 解耦
- 两者 `package.json` 的 `version` 字段同步为 `2.7.16-security.N`，满足 `vue-loader@15` 对 vue / vue-template-compiler 版本严等的校验
- `webpack.config.js` 的 `vue$` alias 指向 `vue/dist/vue.esm.js`（含模板编译器，便于 demo 用内联模板）

## 间接依赖替换（pnpm.overrides）

### 场景

实际项目中常见情形：你依赖的某个第三方 UI 库（如 `some-ui-lib`）在其自身的
`package.json` 里声明了 `"vue": "^2.7.x"`，从而把有漏洞的 `vue@2.7.16` 作为
**间接依赖**引入。你无法直接修改第三方库，但可以在**消费方**的 `package.json`
中声明 override，强制整个依赖树都解析到安全修复版本。

```
your-project
├── vue@2.7.16-security.1   ← 直接依赖，已是修复版
└── some-ui-lib
    └── vue@2.7.16           ← 间接依赖（有漏洞），被 overrides 覆盖 ↗
```

### 配置方式（各包管理器）

**pnpm**（`package.json`）：
```json
{
  "pnpm": {
    "overrides": {
      "vue": "git+https://github.com/joygqz/vue.git#v2.7.16-security.1",
      "vue-template-compiler": "git+https://github.com/joygqz/vue.git#template-compiler-v2.7.16-security.1"
    }
  }
}
```

**npm 8+**（`package.json`）：
```json
{
  "overrides": {
    "vue": "git+https://github.com/joygqz/vue.git#v2.7.16-security.1"
  }
}
```

**yarn**（`package.json`）：
```json
{
  "resolutions": {
    "vue": "git+https://github.com/joygqz/vue.git#v2.7.16-security.1"
  }
}
```

### 验证

```sh
pnpm run verify:indirect
```

脚本（`verify-indirect.js`）会检查：
1. `package.json` 中的 `pnpm.overrides` 字段已正确配置
2. `require('vue')` 解析到的版本符合 `2.7.16-security.N` 格式
3. `require('vue-template-compiler')` 版本同上
4. 模拟第三方库路径下 `require.resolve('vue')` 同样指向安全修复版（pnpm 默认 hoist 机制保证）
