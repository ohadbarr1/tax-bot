# Form 135 Field Position Calibration

## Problem

All income/deduction values were rendered at `x=260`, which placed them **outside** the data-entry boxes and into the Hebrew description text area (tan background). The form looked blank where numbers should appear.

## Root Cause

The field coordinate map was initially estimated by reading label positions from the PDF content stream (TT1 font `Tm` operators, which give the position of the field *code* label like "158", "042"). The original comment said "data drawn just to the RIGHT of each label", which placed data at `x=260` — past the right edge of the data box.

## How the Boxes Are Laid Out

The Form 135 income section (page 1) has two side-by-side data columns:

| Column | x range | Contents |
|---|---|---|
| Left (secondary employer) | `x = 31 – 132` | Fields 172, 069, 272, … |
| Right (main employer + capital gains) | `x = 134 – 235` | Fields 158, 068, 258, 060, 067, 157, … |

Hebrew description text begins at `x ≈ 236` rightward.

Field code labels (e.g. "158", "060") are printed near the **right edge** of their box at `x ≈ 222`. They are visual identifiers, not left-edge anchors.

## How the Fix Was Found

1. Decompressed the PDF's FlateDecode content streams with `zlib.inflateSync`.
2. Parsed `re` (rectangle) operators to get all box boundaries:
   ```
   LEFT  box: x = 31.3  → 132.4  (width ≈ 101 pt)
   RIGHT box: x = 134.0 → 235.2  (width ≈ 101 pt)
   ```
3. Generated `form135_verify.pdf` with box outlines + test value "300,148" at `x=145` — confirmed visually that x=145 lands in the white data entry area, left of the "158" code.
4. Confirmed with `pdfjs-dist` text extraction on the final PDF: all overlaid numbers report `x=145`.

## Fix Applied

In `app/api/generate/form-135/route.ts`, the `F` coordinate map was updated:

```
BEFORE:  x = 260  (outside box — in description area)
AFTER:   x = 145  (left side of right box, x=134–235)
```

Secondary employer severance (`x = 127 → 40`) was adjusted to avoid overflow of the left box (`x = 31–132`).

### Final coordinate map (key fields)

| Field | y | x | Box |
|---|---|---|---|
| grossSalary (158) | 338 | 145 | right x=134–235 |
| taxWithheld (068) | 319 | 145 | right x=134–235 |
| pension (258) | 300 | 145 | right x=134–235 |
| severance (272) | 300 |  40 | left  x=31–132  |
| capitalGain (060) | 209 | 145 | right x=134–235 |
| capitalLoss (067) | 191 | 145 | right x=134–235 |
| foreignTax (157) | 173 | 145 | right x=134–235 |
| donations (078) | 121 | 145 | right x=134–235 |
| lifeInsurance (126) | 103 | 145 | right x=134–235 |
| indPension (142) |  85 | 145 | right x=134–235 |

Y values were confirmed against rect midpoints extracted from the content stream.

## Verification

```bash
node -e "
(async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = require('fs').readFileSync('/tmp/form135_clean.pdf');
  const doc  = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  content.items
    .filter(i => /^[\d,]+$/.test(i.str.trim()))
    .map(i => ({ str: i.str.trim(), x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }))
    .filter(i => i.y > 60 && i.y < 400)
    .sort((a,b) => b.y - a.y)
    .forEach(i => console.log('x='+i.x+', y='+i.y+': '+i.str));
})();
"
# Expected: all income/deduction values report x=145
```

Date confirmed: 2025-04-14.
