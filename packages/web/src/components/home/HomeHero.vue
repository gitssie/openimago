<template>
  <section class="home-hero">
    <h1 class="home-hero__title">
      <span class="home-hero__title-prefix">{{ t('gallery.heroTitlePrefix') }}</span>
      <span class="home-hero__title-accent">{{ t('gallery.heroTitleAccent') }}</span>
    </h1>
    <p class="home-hero__subtitle">{{ t('gallery.heroSubtitle') }}</p>
    <p class="home-hero__tagline">{{ t('gallery.heroTagline') }}</p>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<style lang="scss" scoped>
.home-hero {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 32px 16px 24px;
}

.home-hero__title {
  margin: 0;
  font-size: clamp(40px, 5.4vw, 56px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.025em;
  font-family: 'SF Pro Display', -apple-system, 'Segoe UI', system-ui, sans-serif;
}

.home-hero__title-prefix {
  background: linear-gradient(90deg, #a855f7 0%, #c084fc 35%, #00f0ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 0 60px rgba(168, 85, 247, 0.30);
}

.home-hero__title-accent {
  // Explicit margin instead of flex/gap — the gradient text-clip + letter-spacing
  // combination collapses whitespace nodes unpredictably, so the space between
  // "OpenImago" and "1.0" needs to be a real, declared value.
  margin-left: 0.45em;
  background: linear-gradient(90deg, #00f0ff 0%, #5cc6ff 60%, #ffffff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 0 60px rgba(0, 240, 255, 0.30);
}

.home-hero__subtitle {
  margin: 14px 0 0;
  font-size: clamp(20px, 2.4vw, 28px);
  font-weight: 500;
  color: var(--imago-text-primary);
  letter-spacing: 0.005em;
}

.home-hero__tagline {
  margin: 10px 0 0;
  font-size: 14px;
  color: var(--imago-text-muted);
  letter-spacing: 0.01em;
}
</style>
