// A small hint popover, shared by the method flowchart and the 9R ladder.
//
// Both surfaces want the same thing: a short description attached to a trigger,
// revealed on hover, keyboard focus, or tap. The native `title` attribute is
// not enough, because it never fires on touch and cannot be styled. This owns
// the placement, open/close and reposition logic so the two callers cannot
// drift apart, and so a fix here fixes both.

export interface HintPopover {
  /** Show `text` anchored to `trigger`, above it when there is room. */
  place: (trigger: Element, text: string) => void;
  hide: () => void;
  isActive: (trigger: Element) => boolean;
}

/**
 * Wrap a `popover="manual"` element. Returns null when the browser has no
 * Popover API, which is the caller's signal to leave the no-JS fallback alone.
 */
export function createHintPopover(popover: HTMLElement | null): HintPopover | null {
  if (!(popover instanceof HTMLElement && popover.showPopover)) {
    return null;
  }

  let active: Element | null = null;

  const place = (trigger: Element, text: string): void => {
    popover.textContent = text;
    if (!popover.matches(':popover-open')) {
      popover.showPopover();
    }
    const rect = trigger.getBoundingClientRect();
    const pop = popover.getBoundingClientRect();
    const centre = rect.left + rect.width / 2;
    const left = Math.max(8, Math.min(centre - pop.width / 2, window.innerWidth - pop.width - 8));
    const above = rect.top - pop.height - 10;
    // Flip below when the trigger sits too near the top of the viewport.
    const top = above < 8 ? rect.bottom + 10 : above;
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    active = trigger;
  };

  const hide = (): void => {
    if (popover.matches(':popover-open')) {
      popover.hidePopover();
    }
    active = null;
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hide();
    }
  });

  // A fixed-positioned popover drifts from its trigger on scroll/resize, so it
  // is re-placed rather than dismissed. Dismissing looks equivalent but is not:
  // tabbing to an off-screen trigger scrolls it into view, and the scroll event
  // that follows would close the popover the focus event had just opened.
  const reposition = (): void => {
    if (active) {
      place(active, popover.textContent ?? '');
    }
  };
  window.addEventListener('scroll', reposition, { passive: true });
  window.addEventListener('resize', reposition);

  return { place, hide, isActive: (trigger) => active === trigger };
}

/**
 * Wire one trigger to the popover.
 *
 * Mouse reveals on hover; keyboard focus on tab; touch toggles on tap.
 * pointerdown-driven focus (touch, and mouse click) is NOT keyboard focus, so
 * it must not open the popover itself; otherwise a tap's focus event opens it
 * and the click event right after immediately closes it again (tap-to-open
 * would need two taps). Gating on :focus-visible leaves pointer-triggered
 * opening to pointerenter (mouse) and click (touch).
 */
export function wireHintTrigger(trigger: Element, text: string, hint: HintPopover): void {
  let lastPointerType = 'mouse';

  trigger.addEventListener('pointerdown', (event) => {
    lastPointerType = (event as PointerEvent).pointerType;
  });
  trigger.addEventListener('pointerenter', (event) => {
    if ((event as PointerEvent).pointerType === 'mouse') {
      hint.place(trigger, text);
    }
  });
  trigger.addEventListener('pointerleave', (event) => {
    if ((event as PointerEvent).pointerType === 'mouse') {
      hint.hide();
    }
  });
  trigger.addEventListener('focus', () => {
    if (trigger.matches(':focus-visible')) {
      hint.place(trigger, text);
    }
  });
  trigger.addEventListener('blur', () => hint.hide());
  trigger.addEventListener('click', () => {
    if (lastPointerType === 'mouse') {
      return;
    }
    if (hint.isActive(trigger)) {
      hint.hide();
    } else {
      hint.place(trigger, text);
    }
  });
}
