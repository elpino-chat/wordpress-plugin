# Elpino Chat — WordPress plugin

Connects a WordPress site to [Elpino](https://elpino.chat)'s AI-powered live
chat: one click to link a workspace, and the widget shows up on the live
site. Optionally verifies logged-in WordPress users' identity, so the AI can
look up their own account instead of chatting with them as a stranger.

## Folder layout

```
elpino-chat.php              Bootstrap only: constants, hooks, requires.
                              No HTML, no business logic — if you're adding
                              either, it almost certainly belongs elsewhere.

includes/
  settings-page.php           The "Elpino Chat" admin page: handles the
                               connect/disconnect callbacks, then includes a
                               view for the markup.
  identity.php                Identity verification: the HS256 JWT signer
                               and the WordPress-user-to-token mapping.
  widget.php                  Injects the widget (tag.js) and identify()
                               call on wp_footer, for the live site.
  cache.php                   Best-effort page-cache-plugin flush after
                               connecting.

views/
  connect.php                 "Not connected yet" screen.
  connected.php                Connected dashboard (Inbox/Settings links,
                               disconnect).
  identity-settings.php        The identity verification form.

assets/
  style.css                    All admin-page styling. Views only ever use
                               classes from here — no inline styles.
  icon.png                     Plugin icon (shown on its own settings page
                               and used for the wordpress.org listing).
```

## Local development

Point the plugin at a local Elpino dev server instead of production by
adding this to `wp-config.php`, above the `require_once ABSPATH .
'wp-settings.php';` line:

```php
define('ELPINO_APP_URL', 'http://localhost:3000');
```

With that set, the widget loader also automatically falls back to the dev
server's own `/tag.js` instead of production's CDN (`cdn.elpino.chat`),
since a site created against a local database wouldn't exist in
production's.

## Design notes / why things are the way they are

- **Connect flow is nonce-signed.** The `return_url` handed to
  `/connect/wordpress` carries a WordPress nonce (`elpino_connect`); the
  callback in `settings-page.php` refuses to accept `?elpino_website_id=`
  without it. Prevents an admin being tricked into clicking a crafted link
  that repoints their widget. Same protection the official Crisp WordPress
  plugin uses for its own callback.
- **The disconnect redirect runs on `admin_init`, not inside the page
  callback.** By the time `elpino_settings_page()` renders, WordPress has
  already sent the admin page's headers — a real `wp_safe_redirect()` from
  there would just warn and fail silently.
- **No Composer dependency for JWT signing.** `identity.php` hand-rolls the
  HS256 JWT (header/payload/HMAC, base64url) instead of requiring
  `firebase/php-jwt`, since a WordPress plugin can't assume `composer
  install` has ever run on the host. It produces the exact same token shape
  as the Node.js SDK (`web/public/sdk/elpino-server.mjs`).
- **The widget itself is the same `tag.js` every other Elpino customer
  embeds** (see `web/app/components/SiteWidgetTag.tsx`), not a bespoke
  loader — it already handles resizing, the launcher, and visitor identity,
  so this plugin doesn't carry its own copy to keep in sync.

## Publishing to wordpress.org

Not done yet. Needs: a `languages/` `.pot` file (run `wp i18n make-pot .` or
similar once there's a working WP-CLI environment), the `assets/` banner and
screenshot images the *wordpress.org listing* uses (separate from the
in-plugin `assets/icon.png` above — those live in the SVN `assets/` at the
repo root, not inside the plugin zip), and a developer account + SVN
submission through <https://wordpress.org/plugins/developers/add/>.
