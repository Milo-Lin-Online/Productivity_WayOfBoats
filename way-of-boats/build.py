#!/usr/bin/env python3
"""
Bundle the modular source into ONE self-contained index.html.

Why this exists: the app is edited as modules (js/*.js + css/styles.css) so you
can find what you're changing, but it is DEPLOYED as a single file, because
that's what the host takes. Edit the modules, run this, upload the result.

    python3 build.py            ->  writes ../index.html

The bundle is byte-for-byte the same program: the loader <script> is replaced
by the modules concatenated in their numbered order, and styles.css goes back
into a <style> block.
"""
import re, pathlib, sys

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent / 'index.html'

src = (HERE / 'index.html').read_text(encoding='utf-8')

# 1. version — one string drives everything
version = re.search(r'name="app-version" content="([^"]+)"', src).group(1)

# 2. inline the stylesheet
css = (HERE / 'css' / 'styles.css').read_text(encoding='utf-8')
src = re.sub(r'\n?\s*<link rel="stylesheet" href="css/styles\.css[^>]*>',
             '\n<style>\n' + css + '</style>', src, count=1)

# 3. replace the module loader with the modules themselves, in order
modules = sorted((HERE / 'js').glob('*.js'))
if not modules:
    sys.exit('no modules found in js/')
bundle = '\n\n'.join(m.read_text(encoding='utf-8') for m in modules)

loader = re.search(r'<!-- ═+\s*\n\s*MODULE LOADER.*?</script>', src, re.S)
if not loader:
    sys.exit('could not find the module loader block in index.html')
src = src.replace(loader.group(0), '<script>\n' + bundle + '\n</script>')

OUT.write_text(src, encoding='utf-8')
kb = OUT.stat().st_size / 1024
print(f'built {OUT}  ({kb:.0f} KB, v{version}, {len(modules)} modules inlined)')
