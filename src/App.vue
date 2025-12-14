<template>
  <div id="app" class="min-h-screen bg-gray-50">
    <nav class="bg-white shadow-lg">
      <div class="container mx-auto px-4">
        <div class="flex justify-between items-center h-16">
          <router-link
              to="/"
              class="text-2xl font-bold text-blue-600"
              @click="forceUpdate"
          >
            MiniShop
          </router-link>
          <div class="flex space-x-4">
            <router-link
                to="/"
                class="text-gray-700 hover:text-blue-600"
                :class="{ 'text-blue-600 font-bold': currentRoute === '/' }"
                @click="forceUpdate"
            >
              Home
            </router-link>
            <router-link
                to="/cart"
                class="text-gray-700 hover:text-blue-600"
                :class="{ 'text-blue-600 font-bold': currentRoute === '/cart' }"
                @click="forceUpdate"
            >
              Cart
            </router-link>
            <router-link
                to="/admin"
                class="text-gray-700 hover:text-blue-600"
                :class="{ 'text-blue-600 font-bold': currentRoute === '/admin' }"
                @click="forceUpdate"
            >
              Admin
            </router-link>
          </div>
        </div>
      </div>
    </nav>

    <!-- Force re-render with key -->
    <router-view
        :key="routeKey"
        class="container mx-auto px-4 py-8"
    />

    <!-- Debug info -->
    <div v-if="showDebug" class="fixed bottom-4 right-4 bg-black text-white p-4 rounded text-sm">
      <p>Route: {{ currentRoute }}</p>
      <p>Component Key: {{ routeKey }}</p>
      <button @click="toggleDebug" class="mt-2 text-xs">Hide Debug</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterView, RouterLink, useRoute } from 'vue-router'
import { ref, computed, watch } from 'vue'

const route = useRoute()
const showDebug = ref(false)
const forceUpdateCounter = ref(0)

const currentRoute = computed(() => route.path)
const routeKey = computed(() => `${route.path}-${forceUpdateCounter.value}`)

function forceUpdate() {
  console.log('🔄 Forcing route update')
  forceUpdateCounter.value++
}

function toggleDebug() {
  showDebug.value = !showDebug.value
}

// Watch for route changes
watch(
    () => route.path,
    (newPath, oldPath) => {
      console.log(`🔄 Route changed: ${oldPath} → ${newPath}`)
      console.log('Route object:', route)
    }
)

console.log('📱 App.vue loaded')
</script>