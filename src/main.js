// src/main.js
import { createApp } from 'vue'
import App from './App.vue'
import LongdoMap from 'longdo-map-vue'

// ensure Firebase initializes & auth is available
import './firebase'

const app = createApp(App)

app.use(LongdoMap, {
    load: {
        apiKey: '21165f932c687ee21197a8d82594e493',
        language: 'th',
        defer: true,
    },
})

app.mount('#app')