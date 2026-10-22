# Arena

Run competing attempts at the same artifact, judge them under one rubric, choose
a base, graft the strongest parts, and verify the synthesis.

1. Freeze the task, constraints, and output location. Ground shared facts once.
2. Write three to six concrete grading criteria. Candidates receive the task and
   grounding but not one another's work.
3. Select two or more provider roles. Prefer different model families for
   judgment-sensitive work. Repeated roles are acceptable for generation races.
4. Give every candidate an isolated write target and launch them together through
   `subagent.spawn`.
5. After every candidate finishes, start an independent judge. The judge sees
   neutral candidate labels and the rubric.
6. The parent reads every candidate end to end while the judge scores them.
7. Pick one base. Manually graft only ideas that improve a named criterion without
   breaking coherence.
8. Verify the synthesized artifact. Wide divergence can mean the brief is wrong;
   reframe rather than forcing a winner.

**Reply:** candidates, rubric, judgment, selected base, grafts, verification, and
any disagreement between parent and judge.
