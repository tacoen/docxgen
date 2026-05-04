<?php
/**
 * api/model_create.php — Scaffold a new model folder
 *
 * POST JSON: { "name": "mou", "copy_from": "spk" }
 *   name      : new model slug (required)
 *   copy_from : existing model to copy fields.json from (optional)
 *
 * Returns: { success, name, path, fields_source }
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$root = dirname(__DIR__);
$body = json_decode(file_get_contents('php://input'), true) ?? [];

$name     = preg_replace('/[^a-zA-Z0-9\-_]/', '', $body['name']      ?? '');
$copyFrom = preg_replace('/[^a-zA-Z0-9\-_]/', '', $body['copy_from'] ?? '');

if (!$name) {
    http_response_code(400);
    echo json_encode(['error' => 'name is required']);
    exit;
}

$modelDir = $root . '/models/' . $name . '/';

if (is_dir($modelDir)) {
    http_response_code(409);
    echo json_encode(['error' => 'Model already exists: ' . $name]);
    exit;
}

mkdir($modelDir, 0755, true);

// Determine fields.json source
$fieldsSource = 'blank';
$fieldsPath   = $modelDir . 'fields.json';

if ($copyFrom) {
    $srcFields = $root . '/models/' . $copyFrom . '/fields.json';
    if (file_exists($srcFields)) {
        copy($srcFields, $fieldsPath);
        $fieldsSource = 'copied from ' . $copyFrom;
    } else {
        // copy_from model exists but has no fields.json — fall through to blank
        $copyFrom = '';
    }
}

if (!$copyFrom) {
    // Write a minimal blank fields.json scaffold
    $blank = [
        'Info' => [
            'namaField' => '',
        ]
    ];
    file_put_contents(
        $fieldsPath,
        json_encode($blank, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
    );
}

echo json_encode([
    'success'       => true,
    'name'          => $name,
    'path'          => 'models/' . $name . '/',
    'fields_source' => $fieldsSource,
]);
