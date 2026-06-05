<template>
  <q-dialog
    :model-value="modelValue"
    :persistent="!dismissible"
    transition-show="jump-up"
    transition-hide="jump-down"
    class="auth-dialog-host"
    @update:model-value="onDialogModelUpdate"
  >
    <AuthPanel
      :variant="'dialog'"
      :initial-mode="initialMode"
      :dismissible="dismissible"
      :loading="loading"
      :error="error"
      @login="(payload) => emit('login', payload)"
      @register="(payload) => emit('register', payload)"
      @dismiss="onDismiss"
      @forgot-password="() => emit('forgot-password')"
      @oauth="(provider) => emit('oauth', provider)"
    />
  </q-dialog>
</template>

<script setup lang="ts">
import AuthPanel, { type LoginPayload, type OAuthProvider, type RegisterPayload, type AuthMode } from './AuthPanel.vue'

interface Props {
  /** v-model:open — whether the dialog is visible. */
  modelValue: boolean
  /** Initial tab to show when the dialog opens. */
  initialMode?: AuthMode
  /** Whether the dialog can be dismissed (close button + outside click + escape). */
  dismissible?: boolean
  /** External loading state — forwarded to the panel. */
  loading?: boolean
  /** External error message — forwarded to the panel. */
  error?: string
}

interface Emits {
  (e: 'update:modelValue', open: boolean): void
  /** Fired when login form passes validation. */
  (e: 'login', payload: LoginPayload): void
  /** Fired when register form passes validation. */
  (e: 'register', payload: RegisterPayload): void
  /** Fired when the "忘记密码？" link is clicked. */
  (e: 'forgot-password'): void
  /** Fired when an OAuth provider button is clicked. */
  (e: 'oauth', provider: OAuthProvider): void
}

const props = withDefaults(defineProps<Props>(), {
  initialMode: 'login',
  dismissible: true,
  loading: false,
  error: '',
})

const emit = defineEmits<Emits>()

function onDialogModelUpdate(open: boolean) {
  emit('update:modelValue', open)
}

function onDismiss() {
  // Only honor dismiss when the dialog is configured as dismissible
  if (props.dismissible) {
    emit('update:modelValue', false)
  }
}
</script>

<style scoped>
/* ── Dialog backdrop: dark blur to match the auth aesthetic ───────── */
:deep(.q-dialog__backdrop) {
  background: rgb(2 6 15 / 78%);
  backdrop-filter: blur(8px) saturate(120%);
  -webkit-backdrop-filter: blur(8px) saturate(120%);
}

/* ── Dialog content container — center and let panel size itself ───── */
:deep(.q-dialog__inner) > .q-dialog__inner--minimized > div,
:deep(.q-dialog__inner) > div {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
