<?php
/**
 * ИНСТРУКЦИЯ: Скопируйте этот код в functions.php вашей темы или в любой плагин
 * 
 * ДЛЯ ПОЛЬЗОВАТЕЛЯ:
 * 1. Откройте WordPress админ-панель
 * 2. Перейдите: Appearance > Theme Files (или используйте FTP/SSH)
 * 3. Откройте functions.php вашей темы
 * 4. Добавьте этот код в конец файла
 * 5. Сохраните файл
 * 
 * После добавления этого кода, BeBuilder метаполя станут доступны через REST API!
 */

// Регистрируем BeBuilder метаполя для REST API
add_action('rest_api_init', function() {
    
    // Регистрируем mfn-page-items метаполе
    register_rest_field('page', 'mfn-page-items', array(
        'get_callback'    => function($post) {
            return get_post_meta($post['id'], 'mfn-page-items', true);
        },
        'update_callback' => function($value, $post) {
            return update_post_meta($post->ID, 'mfn-page-items', $value);
        },
        'schema'          => array(
            'description' => 'BeBuilder page items',
            'type'        => 'string',
        ),
    ));
    
    // Регистрируем mfn-page-options метаполе
    register_rest_field('page', 'mfn-page-options', array(
        'get_callback'    => function($post) {
            return get_post_meta($post['id'], 'mfn-page-options', true);
        },
        'update_callback' => function($value, $post) {
            return update_post_meta($post->ID, 'mfn-page-options', $value);
        },
        'schema'          => array(
            'description' => 'BeBuilder page options',
            'type'        => 'string',
        ),
    ));
    
    // Регистрируем для posts тоже
    register_rest_field('post', 'mfn-page-items', array(
        'get_callback'    => function($post) {
            return get_post_meta($post['id'], 'mfn-page-items', true);
        },
        'update_callback' => function($value, $post) {
            return update_post_meta($post->ID, 'mfn-page-items', $value);
        },
        'schema'          => array(
            'description' => 'BeBuilder page items',
            'type'        => 'string',
        ),
    ));
    
    register_rest_field('post', 'mfn-page-options', array(
        'get_callback'    => function($post) {
            return get_post_meta($post['id'], 'mfn-page-options', true);
        },
        'update_callback' => function($value, $post) {
            return update_post_meta($post->ID, 'mfn-page-options', $value);
        },
        'schema'          => array(
            'description' => 'BeBuilder page options',
            'type'        => 'string',
        ),
    ));
});
