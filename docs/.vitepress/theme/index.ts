import DefaultTheme from 'vitepress/theme';
import DemoActions from './components/DemoActions.vue';
import DemoEventLog from './components/DemoEventLog.vue';
import DemoFrame from './components/DemoFrame.vue';
import './custom.css';

export default {
  ...DefaultTheme,
  enhanceApp(ctx) {
    DefaultTheme.enhanceApp?.(ctx);
    ctx.app.component('DemoActions', DemoActions);
    ctx.app.component('DemoEventLog', DemoEventLog);
    ctx.app.component('DemoFrame', DemoFrame);
  },
};
