=== Elpino Chat ===
Contributors: elpino
Tags: live chat, chatbot, ai chat, customer support, helpdesk
Requires at least: 5.8
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add Elpino's AI-powered live chat widget to your WordPress site in one click. No coding required.

== Description ==

Elpino Chat connects your WordPress site to your [Elpino](https://elpino.chat) workspace so its AI support agent can answer your visitors instantly, and hand off to your team when it can't.

* **One-click connect.** Log in to Elpino, pick or create a site, and the widget is live — no snippets to copy or paste.
* **AI that answers from your own knowledge.** Elpino only answers from the sources you've given it, and offers a human when it can't.
* **Identity verification.** Optionally tell Elpino who your logged-in WordPress users are, so the AI can safely look up their own account instead of chatting with them as a stranger.
* **Your team's inbox, right from wp-admin.** One click through to your Elpino inbox and widget settings.

= How it works =

1. Activate the plugin and click "Connect to Elpino" from its settings page.
2. Log in to (or sign up for) Elpino, and pick which site you're connecting.
3. That's it — the chat widget appears on your site immediately.

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/elpino-chat`, or install it through the WordPress plugins screen directly.
2. Activate the plugin through the "Plugins" screen.
3. Go to the new "Elpino Chat" menu item and click "Connect to Elpino".

== Frequently Asked Questions ==

= Do I need an Elpino account? =

Yes — this plugin connects an existing (or brand-new) Elpino workspace to your WordPress site. You can create one for free during the connect step.

= Does this slow down my site? =

The widget loads asynchronously and only after your page has otherwise finished loading, so it doesn't block your site's own render.

= Can I verify who my logged-in customers are? =

Yes. Once connected, an optional "Identity verification" section lets you paste a secret from your Elpino dashboard. Logged-in WordPress visitors are then automatically signed for the AI, by name and email.

= Is my data safe? =

The plugin only ever sends your site's own logged-in users' name/email (only if you turn on identity verification) and the page they're viewing. It never sends anything else about your site or its content.

== Screenshots ==

1. Connect your site in one click.
2. Manage your connection from wp-admin.

== Changelog ==

= 1.0.0 =
* Initial release: one-click connect, live widget embed, and optional identity verification for logged-in WordPress users.
