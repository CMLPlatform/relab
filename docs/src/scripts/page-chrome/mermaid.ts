let mermaidRenderPromise: Promise<void> | undefined;
let activeMermaidTheme = '';
let themeObserver: MutationObserver | undefined;
let mermaidModulePromise: Promise<typeof import('mermaid')> | undefined;
const BOM_PATTERN = /^\uFEFF/;
const FRONTMATTER_PATTERN = /^[\s\u200b]*---\s*\n[\s\S]*?\n---\s*(?:\n|$)/;
const FONT_AWESOME_PATTERN = /\s+fa:[a-z0-9-]+/gi;
const TRAILING_WHITESPACE_PATTERN = /[ \t]+$/g;

const reportMermaidError = (error: unknown) => {
  if (typeof reportError === 'function') {
    reportError(error instanceof Error ? error : new Error(String(error)));
  }
};

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
  let text = source.replace(/\r\n?/g, '\n').replace(BOM_PATTERN, '').trim();

  const frontmatterMatch = text.match(FRONTMATTER_PATTERN);
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
    .replace(FONT_AWESOME_PATTERN, '')
    .split('\n')
    .map((line) => line.replace(TRAILING_WHITESPACE_PATTERN, ''))
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
        diagram.textContent = diagram.dataset.mermaidSource ?? diagram.textContent ?? '';
      }
    }

    try {
      await mermaid.run({ nodes: diagrams });
    } catch (error) {
      reportMermaidError(error);
    }
  })();

  try {
    await mermaidRenderPromise;
  } finally {
    mermaidRenderPromise = undefined;
  }
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
        renderMermaid(true).catch(reportMermaidError);
      }
    }
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
};

export const initMermaidChrome = () => {
  bindThemeObserver();
  renderMermaid().catch(reportMermaidError);
};
