<template>
  <div class="papyrus-demo-events">
    <div class="papyrus-demo-events-header">
      <div class="papyrus-demo-events-title">Event Log</div>
      <button class="papyrus-demo-events-clear" type="button" @click="clear">
        Clear
      </button>
    </div>
    <div v-if="events.length === 0" class="papyrus-demo-events-item">
      <div class="papyrus-demo-events-meta">
        <span>Waiting</span>
        <span>--:--:--</span>
      </div>
      <div class="papyrus-demo-events-payload">
        Trigger a demo action or select text in the viewer.
      </div>
    </div>
    <div v-else class="papyrus-demo-events-list">
      <div v-for="event in events" :key="event.id" class="papyrus-demo-events-item">
        <div class="papyrus-demo-events-meta">
          <span>{{ event.type }}</span>
          <span>{{ event.time }}</span>
        </div>
        <div class="papyrus-demo-events-payload">{{ event.payload }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

type DemoEvent = {
  id: string;
  type: string;
  time: string;
  payload: string;
};

const props = withDefaults(defineProps<{ max?: number }>(), { max: 6 });
const events = ref<DemoEvent[]>([]);

const clear = () => {
  events.value = [];
};

const formatTime = () => {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour12: false });
};

const onMessage = (event: MessageEvent) => {
  const data = event.data as { source?: string; type?: string; eventType?: string; payload?: unknown };
  if (!data || data.source !== 'papyrus-demo' || data.type !== 'event') return;

  const payloadText = data.payload ? JSON.stringify(data.payload, null, 2) : '';
  const entry: DemoEvent = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: data.eventType ?? 'EVENT',
    time: formatTime(),
    payload: payloadText,
  };

  events.value = [entry, ...events.value].slice(0, props.max);
};

onMounted(() => {
  window.addEventListener('message', onMessage);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
});
</script>
