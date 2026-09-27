<?php
if ( ! defined( 'ABSPATH' ) ) exit;
/**
 * The connected screen. Expects $website_id from includes/settings-page.php.
 */
?>
<div class="wrap elpino-wrap">
  <div class="elpino-col-main">
    <div class="elpino-logo">
      <img src="<?php echo esc_url( plugins_url( 'assets/logo.png', ELPINO_PLUGIN_FILE ) ); ?>" alt="Elpino">
    </div>

    <div class="elpino-content">
      <?php echo elpino_notice_markup( $notice ); ?>
      <span class="elpino-status-pill"><span class="elpino-status-dot"></span><?php esc_html_e( 'Connected', 'elpino-chat' ); ?></span>
      <h2 class="elpino-title"><?php esc_html_e( 'Elpino is live on your site', 'elpino-chat' ); ?></h2>

      <div class="elpino-action-list">
        <a class="elpino-action-link" href="<?php echo esc_url( ELPINO_APP_URL . '/dashboard/inbox' ); ?>" target="_blank" rel="noopener">
          <span class="elpino-action-icon">📥</span>
          <span>
            <span class="elpino-action-title"><?php esc_html_e( 'Go to my Inbox', 'elpino-chat' ); ?></span><br>
            <span class="elpino-action-desc"><?php esc_html_e( 'Reply to your WordPress visitors', 'elpino-chat' ); ?></span>
          </span>
        </a>
        <a class="elpino-action-link" href="<?php echo esc_url( ELPINO_APP_URL . '/dashboard/settings/chatbot' ); ?>" target="_blank" rel="noopener">
          <span class="elpino-action-icon">🤖</span>
          <span>
            <span class="elpino-action-title"><?php esc_html_e( 'Customize your AI agent', 'elpino-chat' ); ?></span><br>
            <span class="elpino-action-desc"><?php esc_html_e( 'Name, avatar, colors and greeting', 'elpino-chat' ); ?></span>
          </span>
        </a>
        <a class="elpino-action-link" href="<?php echo esc_url( ELPINO_APP_URL . '/dashboard/knowledge' ); ?>" target="_blank" rel="noopener">
          <span class="elpino-action-icon">📚</span>
          <span>
            <span class="elpino-action-title"><?php esc_html_e( 'Knowledge base', 'elpino-chat' ); ?></span><br>
            <span class="elpino-action-desc"><?php esc_html_e( 'What the AI can answer from', 'elpino-chat' ); ?></span>
          </span>
        </a>
        <a class="elpino-action-link" href="<?php echo esc_url( ELPINO_APP_URL . '/dashboard/settings/billing' ); ?>" target="_blank" rel="noopener">
          <span class="elpino-action-icon">💳</span>
          <span>
            <span class="elpino-action-title"><?php esc_html_e( 'Plan & billing', 'elpino-chat' ); ?></span><br>
            <span class="elpino-action-desc"><?php esc_html_e( 'Change or manage your plan', 'elpino-chat' ); ?></span>
          </span>
        </a>
      </div>

      <?php elpino_render_identity_settings(); ?>

      <div class="elpino-disconnect-row">
        <form method="POST">
          <?php wp_nonce_field( 'elpino_disconnect', 'elpino_disconnect_nonce' ); ?>
          <button type="submit" name="disconnect" class="elpino-btn elpino-btn--danger" style="width: auto; padding: 0 20px;">
            <?php esc_html_e( 'Unlink WordPress from Elpino', 'elpino-chat' ); ?>
          </button>
        </form>
      </div>
    </div>
  </div>

  <div class="elpino-col-art">
    <div class="elpino-art-dots"></div>
    <span class="elpino-art-chip elpino-art-chip--1">✅ <?php esc_html_e( 'All set', 'elpino-chat' ); ?></span>
    <span class="elpino-art-chip elpino-art-chip--2">💬 <?php esc_html_e( 'Live now', 'elpino-chat' ); ?></span>
    <div class="elpino-art-badge">
      <img src="<?php echo esc_url( plugins_url( 'assets/icon.png', ELPINO_PLUGIN_FILE ) ); ?>" alt="">
    </div>
    <span class="elpino-art-version">Version <?php echo esc_html( ELPINO_PLUGIN_VERSION ); ?></span>
  </div>
</div>
