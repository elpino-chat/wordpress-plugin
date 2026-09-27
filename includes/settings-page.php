<?php
if ( ! defined( 'ABSPATH' ) ) exit;

// The "Elpino Chat" admin page: handles the connect/disconnect callbacks,
// then hands off to a view file for the actual markup. Views only ever
// read the local variables set up here — no logic lives in views/. $notice,
// if set, is rendered by the view itself (via elpino_notice_markup()
// below), not echoed here, so it lands inside the view's own layout instead
// of above it.
function elpino_settings_page() {
    $notice = elpino_handle_connect_callback();

    $website_id = get_option( 'elpino_website_id' );
    $connected = ! empty( $website_id );
    $connect_url = elpino_build_connect_url();

    if ( $connected ) {
        include ELPINO_PLUGIN_DIR . 'views/connected.php';
    } else {
        include ELPINO_PLUGIN_DIR . 'views/connect.php';
    }
}

// Renders $notice as a dismissible admin notice, called from within a view
// (see elpino_notice_markup() usage in views/connect.php and connected.php).
function elpino_notice_markup( $notice ) {
    if ( ! $notice ) return '';
    return sprintf(
        '<div class="notice notice-%s is-dismissible" style="margin: 0 0 20px;"><p>%s</p></div>',
        esc_attr( $notice['type'] === 'error' ? 'error' : 'success' ),
        wp_kses_post( $notice['message'] )
    );
}

// Only accepts ?elpino_website_id= when it comes back with the same
// WordPress nonce elpino_build_connect_url() sent out — otherwise an admin
// tricked into clicking a crafted link with a different ID could have
// their widget silently repointed. Same protection Crisp's own WP plugin
// uses for its callback.
function elpino_handle_connect_callback() {
    if ( ! isset( $_GET['elpino_website_id'] ) ) return null;

    // TEMPORARY diagnostic — remove once the connect flow is confirmed
    // working end-to-end. Logs to wp-content/debug.log (WP_DEBUG_LOG).
    error_log( sprintf(
        '[elpino-chat] connect callback: elpino_website_id=%s _wpnonce=%s nonce_verify=%s',
        isset( $_GET['elpino_website_id'] ) ? $_GET['elpino_website_id'] : '(none)',
        isset( $_GET['_wpnonce'] ) ? $_GET['_wpnonce'] : '(none)',
        isset( $_GET['_wpnonce'] ) ? var_export( wp_verify_nonce( $_GET['_wpnonce'], 'elpino_connect' ), true ) : '(no nonce)'
    ) );

    if ( ! isset( $_GET['_wpnonce'] ) || ! wp_verify_nonce( $_GET['_wpnonce'], 'elpino_connect' ) ) {
        return array( 'type' => 'error', 'message' => __( 'That connection link had expired or wasn\'t recognized. Click "Connect to Elpino" again below.', 'elpino-chat' ) );
    }

    $updated = update_option( 'elpino_website_id', sanitize_text_field( $_GET['elpino_website_id'] ) );
    error_log( '[elpino-chat] update_option(elpino_website_id) returned: ' . var_export( $updated, true ) . '; now reads back as: ' . var_export( get_option( 'elpino_website_id' ), true ) );
    elpino_flush_page_caches();
    return array( 'type' => 'success', 'message' => __( 'Elpino connected successfully!', 'elpino-chat' ) );
}

// Hooked on admin_init (see elpino-chat.php), not called from within the
// page callback: by the time elpino_settings_page() runs, WordPress has
// already sent the admin page's own headers, so a real wp_safe_redirect()
// here would just warn and fail. admin_init runs early enough for one.
function elpino_handle_disconnect() {
    if ( ! isset( $_POST['disconnect'] ) || ! isset( $_GET['page'] ) || $_GET['page'] !== 'elpino-chat' ) return;
    if ( ! check_admin_referer( 'elpino_disconnect', 'elpino_disconnect_nonce' ) ) return;
    delete_option( 'elpino_website_id' );
    wp_safe_redirect( admin_url( 'admin.php?page=elpino-chat' ) );
    exit;
}

function elpino_render_identity_settings() {
    $identity_notice = elpino_handle_identity_form();
    $secret = get_option( 'elpino_identity_secret', '' );
    $email_verified = get_option( 'elpino_identity_email_verified', '' );
    include ELPINO_PLUGIN_DIR . 'views/identity-settings.php';
}

// return_url carries a WordPress nonce so elpino_handle_connect_callback()
// can tell a genuine redirect from a crafted link (see there for why).
function elpino_build_connect_url() {
    // Not wp_nonce_url(): it runs esc_html() on its result (turning "&" into
    // "&amp;"), meant for printing straight into an href attribute. Used as
    // a raw query value instead — via urlencode() below — that HTML-escaped
    // "&amp;" got percent-encoded right along with everything else, so the
    // nonce param on the other side became unparseable. add_query_arg()
    // alone skips that escaping.
    $return_url = add_query_arg( '_wpnonce', wp_create_nonce( 'elpino_connect' ), admin_url( 'admin.php?page=elpino-chat' ) );
    return ELPINO_APP_URL . '/connect/wordpress?return_url=' . urlencode( $return_url ) . '&site_url=' . urlencode( home_url( '/' ) );
}

// A reminder on every other admin screen while not yet connected, so an
// admin who activated the plugin and wandered off still finds their way
// back. Not shown on our own page (redundant there — that page already
// shows the full "not connected" state) or once connected. Dismissing it
// (WordPress's own is-dismissible button) only hides it for that page
// load, same as Crisp's own plugin does for its equivalent notice — it
// comes back on the next admin page until actually connected.
add_action( 'admin_notices', 'elpino_connect_reminder_notice' );
function elpino_connect_reminder_notice() {
    if ( get_option( 'elpino_website_id' ) ) return;
    if ( isset( $_GET['page'] ) && $_GET['page'] === 'elpino-chat' ) return;

    $url = admin_url( 'admin.php?page=elpino-chat' );
    printf(
        '<div class="notice notice-warning is-dismissible"><p><img src="%s" alt="" height="16" style="vertical-align: text-bottom; margin-right: 4px;"> %s</p></div>',
        esc_url( plugins_url( 'assets/icon.png', ELPINO_PLUGIN_FILE ) ),
        sprintf(
            /* translators: %1$s and %2$s wrap a link to the plugin's own settings page. */
            esc_html__( 'Elpino Chat isn\'t connected yet. %1$sConnect it now%2$s and your chat widget will be live in under a minute.', 'elpino-chat' ),
            '<a href="' . esc_url( $url ) . '">',
            '</a>'
        )
    );
}
