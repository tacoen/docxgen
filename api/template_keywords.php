<?php
/**
 * api/template_keywords.php — Extract ${keywords} from a .docx template
 *
 * GET ?model=spk&template=spk-template.docx
 *
 * Returns: { keywords: [...], missing: [...], extra: [...] }
 *   keywords : all ${...} found in the .docx
 *   missing  : in .docx but NOT in fields.json  → will be left blank
 *   extra    : in fields.json but NOT in .docx   → unused fields
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$root     = dirname(__DIR__);
$model    = preg_replace('/[^a-zA-Z0-9\-_]/', '', $_GET['model']    ?? '');
$template = basename($_GET['template'] ?? '');

if (!$model || !$template) {
    http_response_code(400);
    echo json_encode(['error' => 'model and template are required']);
    exit;
}

$templatePath = $root . '/models/' . $model . '/' . $template;
$fieldsPath   = $root . '/models/' . $model . '/fields.json';

if (!file_exists($templatePath)) {
    http_response_code(404);
    echo json_encode(['error' => 'Template not found']);
    exit;
}

// ── Extract keywords from .docx (it's a zip of XML files) ────────────────────
$zip = new ZipArchive();
if ($zip->open($templatePath) !== true) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not open .docx file']);
    exit;
}

$keywords = [];

// PhpWord stores placeholders in word/document.xml and headers/footers
$xmlFiles = ['word/document.xml', 'word/header1.xml', 'word/header2.xml',
             'word/footer1.xml',  'word/footer2.xml'];

foreach ($xmlFiles as $xmlFile) {
    $content = $zip->getFromName($xmlFile);
    if ($content === false) continue;

    // Strip XML tags so split run placeholders are joined
    $plain = preg_replace('/<[^>]+>/', '', $content);

    preg_match_all('/\$\{([^}]+)\}/', $plain, $matches);
    foreach ($matches[1] as $kw) {
        $keywords[] = trim($kw);
    }
}
$zip->close();

$keywords = array_values(array_unique($keywords));
sort($keywords);

// ── Load fields.json keywords ─────────────────────────────────────────────────
$fieldKeys = [];
if (file_exists($fieldsPath)) {
    $schema = json_decode(file_get_contents($fieldsPath), true) ?? [];
    foreach ($schema as $group => $fields) {
        foreach (array_keys($fields) as $key) {
            $fieldKeys[] = $key;
        }
    }
}

// Always-available built-ins
$builtins  = ['hariIni', 'bulanIni', 'tahunIni'];
$allKnown  = array_merge($fieldKeys, $builtins);

$missing = array_values(array_diff($keywords, $allKnown));   // in docx, not in fields
$extra   = array_values(array_diff($fieldKeys, $keywords));  // in fields, not in docx

echo json_encode([
    'model'    => $model,
    'template' => $template,
    'keywords' => $keywords,
    'missing'  => $missing,
    'extra'    => $extra,
    'builtins' => $builtins,
]);
