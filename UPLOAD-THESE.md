# "It's just you aboard" — v2026.08.20-2

**3 files**, on top of v2026.08.20-1.

```
js/11-people.js       the prompt
css/styles.css
index-SOURCE.html  ->  way-of-boats/index.html
```

Or just take the bundled `index.html`.

## What it does

Once you've set your name, if there's nobody else on the crew a small boat-shaped
box rises at the bottom of the screen:

> ⛵ **It's just you aboard.**
> Add your crewmates! Or sync back to your session.
> 　[👥 Add crewmates]　[🔗 Sync to a session]

**Both doors, deliberately.** An empty room looks identical whether you're
genuinely new or your sync just isn't connected — and the second is much more
alarming if you don't know that's what you're seeing. Rather than guess, it
offers the fix for either.

It stays quiet until a name is set, since the app already asks for one and two
prompts at once is noise. It disappears the moment a second crewmate exists, and
comes back if you're ever alone again. The × hides it for the session; a reload
will offer it once more.

Verified: appears only when named and alone, both buttons work, it never stacks
up across repeated renders, and it sits 2px off the bottom edge.
