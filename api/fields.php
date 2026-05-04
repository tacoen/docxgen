<?php
/**
 * api/fields.php — Read a model's fields.json
 *
 * GET ?model=spk   → returns contents of models/spk/fields.json
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$root  = dirname(__DIR__);
$model = preg_replace('/[^a-zA-Z0-9\-_]/', '', $_GET['model'] ?? '');

if (!$model) {
    http_response_code(400);
    echo json_encode(['error' => 'model parameter required']);
    exit;
}

$path = $root . '/models/' . $model . '/fields.json';

if (!file_exists($path)) {
    http_response_code(404);
    echo json_encode(['error' => 'fields.json not found for model: ' . $model]);
    exit;
}

// Stream as-is — already valid JSON
header('Cache-Control: no-cache');
readfile($path);
