# Auto Fit Export

Adobe Illustrator script that batch-exports every **Data Set** from the active artboard as JPG, PNG, or PDF. Optionally auto-fits **Area Type** text frames that were selected before running the script.

## Requirements

- Document has Variables + Data Sets
- For Auto Fit: select Area Type frames (not Point Type) **before** running the script
- A writable export folder

## How to use

1. Open your `.ai` template
2. (Optional) Select one or more Area Type frames to auto-fit
3. **File → Scripts → Other Script…** → choose `auto-fit-export.jsx`
4. In the dialog: pick format, settings, and export folder
5. If frames were selected, **Auto Fit** can be checked; otherwise the checkbox stays disabled
6. Click **Export**

Output files are named after each Data Set (spaces preserved). When Auto Fit is on, font sizes are restored to the design size after export finishes.

## Notes

- Selection is read once when the script starts (no live refresh / polling)
- Prefs (format, folder, PPI, Auto Fit, etc.) are saved under Illustrator’s user data folder
- PDF export uses a document duplicate + PDF Preset so the original `.ai` stays open
