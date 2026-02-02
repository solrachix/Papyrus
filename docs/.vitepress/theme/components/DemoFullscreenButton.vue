<template>
  <button class="demo-fullscreen-btn" type="button" @click="open">
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
  margin-top: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
}
</style>
