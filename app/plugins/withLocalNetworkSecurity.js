const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * Scoped cleartext for the RPi camera's local path.
 *
 * Release Android blocks http:// outright, but a paired camera is reached
 * directly at `USB_GADGET_DEFAULT` (192.168.7.1) or on the LAN over plain http.
 * This permits cleartext for those hosts only — never app-wide
 * (`android:usesCleartextTraffic`), which would expose every request.
 *
 * NOTE: Android matches hostnames, not CIDR ranges, so a private range cannot be
 * expressed. Listed: the fixed USB-gadget address, loopback, and mDNS `*.local`
 * names. A camera reached by a manually typed numeric LAN IP still needs its
 * address added below; the upgrade path is mDNS naming on the Pi.
 *
 * The manifest attribute is written into the release variant only: it overrides
 * `usesCleartextTraffic`, and the debug variant needs cleartext for Metro.
 */
const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">192.168.7.1</domain>
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="true">local</domain>
  </domain-config>
</network-security-config>
`;

const RELEASE_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:networkSecurityConfig="@xml/network_security_config" />
</manifest>
`;

async function writeFile(filePath, contents) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, contents, 'utf8');
}

module.exports = function withLocalNetworkSecurity(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const main = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main');
      const release = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'release');
      await writeFile(
        path.join(main, 'res', 'xml', 'network_security_config.xml'),
        NETWORK_SECURITY_CONFIG,
      );
      await writeFile(path.join(release, 'AndroidManifest.xml'), RELEASE_MANIFEST);
      return config;
    },
  ]);
};
