<?php
if ( ! defined( 'ABSPATH' ) ) exit;
/**
 * The identity verification form, on the connected screen. Expects
 * $identity_notice, $secret, $email_verified from
 * includes/settings-page.php's elpino_render_identity_settings().
 */
?>
<?php if ( $identity_notice ) : ?>
  <div class="notice notice-<?php echo esc_attr( $identity_notice['type'] === 'error' ? 'error' : 'success' ); ?> is-dismissible">
    <p><?php echo wp_kses_post( $identity_notice['message'] ); ?></p>
  </div>
<?php endif; ?>

<div class="elpino-subcard">
  <span class="elpino-badge">🪪 <?php esc_html_e( 'Identity verification', 'elpino-chat' ); ?></span>
  <h2><?php esc_html_e( 'Recognize your logged-in customers', 'elpino-chat' ); ?></h2>
  <p>
    <?php
    printf(
      /* translators: %1$s and %2$s wrap a link to the Elpino dashboard's identity settings. */
      esc_html__( 'Optional. When a WordPress user is logged in, Elpino can be told who they are — by name and email — so the AI can look up their own account instead of chatting with them as a stranger. Get your secret from %1$sSettings &rarr; Identity Verification%2$s in your Elpino dashboard.', 'elpino-chat' ),
      '<a href="' . esc_url( ELPINO_APP_URL . '/dashboard/settings' ) . '" target="_blank" rel="noopener">',
      '</a>'
    );
    ?>
  </p>

  <form method="POST">
    <?php wp_nonce_field( 'elpino_identity_save', 'elpino_identity_nonce' ); ?>

    <p>
      <label class="elpino-field-label" for="elpino_identity_secret"><?php esc_html_e( 'Identity secret', 'elpino-chat' ); ?></label>
      <input type="text" id="elpino_identity_secret" name="elpino_identity_secret" value="<?php echo esc_attr( $secret ); ?>" class="elpino-input" placeholder="elid_..." autocomplete="off">
    </p>

    <p>
      <label>
        <input type="checkbox" name="elpino_identity_email_verified" value="1" <?php checked( $email_verified, '1' ); ?>>
        <?php esc_html_e( 'Treat WordPress account emails as verified', 'elpino-chat' ); ?>
      </label>
      <br>
      <span class="description"><?php esc_html_e( 'Only check this if your site actually confirms email addresses (e.g. account activation emails, or WooCommerce email verification) — this is shown to your team as a signal that the address is trustworthy.', 'elpino-chat' ); ?></span>
    </p>

    <button type="submit" name="elpino_identity_save" class="elpino-btn elpino-btn--primary">
      <?php esc_html_e( 'Save identity settings', 'elpino-chat' ); ?>
    </button>
  </form>
</div>
