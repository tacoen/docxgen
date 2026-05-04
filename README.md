# DocGen

A local document generator that fills `.docx` Word templates with form data. Built on PHP + PhpWord, runs entirely on your machine.

---

## Requirements

- PHP 7.4+
- Composer
- A modern browser

---

## Installation

```bash
git clone <repo>
cd docgen
composer install
php -S localhost:8000 router.php
```

Open `http://localhost:8000` in your browser.

### `composer.json`

Already included in the repo. Contents for reference:

```json
{
    "name": "docgen/template-processor",
    "description": "DOCX template processor — fills Word documents from JSON form data",
    "type": "project",
    "require": {
        "php": ">=7.4",
        "phpoffice/phpword": "^1.3"
    },
    "autoload": {
        "psr-4": {
            "DocGen\\": "src/"
        }
    },
    "config": {
        "optimize-autoloader": true
    }
}
```

`composer install` will download PhpWord into `vendor/` — this is the only dependency.

---

## Folder structure

```
docgen/
├── api/
│   ├── delete.php            # Delete templates or output files
│   ├── download.php          # Stream files to browser
│   ├── fields.php            # Serve a model's fields.json
│   ├── generate.php          # Fill template and save output
│   ├── list.php              # Directory listings
│   ├── model_create.php      # Scaffold a new model folder
│   ├── template_keywords.php # Scan a .docx for ${keywords}
│   └── upload.php            # Upload .docx templates
├── models/
│   └── {model}/
│       ├── fields.json       # Field definitions (see FIELDS.md)
│       └── *.docx            # Word templates
├── output/
│   └── {project}/
│       └── {model}/
│           ├── *.docx             # Generated documents
│           ├── values.json        # Latest field snapshot
│           └── values_*.json      # Per-output snapshots
├── index.html
├── script.js
├── style.css
├── router.php
├── README.md
└── FIELDS.md
```

---

## Creating a new model

A **model** is a document type (e.g. `spk`, `mou`, `surat-perintah`). Each model has its own folder, field definitions, and templates.

### Option A — From the browser (recommended)

1. Click **＋ New Model** in the sidebar
2. Enter a model name (slug, no spaces — e.g. `mou`)
3. Optionally copy `fields.json` from an existing model as a starting point
4. Click **Create**

### Option B — Manually

```bash
mkdir models/mou
cp models/spk/fields.json models/mou/fields.json
# edit models/mou/fields.json
```

---

## Adding a template

1. Create a `.docx` file in Microsoft Word or LibreOffice
2. Insert placeholders using the syntax `${fieldKey}` anywhere in the document — in paragraphs, tables, headers, footers
3. In DocGen, select your model, go to **Templates**, and upload the file
4. Use the **Keywords** tab to see all available `${keyword}` placeholders and their current values

---

## Generating a document

1. Select a **Model** from the sidebar
2. Set a **Project** name (determines the output folder)
3. Fill in the form fields
4. Check one or more templates in the project strip
5. Click **⚡ Generate**

Output files are saved to `output/{project}/{model}/` and downloaded automatically.

---

## Built-in keywords

These are available in every template without adding them to `fields.json`:

| Keyword | Output |
|---|---|
| `${project}` | Current project name/code |
| `${model}` | Current model name |
| `${hariIni}` | Today's date — `dd-mm-yyyy` |
| `${bulanIni}` | Current month and year — `Mei 2026` |
| `${tahunIni}` | Current year — `2026` |

---

## Tips

- **Keywords tab** — lists all `${keyword}` for the loaded model, sorted A-Z, with current values. Click any row to copy to clipboard.
- **Last date** — every date field shows a `← dd/mm/yyyy` link. Click it to fill that field with the most recently entered date — useful when all dates in a document are the same.
- **Restore** — if you previously generated a document for a project+model, a banner appears offering to restore the last used field values.
- **Cache** — use **🧹 Cache** in the form buttons to selectively clear localStorage drafts, template selections, project/model memory, or output history.
- **Bulk generate** — select multiple templates and generate all in one click. Each file downloads automatically.

---

## Project vs Model

| Concept | Example | Purpose |
|---|---|---|
| Model | `spk` | The document type — defines fields and templates |
| Project | `voj-2024` | The job/contract — determines the output folder |

One project can generate documents from multiple models. One model can be reused across many projects.

