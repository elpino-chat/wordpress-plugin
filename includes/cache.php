<?php
if ( ! defined( 'ABSPATH' ) ) exit;

// A page cache plugin serving a cached homepage would otherwise keep
// showing it without the widget script until that cache naturally expires.
// Best-effort: clears the common caching plugins' stores right after
// connecting, same as the Crisp plugin does for the same reason.
function elpino_flush_page_caches() {
    if ( function_exists( 'rocket_clean_domain' ) ) {
        rocket_clean_domain();
    }
    if ( function_exists( 'wp_cache_clean_cache' ) ) {
        global $file_prefix;
        wp_cache_clean_cache( $file_prefix, true );
    }
    if ( function_exists( 'w3tc_flush_all' ) ) {
        w3tc_flush_all();
    }
    if ( function_exists( 'wp_cache_flush' ) ) {
        wp_cache_flush();
    }
}
