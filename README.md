# Elpino Chat for WordPress and WooCommerce

Adds the Elpino chat widget to WordPress. WooCommerce stores can connect order support, with signed-in customer account identity.

## Install

Download `elpino-chat.zip` from this repository’s GitHub Releases. In WordPress, use Plugins → Add New → Upload Plugin, then activate. Open **Elpino** in the admin sidebar to connect your workspace.

## Identity

Copy your workspace identity secret from Elpino Settings → Identity Verification. Add it to your server’s `wp-config.php` before the stop-editing line:

```php
define('ELPINO_IDENTITY_SECRET', 'your-workspace-identity-secret');
```

Enable identity verification in the Elpino plugin page. Secrets stay on the server. The plugin obtains short-lived signed identities through an authenticated WordPress AJAX endpoint; it does not verify email ownership or request chat OTPs.

## WooCommerce

Install WooCommerce, connect the store through **Connect WooCommerce**, and enable identity verification. Version 1.2.0 requires the Elpino backend update supporting signed WooCommerce account subjects. Orders are scoped to the signed store URL and customer ID; guest orders require support assistance. Order changes require the workspace owner’s permission setting.

## Build the ZIP

```bash
python3 scripts/build-zip.py
```

The installable artifact is `dist/elpino-chat.zip`. ZIP files are attached to GitHub Releases rather than committed to source control.

## WordPress.org

Version 1.1.2 was submitted for review. Version 1.2.0 is a separate prerelease pending backend deployment, WooCommerce integration testing, and Plugin Check. Publishing here does not update the WordPress.org submission.

See `readme.txt` for compatibility and release history. License: GPLv2 or later.
