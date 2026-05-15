import Vue from 'vue'
import App from './App.vue'

console.log('[demo-vue] vue version =', Vue.version)

new Vue({
  render: h => h(App)
}).$mount('#app')
