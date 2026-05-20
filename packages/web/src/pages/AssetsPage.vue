<template>
  <q-page padding>
    <div class="row items-center q-mb-lg">
      <h4 class="neon-text-cyan q-my-none">资产库</h4>
      <q-space />
      <q-uploader url="/api/platform/assets/upload" label="上传文件" color="primary" style="max-width: 300px" @uploaded="store.fetchAll()" />
    </div>

    <div v-if="store.loading" class="flex flex-center q-pa-xl"><q-spinner color="primary" size="3em" /></div>

    <div v-else-if="store.assets.length === 0" class="flex flex-center q-pa-xl text-grey-5">
      <div class="text-center"><q-icon name="image" size="4em" /><p>还没有上传资产</p></div>
    </div>

    <div v-else class="row q-col-gutter-md">
      <div v-for="a in store.assets" :key="a.id" class="col-6 col-sm-4 col-md-3">
        <q-card class="neon-card">
          <q-img :src="a.url || a.thumbnailUrl" :ratio="1" class="media-glow">
            <div class="absolute-bottom-right q-pa-xs">
              <q-btn flat round dense size="sm" icon="delete" color="negative" @click="store.remove(a.id)" />
            </div>
          </q-img>
          <q-card-section class="q-pa-sm">
            <div class="text-caption ellipsis">{{ a.name || a.filename || a.id }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAssetsStore } from 'src/stores/assets'
const store = useAssetsStore()
onMounted(() => store.fetchAll())
</script>
