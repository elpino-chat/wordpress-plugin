<?php
/**
 * Elpino — Lightweight HS256 JWT Signer/Verifier
 *
 * Zero-dependency JWT implementation that ships inline with the plugin.
 * Uses HMAC-SHA256 (HS256) — the same algorithm used by the Node.js and
 * Python SDKs, ensuring tokens are interoperable across all Elpino runtimes.
 *
 * Usage:
 *   $token = Elpino_JWT::sign(['userId' => '42', 'email' => 'a@b.com'], $secret);
 *   $data  = Elpino_JWT::verify($token, $secret);
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class Elpino_JWT {

    /**
     * Sign a payload and return a compact JWT string (header.payload.signature).
     *
     * FIX: reserved claims (iat, exp) are set AFTER merging the user payload
     * so they can never be overridden by attacker-controlled data.
     *
     * @param array<string, mixed> $payload  User-supplied claims.
     * @param string               $secret   HMAC-SHA256 signing secret (≥32 chars recommended).
     * @param int                  $ttl      Token lifetime in seconds. Default: 3600 (1 hour).
     *
     * @return string Compact JWT (header.payload.signature).
     *
     * @throws \InvalidArgumentException When the secret is empty.
     * @throws \RuntimeException         When JSON encoding fails.
     */
    public static function sign( array $payload, string $secret, int $ttl = 3600 ): string {
        if ( '' === $secret ) {
            throw new \InvalidArgumentException(
                '[Elpino_JWT] secret must not be empty. ' .
                'Set ELPINO_IDENTITY_SECRET (≥32 chars) in wp-config.php.'
            );
        }

        $now = time();

        // FIX: merge user payload FIRST, then set reserved claims so they
        // cannot be spoofed by user-supplied keys in $payload.
        $claims = array_merge( $payload, [
            'iat' => $now,
            'exp' => $now + $ttl,
        ] );

        $header_json  = wp_json_encode( [ 'alg' => 'HS256', 'typ' => 'JWT' ] );
        $payload_json = wp_json_encode( $claims );

        if ( false === $header_json || false === $payload_json ) {
            throw new \RuntimeException( '[Elpino_JWT] Failed to JSON-encode JWT segments.' );
        }

        $header    = self::base64url_encode( $header_json );
        $body      = self::base64url_encode( $payload_json );
        $signing   = $header . '.' . $body;
        $signature = self::base64url_encode( hash_hmac( 'sha256', $signing, $secret, true ) );

        return $signing . '.' . $signature;
    }

    /**
     * Verify and decode a compact JWT string.
     *
     * @param string $token  Compact JWT (three dot-separated Base64url segments).
     * @param string $secret The same secret used to sign the token.
     *
     * @return array<string, mixed> Decoded payload.
     *
     * @throws \InvalidArgumentException  When the secret is empty.
     * @throws \UnexpectedValueException  On malformed structure, bad signature, or expiry.
     */
    public static function verify( string $token, string $secret ): array {
        if ( '' === $secret ) {
            throw new \InvalidArgumentException( '[Elpino_JWT] secret must not be empty.' );
        }

        $parts = explode( '.', $token );
        if ( 3 !== count( $parts ) ) {
            throw new \UnexpectedValueException(
                '[Elpino_JWT] Malformed token: expected exactly 3 dot-separated segments.'
            );
        }

        [ $header_b64, $payload_b64, $sig_b64 ] = $parts;

        // Constant-time signature comparison — prevents timing attacks.
        $expected_sig = self::base64url_encode(
            hash_hmac( 'sha256', $header_b64 . '.' . $payload_b64, $secret, true )
        );

        if ( ! hash_equals( $expected_sig, $sig_b64 ) ) {
            throw new \UnexpectedValueException( '[Elpino_JWT] Signature verification failed.' );
        }

        // FIX: validate JSON decoding success explicitly.
        $payload_json = self::base64url_decode( $payload_b64 );
        $payload      = json_decode( $payload_json, true );

        if ( JSON_ERROR_NONE !== json_last_error() || ! is_array( $payload ) ) {
            throw new \UnexpectedValueException(
                '[Elpino_JWT] Payload is not valid JSON: ' . json_last_error_msg()
            );
        }

        // Check expiry claim.
        if ( isset( $payload['exp'] ) && time() > (int) $payload['exp'] ) {
            throw new \UnexpectedValueException( '[Elpino_JWT] Token has expired.' );
        }

        // Check not-before claim (prevents using a future token early).
        if ( isset( $payload['nbf'] ) && time() < (int) $payload['nbf'] ) {
            throw new \UnexpectedValueException( '[Elpino_JWT] Token is not yet valid (nbf).' );
        }

        return $payload;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static function base64url_encode( string $data ): string {
        return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' );
    }

    /**
     * Decode a Base64url string, correctly handling all padding cases.
     *
     * FIX: previous formula failed for inputs whose length mod 4 === 0
     * because it padded them to the same length instead of leaving them as-is.
     * The correct formula is: pad to the next multiple of 4.
     */
    private static function base64url_decode( string $data ): string {
        // Translate URL-safe alphabet back to standard Base64.
        $b64 = strtr( $data, '-_', '+/' );
        // Re-add stripped padding: length must be a multiple of 4.
        $remainder = strlen( $b64 ) % 4;
        if ( $remainder > 0 ) {
            $b64 = str_pad( $b64, strlen( $b64 ) + ( 4 - $remainder ), '=' );
        }
        $decoded = base64_decode( $b64, true );
        if ( false === $decoded ) {
            throw new \UnexpectedValueException( '[Elpino_JWT] Failed to Base64-decode segment.' );
        }
        return $decoded;
    }
}
