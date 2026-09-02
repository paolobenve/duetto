---
description: Search a word across everything that has been written - conversations, commits, code and documentation
---

Search for `$ARGUMENTS` everywhere work on this project leaves a trace, and report what
you find grouped by source.

Search in this order, and **stop as soon as you have enough** to answer:

1. **Commit messages** — the best source, because every commit explains why a thing was
   done:
   `git -C /home/paolo/git/duetto log --grep="$ARGUMENTS" -i --oneline`

2. **The code's history** — who introduced that string, or took it away:
   `git -C /home/paolo/git/duetto log -S "$ARGUMENTS" -i --oneline`

3. **The code and documentation as they are now** — the comments are long and explain the
   why, so a search here often answers on its own:
   `grep -rn -i "$ARGUMENTS" /home/paolo/git/duetto/app/src /home/paolo/git/duetto/server/src /home/paolo/git/duetto/docs /home/paolo/git/duetto/README.md /home/paolo/git/duetto/CHANGELOG.md`

4. **Past conversations**, only if the first three are not enough. They live in three
   directories — the current sessions, the older ones, and the DuoTalk days before the
   rename — and they are big JSON files, so pull the context around the word instead of
   printing whole lines:
   `grep -hoi ".\{250\}$ARGUMENTS.\{350\}" /home/paolo/.claude/projects/-home-paolo/*.jsonl /home/paolo/.claude/projects/-home-paolo-git/*.jsonl /home/paolo/.claude/projects/-home-paolo-git-duotalk/*.jsonl | head -5`

When presenting the results:

- Put **the answer** first, then where it comes from. Whoever searches wants to know what
  was decided, not to read a list of lines.
- If you find the explanation of *why* something was done, report it: that is what is
  wanted, and it lives in the commit messages.
- If the conversations contain guesses that later turned out to be wrong, say so: without
  that distinction one risks fishing out a discarded diagnosis and taking it for a
  conclusion.
- If you find nothing, say so in one line instead of listing where you looked.
