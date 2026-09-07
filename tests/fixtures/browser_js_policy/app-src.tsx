// ruleid: dom-html-sink
document.body.innerHTML = '<p>unsafe</p>';

// ruleid: dom-html-sink
document.body.insertAdjacentHTML('beforeend', '<p>unsafe</p>');

// ruleid: dom-html-sink
document.body.setHTMLUnsafe('<p>unsafe</p>');

// ruleid: dom-html-sink
const Unsafe = () => <div dangerouslySetInnerHTML={{ __html: '<p>unsafe</p>' }} />;

// ok: dom-html-sink
document.body.append(document.createElement('p'));

function UnsafeWebView() {
  return (
    // ruleid: webview-unsafe-origin
    <WebView originWhitelist={['*']} source={{ uri: 'https://example.com' }} />
  );
}

function PlaintextWebView() {
  return (
    // ruleid: webview-unsafe-origin
    <WebView originWhitelist={['http://example.com']} source={{ uri: 'http://example.com' }} />
  );
}

function ReviewedWebView() {
  return (
    // ok: webview-unsafe-origin
    <WebView
      originWhitelist={['https://www.youtube-nocookie.com']}
      source={{ uri: 'https://www.youtube-nocookie.com/embed/example' }}
    />
  );
}

// ruleid: webview-new-usage
const { WebView: ImportedWebView } = require('react-native-webview');

// ruleid: webview-new-usage
import { WebView } from 'react-native-webview';
