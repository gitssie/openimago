<template>
  <!--
    Minimal shell layout for the redesigned workspace pages. Workspace
    pages render their own top toolbar + 3-column UILayout inside their
    q-page, so this layout only needs to provide a full-viewport q-layout
    shell (no global sidebar, no HomeLayout topbar). The nested child route
    component (e.g. SessionWorkspacePage / ProjectWorkspacePage) is rendered
    by a <router-view /> so vue-router can inject it here — <slot /> would not
    receive the route component on its own.
  -->
  <q-layout view="hHh lpR lFr" class="workspace-shell">
    <q-page-container class="workspace-shell__page">
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
// No props / emits — pass-through shell only.
</script>

<style lang="scss" scoped>
.workspace-shell {
  background: var(--imago-bg-void);
  color: var(--imago-text-primary);
}

.workspace-shell__page {
  height: 100%;
  min-height: 0;
}
</style>
