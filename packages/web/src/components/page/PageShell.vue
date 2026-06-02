<template>
  <q-page class="page-shell">
    <!-- Ambient backdrop (decorative) — matches HomePage -->
    <div class="page-shell__ambient" aria-hidden="true">
      <div class="page-shell__orb page-shell__orb--cyan" />
      <div class="page-shell__orb page-shell__orb--violet" />
      <div class="page-shell__orb page-shell__orb--pink" />
      <div class="page-shell__ambient-grid" />
    </div>

    <div class="page-shell__inner">
      <slot />
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * PageShell — the standard wrapper for "rich" content pages (assets, projects, prompts).
 *
 * Provides:
 * - <q-page> root with the void background
 * - 3 ambient orbs (cyan top, violet top-right, pink bottom-right) + grid mask
 * - Centered inner container with consistent horizontal padding
 *
 * Pages that need a *full-bleed* workspace layout (session, project workspace) should
 * NOT use this — they manage their own padding via style-fn on <q-page>.
 */
</script>

<style lang="scss" scoped>
.page-shell {
  position: relative;
  padding: 24px 24px 80px;
  background: var(--imago-bg-void);
  overflow-x: hidden;
}

.page-shell__inner {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
}

// ── Ambient backdrop (decorative) ──────────────────────────────────────
.page-shell__ambient {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}

.page-shell__orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.45;
  animation: orb-drift 18s ease-in-out infinite;
}

.page-shell__orb--cyan {
  top: -120px;
  left: 30%;
  width: 460px;
  height: 460px;
  background: radial-gradient(circle, rgba(0, 240, 255, 0.16), transparent 65%);
}

.page-shell__orb--violet {
  top: -40px;
  right: -100px;
  width: 380px;
  height: 380px;
  background: radial-gradient(circle, rgba(168, 85, 247, 0.14), transparent 65%);
  animation-delay: -6s;
  animation-duration: 22s;
}

.page-shell__orb--pink {
  bottom: 80px;
  right: 5%;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(255, 45, 149, 0.08), transparent 65%);
  animation-delay: -12s;
  animation-duration: 26s;
}

.page-shell__ambient-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(0, 240, 255, 0.020) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 240, 255, 0.020) 1px, transparent 1px);
  background-size: 56px 56px;
  background-position: -1px -1px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 80%);
}

@keyframes orb-drift {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  33%      { transform: translate3d(40px, -20px, 0) scale(1.08); }
  66%      { transform: translate3d(-30px, 30px, 0) scale(0.95); }
}

// ── Responsive ───────────────────────────────────────────────────────
@media (max-width: 768px) {
  .page-shell { padding: 16px 14px 60px; }
  .page-shell__orb--cyan { width: 320px; height: 320px; }
  .page-shell__orb--violet { width: 240px; height: 240px; }
  .page-shell__orb--pink { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .page-shell__orb { animation: none !important; }
}
</style>
