<?php
/**
 * api/delete.php — Delete a template or output file
 *
 * POST JSON:
 *   { "type": "template", "model": "spk", "filename": "template.docx" }
 *   { "type": "output",   "path": "output/project/spk/spk_20260430.docx" }
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
$type = $body['type'] ?? '';

function safeResolve(string $root, string $rel): string|false {
    $rel  = ltrim($rel, '/');
    $full = realpath($root . '/' . $rel);
    // Must resolve inside project root
    if (!$full || strpos($full, realpath($root)) !== 0) return false;
    return $full;
}

switch ($type) {

    case 'template':
        $model    = preg_replace('/[^a-zA-Z0-9\-_]/', '', $body['model']    ?? '');
        $filename = basename($body['filename'] ?? '');
        if (!$model || !$filename) {
            http_response_code(400);
            echo json_encode(['error' => 'model and filename required']);
            exit;
        }
        $full = safeResolve($root, 'models/' . $model . '/' . $filename);
        break;

    case 'output':
        $rel  = $body['path'] ?? '';
        $full = safeResolve($root, $rel);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'type must be "template" or "output"']);
        exit;
}

if (!$full || !file_exists($full)) {
    http_response_code(404);
    echo json_encode(['error' => 'File not found']);
    exit;
}

// Only allow deleting .docx files (not fields.json, vendor/, etc.)
$ext = strtolower(pathinfo($full, PATHINFO_EXTENSION));
if ($ext !== 'docx') {
    http_response_code(403);
    echo json_encode(['error' => 'Only .docx files can be deleted']);
    exit;
}

unlink($full);
echo json_encode(['success' => true, 'deleted' => basename($full)]);
