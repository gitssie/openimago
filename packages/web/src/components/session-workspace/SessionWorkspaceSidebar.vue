<template>
  <div class="workspace-sidebar">
    <div class="session-list-panel">
      <div class="session-list-panel__header">
        <q-btn label="新建会话" icon="add" class="new-session-btn" unelevated no-caps @click="$emit('create')" />
      </div>

      <div class="session-group">
        <div class="session-group__title">
          <span>会话流</span>
          <div class="row items-center q-gutter-xs">
            <span class="session-group__count">{{ sessionCount }}</span>
            <q-icon name="expand_more" />
          </div>
        </div>

        <q-list v-if="sessions.length > 0" class="session-list">
          <q-item
            v-for="session in sessions"
            :key="session.id"
            clickable
            :active="session.active"
            active-class="session-item--active"
            class="session-item"
            @click="$emit('select', session.id)"
          >
            <q-item-section class="session-item__section">
              <div class="session-item__row">
                <q-item-label class="session-title">{{ session.title }}</q-item-label>
                <div class="session-item__status">
                  <span class="session-item__status-dot" />
                  <span>{{ session.clockLabel }}</span>
                </div>
              </div>
              <q-item-label caption class="session-preview">{{ session.preview }}</q-item-label>
              <div class="session-item__meta">
                <span>{{ session.timeLabel }}</span>
                <span>{{ session.meta }}</span>
              </div>
            </q-item-section>
            <q-item-section side class="session-delete">
              <q-btn flat round dense icon="close" size="xs" color="grey-5" @click.stop="$emit('delete', session.id)" />
            </q-item-section>
          </q-item>
        </q-list>

        <div v-else class="session-list-empty">暂无会话，点击上方按钮创建。</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  sessions: Array<{
    id: string
    title: string
    preview: string
    timeLabel: string
    clockLabel: string
    meta: string
    active: boolean
  }>
  sessionCount: number
  collapsed: boolean
  projectId?: string
}>()

defineEmits<{
  (e: 'create'): void
  (e: 'select', id: string): void
  (e: 'delete', id: string): void
  (e: 'toggleCollapse'): void
}>()
</script>

<style scoped>
.workspace-sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--imago-bg-void);
  overflow: hidden;
}

.session-list-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 12px 14px 16px;
}

.session-list-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}

.new-session-btn {
  flex: 1;
  height: 40px;
  color: #edfeff;
  background: linear-gradient(135deg, rgba(10, 18, 34, 0.96), rgba(18, 12, 32, 0.92));
  border: 1px solid rgba(0, 240, 255, 0.18);
  border-radius: 14px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03), 0 0 28px rgba(0, 240, 255, 0.08);
}

.new-session-btn:hover {
  background: linear-gradient(135deg, rgba(14, 28, 44, 0.96), rgba(23, 16, 42, 0.94));
}

.session-panel-action {
  width: 36px;
  height: 36px;
  color: var(--imago-text-muted);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.session-group__title {
  display: flex;
  justify-content: space-between;
  color: var(--imago-text-dim);
  font-size: 12px;
  font-weight: 500;
  margin: 0 8px 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.session-group__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(0, 240, 255, 0.08);
  color: rgba(0, 240, 255, 0.82);
  font-size: 11px;
}

.session-list {
  display: grid;
  gap: 10px;
}

.session-list-empty {
  margin-top: 12px;
  color: var(--imago-text-faint);
  font-size: 13px;
  text-align: center;
}

.session-item {
  min-height: 92px;
  padding: 12px;
  color: var(--imago-text-muted);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(11, 14, 25, 0.88), rgba(9, 10, 18, 0.72));
  transition: border-color var(--imago-ease-default), background var(--imago-ease-default), box-shadow var(--imago-ease-default), transform var(--imago-ease-default);
}

.session-item:hover {
  background: linear-gradient(180deg, rgba(14, 20, 34, 0.92), rgba(11, 13, 24, 0.86));
  border-color: rgba(0, 240, 255, 0.12);
  box-shadow: 0 0 26px rgba(0, 240, 255, 0.06);
  transform: translateY(-1px);
}

.session-item--active {
  background: linear-gradient(180deg, rgba(10, 28, 40, 0.94), rgba(14, 14, 32, 0.9));
  border-color: rgba(0, 240, 255, 0.28);
  box-shadow: inset 0 0 0 1px rgba(0, 240, 255, 0.12), 0 0 34px rgba(0, 240, 255, 0.1);
}

.session-item__section {
  gap: 8px;
}

.session-item__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.session-item__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.44);
  font-size: 11px;
  white-space: nowrap;
}

.session-item__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(0, 240, 255, 0.8);
  box-shadow: 0 0 10px rgba(0, 240, 255, 0.45);
}

.session-title {
  color: var(--imago-text-secondary);
  font-size: 13px;
  line-height: 1.3;
  white-space: normal;
}

.session-preview {
  margin-top: 0;
  color: rgba(255, 255, 255, 0.52) !important;
  font-size: 12px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.session-item__meta {
  display: flex;
  gap: 10px;
  color: rgba(255, 255, 255, 0.34);
  font-size: 11px;
}

.session-delete {
  opacity: 0;
  transition: opacity 120ms ease;
}

.session-item:hover .session-delete {
  opacity: 1;
}

/* Footer */
.sidebar-footer {
  flex-shrink: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 10px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.credits-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.credits-label {
  flex: 1;
}

.credits-value {
  font-weight: 600;
  color: rgba(0, 240, 255, 0.82);
}

.load-more-btn {
  color: rgba(255, 255, 255, 0.35);
  font-size: 12px;
  align-self: center;
}
</style>
