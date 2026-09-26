import elkLayouts from '@mermaid-js/layout-elk';

let mermaidRenderPromise: Promise<void> | undefined;
let activeMermaidTheme = '';
let mermaidModulePromise: Promise<typeof import('mermaid')> | undefined;
let mermaidLayoutsRegistered = false;
const BOM_PATTERN = /^\uFEFF/;
const TRAILING_WHITESPACE_PATTERN = /[ \t]+$/g;

const reportMermaidError = (error: unknown) => {
  reportError(error instanceof Error ? error : new Error(String(error)));
};

/**
 * Give a rendered diagram its natural width so the frame can scroll it.
 *
 * Mermaid emits `width="100%"` with the natural size only as an inline
 * `max-width`, and a percent-sized SVG has no intrinsic width CSS can recover
 * (`width: max-content` resolves to the container). Left alone a 1636px diagram
 * scaled to 0.46x at 1440px, putting 16px labels at ~7.4px. Narrow diagrams are
 * left alone so they still fill the frame.
 */
function pinDiagramToIntrinsicWidth(diagram: HTMLElement): void {
  const svg = diagram.querySelector('svg');
  if (!svg) {
    return;
  }
  const intrinsic = svg.viewBox?.baseVal?.width;
  if (!intrinsic) {
    return;
  }
  if (intrinsic > diagram.clientWidth) {
    svg.style.width = `${intrinsic}px`;
    svg.style.maxWidth = 'none';
  } else {
    svg.style.width = '';
    svg.style.maxWidth = '';
  }
}

/*
 * Re-pin when the frame's width changes (resize, rotation, sidebar). The frame
 * scrolls its overflow, so re-pinning the SVG never resizes the frame and
 * cannot loop the observer.
 */
const diagramFrameObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    pinDiagramToIntrinsicWidth(entry.target as HTMLElement);
  }
});

/*
 * NOTE: literal colors because mermaid's parser (khroma) cannot read CSS custom
 * properties or `light-dark()`. Border and text mirror brand.css
 * --relab-brand-primary / --relab-brand-text; the surfaces are hand-tuned. If brand.css
 * changes, retune these (no machine link).
 */
const mermaidThemeVariables = {
  light: {
    background: '#f7fbff',
    primaryColor: '#d9f4fb',
    primaryBorderColor: '#1f4c96',
    primaryTextColor: '#16202e',
    lineColor: '#24415b',
    tertiaryColor: '#eef5fb',
    // Without this, mermaid's `base` theme derives a pale yellow-green edge-label
    // background (rgba(244,251,217,.5)). Pinned to the diagram frame's tone.
    edgeLabelBackground: '#eef5fb',
  },
  dark: {
    background: '#0c1724',
    primaryColor: '#13364d',
    primaryBorderColor: '#8fb8ff',
    primaryTextColor: '#e9eff8',
    lineColor: '#b9dcf6',
    tertiaryColor: '#102131',
    // Dark-mode derivation was rgba(54,77,19,.5). Same fix.
    edgeLabelBackground: '#102131',
  },
} as const;

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
  const codeBlocks = document.querySelectorAll('.expressive-code pre[data-language="mermaid"]');

  for (const sourceElement of codeBlocks) {
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
      reportMermaidError(error);
    } finally {
      // Release the reservation: a rendered diagram is usually much shorter than
      // its source block. Cleared even when run() throws, so a failed render
      // leaves the source text rather than a blank reserved box.
      for (const diagram of diagrams) {
        diagram.style.minHeight = '';
        pinDiagramToIntrinsicWidth(diagram);
        // Idempotent per element; re-renders (theme swaps) do not stack observers.
        diagramFrameObserver.observe(diagram);
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

  const themeObserver = new MutationObserver((mutations) => {
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

bindThemeObserver();
renderMermaid().catch(reportMermaidError);
