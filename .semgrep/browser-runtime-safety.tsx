// ruleid: relab.browser-runtime-safety.dom-html-sink
document.body.innerHTML = '<p>unsafe</p>';

// ruleid: relab.browser-runtime-safety.dom-html-sink
document.body.insertAdjacentHTML('beforeend', '<p>unsafe</p>');

// ok: relab.browser-runtime-safety.dom-html-sink
document.body.append(document.createElement('p'));

function UnsafeWebView() {
  return (
    // ruleid: relab.browser-runtime-safety.webview-unsafe-origin
    <WebView originWhitelist={['*']} source={{ uri: 'https://example.com' }} />
  );
}

function PlaintextWebView() {
  return (
    // ruleid: relab.browser-runtime-safety.webview-unsafe-origin
    <WebView originWhitelist={['http://example.com']} source={{ uri: 'http://example.com' }} />
  );
}

function ReviewedWebView() {
  return (
    // ok: relab.browser-runtime-safety.webview-unsafe-origin
    <WebView
      originWhitelist={['https://www.youtube-nocookie.com']}
      source={{ uri: 'https://www.youtube-nocookie.com/embed/example' }}
    />
  );
}

// ruleid: relab.browser-runtime-safety.webview-new-usage
const { WebView: ImportedWebView } = require('react-native-webview');
