<?php
/**
 * Plugin Name: Elpino Chat
 * Plugin URI: https://elpino.chat
 * Description: Add Elpino's AI-powered live chat widget to your WordPress site in one click. Connect your Elpino workspace, and optionally verify logged-in customers' identity — no code required.
 * Version: 1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Author: Elpino
 * Author URI: https://elpino.chat
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: elpino-chat
 *
 * This file only wires things together — the actual logic lives under
 * includes/, and the HTML lives under views/. See README.md for the
 * plugin's folder layout and how the pieces fit together.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'ELPINO_PLUGIN_FILE', __FILE__ );
define( 'ELPINO_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
// Keep in sync with the "Version:" header above — shown on the connect screen.
define( 'ELPINO_PLUGIN_VERSION', '1.0.0' );

// Where the Elpino app itself lives. Override in wp-config.php with
// define('ELPINO_APP_URL', 'http://localhost:3000'); to test against a
// local dev server instead of production.
if ( ! defined( 'ELPINO_APP_URL' ) ) {
    define( 'ELPINO_APP_URL', 'https://elpino.chat' );
}

require_once ELPINO_PLUGIN_DIR . 'includes/cache.php';
require_once ELPINO_PLUGIN_DIR . 'includes/identity.php';
require_once ELPINO_PLUGIN_DIR . 'includes/widget.php';
require_once ELPINO_PLUGIN_DIR . 'includes/settings-page.php';

add_action( 'plugins_loaded', 'elpino_load_textdomain' );
function elpino_load_textdomain() {
    load_plugin_textdomain( 'elpino-chat', false, basename( ELPINO_PLUGIN_DIR ) . '/languages' );
}

// The admin menu entry and its page.
add_action( 'admin_menu', 'elpino_chat_menu' );
function elpino_chat_menu() {
    add_menu_page(
        __( 'Elpino Chat', 'elpino-chat' ),
        __( 'Elpino Chat', 'elpino-chat' ),
        'manage_options',
        'elpino-chat',
        'elpino_settings_page',
        'dashicons-format-chat'
    );
}

// Only load the admin stylesheet on this plugin's own page.
add_action( 'admin_enqueue_scripts', 'elpino_admin_enqueue' );
function elpino_admin_enqueue( $hook ) {
    if ( $hook !== 'toplevel_page_elpino-chat' ) return;
    wp_enqueue_style( 'elpino-chat-admin', plugins_url( 'assets/style.css', ELPINO_PLUGIN_FILE ), array(), '1.0.0' );
}

// WordPress gives every admin page's content area some default padding
// (#wpbody-content) and the .wrap class its own default margin — normally
// exactly what you want, but it's what leaves a gap around our card on the
// left/right/bottom. This marks the <body> so assets/style.css can zero
// just that spacing out for this one page, without touching the sidebar or
// toolbar (unlike the earlier full-bleed attempt, both stay untouched).
add_filter( 'admin_body_class', 'elpino_admin_body_class' );
function elpino_admin_body_class( $classes ) {
    if ( isset( $_GET['page'] ) && $_GET['page'] === 'elpino-chat' ) {
        $classes .= ' elpino-edge-to-edge';
    }
    return $classes;
}

// Land straight on the Elpino Chat page after activation, instead of the
// generic plugins list — the standard WooCommerce/Yoast pattern.
// register_activation_hook() itself must never redirect directly: it also
// fires during bulk-activate and WP-CLI, where a redirect would cut the
// process short. Set a flag here, act on it once from admin_init instead.
register_activation_hook( __FILE__, 'elpino_chat_activate' );
function elpino_chat_activate() {
    add_option( 'elpino_chat_activation_redirect', true );
}

add_action( 'admin_init', 'elpino_chat_activation_redirect' );
function elpino_chat_activation_redirect() {
    if ( ! get_option( 'elpino_chat_activation_redirect', false ) ) return;
    delete_option( 'elpino_chat_activation_redirect' );
    // Skip it for a bulk activation (several plugins at once) or network
    // activation — either would otherwise strand the admin mid-batch on
    // this plugin's page instead of finishing the rest.
    if ( isset( $_GET['activate-multi'] ) || is_network_admin() ) return;
    wp_safe_redirect( admin_url( 'admin.php?page=elpino-chat' ) );
    exit;
}

// The disconnect button's own redirect. Must run this early (admin_init),
// not from inside elpino_settings_page() — by the time that page callback
// runs, WordPress has already sent the admin page's headers, so a real
// redirect from there would just warn and fail. See
// includes/settings-page.php's elpino_handle_disconnect() for the check.
add_action( 'admin_init', 'elpino_handle_disconnect' );

// Inject the widget (and, for a logged-in visitor with identity
// verification configured, the identify() call) on the live site.
add_action( 'wp_footer', 'elpino_inject_script' );
