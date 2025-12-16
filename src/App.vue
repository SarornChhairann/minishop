<template>
  <div id="app" class="min-h-screen bg-gray-50">
    <nav class="bg-white shadow-lg">
      <div class="container mx-auto px-4">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center space-x-2">
            <router-link
                to="/"
                class="text-2xl font-bold text-blue-600 flex items-center"
                @click="forceUpdate"
            >
              <img src="./assets/mini-shop.png" alt="MiniShop" class="w-8 h-8 mr-2 rounded-md"> MiniShop
            </router-link>
          </div>
          <div class="flex space-x-4">
            <router-link
                to="/cart"
                class="text-gray-700 hover:text-blue-600"
                :class="{ 'text-blue-600 font-bold': currentRoute === '/cart' }"
                @click="forceUpdate"
            >
              <div class="relative inline-block">
                Cart
                <span v-if="cartStore.items.length > 0" class="absolute -top-2 -right-2 inline-flex items-center justify-center h-5 w-5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                  {{ cartStore.items.length }}
                </span>
              </div>
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
  <Toast />
</template>

<script setup lang="ts">
import { RouterView, RouterLink, useRoute } from 'vue-router'
import { ref, computed, watch } from 'vue'
import { useCartStore } from './stores/cart';
import Toast from "@/components/ui/Toast.vue";

const route = useRoute();
const currentRoute = computed(() => route.path);
const routeKey = ref(0);
const cartStore = useCartStore();
const showDebug = ref(false)
const forceUpdateCounter = ref(0)

const forceUpdate = () => {
  console.log('🔄 Forcing route update')
  forceUpdateCounter.value++
  routeKey.value++
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