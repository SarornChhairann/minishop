<template>
  <div class="max-w-6xl mx-auto">
    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
    </div>

    <div v-else-if="product" class="bg-white rounded-lg shadow-lg overflow-hidden">
      <div class="md:flex">
        <!-- Product Image -->
        <div class="md:w-1/2 p-8">
          <img
              :src="product.image_url || 'https://via.placeholder.com/600x500'"
              :alt="product.name"
              class="w-full h-auto rounded-lg object-cover"
          >
        </div>

        <!-- Product Info -->
        <div class="md:w-1/2 p-8">
          <div class="mb-6">
            <span v-if="product.status === 'ACTIVE'" class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
              In Stock
            </span>
            <span v-else class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">
              Out of Stock
            </span>
          </div>

          <h1 class="text-3xl font-bold text-gray-900 mb-4">{{ product.name }}</h1>
          <p class="text-gray-600 mb-6">{{ product.description }}</p>

          <div class="mb-6">
            <span class="text-4xl font-bold text-blue-600">${{ product.price }}</span>
            <span class="text-gray-500 ml-2">per item</span>
          </div>

          <div class="mb-8">
            <p class="text-gray-700 mb-2">
              Available Stock: <span :class="product.stock < 10 ? 'text-red-600 font-bold' : 'text-green-600'">
                {{ product.stock }} units
              </span>
            </p>
          </div>

          <!-- Add to Cart Form -->
          <div class="mb-8">
            <div class="flex items-center mb-4">
              <label for="quantity" class="mr-4 font-medium text-gray-700">Quantity:</label>
              <div class="flex items-center border rounded-lg">
                <button
                    @click="decrementQuantity"
                    :disabled="quantity <= 1"
                    class="px-4 py-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  -
                </button>
                <input
                    v-model.number="quantity"
                    type="number"
                    min="1"
                    :max="product.stock"
                    class="w-16 text-center py-2 border-x"
                >
                <button
                    @click="incrementQuantity"
                    :disabled="quantity >= product.stock"
                    class="px-4 py-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>
            </div>

            <button
                @click="addToCart"
                :disabled="product.stock === 0 || product.status !== 'ACTIVE'"
                class="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition duration-200"
            >
              {{ product.stock === 0 ? 'Out of Stock' : 'Add to Cart' }}
            </button>
          </div>

          <!-- Product Details -->
          <div class="border-t pt-6">
            <h3 class="font-bold text-lg mb-3">Product Details</h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div class="text-gray-600">Product ID</div>
              <div class="font-medium">{{ product.product_id }}</div>

              <div class="text-gray-600">Status</div>
              <div :class="product.status === 'ACTIVE' ? 'text-green-600 font-medium' : 'text-red-600'">
                {{ product.status }}
              </div>

              <div class="text-gray-600">Added On</div>
              <div class="font-medium">{{ formatDate(product.created_at,{preset: 'datetime'}) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-12">
      <h2 class="text-2xl font-bold text-gray-600 mb-4">Product not found</h2>
      <router-link to="/" class="text-blue-600 hover:text-blue-800 underline">
        Return to home page
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { productService } from '../services/api';
import { useCartStore } from '../stores/cart';
import {formatDate} from "@/composables/useDateFormatter.ts";
import {useToast} from "@/composables/useToast.ts";


const route = useRoute();
const cartStore = useCartStore();

const product = ref<any>(null);
const loading = ref(true);
const quantity = ref(1);
const {toast} = useToast()

onMounted(async () => {
  await fetchProduct();
});

async function fetchProduct() {
  try {
    loading.value = true;
    const productId = parseInt(route.params.id as string);
    product.value = await productService.getProduct(productId);
    quantity.value = 1;
  } catch (error) {
    console.error('Error fetching product:', error);
  } finally {
    loading.value = false;
  }
}

function incrementQuantity() {
  if(product.value && quantity.value >= product.value.stock){
    toast.error(`Influenced stock: ${product.value.stock}`);
  }else {
    quantity.value++;
  }
}

function decrementQuantity() {
  if (quantity.value > 1) {
    quantity.value--;
  }
}

function addToCart() {
  if(product.value && cartStore.items.length > 0){
    const item = cartStore.items.find((e)=> e.product_id == product.value.product_id);
    if(item && (item?.quantity >= product.value.stock || (quantity.value + item.quantity) >= product.value.stock)){
      toast.error(`Influenced stock: ${product.value.stock}`)
    } else {
      cartStore.addToCart({
        product_id: product.value.product_id,
        name: product.value.name,
        price: product.value.price,
        quantity: quantity.value,
        image_url: product.value.image_url,
        availableStock: product.value.stock,
      });

      toast.success(`${quantity.value} ${product.value.name} added to cart!`)
    }
  }
}

// Watch for route changes
watch(() => route.params.id, fetchProduct);
</script>