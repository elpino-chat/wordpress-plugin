<?php
if ( ! defined( 'ABSPATH' ) ) exit;

// Injects the chat widget on the live website. Uses the same tag.js loader
// every other Elpino customer's site embeds (see
// web/app/components/SiteWidgetTag.tsx and the dashboard's own "Install"
// snippet) — it already handles the launcher, resizing, visitor identity
// and everything else, so this plugin doesn't need its own copy.
function elpino_inject_script() {
    $website_id = get_option( 'elpino_website_id' );
    if ( ! $website_id ) return;

    // cdn.elpino.chat proxies to the production app's database — a site
    // created against a local dev server (ELPINO_APP_URL overridden in
    // wp-config.php) doesn't exist there, so fall back to that server's own
    // /tag.js instead. Mirrors SiteWidgetTag.tsx's same dev/prod split.
    $tag_src = ( ELPINO_APP_URL === 'https://elpino.chat' ) ? 'https://cdn.elpino.chat/tag.js' : ( ELPINO_APP_URL . '/tag.js' );
    echo '<script async src="' . esc_url( $tag_src ) . '" data-site-key="' . esc_attr( $website_id ) . '"></script>' . "\n";

    // Identity verification: only ever signs the server's own idea of who is
    // logged in (wp_get_current_user(), inside elpino_identity_token_for_current_user()),
    // never anything from the request. A logged-out visitor, or a site with
    // no secret configured, gets no script at all and chats anonymously —
    // the same fallback every other Elpino integration has.
    $identity_token = elpino_identity_token_for_current_user();
    if ( $identity_token ) {
        echo '<script>window.$elpino = window.$elpino || []; window.$elpino.push(["identify", { token: "' . esc_js( $identity_token ) . '" }]);</script>' . "\n";
    }
}
