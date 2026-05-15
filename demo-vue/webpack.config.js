const path = require('path')
const { VueLoaderPlugin } = require('vue-loader')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: {
    app: './src/main.js',
    poc: './src/poc.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
    clean: true
  },
  resolve: {
    extensions: ['.js', '.vue'],
    alias: {
      // 强制 webpack 取 runtime + compiler 全量构建（demo 用模板字符串）
      vue$: 'vue/dist/vue.esm.js'
    }
  },
  module: {
    rules: [
      { test: /\.vue$/, loader: 'vue-loader' },
      { test: /\.css$/, use: ['vue-style-loader', 'css-loader'] }
    ]
  },
  plugins: [
    new VueLoaderPlugin(),
    new HtmlWebpackPlugin({
      template: 'public/index.html',
      filename: 'index.html',
      chunks: ['app']
    }),
    new HtmlWebpackPlugin({
      template: 'public/poc.html',
      filename: 'poc.html',
      chunks: ['poc'],
      inject: false
    })
  ],
  devServer: {
    static: path.resolve(__dirname, 'dist'),
    port: 5173,
    open: false
  }
}
