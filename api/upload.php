<?php
/**
 * api/upload.php — Upload a .docx template into a model folder
 *
 * POST multipart/form-data
 *   file  : <docx file>
 *   model : spk | mou | offers | ...
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$root  = dirname(__DIR__);
$model = preg_replace('/[^a-zA-Z0-9\-_]/', '', $_POST['model'] ?? '');

if (!$model) {
    http_response_code(400);
    echo json_encode(['error' => 'model parameter required']);
    exit;
}

if (!isset($_FILES['file'])) {
    http_response_code(400);
    echo json_encode(['error' => 'No file provided']);
    exit;
}

$file = $_FILES['file'];

// Check for PHP upload errors first
if ($file['error'] !== UPLOAD_ERR_OK) {
    $uploadErrors = [
        UPLOAD_ERR_INI_SIZE   => 'File exceeds server upload limit',
        UPLOAD_ERR_FORM_SIZE  => 'File exceeds form upload limit',
        UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded',
        UPLOAD_ERR_NO_FILE    => 'No file was uploaded',
        UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
    ];
    http_response_code(400);
    echo json_encode(['error' => $uploadErrors[$file['error']] ?? 'Upload error: ' . $file['error']]);
    exit;
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

if ($ext !== 'docx') {
    http_response_code(400);
    echo json_encode(['error' => 'Only .docx files are allowed']);
    exit;
}

// 10 MB limit
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
if ($file['size'] > MAX_UPLOAD_BYTES) {
    http_response_code(400);
    echo json_encode(['error' => 'File too large (max 10 MB). Got: ' . round($file['size']/1024/1024, 1) . ' MB']);
    exit;
}

$modelDir = $root . '/models/' . $model . '/';
if (!is_dir($modelDir)) mkdir($modelDir, 0755, true);

$safeName = preg_replace('/[^a-zA-Z0-9\-_.]/', '_', $file['name']);
$dest     = $modelDir . $safeName;

if (!move_uploaded_file($file['tmp_name'], $dest)) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save file']);
    exit;
}

echo json_encode([
    'success'  => true,
    'model'    => $model,
    'filename' => $safeName,
    'path'     => 'models/' . $model . '/' . $safeName,
    'size'     => $file['size'],
]);
