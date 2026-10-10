import elkLayouts from '@mermaid-js/layout-elk';

let mermaidRenderPromise: Promise<void> | undefined;
let activeMermaidTheme = '';
let mermaidPromise: Promise<typeof import('mermaid').default> | undefined;
const BOM_PATTERN = /^\uFEFF/;
const TRAILING_WHITESPACE_PATTERN = /[ \t]+$/g;

/*
 * NOTE: literal colors because mermaid's parser (khroma) cannot read CSS custom
 * properties or `light-dark()`. Border and text mirror brand.css
 * --relab-brand-primary / --relab-brand-text and `background` mirrors
 * --relab-brand-background; the other surfaces are hand-tuned. If brand.css
 * changes, retune these (no machine link).
 */
const mermaidThemeVariables = {
  light: {
    background: '#fafbfe',
    primaryColor: '#d9f4fb',
    primaryBorderColor: '#1f4c96',
    primaryTextColor: '#16202e',
    lineColor: '#24415b',
    tertiaryColor: '#edf0f8',
    // Without this, mermaid's `base` theme derives a pale yellow-green edge-label
    // background (rgba(244,251,217,.5)). Pinned to the diagram frame's tone,
    // .relab-mermaid's 6% primary over the page ground.
    edgeLabelBackground: '#edf0f8',
  },
  dark: {
    background: '#11141d',
    primaryColor: '#13364d',
    primaryBorderColor: '#8fb8ff',
    primaryTextColor: '#e9eff8',
    lineColor: '#b9dcf6',
    tertiaryColor: '#191e2b',
    // Dark-mode derivation was rgba(54,77,19,.5). Same fix.
    edgeLabelBackground: '#191e2b',
  },
} as const;

const fullSizeUrls = new WeakMap<HTMLElement, string>();
const FULL_SIZE_CLASS = 'relab-mermaid-full-size';

/**
 * Put a "View full size" link under a rendered diagram.
 *
 * Diagrams scale down to the column width, which shrinks the labels of a wide
 * one. The link opens the SVG at its natural size in a new tab. The copy gets
 * the page ground as its background, so light dark-theme labels stay readable
 * on the tab's white default. Called again after every render (theme swaps),
 * it replaces the previous blob URL.
 */
function linkFullSizeDiagram(diagram: HTMLElement, theme: keyof typeof mermaidThemeVariables) {
  const previousUrl = fullSizeUrls.get(diagram);
  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
  }
  const svg = diagram.querySelector('svg');
  let wrapper = diagram.nextElementSibling;
  if (!wrapper?.classList.contains(FULL_SIZE_CLASS)) {
    wrapper = null;
  }
  if (!svg) {
    wrapper?.remove();
    return;
  }

  const copy = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = svg.viewBox.baseVal;
  if (width && height) {
    copy.setAttribute('width', String(width));
    copy.setAttribute('height', String(height));
  }
  copy.style.maxWidth = 'none';
  copy.style.background = mermaidThemeVariables[theme].background;
  // XMLSerializer, not outerHTML: HTML labels inside foreignObject must be
  // well-formed XML for a standalone SVG document to parse.
  const markup = new XMLSerializer().serializeToString(copy);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  fullSizeUrls.set(diagram, url);

  if (!wrapper) {
    wrapper = document.createElement('p');
    wrapper.className = FULL_SIZE_CLASS;
    const link = document.createElement('a');
    link.target = '_blank';
    link.textContent = 'View full size';
    const hint = document.createElement('span');
    hint.className = 'sr-only';
    hint.textContent = ' (opens in a new tab)';
    link.append(hint);
    wrapper.append(link);
    diagram.after(wrapper);
  }
  wrapper.querySelector('a')?.setAttribute('href', url);
}

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
  const lines = Array.from(sourceElement.querySelectorAll('.ec-line')).map(
    (line) => line.querySelector('.code')?.textContent ?? '',
  );
  return lines.length > 0 ? lines.join('\n') : (sourceElement.textContent ?? '');
};

const getCurrentTheme = () =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

const loadMermaid = () => {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.registerLayoutLoaders(elkLayouts);
    return mermaid;
  });
  return mermaidPromise;
};

const ensureMermaidContainers = () => {
  const codeBlocks = document.querySelectorAll('.expressive-code pre[data-language="mermaid"]');

  for (const sourceElement of codeBlocks) {
    const currentContainer =
      sourceElement.closest('.expressive-code') ?? sourceElement.closest('pre') ?? sourceElement;
    if (!(currentContainer instanceof HTMLElement)) {
      continue;
    }

    const container = document.createElement('div');
    container.className = 'relab-mermaid';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Diagram');
    container.dataset.mermaidSource = normalizeMermaidSource(readMermaidSource(sourceElement));
    container.textContent = container.dataset.mermaidSource;
    // Reserve the pre-render block's height so the swap never shrinks
    // already-laid-out content. NOTE: taller diagrams still grow the page.
    const preRenderHeight = currentContainer.offsetHeight;
    if (preRenderHeight > 0) {
      container.style.minHeight = `${preRenderHeight}px`;
    }
    currentContainer.replaceWith(container);
  }
};

const renderMermaid = async (force = false): Promise<void> => {
  if (mermaidRenderPromise) {
    // A render is running; queue a forced re-render (theme change) behind it.
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
      reportError(error);
    } finally {
      // Release the reservation: a rendered diagram is usually much shorter than
      // its source block. Cleared even when run() throws, so a failed render
      // leaves the source text rather than a blank reserved box.
      for (const diagram of diagrams) {
        diagram.style.minHeight = '';
        linkFullSizeDiagram(diagram, theme);
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

  // attributeFilter limits the records to data-theme changes.
  new MutationObserver(() => {
    renderMermaid(true).catch(reportError);
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
};

bindThemeObserver();
renderMermaid().catch(reportError);
