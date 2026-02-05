<?php
/**
 * Plugin Name: MSI Product Image Data
 * Description: Injects per-product image maps (colors and sizes) as inline JSON on single product pages.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

function msi_build_image_data($product) {
    if (!$product || !is_a($product, 'WC_Product')) {
        return null;
    }

    $debug = [];

    $sku = $product->get_sku();
    if (!$sku) {
        $debug[] = 'Missing SKU on product.';
    }

    $gallery_ids = $product->get_gallery_image_ids();
    if (empty($gallery_ids)) {
        $debug[] = 'No gallery images found on product.';
    }

    $sizes = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'];
    $colors = [];
    $size_images = [];

    if ($sku && !empty($gallery_ids)) {
        foreach ($gallery_ids as $image_id) {
            $url = wp_get_attachment_url($image_id);
            if (!$url) {
                continue;
            }

            $path = parse_url($url, PHP_URL_PATH);
            if (!$path) {
                continue;
            }

            $filename = pathinfo($path, PATHINFO_FILENAME);
            if (!$filename) {
                continue;
            }

            $prefix = $sku . '_';
            if (stripos($filename, $prefix) !== 0) {
                continue;
            }

            $token = substr($filename, strlen($prefix));
            if ($token === '') {
                continue;
            }

            $token_lower = strtolower($token);

            if (in_array($token_lower, $sizes, true)) {
                $size_images[$token_lower] = $url;
            } else {
                $colors[$token_lower] = $url;
            }
        }
    }

    if (empty($colors) && empty($size_images)) {
        $debug[] = 'No matching images found using SKU naming convention.';
    }

    $featured_id = $product->get_image_id();
    $featured_url = '';
    if (!empty($colors)) {
        $featured_url = reset($colors);
    }
    if (!$featured_url) {
        $featured_url = $featured_id ? wp_get_attachment_url($featured_id) : '';
    }
    if (!$featured_url && !empty($size_images)) {
        $featured_url = reset($size_images);
    }

    $currency_symbol = function_exists('get_woocommerce_currency_symbol')
        ? get_woocommerce_currency_symbol()
        : '';
    $currency_symbol = html_entity_decode($currency_symbol, ENT_QUOTES, 'UTF-8');

    return [
        'sku' => $sku ?: null,
        'price' => (float) $product->get_price(),
        'currency' => $currency_symbol,
        'colors' => $colors,
        'sizes' => $size_images,
        'image_url' => $featured_url,
        'image' => [
            'id' => $featured_id ?: null,
            'src' => $featured_url,
        ],
        'debug' => [
            'enabled' => true,
            'messages' => $debug,
        ],
    ];
}

add_action('wp_enqueue_scripts', function () {
    if (!function_exists('is_product') || !is_product()) {
        return;
    }

    if (!function_exists('wc_get_product')) {
        return;
    }

    global $product;
    if (!$product) {
        return;
    }

    $data = msi_build_image_data($product);
    if (!$data) {
        return;
    }

    $json = wp_json_encode($data);
    if (!$json) {
        return;
    }

    $script = 'window.MSI_PRODUCT_IMAGE_DATA = ' . $json . ';';
    if (!empty($data['debug']['messages'])) {
        $script .= 'if (window.console && console.warn) { console.warn("[MSI Product Image Data]", window.MSI_PRODUCT_IMAGE_DATA.debug.messages); }';
    }

    wp_register_script('msi-product-image-data', false, [], null, true);
    wp_enqueue_script('msi-product-image-data');
    wp_add_inline_script('msi-product-image-data', $script, 'before');
}, 20);

add_action('rest_api_init', function () {
    register_rest_route('orderform/v1', '/product/(?P<sku>[a-zA-Z0-9_-]+)', [
        'methods' => 'GET',
        'callback' => function ($request) {
            if (!function_exists('wc_get_product_id_by_sku')) {
                return new WP_Error('woocommerce_missing', 'WooCommerce not available.', ['status' => 500]);
            }

            $sku = $request->get_param('sku');
            $sku = is_string($sku) ? sanitize_text_field($sku) : '';
            if ($sku === '') {
                return new WP_Error('invalid_sku', 'SKU is required.', ['status' => 400]);
            }

            $product_id = wc_get_product_id_by_sku($sku);
            if (!$product_id) {
                return new WP_Error('not_found', 'Product not found.', ['status' => 404]);
            }

            $product = wc_get_product($product_id);
            if (!$product) {
                return new WP_Error('not_found', 'Product not found.', ['status' => 404]);
            }

            $data = msi_build_image_data($product);
            if (!$data) {
                return new WP_Error('invalid_product', 'Unable to build product data.', ['status' => 500]);
            }

            return $data;
        },
        'permission_callback' => '__return_true',
    ]);
});
