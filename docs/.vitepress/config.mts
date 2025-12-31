import { defineConfig } from 'vitepress';

const SITE_URL = process.env.VITEPRESS_SITE_URL;
const SITE_NAME = 'Papyrus';
const DESCRIPTION_EN = 'Open source PDF, EPUB, and TXT SDK for web and mobile document readers.';
const DESCRIPTION_PT = 'SDK open source de PDF, EPUB e TXT para leitores de documentos web e mobile.';
const KEYWORDS = [
  'PDF SDK',
  'EPUB SDK',
  'open source PDF library',
  'document reader',
  'document viewer',
  'React PDF viewer',
  'React Native PDF SDK',
  'PDF.js',
].join(', ');
const OG_IMAGE = process.env.VITEPRESS_OG_IMAGE || (SITE_URL ? `${SITE_URL}/og.png` : '/og.png');

const head = [
  ['meta', { name: 'keywords', content: KEYWORDS }],
  ['meta', { property: 'og:type', content: 'website' }],
  ['meta', { property: 'og:site_name', content: SITE_NAME }],
  ['meta', { property: 'og:title', content: SITE_NAME }],
  ['meta', { property: 'og:description', content: DESCRIPTION_EN }],
  ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ['meta', { name: 'twitter:title', content: SITE_NAME }],
  ['meta', { name: 'twitter:description', content: DESCRIPTION_EN }],
];

if (OG_IMAGE) {
  head.push(['meta', { property: 'og:image', content: OG_IMAGE }]);
  head.push(['meta', { name: 'twitter:image', content: OG_IMAGE }]);
}

if (SITE_URL) {
  head.push(['meta', { property: 'og:url', content: SITE_URL }]);
}

const buildRoute = (relativePath: string) => {
  const normalized = relativePath.replace(/\\/g, '/').replace(/\.md$/, '');
  if (normalized === 'index') return '/';
  if (normalized.endsWith('/index')) {
    return `/${normalized.slice(0, -'/index'.length)}/`;
  }
  return `/${normalized}`;
};

const navEn = [
  { text: 'Quickstart', link: '/quickstart' },
  { text: 'FAQ', link: '/faq' },
  { text: 'Architecture', link: '/architecture' },
  { text: 'Configuration', link: '/configuration' },
  { text: 'Flows', link: '/flows' },
  { text: 'Mobile', link: '/mobile' },
  { text: 'Interactive', link: '/examples/' },
];

const navPt = [
  { text: 'Inicio', link: '/pt/' },
  { text: 'Quickstart', link: '/pt/quickstart' },
  { text: 'FAQ', link: '/pt/faq' },
  { text: 'Arquitetura', link: '/pt/architecture' },
  { text: 'Configuracao', link: '/pt/configuration' },
  { text: 'Fluxos', link: '/pt/flows' },
  { text: 'Mobile', link: '/pt/mobile' },
  { text: 'Interativo', link: '/pt/examples/' },
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
    text: 'Interactive',
    items: [
      { text: 'Overview', link: '/examples/' },
      { text: 'Demo + Events', link: '/examples/demo' },
      { text: 'Theme Switching', link: '/examples/theme' },
      { text: 'Locale', link: '/examples/locale' },
      { text: 'Switching Engines', link: '/examples/engines' },
    ],
  },
  {
    text: 'Articles',
    items: [
      { text: 'FAQ', link: '/faq' },
      { text: 'Open Source PDF SDK', link: '/open-source-pdf-sdk' },
      { text: 'Open Source EPUB SDK', link: '/open-source-epub-sdk' },
      { text: 'Papyrus vs PDFTron', link: '/papyrus-pdftron-alternative' },
      { text: 'Best Free PDF SDK 2026', link: '/best-free-pdf-sdk-2026' },
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
    text: 'Interativo',
    items: [
      { text: 'Visao geral', link: '/pt/examples/' },
      { text: 'Demo e Eventos', link: '/pt/examples/demo' },
      { text: 'Troca de Tema', link: '/pt/examples/theme' },
      { text: 'Idioma', link: '/pt/examples/locale' },
      { text: 'Troca de Engine', link: '/pt/examples/engines' },
    ],
  },
  {
    text: 'Artigos',
    items: [
      { text: 'FAQ', link: '/pt/faq' },
      { text: 'SDK PDF Open Source', link: '/pt/sdk-pdf-open-source' },
      { text: 'SDK EPUB Open Source', link: '/pt/sdk-epub-open-source' },
      { text: 'Papyrus vs PDFTron', link: '/pt/papyrus-alternativa-pdftron' },
      { text: 'Melhor SDK PDF Gratis 2026', link: '/pt/melhor-sdk-pdf-gratis-2026' },
    ],
  },
];

export default defineConfig({
  title: 'Papyrus',
  description: DESCRIPTION_EN,
  cleanUrls: true,
  lastUpdated: true,
  appearance: true,
  head,
  sitemap: SITE_URL ? { hostname: SITE_URL } : undefined,
  transformHead: ({ pageData }) => {
    if (!SITE_URL) return [];
    const route = buildRoute(pageData.relativePath);
    const canonical = `${SITE_URL}${route}`;
    const isPt = pageData.relativePath.replace(/\\/g, '/').startsWith('pt/');
    const enRoute = isPt ? route.replace(/^\/pt\//, '/') : route;
    const ptRoute = isPt ? route : route === '/' ? '/pt/' : `/pt${route}`;

    return [
      ['link', { rel: 'canonical', href: canonical }],
      ['link', { rel: 'alternate', hreflang: 'en', href: `${SITE_URL}${enRoute}` }],
      ['link', { rel: 'alternate', hreflang: 'pt-BR', href: `${SITE_URL}${ptRoute}` }],
      ['link', { rel: 'alternate', hreflang: 'x-default', href: `${SITE_URL}${enRoute}` }],
    ];
  },
  themeConfig: {
    search: {
      provider: 'local',
    },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      description: DESCRIPTION_EN,
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
      description: DESCRIPTION_PT,
      themeConfig: {
        nav: navPt,
        sidebar: {
          '/pt/': sidebarPt,
        },
      },
    },
  },
});
