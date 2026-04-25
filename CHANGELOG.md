# Changelog

All notable changes in this repository, based on git commit history.

## Unreleased

### Sandbox Streaming Enhancements (Task 1.3 WIP)
- **Summary:** Added noVNC web bridge runtime wiring on top of the existing Xvfb + x11vnc setup.
- **Current working tree updates:**
  - Modified `Backend/sandbox/supervisord.conf` to add managed `websockify` service (`6080 -> 5900`) with startup sequencing.
  - Modified `Backend/sandbox/Dockerfile` to expose `6080` alongside `5900`.
- **Verification status:** Container-level validation completed (`websockify` process healthy and `http://localhost:6080/vnc.html` reachable).

## 2026-04-25

### `d17969c` - Add Xvfb and x11vnc configuration to Dockerfile and create supervisord.conf for managing services
- **Author:** VjayRam
- **Summary:** Added process supervision and display/VNC runtime configuration for sandbox container orchestration.
- **Key files changed:**
  - Modified `Backend/sandbox/Dockerfile`
  - Added `Backend/sandbox/supervisord.conf`

### `eac9db9` - Merge branch 'dev-v' of https://github.com/manu042k/Project-Hawkeye into dev-v
- **Author:** VjayRam
- **Summary:** Merged remote `dev-v` changes into local `dev-v`.
- **Change stats:** Merge commit; no direct file modifications recorded in this commit.

### `642253a` - Update Dockerfile version to Playwright v1.58.0 and add sandbox Dockerfile with pinned dependencies for reproducible builds
- **Author:** VjayRam
- **Summary:** Standardized sandbox base image to Playwright `v1.58.0` and introduced pinned package installation for reproducibility.
- **Change stats:** 2 files changed, 16 insertions, 1 deletion.
- **Key files changed:**
  - Added `Backend/sandbox/Dockerfile`
  - Modified `docs/SystemArchitecture.md`

### `a895a1d` - Add architecture and design documentation for Autonomous App Testing Agent
- **Author:** VjayRam
- **Summary:** Added foundational architecture and system design documents for the autonomous testing agent.
- **Change stats:** 2 files changed, 411 insertions.
- **Key files changed:**
  - Added `docs/SystemArchitecture.md`
  - Added `docs/SystemDesign.md`

### `af73f74` - Update Dockerfile version to Playwright v1.58.0 and add sandbox Dockerfile with pinned dependencies for reproducible builds
- **Author:** VjayRam
- **Summary:** Added sandbox Dockerfile and updated architecture doc references to the pinned Playwright image.
- **Change stats:** 2 files changed, 16 insertions, 1 deletion.
- **Key files changed:**
  - Added `Backend/sandbox/Dockerfile`
  - Modified `docs/SystemArchitecture.md`

### `06a81ca` - Add backend structure with main functionality, Python version specification, and project metadata; update .gitignore and add project documentation
- **Author:** Manoj
- **Summary:** Restructured codebase into backend/frontend layout and added flow-analysis documentation.
- **Change stats:** 6 files changed, 50 insertions.
- **Key files changed:**
  - Modified `.gitignore`
  - Renamed `.python-version` to `Backend/.python-version`
  - Renamed `main.py` to `Backend/main.py`
  - Renamed `pyproject.toml` to `Backend/pyproject.toml`
  - Added `Docs/Project_Hawkeye_Flow_Analysis.md`
  - Added `Frontend/.gitkeep`

### `bba8cd1` - Add architecture and design documentation for Autonomous App Testing Agent
- **Author:** VjayRam
- **Summary:** Introduced architecture and design docs for the testing agent system.
- **Change stats:** 2 files changed, 411 insertions.
- **Key files changed:**
  - Added `docs/SystemArchitecture.md`
  - Added `docs/SystemDesign.md`

### `48e8298` - Implement initial project structure and setup
- **Author:** VjayRam
- **Summary:** Added initial Python application entry point and project metadata files.
- **Change stats:** 3 files changed, 14 insertions.
- **Key files changed:**
  - Added `.python-version`
  - Added `main.py`
  - Added `pyproject.toml`

### `35215a1` - Initial commit
- **Author:** MANOJ M
- **Summary:** Created repository baseline with ignore rules and README.
- **Change stats:** 2 files changed, 219 insertions.
- **Key files changed:**
  - Added `.gitignore`
  - Added `README.md`
