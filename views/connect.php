<?php
if ( ! defined( 'ABSPATH' ) ) exit;
/**
 * The "not connected yet" screen. Expects $connect_url from
 * includes/settings-page.php.
 */
?>
<div class="wrap elpino-wrap">
  <div class="elpino-col-main elpino-col-main--centered">
    <div class="elpino-logo">
      <img src="<?php echo esc_url( plugins_url( 'assets/logo.png', ELPINO_PLUGIN_FILE ) ); ?>" alt="Elpino">
    </div>

    <div class="elpino-content">
      <?php echo elpino_notice_markup( $notice ); ?>
      <h2 class="elpino-title"><?php esc_html_e( 'Add Elpino to your WordPress', 'elpino-chat' ); ?></h2>
      <p class="elpino-subtitle">
        <?php esc_html_e( 'By clicking the button below, we\'ll connect your Elpino workspace and add the chat widget to your site automatically. No coding required.', 'elpino-chat' ); ?>
      </p>
      <a class="elpino-btn elpino-btn--primary" href="<?php echo esc_url( $connect_url ); ?>">
        <?php esc_html_e( 'Install Elpino on my WordPress', 'elpino-chat' ); ?>
      </a>
    </div>
  </div>

  <div class="elpino-col-art">
    <div class="elpino-art-dots"></div>
    <span class="elpino-art-chip elpino-art-chip--1">💬 <?php esc_html_e( 'AI-powered', 'elpino-chat' ); ?></span>
    <span class="elpino-art-chip elpino-art-chip--2">⚡ <?php esc_html_e( 'One click', 'elpino-chat' ); ?></span>
    <span class="elpino-art-chip elpino-art-chip--3">🔒 <?php esc_html_e( 'Privacy-first', 'elpino-chat' ); ?></span>
    <div class="elpino-art-badge">
      <img src="<?php echo esc_url( plugins_url( 'assets/icon.png', ELPINO_PLUGIN_FILE ) ); ?>" alt="">
    </div>
    <span class="elpino-art-version">Version <?php echo esc_html( ELPINO_PLUGIN_VERSION ); ?></span>
  </div>
</div>
