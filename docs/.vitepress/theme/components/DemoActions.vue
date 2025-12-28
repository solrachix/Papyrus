<template>
  <div class="papyrus-demo-actions">
    <button
      v-for="item in actions"
      :key="item.label"
      class="papyrus-demo-action"
      type="button"
      @click="send(item)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
type DemoAction = {
  label: string;
  action: string;
  value?: string | number | boolean | null;
  payload?: Record<string, unknown>;
};

const props = withDefaults(
  defineProps<{ actions: DemoAction[]; targetId?: string }>(),
  { targetId: 'papyrus-demo' }
);

const send = (item: DemoAction) => {
  const frame = document.getElementById(props.targetId) as HTMLIFrameElement | null;
  const message = {
    source: 'papyrus-docs',
    action: item.action,
    value: item.value ?? null,
    payload: item.payload ?? null,
  };

  if (frame?.contentWindow) {
    frame.contentWindow.postMessage(message, '*');
  }
};
</script>
