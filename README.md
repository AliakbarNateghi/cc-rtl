# rtl

A Claude Code mod that makes Persian/Arabic text in Claude's replies readable in terminals that do no bidi reordering or Arabic shaping (Windows Terminal, most Linux terminals).

It joins the letters (presentation forms, including پ چ ژ گ ک ی and lam-alef) and puts RTL lines in right-to-left order. English words, numbers and inline code stay in their own order. Code blocks are left alone. Long RTL lines are pre-wrapped to the terminal width so they read top to bottom.

Only the terminal drawing changes. The stored transcript and what the model sees stay the same. The desktop app is untouched, since it renders RTL itself.

## Install

```
/plugin install rtl --marketplace AliakbarNateghi/cc-rtl
```

Answer `y` to add the marketplace, then pick a scope.

## Use

On by default. `/rtl off` to turn it off, `/rtl on` to turn it back on, `/rtl` to see the state.

## Limits

- Lines are left-aligned, not right-aligned.
- Only Claude's replies are changed, not your own prompt or tool output.
- Text you copy from the terminal is the reordered form.
