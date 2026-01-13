<template>
  <div class="papyrus-demo-frame">
    <div class="papyrus-demo-shell">
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
import { computed } from 'vue';
import { withBase } from 'vitepress';

const props = withDefaults(defineProps<{ src?: string; demoId?: string }>(), {
  src: '/demo/index.html',
  demoId: 'papyrus-demo',
});

const { src, demoId } = props;

const resolvedSrc = computed(() => {
  if (!src) return withBase('/demo/index.html');
  if (/^https?:\/\//.test(src) || src.startsWith('//')) return src;
  return withBase(src);
});
</script>
