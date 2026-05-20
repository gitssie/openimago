import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from 'src/api/client'

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  createdAt: number
  error?: string
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<DisplayMessage[]>([])
  const streaming = ref(false)
  const sessionId = ref<string | null>(null)

  async function loadMessages(sid: string) {
    sessionId.value = sid
    try {
      const raw = await api.sessionMessages(sid)
      messages.value = raw.map((m) => ({
        id: typeof m.id === 'string' || typeof m.id === 'number' ? String(m.id) : '',
        role: (m.role as DisplayMessage['role']) ?? 'assistant',
        text: typeof m.content === 'string' ? m.content : typeof m.text === 'string' ? m.text : '',
        createdAt: Number(m.createdAt ?? m.time ?? Date.now()),
      }))
    } catch {
      messages.value = []
    }
  }

  function sendPrompt(text: string) {
    if (!sessionId.value) return
    const now = Date.now()
    messages.value.push({ id: now.toString(), role: 'user', text, createdAt: now })

    streaming.value = true
    api.sendPrompt(sessionId.value, text)
      .then((res) => {
        messages.value.push({
          id: (now + 1).toString(),
          role: 'assistant',
          text: res?.content || res?.message || '生成完成',
          createdAt: Date.now(),
        })
      })
      .catch((e: Error) => {
        messages.value.push({ id: (now + 1).toString(), role: 'system', text: e.message, createdAt: Date.now(), error: e.message })
      })
      .finally(() => { streaming.value = false })
  }

  async function abort() {
    if (!sessionId.value) return
    await api.abortSession(sessionId.value)
    streaming.value = false
  }

  function regenerate(lastUserMessage?: DisplayMessage) {
    if (lastUserMessage) sendPrompt(lastUserMessage.text)
  }

  return { messages, streaming, sessionId, loadMessages, sendPrompt, abort, regenerate }
})
