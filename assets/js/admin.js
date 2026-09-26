/**
 * Elpino Chat — WordPress Admin Bridge  (v2.1 — security hardened)
 *
 * Two-way handshake protocol
 * ──────────────────────────
 * 1. On iframe load → send ELPINO_HANDSHAKE to the iframe using the
 *    Next.js dashboard origin as the strict targetOrigin.
 * 2. Receive ELPINO_HANDSHAKE_ACK from the iframe, validating event.origin.
 * 3. After ACK → receive ELPINO_KEYS and forward credentials to the PHP
 *    AJAX handler via fetch().
 *
 * Security hardening in this version
 * ────────────────────────────────────
 * • frame.contentWindow null-guard before every postMessage call.
 * • Strict event.origin validation on every incoming message.
 * • Both websiteId and secret stripped of whitespace and length-checked
 *   client-side before the AJAX call (server always re-validates).
 * • escHtml() applied to all user-supplied strings before innerHTML.
 * • Duplicate-ACK guard: once handshake is complete, further ACKs are ignored.
 */

( function () {
    'use strict';

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Read a hidden <input> value injected by the PHP render callback.
     * @param {string} id
     * @returns {string}
     */
    function getHiddenValue( id ) {
        var el = document.getElementById( id );
        return el ? el.value.trim() : '';
    }

    /**
     * Minimal HTML-escape for strings inserted via innerHTML.
     * Covers the five characters that can break HTML context.
     * @param {string} str
     * @returns {string}
     */
    function escHtml( str ) {
        return String( str )
            .replace( /&/g,  '&amp;'  )
            .replace( /</g,  '&lt;'   )
            .replace( />/g,  '&gt;'   )
            .replace( /"/g,  '&quot;' )
            .replace( /'/g,  '&#039;' );
    }

    /**
     * Show a temporary WordPress admin notice banner.
     * @param {string}            text HTML-safe string to display.
     * @param {'success'|'error'} type Banner colour class.
     */
    function showBanner( text, type ) {
        var wrap = document.getElementById( 'elpino-admin-wrap' );
        if ( ! wrap ) return;

        var existing = document.getElementById( 'elpino-status-banner' );
        if ( existing ) existing.remove();

        var banner       = document.createElement( 'div' );
        banner.id        = 'elpino-status-banner';
        banner.className = 'notice notice-' + ( type === 'success' ? 'success' : 'error' ) + ' is-dismissible';
        banner.innerHTML = '<p>' + text + '</p>';

        var h1 = wrap.querySelector( 'h1' );
        if ( h1 && h1.nextSibling ) {
            wrap.insertBefore( banner, h1.nextSibling );
        } else {
            wrap.prepend( banner );
        }

        setTimeout( function () { if ( banner.parentNode ) banner.remove(); }, 7000 );
    }

    // ── Configuration (values injected by PHP) ────────────────────────────────

    var dashboardOrigin = getHiddenValue( 'elpino-dashboard-origin' );
    var nonce           = getHiddenValue( 'elpino-nonce' );
    var ajaxUrl         = getHiddenValue( 'elpino-ajax-url' );

    // ── State ─────────────────────────────────────────────────────────────────

    /** True once ELPINO_HANDSHAKE_ACK is received and validated. */
    var handshakeComplete = false;

    // ── Phase 1 — Send handshake to the iframe ────────────────────────────────

    function sendHandshake() {
        if ( ! dashboardOrigin ) {
            console.error( '[Elpino] No dashboard origin configured. Set ELPINO_DASHBOARD_URL in wp-config.php.' );
            return;
        }

        var frame = document.getElementById( 'elpino-dashboard-frame' );

        // FIX: guard against null contentWindow (frame not yet in DOM / cross-origin error).
        if ( ! frame || ! frame.contentWindow ) {
            console.error( '[Elpino] iframe contentWindow is not accessible.' );
            return;
        }

        frame.contentWindow.postMessage(
            { type: 'ELPINO_HANDSHAKE', origin: window.location.origin },
            dashboardOrigin  // strict targetOrigin — never '*'
        );
    }

    // ── Phase 2 & 3 — Listen for messages from the iframe ────────────────────

    window.addEventListener( 'message', function ( event ) {
        // Always validate origin first — drop anything not from the dashboard.
        if ( ! dashboardOrigin || event.origin !== dashboardOrigin ) {
            return;
        }

        var data = event.data;
        if ( ! data || typeof data !== 'object' ) return;

        // ── 2a: Handshake ACK ─────────────────────────────────────────────────
        if ( data.type === 'ELPINO_HANDSHAKE_ACK' ) {
            if ( handshakeComplete ) return; // ignore duplicate ACKs
            handshakeComplete = true;
            console.info( '[Elpino] Handshake complete. Verified origin: ' + event.origin );
            return;
        }

        // ── 2b: Credentials payload ───────────────────────────────────────────
        if ( data.type === 'ELPINO_KEYS' && handshakeComplete ) {
            // FIX: strip whitespace client-side and length-check before sending.
            var websiteId = typeof data.websiteId === 'string' ? data.websiteId.trim() : '';
            var secret    = typeof data.secret    === 'string' ? data.secret.trim()    : '';

            if ( ! websiteId ) {
                showBanner( '❌ Received an empty Website ID from the dashboard.', 'error' );
                return;
            }

            // Client-side minimum length guard (server enforces 32).
            if ( secret.length < 32 ) {
                showBanner( '❌ Received an invalid Identity Secret (too short). Please try again.', 'error' );
                return;
            }

            saveCredentials( websiteId, secret );
        }
    } );

    // ── Phase 3 — AJAX save ───────────────────────────────────────────────────

    /**
     * POST the credentials to the WordPress AJAX handler.
     * Both values are validated again server-side.
     *
     * @param {string} websiteId
     * @param {string} secret
     */
    function saveCredentials( websiteId, secret ) {
        if ( ! nonce || ! ajaxUrl ) {
            showBanner( '❌ Internal error: missing nonce or AJAX URL. Please reload the page.', 'error' );
            return;
        }

        var body = new URLSearchParams( {
            action:     'elpino_save_credentials',
            nonce:      nonce,
            website_id: websiteId,
            secret:     secret,
        } );

        fetch( ajaxUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:    body.toString(),
        } )
            .then( function ( res ) {
                if ( ! res.ok ) throw new Error( 'HTTP ' + res.status );
                return res.json();
            } )
            .then( function ( json ) {
                if ( json && json.success ) {
                    showBanner(
                        '✅ Website ID <strong>' + escHtml( websiteId ) + '</strong> and Identity Secret saved. The chat widget is now active.',
                        'success'
                    );
                } else {
                    var msg = ( json && json.data && json.data.message )
                        ? json.data.message : 'Unknown server error.';
                    showBanner( '❌ Could not save credentials: ' + escHtml( msg ), 'error' );
                }
            } )
            .catch( function ( err ) {
                console.error( '[Elpino] AJAX request failed:', err );
                showBanner( '❌ Network error while saving credentials. Check your connection.', 'error' );
            } );
    }

    // ── Boot ──────────────────────────────────────────────────────────────────

    document.addEventListener( 'DOMContentLoaded', function () {
        var frame = document.getElementById( 'elpino-dashboard-frame' );
        if ( frame ) {
            frame.addEventListener( 'load', sendHandshake );
        }
    } );

}() );
