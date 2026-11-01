import App from './App'
import { createPageNarratorMixin } from './services/appNarrator.js'

// #ifndef VUE3
import Vue from 'vue'
import './uni.promisify.adaptor'
Vue.config.productionTip = false
Vue.mixin(createPageNarratorMixin())
App.mpType = 'app'
const app = new Vue({
  ...App
})
app.$mount()
// #endif

// #ifdef VUE3
import { createSSRApp } from 'vue'
export function createApp() {
  const app = createSSRApp(App)
  app.mixin(createPageNarratorMixin())
  return {
    app
  }
}
// #endif
