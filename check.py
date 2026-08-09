#!/usr/bin/env python3
"""Build check: every function an inline handler calls must actually exist.

Handlers live inside JS template strings, so a missing one is invisible until a
user clicks it. This is what would have caught the empty-book bug.
"""
import re, pathlib, sys
here = pathlib.Path(__file__).parent
js = "\n".join(f.read_text(encoding='utf-8') for f in sorted((here/'js').glob('*.js')))
html = (here/'index.html').read_text(encoding='utf-8')

defined  = set(re.findall(r'(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(', js))
defined |= set(re.findall(r'(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=', js))

called = set()
for src in (js, html):
    for m in re.finditer(r'on[a-z]+\s*=\s*["\'`]([^"\'`]*)["\'`]', src):
        called |= set(re.findall(r'([A-Za-z_$][\w$]*)\s*\(', m.group(1)))

IGNORE = {'if','for','while','return','typeof','parseInt','parseFloat','Math','JSON','String','Number',
          'event','this','alert','confirm','Date','Array','Object','blur','preventDefault',
          'stopPropagation','getElementById','dispatchEvent','Event','focus','select','padStart'}
missing = sorted(called - defined - IGNORE)

dupes = {}
for f in sorted((here/'js').glob('*.js')):
    for name in re.findall(r'(?:^|\n)function\s+([A-Za-z_$][\w$]*)\s*\(', f.read_text(encoding='utf-8')):
        dupes.setdefault(name, []).append(f.name)
clashes = {k: v for k, v in dupes.items() if len(v) > 1}

print(f"handlers checked: {len(called)}")
print("missing handlers:", missing or "none")
print("name collisions :", clashes or "none")
sys.exit(1 if (missing or clashes) else 0)
