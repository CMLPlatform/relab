import { initMermaidChrome } from './mermaid';
import { initTocChrome } from './toc';

const initPageChrome = () => {
  initTocChrome();
  initMermaidChrome();
};

document.addEventListener('astro:page-load', initPageChrome);
document.addEventListener('astro:after-swap', initPageChrome);
initPageChrome();
