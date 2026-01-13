import DefaultTheme from 'vitepress/theme';
import { inject } from '@vercel/analytics';
import DemoActions from './components/DemoActions.vue';
import DemoEventLog from './components/DemoEventLog.vue';
import DemoFrame from './components/DemoFrame.vue';
import './custom.css';

let analyticsReady = false;

export default {
  ...DefaultTheme,
  enhanceApp(ctx) {
    DefaultTheme.enhanceApp?.(ctx);
    if (typeof window !== 'undefined' && !analyticsReady) {
      analyticsReady = true;
      inject({ mode: 'auto' });
    }
    ctx.app.component('DemoActions', DemoActions);
    ctx.app.component('DemoEventLog', DemoEventLog);
    ctx.app.component('DemoFrame', DemoFrame);
  },
};
