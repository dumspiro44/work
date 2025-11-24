<?php
/**
 * УЛУЧШЕННЫЙ КОД для регистрации BeBuilder метаполей
 * Скопируйте этот код в functions.php вашей темы (вместо предыдущего)
 * 
 * Этот вариант использует register_meta() что более надежно работает с REST API
 */

add_action('rest_api_init', function() {
    // Методология 1: Используем register_meta для лучшей поддержки REST API
    
    register_meta('post', 'mfn-page-items', array(
        'type'              => 'string',
        'description'       => 'BeBuilder page items',
        'single'            => true,
        'show_in_rest'      => true,
        'auth_callback'     => function() { return true; }
    ));
    
    register_meta('post', 'mfn-page-options', array(
        'type'              => 'string',
        'description'       => 'BeBuilder page options',
        'single'            => true,
        'show_in_rest'      => true,
        'auth_callback'     => function() { return true; }
    ));
    
    register_meta('page', 'mfn-page-items', array(
        'type'              => 'string',
        'description'       => 'BeBuilder page items',
        'single'            => true,
        'show_in_rest'      => true,
        'auth_callback'     => function() { return true; }
    ));
    
    register_meta('page', 'mfn-page-options', array(
        'type'              => 'string',
        'description'       => 'BeBuilder page options',
        'single'            => true,
        'show_in_rest'      => true,
        'auth_callback'     => function() { return true; }
    ));
    
    // Методология 2: Также регистрируем через register_rest_field для дополнительной совместимости
    register_rest_field(array('page', 'post'), 'mfn-page-items', array(
        'get_callback'    => function($post) {
            return get_post_meta($post['id'], 'mfn-page-items', true);
        },
        'schema'          => array(
            'type'        => 'string',
        ),
    ));
    
    register_rest_field(array('page', 'post'), 'mfn-page-options', array(
        'get_callback'    => function($post) {
            return get_post_meta($post['id'], 'mfn-page-options', true);
        },
        'schema'          => array(
            'type'        => 'string',
        ),
    ));
});

// Альтернативный метод: если выше не работает, используем фильтр rest_prepare_post_type
add_filter('rest_prepare_post', function($response, $post, $request) {
    $mfn_items = get_post_meta($post->ID, 'mfn-page-items', true);
    $mfn_options = get_post_meta($post->ID, 'mfn-page-options', true);
    
    if ($mfn_items) {
        $response->data['mfn-page-items'] = $mfn_items;
    }
    if ($mfn_options) {
        $response->data['mfn-page-options'] = $mfn_options;
    }
    
    return $response;
}, 10, 3);

add_filter('rest_prepare_page', function($response, $post, $request) {
    $mfn_items = get_post_meta($post->ID, 'mfn-page-items', true);
    $mfn_options = get_post_meta($post->ID, 'mfn-page-options', true);
    
    if ($mfn_items) {
        $response->data['mfn-page-items'] = $mfn_items;
    }
    if ($mfn_options) {
        $response->data['mfn-page-options'] = $mfn_options;
    }
    
    return $response;
}, 10, 3);
