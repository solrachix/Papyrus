import DefaultTheme from 'vitepress/theme';
import { Analytics } from '@vercel/analytics/vue';
import { h } from 'vue';
import DemoActions from './components/DemoActions.vue';
import DemoEventLog from './components/DemoEventLog.vue';
import DemoFrame from './components/DemoFrame.vue';
import './custom.css';

export default {
  ...DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => h(Analytics),
    });
  },
  enhanceApp(ctx) {
    DefaultTheme.enhanceApp?.(ctx);
    ctx.app.component('DemoActions', DemoActions);
    ctx.app.component('DemoEventLog', DemoEventLog);
    ctx.app.component('DemoFrame', DemoFrame);
  },
};
