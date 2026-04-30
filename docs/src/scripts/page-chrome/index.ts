import { initMermaidChrome } from './mermaid.ts';

const initPageChrome = () => {
  initMermaidChrome();
};

document.addEventListener('astro:page-load', initPageChrome);
document.addEventListener('astro:after-swap', initPageChrome);
initPageChrome();
