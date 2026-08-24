<template>
  <button
    class="demo-fullscreen-btn"
    type="button"
    aria-label="Abrir exemplo interativo em tela ampla"
    @click="open"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
    </svg>
    Abrir exemplo interativo
  </button>
</template>

<script setup lang="ts">
const open = () => {
  const event = new CustomEvent('papyrus-demo-fullscreen', { detail: true });
  window.dispatchEvent(event);
};
</script>

<style scoped>
.demo-fullscreen-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
}

.demo-fullscreen-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
