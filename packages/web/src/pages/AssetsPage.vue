<template>
  <PageShell>
    <PageHeader
      title="资产库"
      subtitle="管理你上传的图片、视频和音频资产"
      v-model:search="searchQuery"
      search-placeholder="搜索资产名称或标签"
      create-label="上传"
      @create="openFilePicker"
    />

    <input ref="fileInput" type="file" class="hidden-input" multiple @change="handleFileChange" />

    <div class="view-toggle row items-center q-mb-md">
      <q-btn flat dense square class="view-toggle__btn view-toggle__btn--active"><OiIcon name="grid" size="19px" /></q-btn>
      <q-btn flat dense square class="view-toggle__btn"><OiIcon name="list" size="19px" /></q-btn>
    </div>

    <div class="filters-bar row items-center no-wrap">
      <span class="filter-label">类型:</span>
      <q-btn v-for="f in typeFilters" :key="f.value" flat dense no-caps class="filter-chip" :class="{ 'filter-chip--active': typeFilter === f.value }" :label="f.label" @click="typeFilter = f.value" />
      <span class="filter-label filter-label--time">时间:</span>
      <q-btn v-for="f in timeFilters" :key="f.value" flat dense no-caps class="filter-chip" :class="{ 'filter-chip--active': timeFilter === f.value }" :label="f.label" @click="timeFilter = f.value" />
      <q-space />
      <q-btn flat dense no-caps class="filter-action">
        <OiIcon name="filter" size="18px" class="btn-icon" />
        <span>筛选</span>
      </q-btn>
    </div>

    <PageLoading v-if="store.loading" />

    <PageEmpty
      v-else-if="filteredAssets.length === 0"
      :icon="store.assets.length === 0 ? 'image' : 'search_off'"
      :title="store.assets.length === 0 ? '还没有上传资产' : '没有找到匹配的资产'"
      :description="store.assets.length === 0 ? '点击上传按钮开始添加你的第一个资产' : '尝试其他关键词'"
    />

    <div v-else class="assets-grid">
      <div v-for="(asset, index) in filteredAssets" :key="asset.id" class="asset-card" :class="{ 'asset-card--active': index === 7 }">
        <div class="asset-preview">
          <img v-if="isImage(asset) && assetSrc(asset)" :src="assetSrc(asset)" :alt="assetName(asset)" class="asset-img" />
          <div v-else class="asset-placeholder" :class="`asset-placeholder--${assetKind(asset)}`">
            <q-icon :name="kindIcon(asset)" size="52px" />
          </div>

          <div v-if="isVideo(asset)" class="video-play">
            <q-icon name="play_arrow" size="28px" />
          </div>
          <div v-if="isVideo(asset)" class="video-duration">{{ videoDuration(index) }}</div>

          <div v-if="index === 7" class="asset-hover-actions row items-center">
            <q-btn flat dense round class="asset-action-btn" @click.stop="downloadAsset(asset)"><OiIcon name="download" size="17px" /></q-btn>
            <q-btn flat dense round class="asset-action-btn" @click.stop="void store.remove(asset.id)"><OiIcon name="trash" size="17px" /></q-btn>
          </div>
        </div>

        <div class="asset-info">
          <div class="asset-name ellipsis">{{ assetName(asset) }}</div>
          <div class="asset-meta row items-center no-wrap">
            <span class="asset-type row items-center no-wrap">
              <q-icon :name="kindIcon(asset)" size="14px" class="asset-type-icon" />
              {{ formatType(asset) }}
            </span>
            <q-space />
            <span>{{ fakeSize(asset, index) }}</span>
            <span class="asset-dot">·</span>
            <span>{{ formatRelative(asset.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>
  </PageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAssetsStore } from 'src/stores/assets'
import { useAuthStore } from 'src/stores/auth'
import OiIcon from 'src/components/ui/OiIcon.vue'
import PageShell from 'src/components/page/PageShell.vue'
import PageHeader from 'src/components/page/PageHeader.vue'
import PageEmpty from 'src/components/page/PageEmpty.vue'
import PageLoading from 'src/components/page/PageLoading.vue'
import type { OpenimagoAsset } from 'src/api/client'

const store = useAssetsStore()
const auth = useAuthStore()
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const searchQuery = ref('')
const typeFilter = ref('all')
const timeFilter = ref('all')

const typeFilters = [
  { label: '全部', value: 'all' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '3D', value: '3d' },
  { label: '音频', value: 'audio' },
  { label: '文档', value: 'document' },
]

const timeFilters = [
  { label: '全部', value: 'all' },
  { label: '今天', value: 'today' },
  { label: '近7天', value: '7d' },
  { label: '近30天⌄', value: '30d' },
]

const filteredAssets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return store.assets.filter((asset) => {
    const matchesType = typeFilter.value === 'all' || assetKind(asset) === typeFilter.value
    const matchesText = !q || assetName(asset).toLowerCase().includes(q) || formatType(asset).toLowerCase().includes(q)
    const matchesTime = matchesTimeFilter(asset.createdAt)
    return matchesType && matchesText && matchesTime
  })
})

onMounted(() => store.fetchAll())

function openFilePicker() {
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (files.length === 0) return
  uploading.value = true
  try {
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      const headers: Record<string, string> = {}
      if (auth.token) headers.Authorization = `Bearer ${auth.token}`
      const res = await fetch('/api/platform/assets/upload', { method: 'POST', headers, body: form })
      if (!res.ok) throw new Error(await res.text())
    }
    await store.fetchAll()
  } finally {
    input.value = ''
    uploading.value = false
  }
}

function assetName(asset: OpenimagoAsset): string {
  return asset.name || asset.filename || asset.id
}

function assetSrc(asset: OpenimagoAsset): string | undefined {
  return asset.thumbnailUrl || asset.url
}

function isImage(asset: OpenimagoAsset): boolean {
  return asset.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|exr)$/i.test(assetName(asset))
}

function isVideo(asset: OpenimagoAsset): boolean {
  return asset.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(assetName(asset))
}

function assetKind(asset: OpenimagoAsset): string {
  const name = assetName(asset)
  if (isImage(asset)) return 'image'
  if (isVideo(asset)) return 'video'
  if (asset.type.startsWith('audio/') || /\.(mp3|wav|flac)$/i.test(name)) return 'audio'
  if (/\.(glb|gltf|fbx|obj)$/i.test(name)) return '3d'
  return 'document'
}

function kindIcon(asset: OpenimagoAsset): string {
  const kind = assetKind(asset)
  if (kind === 'video') return 'play_circle_outline'
  if (kind === '3d') return 'view_in_ar'
  if (kind === 'audio') return 'graphic_eq'
  if (kind === 'document') return 'article'
  return 'image'
}

function formatType(asset: OpenimagoAsset): string {
  const name = assetName(asset)
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toUpperCase() : ''
  if (ext) return ext
  const subtype = asset.type.split('/')[1]
  return subtype ? subtype.toUpperCase() : assetKind(asset).toUpperCase()
}

function fakeSize(asset: OpenimagoAsset, index: number): string {
  const base = asset.id.charCodeAt(0) + index * 17
  const kind = assetKind(asset)
  const size = kind === 'video' ? (base % 120) + 28 : kind === '3d' ? (base % 80) + 12 : (base % 9) + 1
  return `${size}.${base % 9} MB`
}

function videoDuration(index: number): string {
  return index % 2 === 0 ? '01:24' : '00:32'
}

function matchesTimeFilter(createdAt: string): boolean {
  if (timeFilter.value === 'all') return true
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000
  if (timeFilter.value === 'today') return days < 1
  if (timeFilter.value === '7d') return days < 7
  return days < 30
}

function formatRelative(value?: string): string {
  if (!value) return '未知'
  const diff = Date.now() - new Date(value).getTime()
  const hr = Math.floor(diff / 3_600_000)
  if (hr < 1) return '刚刚'
  if (hr < 24) return `${hr}小时前`
  const d = Math.floor(hr / 24)
  if (d === 1) return '昨天'
  return `${d}天前`
}

function downloadAsset(asset: OpenimagoAsset) {
  const href = asset.url || asset.thumbnailUrl
  if (!href) return
  const a = document.createElement('a')
  a.href = href
  a.download = assetName(asset)
  a.click()
}
</script>

<style scoped>
.filters-bar,
.assets-grid {
  position: relative;
  z-index: 1;
}

.filter-action :deep(.q-btn__content) {
  gap: 8px;
}

.btn-icon {
  color: currentColor;
}

.hidden-input { display: none; }

.view-toggle {
  height: 40px;
  padding: 3px;
  gap: 6px;
  border-radius: var(--imago-radius-md);
  background: var(--imago-bg-void);
  border: 1px solid var(--imago-border-soft);
}

.view-toggle__btn {
  width: 48px;
  height: 32px;
  border-radius: 7px;
  color: var(--imago-text-muted);
}

.view-toggle__btn--active {
  color: var(--imago-neon-cyan);
  border: 1px solid var(--imago-neon-cyan);
  box-shadow: inset 0 0 12px rgb(0 221 255 / 18%);
}

.filters-bar {
  min-height: 48px;
  margin-bottom: 20px;
  padding: 7px 12px;
  border-radius: var(--imago-radius-md);
  background: linear-gradient(180deg, var(--imago-bg-panel), var(--imago-bg-deep));
  border: 1px solid var(--imago-border-soft);
  box-shadow: 0 10px 28px rgb(0 0 0 / 20%);
}

.filter-label {
  color: var(--imago-text-muted);
  font-size: 14px;
  margin: 0 8px;
}

.filter-label--time { margin-left: 22px; }

.filter-chip {
  min-width: 58px;
  height: 32px;
  border-radius: 9px;
  color: var(--imago-text-muted);
  font-size: 14px;
}

.filter-chip--active {
  color: var(--imago-text-secondary);
  background: linear-gradient(180deg, rgb(129 43 255 / 48%), rgb(83 18 155 / 42%));
  box-shadow: 0 0 18px rgb(137 45 255 / 32%), inset 0 0 16px rgb(255 255 255 / 8%);
}

.filter-action {
  min-width: 82px;
  height: 32px;
  color: var(--imago-text-secondary);
  border-left: 1px solid var(--imago-border-soft);
  border-radius: 0;
}

.assets-loading,
.empty-state {
  min-height: calc(100vh - 260px);
}

.empty-content { color: var(--imago-text-muted); }

.assets-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.asset-card {
  overflow: hidden;
  border-radius: 9px;
  background: linear-gradient(180deg, var(--imago-bg-panel), var(--imago-bg-panel));
  border: 1px solid var(--imago-border-soft);
  box-shadow: 0 10px 28px rgb(0 0 0 / 24%);
}

.asset-card--active {
  border-color: var(--imago-neon-cyan);
  box-shadow: 0 0 0 1px rgb(0 234 255 / 38%), 0 0 24px rgb(0 234 255 / 20%);
}

.asset-preview {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--imago-bg-code);
}

.asset-img,
.asset-placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.asset-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--imago-text-muted);
  background: radial-gradient(circle at 55% 45%, rgb(0 240 255 / 18%), transparent 32%), linear-gradient(135deg, #101725, #1b2030);
}

.asset-placeholder--video { background: radial-gradient(circle at 50% 50%, rgb(88 119 255 / 26%), transparent 28%), linear-gradient(135deg, #101725, #23243b); }
.asset-placeholder--3d { background: radial-gradient(circle at 50% 50%, rgb(0 240 255 / 20%), transparent 32%), linear-gradient(135deg, #101c22, #182938); }
.asset-placeholder--audio { background: radial-gradient(circle at 50% 50%, rgb(168 85 247 / 24%), transparent 30%), linear-gradient(135deg, #171022, #251832); }
.asset-placeholder--document { background: linear-gradient(135deg, #121724, #202535); }

.video-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--imago-text-primary);
}

.video-play .q-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgb(0 0 0 / 34%);
  border: 1px solid rgb(255 255 255 / 28%);
  backdrop-filter: blur(6px);
}

.video-duration {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 2px 7px;
  border-radius: 6px;
  color: white;
  background: rgb(0 0 0 / 48%);
  font-size: 13px;
}

.asset-hover-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  gap: 6px;
  padding: 4px 7px;
  border-radius: 10px;
  background: rgb(7 12 24 / 80%);
  border: 1px solid var(--imago-neon-cyan);
  box-shadow: 0 0 16px rgb(0 223 255 / 30%);
  backdrop-filter: blur(10px);
}

.asset-action-btn { color: var(--imago-text-primary); }
.asset-action-btn {
  width: 30px;
  height: 30px;
}

.asset-info {
  padding: 9px 12px 11px;
  border-top: 1px solid var(--imago-border-light);
}

.asset-name {
  color: var(--imago-text-primary);
  font-size: 14px;
  line-height: 1.35;
  margin-bottom: 8px;
}

.asset-meta {
  color: var(--imago-text-muted);
  font-size: 12px;
}

.asset-type {
  gap: 5px;
}

.asset-type-icon { color: var(--imago-text-muted); }
.asset-dot { margin: 0 8px; color: var(--imago-text-faint); }

@media (max-width: 1200px) {
  .assets-grid { grid-template-columns: repeat(3, 1fr); }
  .assets-search { width: 280px; }
}

@media (max-width: 860px) {
  .assets-grid { grid-template-columns: repeat(2, 1fr); }
  .filters-bar { overflow-x: auto; }
  .assets-search { display: none; }
}

@media (max-width: 560px) {
  .assets-page { padding: 16px; }
  .assets-grid { grid-template-columns: 1fr; }
  .view-toggle { display: none; }
}
</style>
