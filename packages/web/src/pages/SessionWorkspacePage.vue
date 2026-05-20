<template>
  <q-page class="session-workspace">
    <div class="workspace-layout row">
      <!-- Session Sidebar -->
      <div class="session-sidebar col-auto">
        <div class="q-pa-sm">
          <q-btn label="+ 新建会话" color="primary" flat dense class="full-width" @click="handleNewSession" />
        </div>
        <q-separator />
        <q-list dense>
          <q-item v-for="s in sessionsStore.sessions" :key="s.id" clickable :active="s.id === $route.params.id" active-class="bg-primary-opacity" @click="$router.push(`/sessions/${s.id}`)">
            <q-item-section avatar>
              <q-icon name="chat" size="xs" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-caption">{{ s.title || s.id.slice(0, 8) }}</q-item-label>
              <q-item-label caption class="text-grey-5">{{ formatTime(s.time?.created) }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </div>

      <!-- Chat Area -->
      <div class="chat-area col">
        <div class="messages-container" ref="messagesRef">
          <div v-if="chat.messages.length === 0 && !chat.streaming" class="flex flex-center full-height text-grey-5">
            <div class="text-center">
              <q-icon name="auto_awesome" size="4em" class="neon-text-purple q-mb-md" />
              <p class="text-h6">输入 prompt 开始创作</p>
            </div>
          </div>

          <div v-for="msg in chat.messages" :key="msg.id" class="message-row q-pa-xs">
            <!-- User -->
            <div v-if="msg.role === 'user'" class="row justify-end">
              <div class="chat-bubble-user" style="max-width: 70%">{{ msg.text }}</div>
            </div>
            <!-- AI -->
            <div v-else-if="msg.role === 'assistant'" class="row justify-start">
              <div class="chat-bubble-ai" style="max-width: 85%">
                <div class="text-body1" style="white-space: pre-wrap">{{ msg.text }}</div>
                <div class="q-mt-sm">
                  <q-btn flat dense size="sm" icon="refresh" color="grey-5" label="重新生成" @click="chat.regenerate(getLastUserMsg(msg))" />
                </div>
              </div>
            </div>
            <!-- Error -->
            <div v-else class="row justify-center">
              <q-banner dense rounded class="bg-negative text-white" style="max-width: 400px">{{ msg.text }}</q-banner>
            </div>
          </div>

          <!-- Streaming indicator -->
          <div v-if="chat.streaming" class="row justify-start q-pa-sm">
            <div class="chat-bubble-ai">
              <q-spinner-dots color="cyan-4" size="2em" />
              <span class="q-ml-sm text-grey-5">AI 正在创作...</span>
            </div>
          </div>
        </div>

        <!-- Spotlight Input -->
        <div class="input-area q-pa-md">
          <div class="spotlight-input-container">
            <q-input
              v-model="promptText"
              outlined dark dense
              placeholder="描述你想创作的图片或视频..."
              class="spotlight-input"
              :disable="chat.streaming"
              @keydown.enter.prevent="handleSend"
            >
              <template #append>
                <q-btn v-if="chat.streaming" flat round icon="stop" color="negative" @click="chat.abort()" />
                <q-btn v-else flat round icon="send" color="primary" @click="handleSend" :disable="!promptText.trim()" />
              </template>
            </q-input>
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useChatStore } from 'src/stores/chat'
import { useSessionsStore } from 'src/stores/sessions'

const route = useRoute()
const chat = useChatStore()
const sessionsStore = useSessionsStore()

const promptText = ref('')
const messagesRef = ref<HTMLElement>()

onMounted(async () => {
  await sessionsStore.fetchAll()
  if (route.params.id) {
    await chat.loadMessages(route.params.id as string)
  }
  scrollToBottom()
})

watch(() => route.params.id, (id) => {
  if (id) void chat.loadMessages(id as string)
})

watch(() => chat.messages.length, () => {
  void nextTick(scrollToBottom)
})

function scrollToBottom() {
  void nextTick(() => {
    const el = messagesRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function handleSend() {
  const text = promptText.value.trim()
  if (!text || chat.streaming) return
  promptText.value = ''
  chat.sendPrompt(text)
}

async function handleNewSession() {
  const s = await sessionsStore.create()
  if (s) window.location.href = `/sessions/${String(s.id)}`
}

function getLastUserMsg(current: { role: string }) {
  if (current.role === 'assistant') {
    const idx = chat.messages.indexOf(current as never)
    for (let i = idx - 1; i >= 0; i--) {
      const msg = chat.messages[i]
      if (msg && msg.role === 'user') return msg
    }
  }
  return undefined
}

function formatTime(t?: number): string {
  if (!t) return ''
  try { return new Date(t).toLocaleDateString('zh-CN') } catch { return String(t) }
}
</script>

<style scoped>
.workspace-layout { height: calc(100vh - 50px); }
.session-sidebar {
  width: 220px; overflow-y: auto; flex-shrink: 0;
}
.chat-area { display: flex; flex-direction: column; height: 100%; }
.messages-container { flex: 1; overflow-y: auto; padding: 16px; }
.spotlight-input-container { max-width: 720px; margin: 0 auto; }
</style>
