<?php
/**
 * api/list.php — Directory listings
 *
 * GET ?type=models                          → list all models (models/ subdirs)
 * GET ?type=templates&model=spk             → list .docx in models/spk/
 * GET ?type=projects                        → list output/ subdirs
 * GET ?type=outputs&project=X              → list output/X/ subdirs (models used)
 * GET ?type=files&project=X&model=spk      → list .docx in output/X/spk/
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$root = dirname(__DIR__);
$type = $_GET['type'] ?? '';

function safeName(string $s): string {
    return preg_replace('/[^a-zA-Z0-9\-_ ]/', '', $s);
}

switch ($type) {

    // ── All available models ──────────────────────────────────────────────────
    case 'models':
        $dir     = $root . '/models/';
        $models  = [];
        if (is_dir($dir)) {
            foreach (array_filter(glob($dir . '*'), 'is_dir') as $d) {
                $name   = basename($d);
                $hasFld = file_exists($d . '/fields.json');
                $tpls   = count(glob($d . '/*.docx') ?: []);
                $models[] = [
                    'name'       => $name,
                    'has_fields' => $hasFld,
                    'templates'  => $tpls,
                ];
            }
        }
        echo json_encode(['models' => $models]);
        break;

    // ── Templates for a specific model ───────────────────────────────────────
    case 'templates':
        $model = safeName($_GET['model'] ?? '');
        if (!$model) { http_response_code(400); echo json_encode(['error' => 'model required']); exit; }
        $dir   = $root . '/models/' . $model . '/';
        $files = glob($dir . '*.docx') ?: [];
        $list  = array_map(function($f) {
            return [
                'name' => basename($f),
                'size' => filesize($f),
                'date' => date('d-m-Y H:i', filemtime($f)),
            ];
        }, $files);
        echo json_encode(['model' => $model, 'templates' => $list]);
        break;

    // ── All projects (output/ subdirs) ───────────────────────────────────────
    case 'projects':
        $dir      = $root . '/output/';
        $projects = [];
        if (is_dir($dir)) {
            foreach (array_filter(glob($dir . '*'), 'is_dir') as $d) {
                $projects[] = ['name' => basename($d)];
            }
        }
        echo json_encode(['projects' => $projects]);
        break;

    // ── Models used within a project ─────────────────────────────────────────
    case 'outputs':
        $project = safeName($_GET['project'] ?? '');
        if (!$project) { http_response_code(400); echo json_encode(['error' => 'project required']); exit; }
        $dir  = $root . '/output/' . $project . '/';
        $list = [];
        if (is_dir($dir)) {
            foreach (array_filter(glob($dir . '*'), 'is_dir') as $d) {
                $model = basename($d);
                $list[] = [
                    'model'      => $model,
                    'file_count' => count(glob($d . '/*.docx') ?: []),
                    'has_values' => file_exists($d . '/values.json'),
                ];
            }
        }
        echo json_encode(['project' => $project, 'outputs' => $list]);
        break;

    // ── .docx files for a project+model ──────────────────────────────────────
    case 'files':
        $project = safeName($_GET['project'] ?? '');
        $model   = safeName($_GET['model']   ?? '');
        if (!$project || !$model) { http_response_code(400); echo json_encode(['error' => 'project and model required']); exit; }
        $dir   = $root . '/output/' . $project . '/' . $model . '/';
        $files = glob($dir . '*.docx') ?: [];
        $list  = array_map(function($f) use ($project, $model) {
            return [
                'filename' => basename($f),
                'size'     => filesize($f),
                'date'     => date('d-m-Y H:i', filemtime($f)),
                'path'     => 'output/' . $project . '/' . $model . '/' . basename($f),
            ];
        }, $files);
        echo json_encode(['project' => $project, 'model' => $model, 'files' => $list]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid type: ' . $type]);
}
