<?php
/**
 * Plugin Name:       Elpino Chat
 * Description:       Adds the Elpino AI chat widget to your site and, with WooCommerce, lets it answer order questions.
 * Version:           1.2.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Elpino
 * License:           GPL-2.0-or-later
 * Text Domain:       elpino-chat
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Overridable in wp-config.php for staging/local installs.
if ( ! defined( 'ELPINO_APP_URL' ) ) {
	define( 'ELPINO_APP_URL', 'https://elpino.chat' );
}
if ( ! defined( 'ELPINO_TAG_URL' ) ) {
	define( 'ELPINO_TAG_URL', 'https://cdn.elpino.chat/tag.js' );
}

const ELPINO_OPTION_SITE_KEY = 'elpino_chat_site_key';
const ELPINO_PAGE_SLUG       = 'elpino-chat';

/** A stored site key is only ever the public widget key; anything else is dropped. */
function elpino_chat_clean_key( $value ) {
	$value = is_string( $value ) ? trim( $value ) : '';
	return preg_match( '/^rz_site_[A-Za-z0-9]{8,64}$/', $value ) ? $value : '';
}

function elpino_chat_settings_url( array $args = array() ) {
	return add_query_arg( array_merge( array( 'page' => ELPINO_PAGE_SLUG ), $args ), admin_url( 'admin.php' ) );
}


function elpino_chat_identity_ready() {
    return defined( 'ELPINO_IDENTITY_SECRET' ) && is_string( ELPINO_IDENTITY_SECRET ) && preg_match( '/^elid_[A-Za-z0-9_-]{32,128}$/', ELPINO_IDENTITY_SECRET );
}

add_action( 'admin_post_elpino_identity', function () {
    if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Forbidden', '', array( 'response' => 403 ) ); }
    check_admin_referer( 'elpino_identity' );
    update_option( 'elpino_chat_identity_enabled', isset( $_POST['enabled'] ) && elpino_chat_identity_ready() ? 1 : 0 );
    wp_safe_redirect( elpino_chat_settings_url() );
    exit;
} );

add_action( 'wp_ajax_elpino_identity', function () {
    nocache_headers();
    if ( ! get_option( 'elpino_chat_identity_enabled' ) || ! elpino_chat_identity_ready() || ! is_user_logged_in() || ! elpino_chat_clean_key( get_option( ELPINO_OPTION_SITE_KEY, '' ) ) ) {
        wp_send_json( array( 'token' => null ) );
    }
    $user = wp_get_current_user();
    $encode = function ( $value ) { return rtrim( strtr( base64_encode( $value ), '+/', '-_' ), '=' ); };
    $now = time();
    // WordPress login verifies the account, but core does not attest email ownership.
    $claims = array( 'sub' => ( class_exists( 'WooCommerce' ) ? 'woocommerce:' : 'wordpress:' ) . $encode( untrailingslashit( home_url() ) ) . ':' . $user->ID, 'name' => $user->display_name, 'aud' => 'elpino-widget', 'iat' => $now, 'exp' => $now + 240, 'jti' => bin2hex( random_bytes( 16 ) ) );
    $payload = $encode( wp_json_encode( array( 'alg' => 'HS256', 'typ' => 'JWT' ) ) ) . '.' . $encode( wp_json_encode( $claims ) );
    wp_send_json( array( 'token' => $payload . '.' . $encode( hash_hmac( 'sha256', $payload, ELPINO_IDENTITY_SECRET, true ) ) ) );
} );
add_action( 'wp_ajax_nopriv_elpino_identity', function () { nocache_headers(); wp_send_json( array( 'token' => null ) ); } );

// ---- The widget ----------------------------------------------------------

add_action( 'wp_enqueue_scripts', function () {
	$key = elpino_chat_clean_key( get_option( ELPINO_OPTION_SITE_KEY, '' ) );
	if ( '' === $key ) {
		return;
	}
	// Version-less on purpose: tag.js is served from Elpino's CDN and updates itself.
	wp_enqueue_script( 'elpino-chat', ELPINO_TAG_URL, array(), null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
    if ( get_option( 'elpino_chat_identity_enabled' ) && elpino_chat_identity_ready() ) {
        $endpoint = wp_json_encode( admin_url( 'admin-ajax.php?action=elpino_identity', 'relative' ) );
        wp_add_inline_script( 'elpino-chat', 'window.ElpinoSettings = Object.assign({}, window.ElpinoSettings, {getIdentityToken: async function(){ var r = await fetch(' . $endpoint . ', {credentials: "same-origin", cache: "no-store"}); if (!r.ok) return null; var data = await r.json(); return data.token || null; }});', 'before' );
    }

} );

// Add attributes to WordPress's enqueued script instead of rebuilding its tag.
add_filter( 'wp_script_attributes', function ( $attributes ) {
    if ( isset( $attributes['id'] ) && 'elpino-chat-js' === $attributes['id'] ) {
        $attributes['data-site-key'] = elpino_chat_clean_key( get_option( ELPINO_OPTION_SITE_KEY, '' ) );
        $attributes['async'] = true;
    }
    return $attributes;
} );

// ---- Connect / disconnect ------------------------------------------------

add_action( 'admin_menu', function () {
	add_menu_page(
		__( 'Elpino Chat', 'elpino-chat' ),
		__( 'Elpino', 'elpino-chat' ),
		'manage_options',
		ELPINO_PAGE_SLUG,
		'elpino_chat_render_page',
		plugins_url( 'assets/elpino-logo.svg', __FILE__ ),
		58
	);
} );

add_action( 'admin_head', function () {
	?>
	<style>
		#adminmenu #toplevel_page_elpino-chat .wp-menu-image {
			display: flex;
			align-items: center;
			justify-content: center;
		}
		#adminmenu #toplevel_page_elpino-chat .wp-menu-image img {
			width: 20px;
			height: 20px;
			max-width: 20px;
			max-height: 20px;
			padding: 0;
			object-fit: contain;
		}
	</style>
	<?php
} );

add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), function ( $links ) {
	array_unshift( $links, '<a href="' . esc_url( elpino_chat_settings_url() ) . '">' . esc_html__( 'Settings', 'elpino-chat' ) . '</a>' );
	return $links;
} );

/**
 * Elpino's /connect/wordpress page sends the admin back to return_url with
 * &elpino_website_id=<public key> added. return_url carries a nonce we made, so a
 * link someone else crafted can't change this site's widget.
 */
add_action( 'admin_init', function () {
	if ( ! isset( $_GET['page'] ) || ELPINO_PAGE_SLUG !== $_GET['page'] ) { // phpcs:ignore WordPress.Security.NonceVerification
		return;
	}

	if ( isset( $_GET['elpino_website_id'] ) ) {
		if ( ! current_user_can( 'manage_options' ) || ! isset( $_GET['_wpnonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ), 'elpino_connect' ) ) {
			wp_die( esc_html__( 'This connect link has expired. Go back to Elpino Chat settings and try again.', 'elpino-chat' ), '', array( 'response' => 403 ) );
		}
		$key = elpino_chat_clean_key( sanitize_text_field( wp_unslash( $_GET['elpino_website_id'] ) ) );
		if ( '' === $key ) {
			wp_safe_redirect( elpino_chat_settings_url( array( 'elpino_status' => 'invalid' ) ) );
			exit;
		}
		update_option( ELPINO_OPTION_SITE_KEY, $key );
		wp_safe_redirect( elpino_chat_settings_url( array( 'elpino_status' => 'connected' ) ) );
		exit;
	}

	if ( isset( $_GET['elpino_disconnect'] ) ) {
		if ( ! current_user_can( 'manage_options' ) || ! isset( $_GET['_wpnonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ), 'elpino_disconnect' ) ) {
			wp_die( esc_html__( 'This link has expired. Go back and try again.', 'elpino-chat' ), '', array( 'response' => 403 ) );
		}
		delete_option( ELPINO_OPTION_SITE_KEY );
        delete_option( 'elpino_chat_identity_enabled' );
		wp_safe_redirect( elpino_chat_settings_url( array( 'elpino_status' => 'disconnected' ) ) );
		exit;
	}
} );

function elpino_chat_render_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$key       = elpino_chat_clean_key( get_option( ELPINO_OPTION_SITE_KEY, '' ) );
	$connected = '' !== $key;
	$status    = isset( $_GET['elpino_status'] ) ? sanitize_key( wp_unslash( $_GET['elpino_status'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification

	$connect_url = add_query_arg(
		array(
			// Encode nested URLs so the callback nonce stays inside return_url.
			'return_url' => rawurlencode( add_query_arg( '_wpnonce', wp_create_nonce( 'elpino_connect' ), elpino_chat_settings_url() ) ),
			'site_url'   => rawurlencode( home_url() ),
		),
		trailingslashit( ELPINO_APP_URL ) . 'connect/wordpress'
	);
	$disconnect_url = wp_nonce_url( elpino_chat_settings_url( array( 'elpino_disconnect' => 1 ) ), 'elpino_disconnect' );
	$woo_url        = add_query_arg( 'siteUrl', rawurlencode( home_url() ), trailingslashit( ELPINO_APP_URL ) . 'api/woocommerce/start' );
    $identity_ready = elpino_chat_identity_ready();
    $identity_enabled = $identity_ready && get_option( 'elpino_chat_identity_enabled' );
    $app = trailingslashit( ELPINO_APP_URL );
    ?>
    <style>
        .elpino-console { max-width: 1050px; margin: 28px 20px 0 0; color: #202824; }
        .elpino-console * { box-sizing: border-box; }
        .elpino-console header { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:28px; }
        .elpino-console header img { width:145px; height:auto; }
        .elpino-console h1 { font-size:28px; font-weight:600; padding:0; margin:0 0 10px; }
        .elpino-console h2 { font-size:18px; margin:0 0 10px; }
        .elpino-console p { color:#626c66; font-size:14px; line-height:1.7; }
        .elpino-console .elpino-panel { background:#fff; border:1px solid #dde3df; border-radius:16px; padding:28px; margin-bottom:20px; }
        .elpino-console .elpino-connection { border-top:4px solid #32765b; }
        .elpino-console .elpino-row { display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap; }
        .elpino-console .elpino-badge { border-radius:20px; background:#edf5ef; color:#286044; padding:6px 12px; font-size:13px; }
        .elpino-console .elpino-actions { display:flex; flex-wrap:wrap; gap:12px; margin-top:22px; align-items:center; }
        .elpino-console .button { border-radius:8px; padding:0 12px; font-size:14px; }
        .elpino-console .button-primary { background:#32765b; border-color:#32765b; }
        .elpino-console .button-primary:hover { background:#255c46; border-color:#255c46; }
        .elpino-console .elpino-connect { font-size:18px; font-weight:600; padding:0 14px; }
        .elpino-console .elpino-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
        .elpino-console .elpino-muted { color:#626c66; font-size:13px; }
        .elpino-console code { overflow-wrap:anywhere; display:block; padding:12px; margin:12px 0; }
        .elpino-console .elpino-danger { color:#b32d2e; }
        @media(max-width:700px) { .elpino-console .elpino-grid { grid-template-columns:1fr; } .elpino-console .elpino-panel { padding:20px; } }
    </style>
    <div class="wrap elpino-console">
        <header><img src="<?php echo esc_url( plugins_url( 'assets/elpino-wordmark.png', __FILE__ ) ); ?>" alt="Elpino" /><a href="<?php echo esc_url( admin_url() ); ?>">Back to WordPress</a></header>
        <h1>Elpino for WordPress</h1>
        <p>Connect your website. Manage your widget, identity, and conversations in one place.</p>
        <section class="elpino-panel elpino-connection">
            <div class="elpino-row"><h2>Your website</h2><span class="elpino-badge"><?php echo $connected ? 'Connected' : 'Not connected'; ?></span></div>
            <p><?php echo esc_html( home_url() ); ?></p>
            <?php if ( $connected ) : ?>
                <p>Your widget connection is saved. Open your website to check that the widget loads.</p>
                <div class="elpino-actions"><a class="button" href="<?php echo esc_url( home_url() ); ?>" target="_blank" rel="noopener">View website</a><a class="elpino-danger" href="<?php echo esc_url( $disconnect_url ); ?>">Disconnect Elpino</a></div>
            <?php else : ?>
                <p>Sign in and choose your Elpino workspace. We’ll bring you back here to finish.</p>
                <a class="button button-primary elpino-connect" href="<?php echo esc_url( $connect_url ); ?>">Connect to Elpino</a>
            <?php endif; ?>
        </section>
        <?php if ( $connected ) : ?>
        <div class="elpino-grid">
            <section class="elpino-panel"><h2>Customize your widget</h2><p>Change the appearance, name, and chat experience in your Elpino workspace.</p><a class="button" href="<?php echo esc_url( $app . 'dashboard/settings/chatbot' ); ?>" target="_blank" rel="noopener">Customize in Elpino ↗</a></section>
            <section class="elpino-panel"><h2>Your inbox</h2><p>Read conversations, reply to visitors, and work alongside your AI agent.</p><a class="button" href="<?php echo esc_url( $app . 'dashboard/inbox' ); ?>" target="_blank" rel="noopener">Open inbox ↗</a></section>
        </div>
        <section class="elpino-panel">
            <div class="elpino-row"><h2>Identity verification</h2><span class="elpino-badge"><?php echo $identity_enabled ? 'Enabled' : 'Disabled'; ?></span></div>
            <p>Recognize signed-in WordPress users using a server-signed identity. Visitors who aren’t signed in continue as guests. No email or OTP request in chat.</p>
            <?php if ( ! $identity_ready ) : ?>
                <p>Copy your workspace identity secret from Elpino and add it to your server’s <strong>wp-config.php</strong> before the “stop editing” line:</p>
                <code>define( 'ELPINO_IDENTITY_SECRET', 'your-workspace-identity-secret' );</code>
                <p class="elpino-muted">Keep this secret on your server. WordPress login verifies the account; email ownership is not asserted by this plugin.</p>
            <?php endif; ?>
            <div class="elpino-actions">
                <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
                    <input type="hidden" name="action" value="elpino_identity" />
                    <?php wp_nonce_field( 'elpino_identity' ); ?>
                    <?php if ( ! $identity_enabled ) : ?><input type="hidden" name="enabled" value="1" /><?php endif; ?>
                    <button class="button button-primary" type="submit" <?php disabled( ! $identity_ready || ! $connected ); ?>><?php echo $identity_enabled ? 'Disable identity verification' : 'Enable identity verification'; ?></button>
                </form>
                <a href="<?php echo esc_url( $app . 'dashboard/settings/identity' ); ?>" target="_blank" rel="noopener">Identity settings in Elpino ↗</a>
            </div>
        </section>
        <?php if ( class_exists( 'WooCommerce' ) ) : ?>
            <section class="elpino-panel"><h2>WooCommerce order support</h2><p>Connect your store and enable identity verification above. Signed-in customers can ask about orders belonging to their WooCommerce account.</p><p class="elpino-muted">Guest orders require your support team. Order changes also require permission in your Elpino workspace.</p><a class="button" href="<?php echo esc_url( $woo_url ); ?>">Connect WooCommerce</a><p><a href="<?php echo esc_url( $app . 'dashboard/settings/setup-integration' ); ?>" target="_blank" rel="noopener">Manage store connection in Elpino ↗</a></p></section>
        <?php endif; ?>
        <?php else : ?>
            <section class="elpino-panel">
                <h2>What you get with Elpino</h2>
                <p>Connect your workspace to bring customer support to your WordPress website.</p>
                <div class="elpino-grid">
                    <div><h3>AI support on your website</h3><p>Help visitors find answers from your knowledge base through a chat widget.</p></div>
                    <div><h3>A widget that feels like your brand</h3><p>Customize the appearance, name, and chat experience in Elpino.</p></div>
                    <div><h3>One inbox for your team</h3><p>Read conversations, reply to visitors, and take over when they need a person.</p></div>
                    <div><h3>Recognize signed-in customers</h3><p>Optionally enable signed WordPress identity after connecting. Guests can still chat without signing in.</p></div>
                </div>
                <p class="elpino-muted">After connecting, you’ll find links to your inbox, widget customization, and identity setup here.</p>
            </section>
        <?php endif; ?>
    </div>
    <?php
}
