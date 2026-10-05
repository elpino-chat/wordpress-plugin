=== Elpino Chat ===
Contributors: elpino
Tags: chat, ai, support, woocommerce, live chat
Requires at least: 5.8
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add the Elpino AI chat widget to your site, and let it answer WooCommerce order questions.

== Description ==

Connect your site to Elpino in one click and the chat widget appears on every page. With WooCommerce installed, approve one screen and the AI can look up order status and tracking for verified customers; there are no API keys to copy.

This plugin loads a script from Elpino's servers (cdn.elpino.chat) on your public pages, and sends visitors' chat messages to Elpino. See https://elpino.chat/privacy.

== Installation ==

1. Upload the plugin and activate it.
2. Go to Elpino in the admin sidebar and choose Connect to Elpino.
3. Sign in to Elpino. You'll be returned here with the widget live.

== Signed identity and WooCommerce ==

The plugin works on WordPress with or without WooCommerce. To recognize signed-in users, configure ELPINO_IDENTITY_SECRET in wp-config.php with your workspace secret and enable Identity verification in the Elpino menu. Keep the secret on the server.

With WooCommerce installed, use Connect WooCommerce to authorize the store connection. Signed-in customers can access orders belonging to their account ID. Login does not attest email ownership. Guest orders are not exposed through this account lookup. Order actions also require the workspace owner's permission setting.

== Changelog ==

= 1.2.0 =
* Support signed WooCommerce customer account IDs for store-scoped order lookup.
* Clarify WordPress and WooCommerce setup and management.


= 1.1.2 =
* Use WordPress script attributes for the enqueued widget loader.
* Sanitize the connection callback key before validation.
* Update compatibility metadata for WordPress 7.1.

= 1.1.1 =
* Show benefits before connection and management controls after connection.
* Remove extra vertical padding from action buttons.

= 1.1.0 =
* Simplify the connection dashboard and link directly to widget and inbox settings.
* Add optional signed WordPress account identity using a server-side secret.

= 1.0.6 =
* Enlarge the connect button text and show a chat widget preview.

= 1.0.5 =
* Add a guided setup layout with progress steps and an Elpino inbox preview.

= 1.0.4 =
* Redesign the connection page with Elpino branding and clear connection status.
* Preserve the verification nonce in connection links.

= 1.0.3 =
* Constrain and center the sidebar logo to prevent overflow.

= 1.0.2 =
* Use the Elpino logo in the admin sidebar.

= 1.0.1 =
* Give Elpino its own admin sidebar menu with a chat icon.

= 1.0.0 =
* First release.
