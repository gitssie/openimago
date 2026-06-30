<template>
  <!--
    ADR 0009 — the Session and Project workspaces are now ONE folder-driven page.
    This file is a thin wrapper kept so the `/sessions` routes (and existing
    imports) resolve to the unified page. The unified page (ProjectWorkspacePage)
    reads the route itself: with no projectId it runs in the standalone-session
    degenerate mode — chat + AI 产出, with the Story tabs appearing only when the
    session's directory actually has Story files.
  -->
  <WorkspacePage />
</template>

<script setup lang="ts">
import WorkspacePage from './ProjectWorkspacePage.vue'
</script>
