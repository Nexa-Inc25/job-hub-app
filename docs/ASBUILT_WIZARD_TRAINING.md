# As-Built Wizard — Training Guide

**For:** Foremen, General Foremen, Crew Leads  
**System:** FieldLedger As-Built Wizard  
**Utility:** PG&E (TD-2051P-10) — other utilities follow the same flow with their own forms

---

## What Is the As-Built Wizard?

The As-Built Wizard guides you through completing your as-built package step by step. Instead of flipping through a PDF and hoping you filled out every field, the wizard:

- **Auto-fills** everything it can from the job data (PM#, address, date, your LAN ID)
- **Tells you exactly** which documents are required for your work type
- **Validates** your package before submission so nothing gets kicked back
- **Replaces PDF checkbox hunting** with a native mobile checklist

---

## How to Access the Wizard

1. Open the job in FieldLedger
2. Navigate to the job details page (`/jobs/:jobId`)
3. Tap **"Complete As-Built"** (or go directly to `/jobs/:jobId/asbuilt-wizard`)

---

## Step-by-Step Walkthrough

### Step 1: Confirm Work Type

**What you do:** The wizard auto-detects your work type from the job data. Confirm it's correct by tapping the right card.

**Work types:**

| Work Type | When to Use |
|-----------|------------|
| **Estimated Work** | Standard estimated jobs — pole replacement, line extension, service upgrade |
| **EC Corrective (Tag Work)** | Electric corrective maintenance from an EC tag |
| **Emergency Restoration** | Emergency corrective restoration |
| **Express Connections** | Express connection in-scope MAT work |
| **Applicant Work** | Applicant-designed installation |
| **Preventive Maintenance** | Scheduled PM work |

**Why it matters:** The work type determines which documents you need to complete. An EC tag job needs fewer documents than a full estimated job.

After tapping your work type, the wizard builds your personalized step list. You'll only see steps that apply to your job.

---

### Step 2: EC Tag Completion

**What you do:** Complete the EC tag with your hours, status, and signature.

**Pre-filled fields (you just verify):**
- **LAN ID** — from your FieldLedger profile
- **Completion Date** — today's date
- **Crew Type** — Contractor (default for CC companies)
- **Actual Hours** — from your timesheet if you've already logged hours

**Fields you fill in:**
1. **Completion Status** — tap one:
   - ✅ **Completed** — work is done
   - ❌ **Canceled** — work was canceled (must select a reason)
   - 🔍 **Found Completed Upon Arrival** — someone else already did it

2. **Actual Hours** — edit if the pre-filled number isn't right

3. **Signature** — tap "Tap to Sign." If you've signed before, your saved signature auto-loads. Otherwise, draw your signature with your finger.

4. Tap **"Complete EC Tag"**

---

### Step 3: Construction Sketch Markup

**What you do:** Red-line or blue-line the construction sketch to show what changed. Or, if nothing changed from the design, tap "Built As Designed."

#### Option A: Built As Designed (No Changes)

If the job was built exactly as the estimator designed it:
1. Tap the green **"Built As Designed"** button
2. Done — moves to next step

#### Option B: Redline / Blueline the Sketch

If anything changed from the original design, you need to mark it up:

1. Tap **"Open Sketch Markup Editor"**

2. **Set your color mode** (top of the toolbar):

| Color | When to Use | Example |
|-------|------------|---------|
| 🔴 **RED** | Something was **removed** or **changed** from the design | Old pole location, removed conductor |
| 🔵 **BLUE** | Something **new** was **added** or installed | New pole location, new conductor run |
| ⚫ **BLACK** | **Existing** infrastructure (for reference only) | Existing poles that weren't touched |

3. **Choose your tool:**

| Tool | Icon | What It Does |
|------|------|-------------|
| **Freehand** | ✏️ | Draw with your finger/stylus — for marking conductor paths, circling areas |
| **Line** | 📏 | Tap two points for a straight line — for conductor runs between poles |
| **Arrow** | ➡️ | Line with an arrowhead — for showing direction of service drops |
| **Text** | Aa | Type a note on the sketch — for callouts like "NEW 45' CL2 DF POLE" |
| **Symbol** | 🔧 | Place a PG&E standard symbol — poles, transformers, fuses, etc. |

4. **Using the Symbol Palette:**
   - Tap the **Symbol** tool button
   - A panel slides open on the left with symbol categories:
     - **Structure** — poles (wood/steel/concrete), crossarms, anchors
     - **Device** — transformers, fuses, switches, reclosers, capacitors
     - **Conductor** — primary OH, secondary OH, underground, service drops
     - **Marker** — Remove X (red only), New Install + (blue only), Transfer arrows
   - Tap a symbol, then tap on the sketch where you want to place it
   - The symbol will be drawn in your current color mode

5. **Useful markers:**
   - **Remove X** (red) — place over anything that was removed
   - **New Install +** (blue) — place where something new was installed
   - **Transfer ↔** — place where equipment was transferred pole to pole

6. **Zoom** in/out with the +/- buttons for precise placement

7. **Undo** the last action if you make a mistake

8. Tap **"Save"** when done

**Tips for good redlines:**
- Always mark the **old** location in RED and the **new** location in BLUE
- Use **symbols** instead of freehand drawing when possible — Mapping can read them faster
- Add **text callouts** for things symbols can't show (pole class, conductor size)
- If you used both red and blue, your markup is probably correct
- If everything is only one color, double-check — did you forget to mark removals or additions?

---

### Step 4: Completion Checklist (CCSC)

**What you do:** Check off every applicable item on the Construction Completion Standards Checklist.

**Pre-filled fields:**
- **PM/Order #** — from job data
- **Address** — from job data
- **Date** — today

**How to fill it out:**

1. The checklist is split into sections:
   - **Overhead (OH)** — 27 items for overhead work
   - **Underground (UG)** — 24 items for underground work
   - Only the sections relevant to your job scope are shown

2. **Safety-critical items** are highlighted in yellow with a 🛡️ shield icon. These **must** be checked — the system won't let you submit without them.

3. For each item, tap the checkbox if the condition is **compliant** (addressed, no hazard, or not applicable to this location).

4. **"Check All"** button — if everything in a section is compliant, tap this instead of checking 27 boxes one by one. Only use this if you've actually verified every item.

5. **Comments** — type anything relevant. "Built as designed" is common. If you found and addressed issues, note them here.

6. **Signature** — sign as crew lead

7. Tap **"Complete Checklist"**

**Common mistakes:**
- Don't skip safety items (yellow highlighted) — the system will block you
- Don't "Check All" without actually looking — QC will catch it
- If an item doesn't apply to your location, it's OK to check it (it means "addressed — not applicable")

---

### Step 5: Equipment Attributes (FDA)

**What you do:** Record the details of equipment you installed, replaced, or removed. This data goes directly to the Asset Registry (GIS + SAP).

**This step only appears for EC corrective and estimated work.**

**Sections shown depend on your job scope:**

#### Pole Attributes (most common)
- **Action** — Install, Replace, Remove, Transfer, No Change
- **Old Pole** (if replacing/removing): Class, Height, Species, Treatment, Year Set, SAP Equipment #
- **New Pole** (if installing/replacing): Class, Height, Species, Treatment, Year Set, Manufacturer

**Example for a pole replacement:**
- Action: **Replace**
- Old Pole: Class 4, 45', Douglas Fir, Penta, 1985
- New Pole: Class 2, 55', Douglas Fir, CU-NAP, 2026

#### Conductors (if applicable)
- Tap **"Add Conductor"** for each conductor you worked on
- Fill in: Action, Type (primary/secondary/neutral), Size (#4 ACSR), Material, Span Length, Phases

#### Transformer (if applicable)
- Action, KVA, Voltage, Serial Number, Manufacturer

#### Mapping Notes
- Anything else Mapping needs to know that doesn't fit the forms above

Tap **"Save Equipment Attributes"** when done.

---

### Step 6: Review & Submit

**What you do:** Verify everything is complete and submit the as-built package.

1. **Step summary** shows a checklist of completed/incomplete steps with ✅/⭕ icons

2. **UTVAC Score** — the system validates your package against PG&E's quality criteria:
   - **Completeness** — all required documents present
   - **Traceability** — your identity (LAN ID) and completion date captured
   - **Signatures** — EC tag and CCSC are signed
   - **Accuracy** — sketch has markup (or Built As Designed)
   - **Verifiability** — completion photos uploaded, GPS captured

3. **Errors** (red) — must be fixed before you can submit. Tap "Go to step" to jump back.

4. **Warnings** (yellow) — recommended but not required. Example: "Completion photos recommended."

5. If the score is green and there are no errors, tap **"Submit As-Built Package"**

6. Confirm in the dialog → your package goes to your supervisor for review, then to Clerical.

---

## After You Submit

- Your supervisor reviews the package
- Clerical checks completeness against PG&E's order close checklist
- Mapping uses your redlines and FDA data to update the Asset Registry (GIS + SAP)
- You can check status anytime from the job's As-Built Router page

---

## Quick Reference Card

| I need to... | Where to go |
|--------------|------------|
| Start an as-built | Job → Complete As-Built |
| Mark "no changes" | Sketch step → Built As Designed |
| Redline a change | Sketch step → RED mode → draw/symbol |
| Blueline a new install | Sketch step → BLUE mode → draw/symbol |
| Fill out the CCSC | Checklist step → check items → sign |
| Complete an EC tag | EC Tag step → verify hours → sign |
| Record pole specs | FDA step → Pole section |
| Check my UTVAC score | Review step → score card |
| Fix a validation error | Review step → tap "Go to step" |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No utility configuration found" | Your company isn't linked to a utility yet. Contact your admin. |
| Can't submit — safety items missing | Go back to CCSC, check all yellow-highlighted items |
| Sketch won't load | Check your internet connection. The PDF loads from the server. |
| Signature doesn't appear | Tap "Tap to Sign" and draw with your finger. Make sure you press Save. |
| Wrong work type detected | Tap a different work type card in Step 1 to override. |
| Lost progress | The wizard saves your progress. Re-open the same job to resume. |

---

## For Supervisors / QC Reviewers

When reviewing a submitted as-built:

1. Check the **UTVAC score** — anything below 80% needs attention
2. Review the **sketch markup** — are redlines and bluelines used correctly?
3. Verify **FDA attributes** — do pole specs match what was actually installed?
4. Check **CCSC completion** — were safety items genuinely addressed, not just checked off?
5. Review **completion photos** — do they show the finished work?

If the package needs corrections, reject it back to the foreman with notes. They can re-open the wizard and fix the specific step.

