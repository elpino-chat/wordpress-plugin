<?php
/**
 * Elpino Chat — Uninstall Cleanup
 *
 * This file is executed by WordPress ONLY when the user deletes the plugin
 * via the WP Admin → Plugins → Delete flow.  It is NOT triggered on
 * deactivation — only on permanent deletion.
 *
 * Reference: https://developer.wordpress.org/plugins/plugin-basics/uninstall-methods/
 *
 * Security: WordPress sets the WP_UNINSTALL_PLUGIN constant before including
 * this file.  We exit immediately if it is not defined to prevent direct access.
 */

// Prevent direct access.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
    exit;
}

// ── Remove all options stored by the plugin ───────────────────────────────────

/**
 * Options written by this plugin:
 *
 *   elpino_website_id  — the chat widget Website ID
 *   elpino_secret      — the identity JWT signing secret
 */
delete_option( 'elpino_website_id' );
delete_option( 'elpino_secret' );

// ── Multisite support ─────────────────────────────────────────────────────────
// If this is a multisite network and the plugin was network-activated,
// remove the options from every sub-site.

if ( is_multisite() ) {
    $site_ids = get_sites( [
        'fields'     => 'ids',
        'number'     => 0, // Retrieve all sites.
        'spam'       => 0,
        'deleted'    => 0,
        'archived'   => 0,
    ] );

    foreach ( $site_ids as $site_id ) {
        switch_to_blog( (int) $site_id );
        delete_option( 'elpino_website_id' );
        delete_option( 'elpino_secret' );
        restore_current_blog();
    }
}
