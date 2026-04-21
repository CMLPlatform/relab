import { initMermaidChrome } from './mermaid.ts';
import { initTocChrome } from './toc.ts';

const initPageChrome = () => {
  initTocChrome();
  initMermaidChrome();
};

document.addEventListener('astro:page-load', initPageChrome);
document.addEventListener('astro:after-swap', initPageChrome);
initPageChrome();
