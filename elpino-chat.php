<?php
/**
 * Plugin Name:       Elpino Chat
 * Plugin URI:        https://elpino.io
 * Description:       Integrates the Elpino live-chat widget into WordPress.
 *                    Renders the Elpino dashboard inside an admin iframe,
 *                    persists credentials via AJAX, and injects the chat
 *                    script (with WooCommerce JWT identity) in wp_footer.
 * Version:           2.1.0
 * Requires at least: 5.9
 * Requires PHP:      8.0
 * Author:            Elpino Team
 * Author URI:        https://elpino.io
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       elpino-chat
 */

declare(strict_types=1);

// ── Safety guard ──────────────────────────────────────────────────────────────
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// ── Constants ─────────────────────────────────────────────────────────────────

define( 'ELPINO_VERSION',    '2.1.0' );
define( 'ELPINO_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'ELPINO_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

/**
 * The Next.js dashboard URL rendered inside the admin iframe.
 * Override in wp-config.php:
 *   define( 'ELPINO_DASHBOARD_URL', 'https://your-app.vercel.app/plugin/wordpress' );
 */
if ( ! defined( 'ELPINO_DASHBOARD_URL' ) ) {
    define( 'ELPINO_DASHBOARD_URL', 'https://your-elpino-app.vercel.app/plugin/wordpress' );
}

// ── Autoloads ─────────────────────────────────────────────────────────────────
require_once ELPINO_PLUGIN_DIR . 'includes/class-elpino-jwt.php';
require_once ELPINO_PLUGIN_DIR . 'includes/elpino-woocommerce.php';

// ── Hooks ─────────────────────────────────────────────────────────────────────
add_action( 'admin_menu',                      'elpino_register_admin_menu' );
add_action( 'admin_enqueue_scripts',           'elpino_enqueue_admin_assets' );
add_action( 'wp_ajax_elpino_save_credentials', 'elpino_ajax_save_credentials' );
add_action( 'wp_footer',                       'elpino_inject_chat_script' );


// ══════════════════════════════════════════════════════════════════════════════
// 1 · ADMIN MENU
// ══════════════════════════════════════════════════════════════════════════════

function elpino_register_admin_menu(): void {
    add_menu_page(
        __( 'Elpino Chat', 'elpino-chat' ),
        __( 'Elpino Chat', 'elpino-chat' ),
        'manage_options',
        'elpino-chat',
        'elpino_render_admin_page',
        'dashicons-format-chat',
        80
    );
}


// ══════════════════════════════════════════════════════════════════════════════
// 2 · ADMIN PAGE (iframe shell)
// ══════════════════════════════════════════════════════════════════════════════

function elpino_render_admin_page(): void {
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( esc_html__( 'You do not have permission to view this page.', 'elpino-chat' ) );
    }

    $saved_id         = get_option( 'elpino_website_id', '' );
    // FIX: always apply esc_url() before echoing a URL attribute.
    $dashboard_url    = esc_url( ELPINO_DASHBOARD_URL );
    $dashboard_origin = elpino_get_url_origin( ELPINO_DASHBOARD_URL );
    $nonce            = wp_create_nonce( 'elpino_save_credentials' );
    ?>
    <div class="wrap" id="elpino-admin-wrap">
        <h1><?php esc_html_e( 'Elpino Chat', 'elpino-chat' ); ?></h1>

        <?php if ( $saved_id ) : ?>
            <div class="notice notice-success is-dismissible">
                <p>
                    <?php
                    printf(
                        /* translators: %s = Website ID */
                        esc_html__( 'Active Website ID: %s', 'elpino-chat' ),
                        '<strong>' . esc_html( $saved_id ) . '</strong>'
                    );
                    ?>
                </p>
            </div>
        <?php endif; ?>

        <!-- Hidden fields consumed by admin.js -->
        <input type="hidden" id="elpino-nonce"            value="<?php echo esc_attr( $nonce ); ?>">
        <input type="hidden" id="elpino-ajax-url"         value="<?php echo esc_attr( admin_url( 'admin-ajax.php' ) ); ?>">
        <input type="hidden" id="elpino-dashboard-origin" value="<?php echo esc_attr( $dashboard_origin ); ?>">

        <div style="margin-top:16px;">
            <iframe
                id="elpino-dashboard-frame"
                src="<?php echo $dashboard_url; /* Already esc_url()'d above. */ ?>"
                title="<?php esc_attr_e( 'Elpino Dashboard', 'elpino-chat' ); ?>"
                style="width:100%;height:80vh;border:1px solid #ddd;border-radius:8px;background:#f0f4ff;"
                allow="clipboard-write"
                referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>
        </div>
    </div>
    <?php
}

/**
 * Extract scheme + host (origin) from a URL.
 * e.g. 'https://app.vercel.app/foo' → 'https://app.vercel.app'
 *
 * @param string $url Full URL.
 * @return string Scheme + host (+ port if non-standard), or empty string on failure.
 */
function elpino_get_url_origin( string $url ): string {
    $parts = wp_parse_url( $url );
    if ( empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
        return '';
    }
    $origin = $parts['scheme'] . '://' . $parts['host'];
    if ( ! empty( $parts['port'] ) ) {
        $origin .= ':' . $parts['port'];
    }
    return $origin;
}


// ══════════════════════════════════════════════════════════════════════════════
// 3 · ADMIN ASSETS
// ══════════════════════════════════════════════════════════════════════════════

function elpino_enqueue_admin_assets( string $hook ): void {
    if ( 'toplevel_page_elpino-chat' !== $hook ) {
        return;
    }

    wp_enqueue_script(
        'elpino-admin',
        ELPINO_PLUGIN_URL . 'assets/js/admin.js',
        [],
        ELPINO_VERSION,
        true
    );
}


// ══════════════════════════════════════════════════════════════════════════════
// 4 · AJAX HANDLER — save Website ID + Identity Secret
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Persist the Website ID and Identity Secret received from the iframe handshake.
 *
 * POST fields expected:
 *   nonce      – wp_nonce for 'elpino_save_credentials'
 *   website_id – alphanumeric Website ID string
 *   secret     – identity signing secret (min 32 chars enforced)
 *
 * Security fixes applied:
 *   • Every guard calls wp_die() after wp_send_json_error() so execution
 *     cannot continue past a failed check.
 *   • The secret is stored raw (not run through sanitize_text_field which
 *     strips characters and silently corrupts high-entropy secrets).
 *     Instead we validate length + allowed-character set explicitly.
 */
function elpino_ajax_save_credentials(): void {

    // 1. Capability check — terminate immediately on failure.
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_send_json_error( [ 'message' => 'Insufficient permissions.' ], 403 );
        wp_die(); // FIX: ensure execution stops.
    }

    // 2. Nonce verification — terminate immediately on failure.
    $nonce = isset( $_POST['nonce'] )
        ? sanitize_text_field( wp_unslash( $_POST['nonce'] ) )
        : '';

    if ( ! wp_verify_nonce( $nonce, 'elpino_save_credentials' ) ) {
        wp_send_json_error( [ 'message' => 'Invalid or expired nonce.' ], 403 );
        wp_die(); // FIX: ensure execution stops.
    }

    // 3. Validate & sanitise Website ID (alphanumeric + hyphens only).
    $raw_website_id = isset( $_POST['website_id'] )
        ? wp_unslash( $_POST['website_id'] )
        : '';

    // Allow only alphanumeric chars and hyphens (matches the generated ID format).
    $website_id = preg_replace( '/[^A-Za-z0-9\-]/', '', (string) $raw_website_id );

    if ( empty( $website_id ) ) {
        wp_send_json_error( [ 'message' => 'website_id is required and must be alphanumeric.' ], 400 );
        wp_die();
    }

    // 4. Validate the Identity Secret.
    // FIX: Do NOT use sanitize_text_field() on secrets — it strips characters
    // such as <, >, &, ", ' which reduces entropy and corrupts the secret.
    // Instead, accept only printable non-whitespace ASCII (safe for JSON storage).
    $raw_secret = isset( $_POST['secret'] )
        ? wp_unslash( $_POST['secret'] )
        : '';

    // Strip any control characters / whitespace; allow all printable ASCII.
    $secret = preg_replace( '/[^\x21-\x7E]/', '', (string) $raw_secret );

    if ( strlen( $secret ) < 32 ) {
        wp_send_json_error( [ 'message' => 'secret must be at least 32 printable characters.' ], 400 );
        wp_die();
    }

    // 5. Persist both values — autoload disabled (not needed on every page load).
    update_option( 'elpino_website_id', $website_id, 'no' );
    update_option( 'elpino_secret',     $secret,     'no' );

    wp_send_json_success( [
        'message'    => 'Credentials saved.',
        'website_id' => $website_id,
    ] );
    wp_die();
}


// ══════════════════════════════════════════════════════════════════════════════
// 5 · FRONTEND SCRIPT INJECTION (wp_footer)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Output the Elpino chat <script> block in wp_footer.
 *
 * wp_json_encode() guarantees all values are JSON-safe and HTML-escaped
 * (JSON_HEX_TAG | JSON_HEX_AMP flags prevent script-injection via the values).
 */
function elpino_inject_chat_script(): void {
    $website_id = (string) get_option( 'elpino_website_id', '' );

    if ( '' === $website_id ) {
        return;
    }

    // WooCommerce identity token — empty string when WC/login not active.
    $identity_token = elpino_get_woocommerce_identity_token();

    // wp_json_encode with JSON_HEX_TAG prevents </script> injection in values.
    $website_id_js     = wp_json_encode( $website_id,     JSON_HEX_TAG | JSON_HEX_AMP );
    $identity_token_js = wp_json_encode( $identity_token, JSON_HEX_TAG | JSON_HEX_AMP );
    ?>
    <!-- Elpino Chat Widget -->
    <script>
        window.ElpinoSettings = {
            websiteId:     <?php echo $website_id_js; ?>,
            identityToken: <?php echo $identity_token_js; ?>
        };
        (function(d, s, id) {
            if (d.getElementById(id)) return;
            var js = d.createElement(s);
            js.id  = id;
            js.src = 'https://cdn.elpino.io/widget.js';
            js.async = true;
            d.head.appendChild(js);
        }(document, 'script', 'elpino-widget-js'));
    </script>
    <!-- /Elpino Chat Widget -->
    <?php
}
