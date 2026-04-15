const tocStateKey = 'relab-docs-toc-collapsed';
let mermaidRenderPromise: Promise<void> | undefined;
let activeMermaidTheme = '';
let themeObserver: MutationObserver | undefined;
let mermaidModulePromise: Promise<typeof import('mermaid')> | undefined;

const mermaidThemeVariables = {
  light: {
    background: '#f7fbff',
    primaryColor: '#d9f4fb',
    primaryBorderColor: '#006783',
    primaryTextColor: '#13263a',
    lineColor: '#24415b',
    tertiaryColor: '#eef5fb',
  },
  dark: {
    background: '#0c1724',
    primaryColor: '#13364d',
    primaryBorderColor: '#63d3ff',
    primaryTextColor: '#f2f8ff',
    lineColor: '#b9dcf6',
    tertiaryColor: '#102131',
  },
} as const;

const normalizeMermaidSource = (source: string) => {
  let text = source
    .replace(/\r\n?/g, '\n')
    .replace(/^\uFEFF/, '')
    .trim();

  const frontmatterMatch = text.match(/^[\s\u200b]*---\s*\n[\s\S]*?\n---\s*(?:\n|$)/);
  if (frontmatterMatch) {
    text = text.slice(frontmatterMatch[0].length).trimStart();
  }

  const lines = text.split('\n');
  if (lines[0]?.trim() === '---') {
    const frontmatterEnd = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (frontmatterEnd !== -1) {
      text = lines
        .slice(frontmatterEnd + 1)
        .join('\n')
        .trimStart();
    }
  }

  return text
    .replace(/\s+fa:[a-z0-9-]+/gi, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
};

const readMermaidSource = (sourceElement: Element) => {
  if (sourceElement.matches('pre[data-language="mermaid"]')) {
    const lines = Array.from(sourceElement.querySelectorAll('.ec-line')).map(
      (line) => line.querySelector('.code')?.textContent ?? '',
    );
    if (lines.length > 0) {
      return lines.join('\n');
    }
  }

  return sourceElement.textContent ?? '';
};

const getCurrentTheme = () =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

const loadMermaid = async () => {
  mermaidModulePromise ??= import('mermaid');
  return (await mermaidModulePromise).default;
};

const ensureMermaidContainers = () => {
  const codeBlocks = document.querySelectorAll(
    '.expressive-code pre[data-language="mermaid"], pre > code.language-mermaid',
  );

  for (const codeBlock of codeBlocks) {
    const sourceElement =
      codeBlock instanceof HTMLElement && codeBlock.matches('pre[data-language="mermaid"]')
        ? codeBlock
        : codeBlock.parentElement;
    if (!sourceElement || sourceElement.dataset.mermaidSourceReady === 'true') {
      continue;
    }

    const currentContainer =
      sourceElement.closest('.expressive-code') ?? sourceElement.closest('pre') ?? sourceElement;
    if (!(currentContainer instanceof HTMLElement)) {
      continue;
    }

    const container = document.createElement('div');
    container.className = 'relab-mermaid';
    container.dataset.mermaidSource = normalizeMermaidSource(readMermaidSource(sourceElement));
    container.textContent = container.dataset.mermaidSource;
    currentContainer.replaceWith(container);
    sourceElement.dataset.mermaidSourceReady = 'true';
  }
};

const renderMermaid = async (force = false) => {
  if (mermaidRenderPromise) {
    return mermaidRenderPromise;
  }

  mermaidRenderPromise = (async () => {
    ensureMermaidContainers();

    const diagrams = Array.from(document.querySelectorAll<HTMLElement>('.relab-mermaid'));
    if (diagrams.length === 0) {
      return;
    }

    const mermaid = await loadMermaid();
    const theme = getCurrentTheme();
    if (force || activeMermaidTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'base',
        themeVariables: mermaidThemeVariables[theme],
      });
      activeMermaidTheme = theme;
      for (const diagram of diagrams) {
        diagram.removeAttribute('data-processed');
        diagram.innerHTML = diagram.dataset.mermaidSource ?? diagram.textContent ?? '';
      }
    }

    try {
      await mermaid.run({ nodes: diagrams });
    } catch (error) {
      console.error('Failed to render Mermaid diagram.', error);
    }
  })();

  try {
    await mermaidRenderPromise;
  } finally {
    mermaidRenderPromise = undefined;
  }
};

const enhanceDesktopToc = () => {
  const panel = document.querySelector('.right-sidebar-panel');
  const container = panel?.querySelector('.sl-container');
  const toc = panel?.querySelector('starlight-toc');
  if (!(panel instanceof HTMLElement) || !(container instanceof HTMLElement) || !toc) {
    return;
  }

  let toggle = container.querySelector<HTMLButtonElement>('.relab-toc-toggle');
  if (!(toggle instanceof HTMLButtonElement)) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'relab-toc-toggle';
    toggle.innerHTML =
      '<span>On this page</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="m14.83 11.29-4.24-4.24a1 1 0 1 0-1.42 1.41L12.71 12l-3.54 3.54a1 1 0 0 0 0 1.41 1 1 0 0 0 .71.29 1 1 0 0 0 .71-.29l4.24-4.24a1.002 1.002 0 0 0 0-1.42Z"/></svg>';
    container.prepend(toggle);
  }

  const applyState = (collapsed: boolean) => {
    panel.dataset.relabTocCollapsed = collapsed ? 'true' : 'false';
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute(
      'aria-label',
      collapsed ? 'Show table of contents' : 'Hide table of contents',
    );
  };

  applyState(window.localStorage.getItem(tocStateKey) === 'true');

  if (toggle.dataset.relabBound === 'true') {
    return;
  }

  toggle.dataset.relabBound = 'true';
  toggle.addEventListener('click', () => {
    const collapsed = panel.dataset.relabTocCollapsed !== 'true';
    applyState(collapsed);
    window.localStorage.setItem(tocStateKey, collapsed ? 'true' : 'false');
  });
};

const bindThemeObserver = () => {
  if (!document.querySelector('.relab-mermaid, .language-mermaid, pre[data-language="mermaid"]')) {
    return;
  }

  if (themeObserver) {
    return;
  }

  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
        void renderMermaid(true);
      }
    }
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
};

const initPageChrome = () => {
  enhanceDesktopToc();
  bindThemeObserver();
  void renderMermaid();
};

document.addEventListener('astro:page-load', initPageChrome);
document.addEventListener('astro:after-swap', initPageChrome);
initPageChrome();
