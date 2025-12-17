# Images / GIFs for SQL Terminal Enhancements

This folder contains demo GIFs referenced by the documentation and the implementation plan.

Current demo filenames used by the project:

- `sql-editing.gif` — demonstration of line editing (cursor movement, insert/delete, word jumps)
- `history-navigation.gif` — demonstration of history navigation (Up/Down cycling, partial-line preservation)

If you want to replace these with higher-quality or recorded captures, please follow these recommendations:

- Filename: keep exactly `sql-editing.gif` and `history-navigation.gif` so links in docs remain valid.
- Resolution: 800×400 or 1024×480 recommended for readability in README; keep aspect ratio consistent.
- Duration: 5–12 seconds is usually sufficient; keep under ~15s to reduce file size.
- Frame rate: 15–30 fps is sufficient for smooth motion; avoid excessively high fps to keep file size small.
- Size: aim for < 2MB per GIF for the README; for documentation pages you may go up to ~5MB if necessary.
- No audio: GIFs do not support audio; capture only visuals.

Suggested capture workflow:
1. Use a terminal with a readable font and sufficient width (80–120 columns).
2. Record using `asciinema` + `gifcast` or a screen recorder and convert to GIF with `ffmpeg` or `gifsicle`.
3. Optimize with `gifsicle --optimize=3 --colors 256` or `gifski` for high-quality GIF with small filesize.

Please commit the GIF files to this directory when ready and update `docs/SQL_TERMINAL_ENHANCEMENTS_PLAN.md` if you want to mention exact durations or file sizes.
