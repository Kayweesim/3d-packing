Refactor engine.py
Context:
- What this code does: 3d Container packing logic
- Why it needs refactoring: very verbose, hard to follow code

Constraints:
- Do NOT change external behavior / public API — this should be a pure refactor
- Do NOT touch [files/areas that are out of scope]
- Keep [naming conventions / architecture pattern] consistent with the rest of the codebase
- If tests exist, they must still pass after the refactor. If they don't exist, 
  write minimal tests first so we can verify behavior is preserved.

Process:
1. First, read through the code and give me a short summary of the current 
   structure and the specific problems you see (don't fix yet)
2. Propose your refactor plan before touching anything — what you'll split out, 
   rename, extract, etc.
3. Wait for my go-ahead, then implement incrementally
4. After each meaningful chunk, run [test command / build command] to confirm 
   nothing broke

Focus areas (pick what applies):
- Break up files/functions that are doing too much
- Improve naming for clarity
- Simplify [specific messy area]