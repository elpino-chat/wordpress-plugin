<?php
if ( ! defined( 'ABSPATH' ) ) exit;

// Identity verification: lets Elpino tell logged-in WordPress users apart
// from anonymous visitors, so the AI can safely look up a signed-in
// customer's own orders/records instead of trusting a typed-in email.
// Mirrors the Node/PHP flow documented at /docs/identity-verification; see
// web/app/dashboard/settings/IdentityVerificationSettings.tsx and
// web/lib/identity-snippets.ts for the canonical version this is kept in
// sync with.

// str_starts_with() is PHP 8.0+; this plugin targets PHP 7.4+.
function elpino_starts_with( $haystack, $needle ) {
    return substr( $haystack, 0, strlen( $needle ) ) === $needle;
}

function elpino_identity_secret_looks_valid( $secret ) {
    return $secret !== '' && elpino_starts_with( $secret, 'elid_' );
}

// Handles the identity settings form's own POST, separate from the main
// connect/disconnect handling in includes/settings-page.php. Returns a
// notice to render (or null), so the view stays render-only.
function elpino_handle_identity_form() {
    if ( ! isset( $_POST['elpino_identity_save'] ) || ! check_admin_referer( 'elpino_identity_save', 'elpino_identity_nonce' ) ) {
        return null;
    }

    $secret = isset( $_POST['elpino_identity_secret'] ) ? sanitize_text_field( wp_unslash( $_POST['elpino_identity_secret'] ) ) : '';
    if ( $secret !== '' && ! elpino_identity_secret_looks_valid( $secret ) ) {
        return array( 'type' => 'error', 'message' => 'That doesn\'t look like an Elpino identity secret — it should start with <code>elid_</code>. Copy it again from Settings &rarr; Identity Verification in your Elpino dashboard.' );
    }

    update_option( 'elpino_identity_secret', $secret );
    update_option( 'elpino_identity_email_verified', isset( $_POST['elpino_identity_email_verified'] ) ? '1' : '' );
    return array( 'type' => 'success', 'message' => 'Identity verification settings saved.' );
}

// Minimal, dependency-free HS256 JWT signer — the exact same token shape
// web/public/sdk/elpino-server.mjs produces for Node.js, and equivalent to
// the firebase/php-jwt example on the identity verification guide. Written
// by hand instead of requiring Composer, since a WordPress plugin can't
// assume `composer install` has ever run on the host.
function elpino_base64url( $data ) {
    return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' );
}

function elpino_sign_identity_token( $secret, $claims ) {
    $header = elpino_base64url( wp_json_encode( array( 'alg' => 'HS256', 'typ' => 'JWT' ) ) );
    $payload = elpino_base64url( wp_json_encode( $claims ) );
    $signature = elpino_base64url( hash_hmac( 'sha256', "$header.$payload", $secret, true ) );
    return "$header.$payload.$signature";
}

// Signs the current WordPress visitor, or null when nobody is logged in —
// callers must never sign a request-supplied identity, only wp_get_current_user().
function elpino_identity_token_for_current_user() {
    if ( ! is_user_logged_in() ) return null;
    $secret = get_option( 'elpino_identity_secret', '' );
    if ( ! elpino_identity_secret_looks_valid( $secret ) ) return null;

    $user = wp_get_current_user();
    $now = time();
    $claims = array(
        'sub' => (string) $user->ID,
        'aud' => 'elpino-widget',
        'jti' => bin2hex( random_bytes( 16 ) ),
        'iat' => $now,
        'exp' => $now + 300,
    );
    if ( $user->user_email ) {
        $claims['email'] = $user->user_email;
        $claims['email_verified'] = get_option( 'elpino_identity_email_verified', '' ) === '1';
    }
    if ( $user->display_name ) {
        $claims['name'] = $user->display_name;
    }
    return elpino_sign_identity_token( $secret, $claims );
}
