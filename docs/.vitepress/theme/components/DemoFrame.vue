<template>
  <div
    class="papyrus-demo-frame"
    :class="{
      'is-fullscreen': isFullscreen,
      'is-parent-dark': isParentDark,
    }"
  >
    <div class="papyrus-demo-shell">
      <div v-if="isFullscreen" class="papyrus-demo-modal-bar">
        <div>
          <strong>Papyrus Interactive Demo</strong>
          <span>Explore o viewer em tela ampla</span>
        </div>
        <button class="papyrus-demo-close" @click="exitFullscreen">Fechar</button>
      </div>
      <iframe
        ref="demoFrame"
        :id="demoId"
        class="papyrus-demo-iframe"
        :src="resolvedSrc"
        title="Papyrus Demo"
        loading="lazy"
        @load="postThemeState"
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
const demoFrame = ref<HTMLIFrameElement | null>(null);
const themeObserver = ref<MutationObserver | null>(null);
const isParentDark = ref(false);

const postThemeState = () => {
  isParentDark.value = document.documentElement.classList.contains('dark');
  demoFrame.value?.contentWindow?.postMessage(
    {
      source: 'papyrus-docs',
      action: 'set-ui-theme',
      value: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    },
    window.location.origin,
  );
};

const postFullscreenState = (fullscreen: boolean) => {
  demoFrame.value?.contentWindow?.postMessage(
    { type: 'papyrus-demo-fullscreen', fullscreen },
    window.location.origin,
  );
};

const resolvedSrc = computed(() => {
  if (!src) return withBase('/demo/index.html#/');
  if (/^https?:\/\//.test(src) || src.startsWith('//')) return src;
  return withBase(src);
});

const exitFullscreen = () => {
  isFullscreen.value = false;
  postFullscreenState(false);
};

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') isFullscreen.value = false;
};

const onToggle = (event: Event) => {
  const detail = (event as CustomEvent).detail;
  if (detail === true) {
    isFullscreen.value = true;
    postFullscreenState(true);
  }
  if (detail === false) exitFullscreen();
};

const onMessage = (event: MessageEvent) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type !== 'papyrus-demo-fullscreen') return;
  isFullscreen.value = event.data.fullscreen === true;
  postFullscreenState(isFullscreen.value);
};

onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('papyrus-demo-fullscreen', onToggle as EventListener);
  window.addEventListener('message', onMessage);

  themeObserver.value = new MutationObserver(postThemeState);
  themeObserver.value.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('papyrus-demo-fullscreen', onToggle as EventListener);
  window.removeEventListener('message', onMessage);
  themeObserver.value?.disconnect();
  themeObserver.value = null;
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
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(2, 6, 23, 0.78);
  border-radius: 0;
  box-shadow: none;
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  box-sizing: border-box;
}

.papyrus-demo-frame.is-fullscreen::before {
  content: '';
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.7);
  z-index: -1;
}

.papyrus-demo-frame.is-fullscreen:not(.is-parent-dark) {
  background: rgba(226, 232, 240, 0.82);
}

.papyrus-demo-frame.is-fullscreen:not(.is-parent-dark)::before {
  background: rgba(248, 250, 252, 0.78);
}

.papyrus-demo-frame.is-fullscreen:not(.is-parent-dark) .papyrus-demo-modal-bar {
  color: #0f172a;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
  border-bottom-color: rgba(15, 23, 42, 0.12);
}

.papyrus-demo-frame.is-fullscreen:not(.is-parent-dark) .papyrus-demo-modal-bar span {
  color: #64748b;
}

.papyrus-demo-frame.is-fullscreen:not(.is-parent-dark) .papyrus-demo-close {
  color: #0f172a;
  background: rgba(15, 23, 42, 0.05);
  border-color: rgba(15, 23, 42, 0.16);
}

.papyrus-demo-frame.is-fullscreen:not(.is-parent-dark) .papyrus-demo-close:hover {
  background: rgba(15, 23, 42, 0.1);
}

.papyrus-demo-shell {
  position: relative;
  height: 100%;
}

.papyrus-demo-frame.is-fullscreen .papyrus-demo-shell {
  width: min(1560px, 100%);
  height: min(920px, 100%);
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 22px;
  overflow: hidden;
  background: #080d19;
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.5);
}

.papyrus-demo-frame.is-fullscreen .papyrus-demo-iframe {
  height: calc(100% - 58px);
}

.papyrus-demo-modal-bar {
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 18px 0 22px;
  color: #f8fafc;
  background: linear-gradient(180deg, #111827, #0f172a);
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.papyrus-demo-modal-bar strong,
.papyrus-demo-modal-bar span {
  display: block;
}

.papyrus-demo-modal-bar strong {
  font-size: 13px;
  letter-spacing: 0.02em;
}

.papyrus-demo-modal-bar span {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 11px;
}

.papyrus-demo-close {
  z-index: 2;
  flex: 0 0 auto;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #fff;
  padding: 7px 13px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
}

.papyrus-demo-close:hover {
  background: rgba(255, 255, 255, 0.16);
}

@media (max-width: 720px) {
  .papyrus-demo-frame.is-fullscreen {
    padding: 10px;
  }

  .papyrus-demo-modal-bar {
    padding-left: 14px;
  }

  .papyrus-demo-modal-bar span {
    display: none;
  }
}
</style>
