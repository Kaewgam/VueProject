// src/main.js
import { createApp } from 'vue'
import App from './App.vue'
import LongdoMap from 'longdo-map-vue'

// ensure Firebase initializes & auth is available
import './firebase'

const app = createApp(App)

window.__LONGDO_KEY = '21165f932c687ee21197a8d82594e493';

app.use(LongdoMap, {
    load: {
        apiKey: window.__LONGDO_KEY, // ใช้ key เดียวกัน
        language: 'th',
        defer:  false,
        services: ['search'],
    },
})

app.mount('#app')