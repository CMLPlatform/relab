// Progressive enhancement for the data-collection flowchart.
//
// Each SVG node ships a <title> — the accessible name and the no-JS hover
// tooltip. When JS runs we lift that text into a styled popover shown on
// hover, keyboard focus, or tap, and remove the <title> so the browser's own
// tooltip (which never fires on touch) doesn't double up. Falls back to the
// native tooltip when this never runs.

function labelOf(node: Element): string {
  return node.querySelector('.nodeLabel')?.textContent?.trim() ?? '';
}

export function initMethodFlow(): void {
  const figure = document.querySelector('.method-flow');
  const popover = document.getElementById('method-flow-popover');
  if (!(figure && popover instanceof HTMLElement && popover.showPopover)) {
    return;
  }

  // Both the wide and narrow SVG variants are in the DOM; only the shown one
  // is interactable (display:none nodes are inert), so wiring all is safe.
  const nodes = figure.querySelectorAll<SVGGElement>('g.node');
  let active: SVGGElement | null = null;

  const place = (node: SVGGElement) => {
    popover.textContent = node.dataset.desc ?? '';
    if (!popover.matches(':popover-open')) {
      popover.showPopover();
    }
    const rect = node.getBoundingClientRect();
    const pop = popover.getBoundingClientRect();
    const centre = rect.left + rect.width / 2;
    const left = Math.max(8, Math.min(centre - pop.width / 2, window.innerWidth - pop.width - 8));
    const above = rect.top - pop.height - 10;
    const top = above < 8 ? rect.bottom + 10 : above;
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    active = node;
  };

  const hide = () => {
    if (popover.matches(':popover-open')) {
      popover.hidePopover();
    }
    active = null;
  };

  let lastPointerType = 'mouse';

  for (const node of nodes) {
    const title = node.querySelector('title');
    const desc = title?.textContent?.trim();
    if (!desc) {
      continue;
    }
    node.dataset.desc = desc;
    title?.remove();
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `${labelOf(node)}: ${desc}`);

    // Mouse reveals on hover; keyboard on focus; touch on tap. The click
    // handler only toggles for touch, so a mouse click (which already hovered)
    // does not immediately dismiss what the hover just opened.
    node.addEventListener('pointerdown', (event) => {
      lastPointerType = event.pointerType;
    });
    node.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse') {
        place(node);
      }
    });
    node.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse') {
        hide();
      }
    });
    node.addEventListener('focus', () => place(node));
    node.addEventListener('blur', () => hide());
    node.addEventListener('click', () => {
      if (lastPointerType === 'mouse') {
        return;
      }
      if (active === node) {
        hide();
      } else {
        place(node);
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hide();
    }
  });
  // A fixed-positioned popover would drift from its node on scroll/resize.
  window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('resize', hide);
}
