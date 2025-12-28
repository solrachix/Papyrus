<template>
  <div class="papyrus-demo-frame">
    <div class="papyrus-demo-shell">
      <iframe
        :id="demoId"
        class="papyrus-demo-iframe"
        :src="src"
        title="Papyrus Demo"
        loading="lazy"
      ></iframe>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ src?: string; demoId?: string }>(), {
  src: '/demo/index.html',
  demoId: 'papyrus-demo',
});

const { src, demoId } = props;
</script>
