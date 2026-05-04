# FIELDS.md — Model Field Reference

`fields.json` defines every form field for a model. It lives at `models/{model}/fields.json`.

---

## File structure

```json
{
  "Group Name": {
    "fieldKey": "default value",
    "fieldKey": { ...options }
  }
}
```

Fields are organized into named **groups** — each group renders as a card in the form. Within each group, fields appear in the order they are defined.

---

## Two ways to define a field

### 1. Plain string — input with a default value

```json
"namaRekanan": "NAMA DIREKTUR"
```

Renders as a plain text input. The string is the pre-filled default. Use `""` for no default.

### 2. Object — full control

```json
"fieldKey": {
  "default": "...",
  "note":    "...",
  "func":    "...",
  "source":  "...",
  "prefix":  "...",
  "suffix":  "...",
  "row":     "..."
}
```

All properties are optional.

---

## Properties

### `default`

Pre-filled value when the form loads or after clicking Clear.

```json
"jangkaWaktu": { "default": "30" }
"nilaiKon":    { "default": "0", "func": "nilai" }
"bendahara":   { "default": "NAMA BENDAHARA", "row": "row-bendahara" }
```

---

### `note`

Placeholder hint shown inside the input field.

```json
"tglSpk": { "func": "date", "note": "dd/mm/yyyy" }
```

---

### `func`

Declares the field's behaviour. Case-insensitive.

| func | Role | Behaviour |
|---|---|---|
| `date` | Input | Masks typing to `dd/mm/yyyy`. Shows long-date hint. Saves as last-used date. |
| `nilai` | Input | Formats number with Indonesian thousand separators (e.g. `200.000.000`) |
| `autolong` | Derived | Auto-fills the long-form Indonesian date from a `source` date field |
| `hari` | Derived | Auto-fills the Indonesian day name (Senin, Selasa…) from a `source` date field |
| `terbilang` | Derived | Auto-fills Indonesian words for a number from a `source` field. Supports `prefix`/`suffix`. |
| `abbr` | Derived | Auto-fills an uppercase abbreviation from the first letter of each significant word in a `source` text field |
| `calcdate` | Derived | Auto-fills a date by adding N days to a start date. Requires `source` as an array: `[dateField, daysField]` |

**Derived fields** update automatically when their source changes. They are editable — the user can always override the auto-filled value directly.

---

### `source`

Required for all derived funcs. Points to the key(s) this field derives from.

String source (one field):
```json
"tglSpkLong":      { "func": "autolong",  "source": "tglSpk" }
"tglNamaHari":     { "func": "hari",      "source": "tglSp" }
"terbilang":       { "func": "terbilang", "source": "nilaiKon",    "suffix": " Rupiah" }
"jangkaWaktuKata": { "func": "terbilang", "source": "jangkaWaktu", "suffix": " hari" }
"kodeTagih":       { "func": "abbr",      "source": "namaPaket" }
```

Array source (for `calcdate` only — `[startDateField, daysField]`):
```json
"tglSelesai": { "func": "calcdate", "source": ["tglSpk", "jangkaWaktu"], "note": "dd/mm/yyyy" }
```

---

### `prefix` and `suffix`

Only used with `func: terbilang`. Added before or after the spelled-out number.

```json
{ "func": "terbilang", "source": "nilaiKon",    "suffix": " Rupiah" }
→ "dua puluh juta Rupiah"

{ "func": "terbilang", "source": "jangkaWaktu", "suffix": " hari" }
→ "tiga puluh hari"

{ "func": "terbilang", "source": "nilaiKon", "prefix": "Rp. ", "suffix": ",-" }
→ "Rp. dua puluh juta,-"
```

---

### `row`

Groups fields side by side in one horizontal row. Any fields sharing the same `row` value are placed together. The grid adjusts automatically: 2 fields → 2 columns, 3 fields → 3 columns.

```json
"bendahara":    { "default": "NAMA BENDAHARA",       "row": "row-bendahara" }
"bendaharaNIP": { "default": "NIP BENDAHARA", "row": "row-bendahara" }
```
→ `[ bendahara ] [ bendaharaNIP ]`

```json
"tglSp":       { "func": "date",     "note": "dd/mm/yyyy", "row": "row-tglsp" }
"tglNamaHari": { "func": "hari",     "source": "tglSp",    "row": "row-tglsp" }
"tglSpLong":   { "func": "autolong", "source": "tglSp",    "row": "row-tglsp" }
```
→ `[ tglSp ] [ tglNamaHari ] [ tglSpLong ]`

> **Rule:** `row` values must be unique across the entire `fields.json`. Do not reuse the same row key in different groups.

---

## Built-in keywords

These are injected on every generate — never add them to `fields.json`:

| Keyword | Example value |
|---|---|
| `${project}` | `voj-2024` |
| `${model}` | `spk` |
| `${hariIni}` | `04-05-2026` |
| `${bulanIni}` | `Mei 2026` |
| `${tahunIni}` | `2026` |

---

## `abbr` stop words

The `abbr` func ignores these common words when building the abbreviation:

`dan, di, ke, dari, atau, yang, untuk, dengan, pada, dalam, oleh, the, of, and, or, to, in, at, by, for, a, an`

So `"pengadaan dan instalasi jaringan"` → `"PIJ"` (skips `dan`).

---

## Rules

- Every derived func (`autolong`, `hari`, `terbilang`, `abbr`, `calcdate`) **must** have a `source`
- `calcdate` source must be an **array**: `["dateField", "daysField"]`
- `row` keys must be **unique across the whole file**
- `prefix` and `suffix` only apply to `terbilang`
- Field names (`func` values) are **case-insensitive** — `autoLong`, `autolong`, `AUTOLONG` all work
- Field order within a group = display order in the form
- Plain string shorthand `"key": "value"` cannot use `func` — use object form if you need any option

---

## Complete working example

```json
{
  "Info": {
    "noSpk":           "",
    "namaPaket":       "",
    "nilaiKon":        { "func": "nilai",     "default": "0", "note": "Contoh: 200000000" },
    "terbilang":       { "func": "terbilang", "source": "nilaiKon", "suffix": " Rupiah" },
    "tglSpk":          { "func": "date",      "note": "dd/mm/yyyy" },
    "tglSpkLong":      { "func": "autolong",  "source": "tglSpk" },
    "jangkaWaktu":     { "default": "30",     "row": "row-jangka" },
    "jangkaWaktuKata": { "func": "terbilang", "source": "jangkaWaktu", "suffix": " hari", "row": "row-jangka" },
    "tglSelesai":      { "func": "calcdate",  "source": ["tglSpk", "jangkaWaktu"], "note": "dd/mm/yyyy" },
    "tglSelesaiLong":  { "func": "autolong",  "source": "tglSelesai" }
  },

  "Pejabat": {
    "pejabat":        { "default": "NAMA PEJABAT, S.Sos., M.Si", "row": "row-pejabat" },
    "jabatanKantor":  { "default": "Kepala Badan",                "row": "row-pejabat" },
    "pejabatNIP":     { "default": "NIP PEJABAT",       "row": "row-pejabat" }
  },

  "Rekanan": {
    "namaRekanan":    "PT NAMA PERUSAHAAN",
    "alamatRekanan":  "Jl. Alamat No. 1",
    "jabatanRekanan": "DIREKTUR"
  },

  "Dokumen": {
    "kodeTagih":  { "func": "abbr",     "source": "namaPaket", "row": "row-tagih" },
    "noSurTagih": {                                              "row": "row-tagih" },
    "tglTagih":   { "func": "date",     "note": "dd/mm/yyyy",  "row": "row-tagih" },
    "tglTagihLong": { "func": "autolong", "source": "tglTagih","row": "row-tagih" }
  }
}
```

---

## Word template tips

- Use `${fieldKey}` anywhere in the `.docx` — paragraphs, tables, headers, footers
- The **Keywords** tab in DocGen lists every placeholder for the loaded model with its current value
- The **Template Keyword Scanner** (Templates tab) scans your `.docx` and warns if any `${keyword}` is missing from `fields.json` or vice versa
- Keyword matching is exact and case-sensitive — `${NamaRekanan}` ≠ `${namaRekanan}`

