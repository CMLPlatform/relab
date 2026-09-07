// ruleid: remote-module-import
import "https://modules.example.com/widget.js";

// ruleid: remote-module-import
const widget = await import("https://modules.example.com/widget.js");

// ok: remote-module-import
import { initThemeControl } from "@/scripts/theme.ts";

// ruleid: cdn-runtime-reference
const scriptOrigin = "https://cdn.jsdelivr.net/npm/example";

// ok: cdn-runtime-reference
const badgeUrl = "https://img.shields.io/codecov/c/github/CMLPlatform/relab";
