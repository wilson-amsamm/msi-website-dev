<?php
/**
 * Plugin Name: MSI Product Image Data
 * Description: Injects per-product image maps (colors and sizes) as inline JSON on single product pages.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

function msi_normalize_attr_value($value) {
    $value = is_string($value) ? $value : '';
    $value = trim($value);
    return strtolower($value);
}

function msi_normalize_variation_attr_scalar($value, $attr_key = '') {
    if (is_array($value)) {
        $value = reset($value);
    }
    if ($value === null || $value === false) {
        return '';
    }

    $key = strtolower((string) $attr_key);

    // If a term ID is stored, resolve it to the taxonomy term slug when possible.
    if (is_numeric($value) && strpos($key, 'attribute_pa_') === 0) {
        $taxonomy = str_replace('attribute_', '', $key);
        $term = get_term_by('id', (int) $value, $taxonomy);
        if ($term && !is_wp_error($term) && !empty($term->slug)) {
            return msi_normalize_attr_value($term->slug);
        }
    }

    return msi_normalize_attr_value((string) $value);
}

function msi_get_variation_meta_attr($variation_id, $keys) {
    if (!$variation_id) {
        return '';
    }

    foreach ($keys as $key) {
        $normalized = strtolower((string) $key);
        $meta_candidates = [
            strpos($normalized, 'attribute_') === 0 ? $normalized : ('attribute_' . $normalized),
            $normalized,
        ];

        foreach ($meta_candidates as $meta_key) {
            $raw = get_post_meta($variation_id, $meta_key, true);
            $normalized_value = msi_normalize_variation_attr_scalar($raw, $meta_key);
            if ($normalized_value !== '') {
                return $normalized_value;
            }
        }
    }

    return '';
}

function msi_get_variation_attr($variation, $keys) {
    if (!$variation || !is_a($variation, 'WC_Product_Variation')) {
        return '';
    }

    $variation_id = method_exists($variation, 'get_id') ? (int) $variation->get_id() : 0;

    foreach ($keys as $key) {
        $val = $variation->get_attribute($key);
        if (is_string($val) && trim($val) !== '') {
            return msi_normalize_attr_value($val);
        }
    }

    $attributes = $variation->get_attributes();
    if (!is_array($attributes)) {
        return '';
    }

    foreach ($keys as $key) {
        foreach ($attributes as $attrKey => $attrValue) {
            $normalizedKey = strtolower((string) $attrKey);
            if (
                $normalizedKey === strtolower($key) ||
                $normalizedKey === 'attribute_' . strtolower($key)
            ) {
                $normalized_value = msi_normalize_variation_attr_scalar($attrValue, $normalizedKey);
                if ($normalized_value !== '') {
                    return $normalized_value;
                }
            }
        }
    }

    // Final fallback: read raw variation post meta.
    $meta_value = msi_get_variation_meta_attr($variation_id, $keys);
    if ($meta_value !== '') {
        return $meta_value;
    }

    return '';
}

function msi_get_fallback_dimension_attr($variation, $exclude_keys) {
    if (!$variation || !is_a($variation, 'WC_Product_Variation')) {
        return '';
    }

    $attributes = $variation->get_attributes();
    if (!is_array($attributes)) {
        return '';
    }

    $normalized_excludes = [];
    foreach ($exclude_keys as $exclude_key) {
        $normalized_excludes[] = strtolower((string) $exclude_key);
        $normalized_excludes[] = 'attribute_' . strtolower((string) $exclude_key);
    }

    foreach ($attributes as $attr_key => $attr_value) {
        $normalized_key = strtolower((string) $attr_key);
        if (in_array($normalized_key, $normalized_excludes, true)) {
            continue;
        }
        $normalized_value = msi_normalize_variation_attr_scalar($attr_value, $normalized_key);
        if ($normalized_value === '') {
            continue;
        }
        return $normalized_value;
    }

    // Raw variation meta fallback: pick first non-color attribute_* value.
    $variation_id = method_exists($variation, 'get_id') ? (int) $variation->get_id() : 0;
    if ($variation_id) {
        $all_meta = get_post_meta($variation_id);
        if (is_array($all_meta)) {
            foreach ($all_meta as $meta_key => $meta_values) {
                $normalized_key = strtolower((string) $meta_key);
                if (strpos($normalized_key, 'attribute_') !== 0) {
                    continue;
                }
                if (in_array($normalized_key, $normalized_excludes, true)) {
                    continue;
                }

                $raw_value = is_array($meta_values) ? reset($meta_values) : $meta_values;
                $normalized_value = msi_normalize_variation_attr_scalar($raw_value, $normalized_key);
                if ($normalized_value !== '') {
                    return $normalized_value;
                }
            }
        }
    }

    return '';
}

function msi_build_variant_data($product, &$colors, &$size_images, $featured_url, &$debug) {
    $variants = [];
    if (!$product || !is_a($product, 'WC_Product') || !$product->is_type('variable')) {
        return $variants;
    }

    $children = $product->get_children();
    if (empty($children)) {
        $debug[] = 'Variable product has no child variations.';
        return $variants;
    }

    foreach ($children as $variation_id) {
        $variation = wc_get_product($variation_id);
        if (!$variation || !is_a($variation, 'WC_Product_Variation')) {
            continue;
        }

        $color = msi_get_variation_attr($variation, ['pa_color', 'color']);
        $size = msi_get_variation_attr($variation, ['pa_size', 'size']);
        if ($size === '') {
            // Handle products whose "size" label points to a differently-named attribute slug.
            $size = msi_get_fallback_dimension_attr($variation, ['pa_color', 'color']);
        }

        $price_raw = $variation->get_price();
        $price = is_numeric($price_raw) ? (float) $price_raw : null;

        $stock_no = get_post_meta($variation_id, '_msi_stock_no', true);
        $stock_no = is_string($stock_no) ? trim($stock_no) : '';
        if ($stock_no === '') {
            $alt_stock_no = get_post_meta($variation_id, '_stock_no', true);
            $stock_no = is_string($alt_stock_no) ? trim($alt_stock_no) : '';
        }
        if ($stock_no === '') {
            $variation_sku = $variation->get_sku();
            $stock_no = is_string($variation_sku) ? trim($variation_sku) : '';
        }

        $image_id = $variation->get_image_id();
        $image_url = $image_id ? wp_get_attachment_url($image_id) : '';
        if (!$image_url && $color && isset($colors[$color])) {
            $image_url = $colors[$color];
        }
        if (!$image_url && $featured_url) {
            $image_url = $featured_url;
        }

        if ($color && $image_url && empty($colors[$color])) {
            $colors[$color] = $image_url;
        }
        if ($size && $image_url && empty($size_images[$size])) {
            $size_images[$size] = $image_url;
        }

        $variants[] = [
            'variation_id' => (int) $variation_id,
            'color' => $color,
            'size' => $size,
            'price' => $price,
            'stock_no' => $stock_no,
            'image_url' => $image_url ?: '',
            'in_stock' => (bool) $variation->is_in_stock(),
        ];
    }

    if (empty($variants)) {
        $debug[] = 'No usable variant records found for variable product.';
    }

    usort($variants, function ($a, $b) {
        $left = ($a['color'] ?? '') . '|' . ($a['size'] ?? '');
        $right = ($b['color'] ?? '') . '|' . ($b['size'] ?? '');
        return strcmp($left, $right);
    });

    return $variants;
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

    $variants = msi_build_variant_data($product, $colors, $size_images, $featured_url, $debug);

    $base_price = is_numeric($product->get_price()) ? (float) $product->get_price() : 0.0;
    if ($base_price <= 0 && !empty($variants)) {
        foreach ($variants as $variant) {
            if (isset($variant['price']) && is_numeric($variant['price']) && (float) $variant['price'] > 0) {
                $base_price = (float) $variant['price'];
                break;
            }
        }
    }

    $currency_symbol = function_exists('get_woocommerce_currency_symbol')
        ? get_woocommerce_currency_symbol()
        : '';
    $currency_symbol = html_entity_decode($currency_symbol, ENT_QUOTES, 'UTF-8');

    return [
        'sku' => $sku ?: null,
        'price' => $base_price,
        'currency' => $currency_symbol,
        'colors' => $colors,
        'sizes' => $size_images,
        'variants' => $variants,
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
