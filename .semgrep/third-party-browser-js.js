// ruleid: relab.third-party-browser-js.remote-module-import
import "https://modules.example.com/widget.js";

// ruleid: relab.third-party-browser-js.remote-module-import
const widget = await import("https://modules.example.com/widget.js");

// ok: relab.third-party-browser-js.remote-module-import
import { initThemeControl } from "@/scripts/theme.ts";

// ruleid: relab.third-party-browser-js.cdn-runtime-reference
const scriptOrigin = "https://cdn.jsdelivr.net/npm/example";

// ok: relab.third-party-browser-js.cdn-runtime-reference
const badgeUrl = "https://img.shields.io/codecov/c/github/CMLPlatform/relab";
