# Reports Directory

This directory stores generated validation artifacts used by migration guardrails.

## Global Coupling Report
- File: `scripts/reports/global-coupling.json`
- Generator: `scripts/check-global-coupling.ps1`

## First Run Baseline Workflow
1. Run the report generator:
   - `powershell -ExecutionPolicy Bypass -File scripts/check-global-coupling.ps1`
2. Save the generated report as your baseline snapshot:
   - `Copy-Item scripts/reports/global-coupling.json scripts/reports/global-coupling-baseline.json -Force`
3. Compare future runs against baseline:
   - `powershell -ExecutionPolicy Bypass -File scripts/check-global-coupling.ps1 -BaselinePath scripts/reports/global-coupling-baseline.json`

## Compare Mode Rules
- Compare mode fails only when current coupling counts increase versus baseline.
- Compare mode does not require exact equality (decreases are allowed).
