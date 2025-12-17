# Keyboard Shortcuts & Terminal Input Guide

This document lists the keyboard shortcuts supported by the integrated SQL Terminal and other useful key bindings.

## SQL Terminal Shortcuts

- Left Arrow (←): Move cursor one character left
- Right Arrow (→): Move cursor one character right
- Up Arrow (↑): Show previous query from history (most recent first)
- Down Arrow (↓): Show next query from history; when at the newest entry, restores the current partial input
- Alt+Left / Alt+B: Move cursor backward by one word
- Alt+Right / Alt+F: Move cursor forward by one word
- Ctrl+A: Move cursor to beginning of line
- Ctrl+E: Move cursor to end of line
- Ctrl+C: Cancel current input (Ctrl+C sends ^C and clears buffer)
- Backspace / Delete: Remove character before/at cursor
- Enter: Submit line (the terminal supports multi-line SQL; use `;` to end a statement)

## Notes

- The terminal will warn when executing very large SQL strings (configurable limit) to avoid accidental heavy operations.
- If advanced line editing fails for any reason, the terminal falls back to a simple input mode that preserves the ability to run commands.

## Webview / Editor

- Query History View:
  - Use the Copy button to copy the full SQL of an entry to clipboard.
  - Use the Delete button to remove an entry from local history.
  - Refresh button reloads the current history; the view also auto-refreshes when queries are executed in the terminal.

---

If you have other key behaviors you'd like supported, open an issue or PR with a suggested workflow and example key sequences.