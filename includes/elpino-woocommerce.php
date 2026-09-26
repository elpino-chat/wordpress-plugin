<?php
/**
 * Elpino Chat — WooCommerce Identity Integration
 *
 * Provides:  elpino_get_woocommerce_identity_token()
 *            elpino_is_woocommerce_active()
 *
 * Called from elpino_inject_chat_script() in the main plugin file.
 * Returns a signed JWT when the current user is logged in AND WooCommerce
 * is active. Returns an empty string in all other cases (the chat widget
 * still loads, just without pre-authenticated identity).
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Generate a signed Elpino identity JWT for the current logged-in user.
 *
 * Identity enrichment from WooCommerce is additive: if WC data is unavailable
 * the token is still generated from core WordPress user data.
 *
 * @return string Signed JWT, or empty string when conditions are not met.
 */
function elpino_get_woocommerce_identity_token(): string {
    // Guard 1: must be a logged-in request.
    if ( ! is_user_logged_in() ) {
        return '';
    }

    // Guard 2: WooCommerce must be active.
    if ( ! elpino_is_woocommerce_active() ) {
        return '';
    }

    // Guard 3: the identity secret must have been stored via the plugin UI.
    $secret = (string) get_option( 'elpino_secret', '' );
    if ( '' === $secret ) {
        return '';
    }

    // ── Build base payload from WordPress user data ────────────────────────────
    $user = wp_get_current_user();

    $name = trim( $user->display_name );
    if ( '' === $name ) {
        // Fall back to first + last name if display_name is empty.
        $name = trim( $user->first_name . ' ' . $user->last_name );
    }

    $payload = [
        'userId' => (string) $user->ID,
        'name'   => $name,
        'email'  => $user->user_email,
    ];

    // ── Enrich with WooCommerce data ──────────────────────────────────────────

    // FIX: wc_get_customer_id_by_user_id() does not exist in WooCommerce.
    // The correct way to get a WC customer object from a WP user ID is via
    // the WC_Customer class. We wrap it in a try/catch so any WC version
    // differences don't break the token generation entirely.
    if ( class_exists( 'WC_Customer' ) ) {
        try {
            $wc_customer = new \WC_Customer( $user->ID );
            // wc_customer->get_id() returns 0 for guests; > 0 for real customers.
            if ( $wc_customer->get_id() > 0 ) {
                $payload['wooCustomerId'] = (string) $wc_customer->get_id();

                // Expose WooCommerce billing email if different from WP email.
                $billing_email = $wc_customer->get_billing_email();
                if ( $billing_email && $billing_email !== $user->user_email ) {
                    $payload['billingEmail'] = $billing_email;
                }

                // Total order count and spend — useful for chat agent context.
                $order_count = wc_get_customer_order_count( $user->ID );
                if ( $order_count > 0 ) {
                    $payload['orderCount']  = $order_count;
                    $payload['totalSpend']  = (float) wc_get_customer_total_spent( $user->ID );
                }
            }
        } catch ( \Throwable $e ) {
            // WC_Customer construction can throw if user is not a valid customer.
            // This is expected for new users — continue without enrichment.
            if ( defined( 'WP_DEBUG_LOG' ) && WP_DEBUG_LOG ) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
                error_log( '[Elpino] WC_Customer enrichment skipped: ' . $e->getMessage() );
            }
        }
    }

    // WooCommerce-relevant roles only.
    $wc_roles = array_values( array_intersect(
        (array) $user->roles,
        [ 'customer', 'shop_manager', 'administrator' ]
    ) );
    if ( ! empty( $wc_roles ) ) {
        $payload['roles'] = $wc_roles;
    }

    /**
     * Allow third-party code to extend or modify the identity payload.
     *
     * Example:
     *   add_filter( 'elpino_identity_payload', function( $payload, $user ) {
     *       $payload['plan'] = get_user_meta( $user->ID, 'subscription_plan', true );
     *       return $payload;
     *   }, 10, 2 );
     *
     * @param array<string,mixed> $payload The default identity payload.
     * @param WP_User             $user    The current WordPress user object.
     */
    $payload = (array) apply_filters( 'elpino_identity_payload', $payload, $user );

    // ── Sign the token ─────────────────────────────────────────────────────────
    try {
        return Elpino_JWT::sign( $payload, $secret );
    } catch ( \Throwable $e ) {
        if ( defined( 'WP_DEBUG_LOG' ) && WP_DEBUG_LOG ) {
            // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
            error_log( '[Elpino] JWT signing failed: ' . $e->getMessage() );
        }
        return '';
    }
}

/**
 * Check whether WooCommerce is currently active.
 *
 * Relies on the WooCommerce class existing — the canonical WooCommerce-
 * recommended detection method (avoids is_plugin_active() which is
 * unavailable outside the admin context).
 *
 * @return bool
 */
function elpino_is_woocommerce_active(): bool {
    return class_exists( 'WooCommerce' );
}
