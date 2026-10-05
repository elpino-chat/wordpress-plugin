<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
delete_option( 'elpino_chat_site_key' );

delete_option( 'elpino_chat_identity_enabled' );
