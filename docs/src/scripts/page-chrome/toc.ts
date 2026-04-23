const tocStateKey = 'relab-docs-toc-collapsed';
const tocChevronPath =
  'm14.83 11.29-4.24-4.24a1 1 0 1 0-1.42 1.41L12.71 12l-3.54 3.54a1 1 0 0 0 0 1.41 1 1 0 0 0 .71.29 1 1 0 0 0 .71-.29l4.24-4.24a1.002 1.002 0 0 0 0-1.42Z';

export const initTocChrome = () => {
  const panel = document.querySelector('.right-sidebar-panel');
  const container = panel?.querySelector('.sl-container');
  const toc = panel?.querySelector('starlight-toc');
  if (
    !(
      panel instanceof HTMLElement &&
      container instanceof HTMLElement &&
      toc instanceof HTMLElement
    )
  ) {
    return;
  }

  let toggle = container.querySelector<HTMLButtonElement>('.relab-toc-toggle');
  if (!(toggle instanceof HTMLButtonElement)) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'relab-toc-toggle';
    const label = document.createElement('span');
    label.textContent = 'On this page';

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'currentColor');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', tocChevronPath);
    icon.append(path);

    toggle.append(label, icon);
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
