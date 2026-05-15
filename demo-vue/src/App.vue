<template>
  <div class="app">
    <h1>Vue 2 安全修复版 demo</h1>
    <p>当前运行的 Vue 版本：<code>{{ version }}</code></p>
    <button @click="count++">点击次数：{{ count }}</button>
  </div>
</template>

<script>
import Vue from 'vue';

export default {
  name: 'App',
  data () {
    return {
      version: Vue.version,
      count: 0
    }
  }
}
</script>

<style>
.app { font-family: system-ui, sans-serif; max-width: 480px; margin: 40px auto; }
h1 { color: #42b883; }
button { padding: 6px 12px; cursor: pointer; }
</style>
