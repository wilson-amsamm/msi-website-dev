<?php
/**
 * Plugin Name: MSI Product Image Data
 * Description: Injects per-product image maps (colors and sizes) as inline JSON on single product pages.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
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

    $data = [
        'sku' => $sku ?: null,
        'colors' => $colors,
        'sizes' => $size_images,
        'debug' => [
            'enabled' => true,
            'messages' => $debug,
        ],
    ];

    $json = wp_json_encode($data);
    if (!$json) {
        return;
    }

    $script = 'window.MSI_PRODUCT_IMAGE_DATA = ' . $json . ';';
    if (!empty($debug)) {
        $script .= 'if (window.console && console.warn) { console.warn("[MSI Product Image Data]", window.MSI_PRODUCT_IMAGE_DATA.debug.messages); }';
    }

    wp_register_script('msi-product-image-data', false, [], null, true);
    wp_enqueue_script('msi-product-image-data');
    wp_add_inline_script('msi-product-image-data', $script, 'before');
}, 20);
