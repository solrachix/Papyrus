import { defineConfig } from 'vitepress';

const navEn = [
  { text: 'Quickstart', link: '/quickstart' },
  { text: 'Architecture', link: '/architecture' },
  { text: 'Configuration', link: '/configuration' },
  { text: 'Flows', link: '/flows' },
  { text: 'Mobile', link: '/mobile' },
  { text: 'Examples', link: '/examples/' },
];

const navPt = [
  { text: 'Inicio', link: '/pt/' },
  { text: 'Quickstart', link: '/pt/quickstart' },
  { text: 'Arquitetura', link: '/pt/architecture' },
  { text: 'Configuracao', link: '/pt/configuration' },
  { text: 'Fluxos', link: '/pt/flows' },
  { text: 'Mobile', link: '/pt/mobile' },
  { text: 'Exemplos', link: '/pt/examples/' },
];

const sidebarEn = [
  {
    text: 'Start',
    items: [
      { text: 'Overview', link: '/' },
      { text: 'Quickstart', link: '/quickstart' },
      { text: 'Architecture', link: '/architecture' },
    ],
  },
  {
    text: 'Guides',
    items: [
      { text: 'Configuration', link: '/configuration' },
      { text: 'Flows', link: '/flows' },
      { text: 'Mobile', link: '/mobile' },
    ],
  },
  {
    text: 'Examples',
    items: [
      { text: 'Overview', link: '/examples/' },
      { text: 'Demo', link: '/examples/demo' },
      { text: 'Theme Switching', link: '/examples/theme' },
      { text: 'Locale', link: '/examples/locale' },
      { text: 'Switching Engines', link: '/examples/engines' },
    ],
  },
];

const sidebarPt = [
  {
    text: 'Inicio',
    items: [
      { text: 'Visao geral', link: '/pt/' },
      { text: 'Quickstart', link: '/pt/quickstart' },
      { text: 'Arquitetura', link: '/pt/architecture' },
    ],
  },
  {
    text: 'Guias',
    items: [
      { text: 'Configuracao', link: '/pt/configuration' },
      { text: 'Fluxos', link: '/pt/flows' },
      { text: 'Mobile', link: '/pt/mobile' },
    ],
  },
  {
    text: 'Exemplos',
    items: [
      { text: 'Visao geral', link: '/pt/examples/' },
      { text: 'Demo', link: '/pt/examples/demo' },
      { text: 'Troca de Tema', link: '/pt/examples/theme' },
      { text: 'Idioma', link: '/pt/examples/locale' },
      { text: 'Troca de Engine', link: '/pt/examples/engines' },
    ],
  },
];

export default defineConfig({
  title: 'Papyrus',
  description: 'Modular PDF SDK',
  cleanUrls: true,
  lastUpdated: true,
  appearance: true,
  themeConfig: {
    search: {
      provider: 'local',
    },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: navEn,
        sidebar: {
          '/': sidebarEn,
        },
      },
    },
    pt: {
      label: 'Portugues',
      lang: 'pt-BR',
      link: '/pt/',
      themeConfig: {
        nav: navPt,
        sidebar: {
          '/pt/': sidebarPt,
        },
      },
    },
  },
});
