<template>
  <section class="home-skills">
    <h2 class="home-skills__title">{{ t('gallery.skillsTitle') }}</h2>
    <div class="home-skills__grid">
      <button
        v-for="skill in skills"
        :key="skill.id"
        type="button"
        class="home-skills__card"
        :style="{ '--skill-hue': skill.hue }"
        @click="emit('select', skill.id)"
      >
        <div class="home-skills__icon">
          <OiIcon :name="skill.icon" :size="22" />
        </div>
        <div class="home-skills__text">
          <div class="home-skills__name">{{ skill.name }}</div>
          <div class="home-skills__desc">{{ skill.desc }}</div>
        </div>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import OiIcon, { type OiIconName } from 'src/components/ui/OiIcon.vue'

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

interface Skill {
  id: string
  name: string
  desc: string
  icon: OiIconName
  hue: string
}

const skills: Skill[] = [
  { id: 'script',     name: '脚本生成', desc: '将想法转化为视频脚本', icon: 'star',         hue: '168 85 247' },
  { id: 'shot',       name: '镜头设计', desc: '生成专业镜头语言',     icon: 'image-placeholder', hue: '37 99 235'  },
  { id: 'storyboard', name: '分镜生成', desc: '生成分镜脚本与画面',   icon: 'template-grid', hue: '6 182 212'  },
  { id: 'video',      name: '视频生成', desc: '一键生成高质量视频',   icon: 'grid',          hue: '14 165 233' },
  { id: 'editing',    name: '智能剪辑', desc: 'AI 自动剪辑与配乐',     icon: 'template-grid', hue: '244 63 94'  },
]
</script>

<style lang="scss" scoped>
.home-skills {
  position: relative;
  z-index: 1;
  margin: 40px auto 0;
  max-width: 1200px;
  padding: 0 8px;
}

.home-skills__title {
  text-align: center;
  margin: 0 0 18px;
  font-size: 14px;
  font-weight: 500;
  color: var(--imago-text-muted);
  letter-spacing: 0.04em;
}

.home-skills__grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
}

.home-skills__card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--imago-border-light);
  border-radius: 14px;
  background: var(--imago-bg-glass);
  backdrop-filter: var(--imago-blur-light);
  -webkit-backdrop-filter: var(--imago-blur-light);
  color: var(--imago-text-primary);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--imago-ease-smooth),
    transform var(--imago-ease-smooth),
    box-shadow var(--imago-ease-smooth);
  font-family: inherit;
}

.home-skills__card:hover {
  border-color: rgb(var(--skill-hue) / 0.55);
  transform: translateY(-2px);
  box-shadow:
    0 0 24px rgb(var(--skill-hue) / 0.18),
    inset 0 0 16px rgb(var(--skill-hue) / 0.06);
}

.home-skills__icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: rgb(var(--skill-hue) / 0.32);
  color: rgb(var(--skill-hue) / 1);
  border: 1px solid rgb(var(--skill-hue) / 0.65);
  box-shadow: inset 0 0 18px rgb(var(--skill-hue) / 0.28);
  flex-shrink: 0;
}

.home-skills__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.home-skills__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--imago-text-primary);
}

.home-skills__desc {
  font-size: 11.5px;
  color: var(--imago-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1024px) {
  .home-skills__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 640px) {
  .home-skills__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
