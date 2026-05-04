<?php
/**
 * router.php — for php -S localhost:8000 router.php
 * Apache users: ignore this file, it is not used.
 *
 * Usage:
 *   cd docgen
 *   php -S localhost:8000 router.php
 */

$uri  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . $uri;

// Serve real files (js, css, html, json, docx, etc.) directly
if ($uri !== '/' && file_exists($file) && !is_dir($file)) {
    return false;
}

// Route /api/*.php
if (preg_match('#^/api/(\w+\.php)#', $uri, $m)) {
    $target = __DIR__ . '/api/' . $m[1];
    if (file_exists($target)) {
        require $target;
        return true;
    }
}

// Everything else → index.html
require __DIR__ . '/index.html';
