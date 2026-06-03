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
  padding: 56px 16px 32px;
}

.home-hero__title {
  margin: 0;
  font-size: clamp(44px, 6vw, 64px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-family: 'SF Pro Display', -apple-system, 'Segoe UI', system-ui, sans-serif;
}

.home-hero__title-prefix {
  background: linear-gradient(90deg, #d946ef 0%, #a855f7 40%, #00f0ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 0 60px rgba(168, 85, 247, 0.35);
}

.home-hero__title-accent {
  margin-left: 0.35em;
  background: linear-gradient(90deg, #00f0ff 0%, #00f0ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 0 40px rgba(0, 240, 255, 0.4);
}

.home-hero__subtitle {
  margin: 18px 0 0;
  font-size: clamp(24px, 3.2vw, 36px);
  font-weight: 400;
  color: #ffffff;
  letter-spacing: 0.01em;
}

.home-hero__tagline {
  margin: 14px 0 0;
  font-size: 14.5px;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.015em;
}
</style>
