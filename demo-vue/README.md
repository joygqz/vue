# demo-vue

验证 [joygqz/vue 安全修复版](https://github.com/joygqz/vue) 能正常通过 pnpm + webpack 构建。

## 运行

```sh
cd demo-vue
pnpm install        # 从 git tag v2.7.16-security.1 拉取 vue + vue-template-compiler
pnpm run verify     # Node 侧验证两个 CVE 修复有效
pnpm run build      # webpack 生产构建 → dist/
pnpm run dev        # webpack-dev-server → http://localhost:5173
```

打开 `dist/index.html` 或 dev server 页面，会显示 `当前运行的 Vue 版本：2.7.16-security.1`。

## 关键点

- `package.json` 中 `vue` / `vue-template-compiler` 均用 git URL，与公共 npm registry 解耦
- 两者 `package.json` 的 `version` 字段同步为 `2.7.16-security.N`，满足 `vue-loader@15` 对 vue / vue-template-compiler 版本严等的校验
- `webpack.config.js` 的 `vue$` alias 指向 `vue/dist/vue.esm.js`（含模板编译器，便于 demo 用内联模板）
