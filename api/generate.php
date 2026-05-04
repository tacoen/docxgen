<?php
/**
 * api/generate.php — Fill a .docx template with form data
 *
 * POST JSON:
 * {
 *   "project":  "kontrak-jalan-2024",
 *   "model":    "spk",
 *   "template": "template.docx",
 *   "fields":   { "noRup": "...", "namaPaket": "...", ... }
 * }
 *
 * Returns: { success, filename, download_url }
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

// ── Vendor check ─────────────────────────────────────────────────────────────
$root        = dirname(__DIR__);
$autoload    = $root . '/vendor/autoload.php';

if (!file_exists($autoload)) {
    http_response_code(500);
    echo json_encode([
        'error' => 'vendor/ folder not found. Please ship phpoffice/phpword with this project. Run: composer install'
    ]);
    exit;
}

require $autoload;
use PhpOffice\PhpWord\TemplateProcessor;

// ── Parse body ───────────────────────────────────────────────────────────────
$body = json_decode(file_get_contents('php://input'), true);
if (!$body) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

$project  = preg_replace('/[^a-zA-Z0-9\-_]/', '', $body['project']  ?? '');
$model    = preg_replace('/[^a-zA-Z0-9\-_]/', '', $body['model']    ?? '');
$template = basename($body['template'] ?? '');
$fields   = $body['fields'] ?? [];

foreach (['project' => $project, 'model' => $model, 'template' => $template] as $k => $v) {
    if (!$v) {
        http_response_code(400);
        echo json_encode(['error' => $k . ' is required']);
        exit;
    }
}

// ── Paths ────────────────────────────────────────────────────────────────────
$templatePath = $root . '/models/' . $model . '/' . $template;
$outputDir    = $root . '/output/' . $project . '/' . $model . '/';

if (!file_exists($templatePath)) {
    http_response_code(404);
    echo json_encode(['error' => 'Template not found: models/' . $model . '/' . $template]);
    exit;
}

if (!is_dir($outputDir)) mkdir($outputDir, 0755, true);

// ── Fill template ─────────────────────────────────────────────────────────────
try {
    $proc = new TemplateProcessor($templatePath);

    // Built-in values always available in any template
    $proc->setValue('hariIni',  date('d-m-Y'));
    $proc->setValue('bulanIni', bulanId(date('n')) . ' ' . date('Y'));
    $proc->setValue('tahunIni', date('Y'));
    $proc->setValue('project',  $project);
    $proc->setValue('model',    $model);

    // Date fields — also resolve *Long sibling server-side as fallback
    $dateFields = [];
    $fieldsJson = $root . '/models/' . $model . '/fields.json';
    if (file_exists($fieldsJson)) {
        $schema = json_decode(file_get_contents($fieldsJson), true) ?? [];
        foreach ($schema as $group => $groupFields) {
            foreach ($groupFields as $key => $def) {
                if (is_array($def) && ($def['func'] ?? '') === 'date') {
                    $dateFields[] = $key;
                }
            }
        }
    }

    foreach ($fields as $key => $value) {
        $value = (string)($value ?? '');

        // Skip internal keys
        if (substr($key, 0, 1) === '_') continue;

        // For date fields, also resolve Long sibling if not provided
        if (in_array($key, $dateFields) && preg_match('/^\d{2}\/\d{2}\/\d{4}$/', $value)) {
            $proc->setValue($key, $value);
            $longKey = $key . 'Long';
            if (empty($fields[$longKey])) {
                $proc->setValue($longKey, tanggalPanjang($value));
            }
        } else {
            $proc->setValue($key, $value);
        }
    }

    // ── Save .docx ────────────────────────────────────────────────────────────
    $timestamp  = date('Ymd_His');
    $filename   = $model . '_' . $timestamp . '.docx';
    $outputPath = $outputDir . $filename;
    $proc->saveAs($outputPath);

    // ── Save per-output values_{timestamp}.json snapshot ─────────────────────
    $snapshot = array_filter($fields, function($k) {
        return substr($k, 0, 1) !== '_';
    }, ARRAY_FILTER_USE_KEY);
    $snapshot['_meta'] = [
        'generated_at' => date('c'),
        'project'      => $project,
        'model'        => $model,
        'template'     => $template,
        'docx_file'    => $filename,
    ];
    $snapshotJson = json_encode($snapshot, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

    // Per-output snapshot — one per generated .docx, never overwritten
    file_put_contents($outputDir . 'values_' . $timestamp . '.json', $snapshotJson);

    // Also keep values.json as the "latest" for quick restore
    file_put_contents($outputDir . 'values.json', $snapshotJson);

    $dlPath = 'output/' . $project . '/' . $model . '/' . $filename;
    echo json_encode([
        'success'      => true,
        'filename'     => $filename,
        'project'      => $project,
        'model'        => $model,
        'download_url' => 'api/download.php?path=' . urlencode($dlPath),
        'generated_at' => date('d-m-Y H:i:s'),
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function bulanId(int $m): string {
    return ['','Januari','Februari','Maret','April','Mei','Juni',
            'Juli','Agustus','September','Oktober','November','Desember'][$m] ?? '';
}

/** dd/mm/yyyy → "5 Mei 2026" */
function tanggalPanjang(string $dmy): string {
    $p = explode('/', $dmy);
    if (count($p) !== 3) return $dmy;
    return (int)$p[0] . ' ' . bulanId((int)$p[1]) . ' ' . $p[2];
}