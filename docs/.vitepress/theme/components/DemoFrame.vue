<template>
  <div class="papyrus-demo-frame" :class="{ 'is-fullscreen': isFullscreen }">
    <div class="papyrus-demo-shell">
      <button v-if="isFullscreen" class="papyrus-demo-close" @click="exitFullscreen">Close</button>
      <iframe
        :id="demoId"
        class="papyrus-demo-iframe"
        :src="resolvedSrc"
        title="Papyrus Demo"
        loading="lazy"
      ></iframe>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { withBase } from 'vitepress';

const props = withDefaults(defineProps<{ src?: string; demoId?: string }>(), {
  src: '/demo/index.html#/',
  demoId: 'papyrus-demo',
});

const { src, demoId } = props;
const isFullscreen = ref(false);

const resolvedSrc = computed(() => {
  if (!src) return withBase('/demo/index.html#/');
  if (/^https?:\/\//.test(src) || src.startsWith('//')) return src;
  return withBase(src);
});

const exitFullscreen = () => {
  isFullscreen.value = false;
};

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') isFullscreen.value = false;
};

const onToggle = (event: Event) => {
  const detail = (event as CustomEvent).detail;
  if (detail === true) isFullscreen.value = true;
  if (detail === false) isFullscreen.value = false;
};

onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('papyrus-demo-fullscreen', onToggle as EventListener);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('papyrus-demo-fullscreen', onToggle as EventListener);
});
</script>

<style scoped>
.papyrus-demo-frame {
  position: relative;
}

.papyrus-demo-frame.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: #0b0f1a;
  border-radius: 0;
  box-shadow: 0 40px 80px rgba(0, 0, 0, 0.5);
  width: 90vw;
  height: 90vh;
  inset: 5vh auto auto 5vw;
  max-width: none;
  max-height: none;
}

.papyrus-demo-frame.is-fullscreen::before {
  content: '';
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.7);
  z-index: -1;
}

.papyrus-demo-shell {
  position: relative;
  height: 100%;
}

.papyrus-demo-frame.is-fullscreen .papyrus-demo-shell {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 16px;
  box-sizing: border-box;
}

.papyrus-demo-frame.is-fullscreen .papyrus-demo-iframe {
  height: 100%;
}

.papyrus-demo-close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
}
</style>
