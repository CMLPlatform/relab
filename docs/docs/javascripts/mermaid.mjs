import elkLayouts from 'https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@0/dist/mermaid-layout-elk.esm.min.mjs';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

mermaid.registerLayoutLoaders(elkLayouts);

// Always use 'default' theme; diagrams use hardcoded light fills throughout,
// so dark mode readability is handled via CSS (.mermaid background override)
// rather than switching Mermaid themes, which avoids re-init on palette toggle.
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  layout: 'elk',
  theme: 'default',
});

window.mermaid = mermaid;
