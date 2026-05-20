import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from 'src/api/client'
import type { OpenimagoAsset } from 'src/api/client'

export const useAssetsStore = defineStore('assets', () => {
  const assets = ref<OpenimagoAsset[]>([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try { assets.value = await api.listAssets() } finally { loading.value = false }
  }
  async function remove(id: string) {
    await api.deleteAsset(id)
    assets.value = assets.value.filter((a) => a.id !== id)
  }
  return { assets, loading, fetchAll, remove }
})
