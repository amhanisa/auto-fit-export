# Auto Fit Export

Adobe Illustrator script that walks every **Data Set**, auto-fits selected **Area Type** text frames to their boxes, then exports each set as JPG, PNG, and/or PDF.

## Requirements

- Document has Variables + Data Sets
- Target frames are Area Type (not Point Type)
- For PDF export, the `.ai` file must already be saved

## How to use

1. Open your `.ai` template
2. Select one or more Area Type frames to auto-fit
3. **File → Scripts → Other Script…** → choose `auto-fit-export.jsx`
4. Pick formats (JPG / PNG / PDF), PPI for raster, and an output folder

Output files are named after each Data Set. Font sizes are restored to the design size after export finishes.
