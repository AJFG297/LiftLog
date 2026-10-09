# Coding standards

Judgement calls the `/code-review` Standards reviewer checks a diff against. Mechanical rules belong in a lint
or a check instead, and the conventions in [AGENTS.md](AGENTS.md) apply as well.

## Interaction

- The diff follows the rules in [docs/UX.md](docs/UX.md). Today that is **dismiss the innermost layer first**:
  with a pad, menu or popover open inside a sheet, back and swipe-down close that layer, not the sheet.
