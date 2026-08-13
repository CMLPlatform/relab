import elkLayouts from '@mermaid-js/layout-elk';

let mermaidRenderPromise: Promise<void> | undefined;
let activeMermaidTheme = '';
let themeObserver: MutationObserver | undefined;
let mermaidModulePromise: Promise<typeof import('mermaid')> | undefined;
let mermaidLayoutsRegistered = false;
const BOM_PATTERN = /^\uFEFF/;
const TRAILING_WHITESPACE_PATTERN = /[ \t]+$/g;

const reportMermaidError = (error: unknown) => {
  if (typeof reportError === 'function') {
    reportError(error instanceof Error ? error : new Error(String(error)));
  }
};

/* NOTE: hand-tuned surfaces; if brand.css primary changes, retune these (no machine link). */
const mermaidThemeVariables = {
  light: {
    background: '#f7fbff',
    primaryColor: '#d9f4fb',
    primaryBorderColor: 'var(--relab-brand-primary)',
    primaryTextColor: 'var(--relab-brand-text)',
    lineColor: '#24415b',
    tertiaryColor: '#eef5fb',
  },
  dark: {
    background: '#0c1724',
    primaryColor: '#13364d',
    primaryBorderColor: 'var(--relab-brand-primary)',
    primaryTextColor: 'var(--relab-brand-text)',
    lineColor: '#b9dcf6',
    tertiaryColor: '#102131',
  },
} as const;

// The brand CSS vars use the CSS `light-dark()` function, which Mermaid's color
// parser (khroma) can't parse and would throw on. Resolve it to the concrete
// color for the theme the script already tracks. Splits on the top-level comma
// so nested rgba(...) values survive.
const resolveLightDark = (value: string, theme: keyof typeof mermaidThemeVariables) => {
  const match = /^light-dark\((.*)\)$/is.exec(value.trim());
  if (!match) return value;
  const inner = match[1];
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      const light = inner.slice(0, i).trim();
      const dark = inner.slice(i + 1).trim();
      return theme === 'dark' ? dark : light;
    }
  }
  return value;
};

const resolveThemeVariables = (theme: keyof typeof mermaidThemeVariables) => {
  const styles = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(mermaidThemeVariables[theme]).map(([key, value]) => [
      key,
      value.startsWith('var(')
        ? resolveLightDark(styles.getPropertyValue(value.slice(4, -1)).trim(), theme) || value
        : value,
    ]),
  );
};

const normalizeMermaidSource = (source: string) => {
  return source
    .replace(/\r\n?/g, '\n')
    .replace(BOM_PATTERN, '')
    .trim()
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
  const mermaid = (await mermaidModulePromise).default;
  if (!mermaidLayoutsRegistered) {
    mermaid.registerLayoutLoaders(elkLayouts);
    mermaidLayoutsRegistered = true;
  }
  return mermaid;
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
    if (!sourceElement) {
      continue;
    }

    const currentContainer =
      sourceElement.closest('.expressive-code') ?? sourceElement.closest('pre') ?? sourceElement;
    if (!(currentContainer instanceof HTMLElement)) {
      continue;
    }

    const container = document.createElement('div');
    container.className = 'relab-mermaid';
    container.tabIndex = 0;
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Diagram, scrollable');
    container.dataset.mermaidSource = normalizeMermaidSource(readMermaidSource(sourceElement));
    container.textContent = container.dataset.mermaidSource;
    // Reserve the pre-render block's height so the swap never shrinks
    // already-laid-out content. NOTE: taller diagrams still grow the page —
    // this only prevents shrink-then-grow shift, not all reflow.
    const preRenderHeight = currentContainer.offsetHeight;
    if (preRenderHeight > 0) {
      container.style.minHeight = `${preRenderHeight}px`;
    }
    currentContainer.replaceWith(container);
  }
};

const renderMermaid = async (force = false): Promise<void> => {
  if (mermaidRenderPromise) {
    // A render is already running. A forced re-render (theme change) must not be
    // dropped, so queue it to run once the in-flight pass settles.
    return force ? mermaidRenderPromise.then(() => renderMermaid(true)) : mermaidRenderPromise;
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
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: resolveThemeVariables(theme),
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
    } finally {
      // Release the pre-render reservation. It exists only to stop the swap
      // shrinking already-laid-out content during load; kept afterwards it is
      // pure dead space, because a rendered diagram is usually much shorter
      // than the source block it replaced (the system-design flowchart renders
      // 328px tall from a 1619px `pre`). Cleared even when run() throws, so a
      // failed render leaves the source text rather than a blank reserved box.
      for (const diagram of diagrams) {
        diagram.style.minHeight = '';
      }
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

const initMermaidChrome = () => {
  bindThemeObserver();
  renderMermaid().catch(reportMermaidError);
};

document.addEventListener('astro:page-load', initMermaidChrome);
document.addEventListener('astro:after-swap', initMermaidChrome);
initMermaidChrome();
