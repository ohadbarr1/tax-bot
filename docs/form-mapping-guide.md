# Form Mapping Guide

How to add a new Israeli tax form to the PDF generation system.

## Architecture

Each form uses an **overlay architecture**: load the official PDF as a
template, then `drawText()` data values at precise (x,y) coordinates.
The ITA forms have zero AcroForm fields — they are static vector PDFs.

## Step-by-step Process

### 1. Obtain the Official PDF

Download the form from the Israel Tax Authority (gov.il) and place it in:
```
public/templates/form{ID}_{YEAR}.pdf
```

### 2. Extract Field Code Positions

Use `pdftotext -bbox` to extract text positions in HTML format:
```bash
pdftotext -bbox "path/to/form.pdf" /tmp/form_bbox.html
```

Then parse field codes (the 2-3 digit numbers printed on the form) with
their coordinates. Convert HTML coordinates (top-left origin) to PDF
coordinates (bottom-left origin):
```
pdf_y = page_height - html_yMin
```

Script example:
```python
import re
with open('/tmp/form_bbox.html') as f:
    html = f.read()
for m in re.finditer(
    r'<word xMin="([^"]+)" yMin="([^"]+)".*?>(\d{2,3})</word>', html):
    xmin, ymin, code = m.groups()
    pdf_y = 841.89 - float(ymin)  # A4 height
    print(f"Code {code}  x={float(xmin):.1f}  y={pdf_y:.1f}")
```

### 3. Create a Calibration Grid PDF

Overlay a coordinate grid on the form for visual reference:
```bash
node scripts/calibrate-form.js
```

The script (see `scripts/calibrate-form.js`) draws blue vertical lines
every 50pt and red horizontal lines every 50pt with labels.

### 4. Compute Data Entry Positions

Field code labels sit at the RIGHT edge of their input box (in RTL layout).
Data is drawn to the LEFT of the label, inside the input box.

**Offset formula** (validated on forms 135 and 1301):
```
data_x = label_x - 77   (right/center column)
data_x = label_x - 79   (left column)
data_y = label_y + 3     (3pt above label baseline)
```

### 5. Create the Field Map JSON

Place in `data/form{ID}_{YEAR}_fields.json`:
```json
{
  "formId": "135",
  "year": 2025,
  "template": "form135_2025.pdf",
  "pageSize": { "width": 595.275, "height": 841.89 },
  "fields": {
    "fieldKey": {
      "pg": 0,
      "x": 144.8,
      "y": 346.0,
      "sz": 11,
      "font": "latin-bold",
      "labelPos": { "x": 221.8, "y": 343.0 },
      "fieldCode": "158"
    }
  }
}
```

Font values:
- `"latin-bold"` — HelveticaBold for numbers/IDs
- `"hebrew"` — Assistant-Regular.ttf for Hebrew text

### 6. Build the Field Value Extractor

Add a `buildForm{ID}Fields()` function to `lib/pdfUtils.ts` that maps
`TaxPayer` + `FinancialData` to a flat record of string values.

### 7. Create the Route Handler

Copy the pattern from `app/api/generate/form-135/route.ts`:
1. Load template PDF
2. Register fontkit, embed Hebrew + Latin fonts
3. Call `buildForm{ID}Fields()` for values
4. Build draw list: `{ key, text, spec }[]`
5. Draw all fields with `page.drawText()`
6. Serialize and return

### 8. Run Calibration Verification

Generate a test PDF with sample data and visually verify:
```bash
# POST with calibrate:true to get red labels on each field
curl -X POST http://localhost:3000/api/generate/form-{ID} \
  -H 'Content-Type: application/json' \
  -d '{"taxpayer":{...},"financials":{...},"calibrate":true}' \
  -o /tmp/calibration.pdf
```

### 9. Iterate

Adjust coordinates in the JSON field map, re-run calibration, repeat
until all fields land perfectly inside their input boxes.

## Font Strategy

| Content | Font | Why |
|---------|------|-----|
| Numbers, IDs, amounts | HelveticaBold | Hebrew-subset fonts lack digits |
| Hebrew text (names, addresses) | Assistant-Regular.ttf | Full Hebrew glyph set |

Hebrew text must be character-reversed for pdf-lib (it renders LTR only).
Use `hebrewForPdf()` from `lib/pdfUtils.ts`.

## Multi-Page Forms

Use the `pg` field in each FieldSpec. The route handler indexes into
`pdfDoc.getPage(spec.pg)` for each field.

## Form Type Selection

`lib/formTypeSelector.ts` determines which form a taxpayer needs based on
their income sources. See inline comments for the decision criteria.

## File Inventory

```
public/templates/
  form135_2025.pdf          # Official 2025 form 135 template
  form1301_2025.pdf         # Official 2025 form 1301 template

data/
  form135_2025_fields.json  # Field coordinate map for 135
  form1301_2025_fields.json # Field coordinate map for 1301

lib/
  pdfUtils.ts               # Field extractors + RTL helpers
  formTypeSelector.ts       # 135 vs 1301 decision logic

app/api/generate/
  form-135/route.ts         # PDF generation endpoint for 135
  form-1301/route.ts        # PDF generation endpoint for 1301

scripts/
  calibrate-form.js         # Calibration grid generator

docs/
  form-mapping-guide.md     # This file
```
