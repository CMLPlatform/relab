// Progressive enhancement for the data-collection flowchart.
//
// Each SVG node ships a <title>: the accessible name and the no-JS hover
// tooltip. When JS runs we lift that text into a styled popover shown on
// hover, keyboard focus, or tap, and remove the <title> so the browser's own
// tooltip (which never fires on touch) doesn't double up. Falls back to the
// native tooltip when this never runs.
//
// Placement, dismissal and repositioning live in popover-hint.ts, shared with
// the 9R ladder; this file owns only what is specific to the SVG nodes.

import { createHintPopover, wireHintTrigger } from '@/scripts/popover-hint.ts';

function labelOf(node: Element): string {
  return node.querySelector('.nodeLabel')?.textContent?.trim() ?? '';
}

export function initMethodFlow(): void {
  const figure = document.querySelector('.method-flow');
  const hint = createHintPopover(document.getElementById('method-flow-popover'));
  if (!(figure && hint)) {
    return;
  }

  // Both the wide and narrow SVG variants are in the DOM; only the shown one
  // is interactable (display:none nodes are inert), so wiring all is safe.
  for (const node of figure.querySelectorAll<SVGGElement>('g.node')) {
    const title = node.querySelector('title');
    const desc = title?.textContent?.trim();
    if (!desc) {
      continue;
    }
    node.dataset.desc = desc;
    title?.remove();
    node.setAttribute('tabindex', '0');
    // No role="button": these nodes have no Enter/Space activation (focus alone
    // opens the popover), so the ARIA button pattern doesn't apply. tabindex
    // plus the full aria-label below is enough to expose them.
    node.setAttribute('aria-label', `${labelOf(node)}: ${desc}`);
    wireHintTrigger(node, desc, hint);
  }
}
