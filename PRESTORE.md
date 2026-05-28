Phase 1 is complete. Move to Phase 2.

The src/store/ folder does not exist yet — create it.

Tasks:
- Create src/store/index.ts with the full Zustand store
- Define TypeScript types: Box, Container, Placement, PackingResult
- Container slice: list of containers, activeContainerIndex, add/remove/update actions
- Box slice: list of boxes to pack, add/remove actions
- UI slice: sidebar open/closed, playback state (playing, speed, progress)
- Include the 20ft and 40ft TEU/FEU presets as constants in src/lib/presets.ts

Wire the store into App.tsx so components can access it.
Do not build any forms yet — just the store and types.

AC:
- [ ] src/store/index.ts exists and exports the store
- [ ] All types are defined and exported from store
- [ ] Presets file exists at src/lib/presets.ts with correct TEU/FEU dimensions
- [ ] No TypeScript errors (tsc --noEmit passes)
- [ ] App.tsx imports store without errors

Do not start Phase 3. Confirm all AC are met before stopping.