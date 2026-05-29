<template>
  <header class="project-header">
    <div class="project-header__left">
      <q-btn
        flat
        round
        dense
        icon="arrow_back"
        class="project-header__back"
        @click="$router.push('/projects')"
      />
      <div class="project-header__info">
        <h1 class="project-header__name">{{ projectName }}</h1>
        <span class="project-header__status" :class="{ 'project-header__status--archived': projectStatus === 'archived' }">
          {{ projectStatus === 'archived' ? '已归档' : '进行中' }}
        </span>
      </div>
    </div>
    <div class="project-header__actions">
      <q-btn
        flat
        dense
        no-caps
        icon="edit"
        class="project-header__action-btn"
        @click="$emit('edit')"
      >
        <q-tooltip>编辑项目</q-tooltip>
      </q-btn>
      <q-btn
        flat
        dense
        no-caps
        :icon="projectStatus === 'archived' ? 'unarchive' : 'archive'"
        class="project-header__action-btn"
        @click="$emit('toggle-archive')"
      >
        <q-tooltip>{{ projectStatus === 'archived' ? '取消归档' : '归档项目' }}</q-tooltip>
      </q-btn>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  projectName: string
  projectStatus: 'active' | 'archived'
}>()

defineEmits<{
  (e: 'edit'): void
  (e: 'toggle-archive'): void
}>()
</script>

<style scoped>
.project-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--imago-border-light);
  background: var(--imago-bg-void);
  flex-shrink: 0;
}

.project-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-header__back {
  color: var(--imago-text-muted);
}

.project-header__back:hover {
  color: var(--imago-text-primary);
}

.project-header__info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-header__name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--imago-text-primary);
}

.project-header__status {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(0, 240, 255, 0.08);
  color: rgba(0, 240, 255, 0.82);
  border: 1px solid rgba(0, 240, 255, 0.14);
}

.project-header__status--archived {
  background: rgba(255, 255, 255, 0.04);
  color: var(--imago-text-dim);
  border-color: var(--imago-border-light);
}

.project-header__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.project-header__action-btn {
  color: var(--imago-text-muted);
  border: 1px solid var(--imago-border-light);
  border-radius: var(--imago-radius-md);
  padding: 4px 12px;
}

.project-header__action-btn:hover {
  color: var(--imago-text-primary);
  background: rgba(255, 255, 255, 0.05);
}
</style>
