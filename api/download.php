<?php
/**
 * api/download.php — Stream a file to the browser
 *
 * GET ?path=output/project/spk/spk_20260430_120000.docx
 * GET ?path=output/project/spk/values.json
 */

$root = dirname(__DIR__);
$rel  = ltrim($_GET['path'] ?? '', '/');
$full = realpath($root . '/' . $rel);

// Must resolve inside docgen root and exist
if (!$full || strpos($full, realpath($root) . DIRECTORY_SEPARATOR) !== 0 || !file_exists($full)) {
    http_response_code(404);
    echo 'File not found';
    exit;
}

$filename = basename($full);
$ext      = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

$mimeMap = [
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'json' => 'application/json',
    'pdf'  => 'application/pdf',
];
$mime = isset($mimeMap[$ext]) ? $mimeMap[$ext] : 'application/octet-stream';

header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($full));
header('Cache-Control: no-cache');

// JSON served inline so fetch() can read it; everything else forced download
if ($ext === 'json') {
    header('Content-Disposition: inline; filename="' . $filename . '"');
} else {
    header('Content-Disposition: attachment; filename="' . $filename . '"');
}

readfile($full);
