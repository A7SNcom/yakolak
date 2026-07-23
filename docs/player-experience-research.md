# Yakolak Player Experience Research

## Experiment v113 — First-move breathing room

### Observation

Production v112 starts the normal 18-second turn timer during the first
interactive lesson. In a real desktop playtest, the deadline expired while the
instruction was being read and the player had not made a legal move.

### Sources

1. Apple Human Interface Guidelines — Onboarding  
   https://developer.apple.com/design/human-interface-guidelines/onboarding

   Principle: onboarding should be fast, optional, interactive, and safe for
   the player to try the action being taught.

2. W3C WAI — Understanding WCAG 2.2 Success Criterion 2.2.1  
   https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html

   Principle: when timing is not essential, users should be able to turn off,
   adjust, or extend a time limit so they have adequate time to complete the
   task. A solo first-move lesson is not a real-time competitive event.

3. Chen, Yan, Hu, Kao, and Liang (2024), *Impact of Tutorial Modes with
   Different Time Flow Rates in Virtual Reality Games*, Proceedings of the ACM
   on Computer Graphics and Interactive Techniques, 7(1), Article 6.  
   https://xuning-hu.github.io/assets/pdfs/Game.pdf

   Principle: giving the player more time while keeping their own input
   responsive can improve control learnability and reduce cognitive load.
   The paper studies VR tutorials, so Yakolak uses it as directional evidence,
   not as proof that the same effect size will transfer.

### Hypothesis

If the deadline is paused only until the player's first legal guided move, a
beginner can read and act without losing a turn, while returning players and
all later turns keep the existing pace.

### Small experiment

- Set no turn deadline while `firstMoveGuide` is active for the human.
- Label the score row `تعلّم` instead of showing a frozen seconds value.
- Clear the guide through the existing first-legal-move path.
- Let the existing next-turn call restore the normal timer.

### Acceptance checks

- Waiting longer than 18 seconds does not advance the first guided turn.
- The board remains interactive during the wait.
- A legal first move ends the guide.
- Bot turns and the next human turn use the normal timer.
- Skip and returning-player paths keep the normal timer from the start.
- Desktop, mobile portrait, and mobile landscape remain within the viewport.
- No new Console errors.

### Result

Local browser verification passed:

- Desktop: the guided human turn was unchanged after 22 seconds.
- Mobile portrait (390x844): the guided human turn was unchanged after 22
  seconds, and the document remained exactly within the viewport.
- A legal move ended the guide; after the bots moved, the next human turn
  showed the normal countdown again.
- Mobile landscape (844x390) remained exactly within the viewport.
- No new Console errors appeared after the corrected build loaded.

Preview verification passed on commit
`2ed6596904463b7bed729c53296b94af17a31d2d`:

- Vercel deployment `dpl_HhESy9BESErjGv6yFFcGbQLp5oEk` reached `READY`.
- Desktop Preview kept the first guided turn after 22 seconds, accepted a
  legal move, and restored the normal countdown on the next human turn.
- Preview at 390x844 and 844x390 kept the guided turn and stayed exactly
  within the viewport.
- The tested Preview emitted no application Console errors.
- GitHub Actions run `30038624423` completed successfully.

Result: keep the experiment. It removes an unfair first-session failure mode
without changing rules, AI, camera, lighting, or the pace of later turns.
