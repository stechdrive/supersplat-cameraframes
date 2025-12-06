# Camera Frames E2E Test Scenario (Evidence Collection)

## Objective
Automate the manual labor of verifying "Composition Stability" by performing the UI operations and capturing clear "Before/After" evidence for human review.

## Prerequisites
- Local development server running (http://localhost:3000)
- Browser access

## Test Steps

### 1. Preparation & Baseline
1.  **Setup**: Open app, enable Camera Frames.
2.  **Framing**: Center on a recognizable object.
3.  **Capture**: Take Screenshot A (`1_baseline.png`).

### 2. The "Stability" Operation
1.  **Operate**: Change Anchor (e.g. to Top-Left) and Resize (e.g. Scale 120%).
    - *Note*: This mimics the user workflow that needs verification.
2.  **Capture**: Take Screenshot B (`2_after_resize.png`).

### 3. Export Verification (Optional but Recommended)
1.  **Export Baseline**: Export image from state 1.
2.  **Export Resized**: Export image from state 2.
    - *Goal*: These two files can be compared. If composition is maintained, the subject content should be identical (just resolution differs).

## Success Criteria (Agent Side)
- Agent completes all steps without error.
- Screenshots `1_baseline.png` and `2_after_resize.png` are successfully saved and embedded in the report.

## Human Verification (User Side)
- Open the generated `walkthrough.md`.
- Look at the side-by-side images.
- **Judge**: Does the 3D object stay in the same relative position?
