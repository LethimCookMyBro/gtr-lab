# Bounded software-renderer verification

The original exact-release Quality attempt for
`3c5380207261fb7f44625ffda609b46461435116`
([run 37187025127, attempt 1](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/37187025127/attempts/1))
failed three real-vehicle cases after its unit, type, general end-to-end and
renderer checks passed. It was not a successful aggregate run or a job cutoff.
The app-identical candidate `e12a0cb` had previously passed all 14 vehicle cases.

The retained [browser evidence](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/37187025127/artifacts/11298257561)
shows slow software-renderer work crossing the existing deadlines:

- Desktop paint: the first Gun Metallic readback took 5.033 seconds, or 5.056
  seconds on retry. The five-second poll had already expired when the nested
  pixel-inequality assertion passed. The preceding page capture took 9.72 and
  9.76 seconds. The painted car was rendered correctly.
- Desktop rotation: the 24 requested animation frames took 53.66 and 64.35
  seconds. Stopping rotation took another 18.28 and 15.76 seconds. Both runs
  eventually attached different before/after vehicle images, but the complete
  test had already crossed its 120-second deadline.
- Mobile exploration: the retry's DPR recovery poll expired after ten seconds.
  Its pending evaluation returned 322 milliseconds later and the unchanged
  less-than-0.02 assertion passed. The earlier 0.701282 gap was exactly the
  intentional adaptive DPR state: 409 / 390 versus the 1.75 target.
- All six failed-attempt browser diagnostic arrays were empty. There was no
  JavaScript, WebGL or shader error to suppress.

An unchanged [second attempt](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/37187025127/attempts/2)
reproduced the slow-rendering failures and then reached the original 30-minute
job cutoff. Desktop paint passed on retry; desktop rotation exceeded its
120-second test budget twice, and mobile exploration exceeded that budget
before its retry was interrupted. The general navigation suite also had one
five-second control-readiness assertion pass on retry. The second attempt is
cancelled, not a clean verification result.

The correction only changes QA budgets. On CI, pixel readback and resolution
recovery each have an explicit 30-second bound, and a complete real-vehicle test
has a 300-second bound, covering both the drag and subsequent pinch sequence.
The aggregate job has a 45-minute outer bound so the individual diagnostics
can finish. Local limits remain unchanged.

All pixel comparisons, nine paint selections, 24 rotation frames, real touch
steps, DPR thresholds, error checks, asset hashes and retry counts remain
unchanged. Application source, dependencies, art, lighting, renderer settings
and Railway deployment/configuration are unchanged. These are Chromium /
SwiftShader correctness checks; their elapsed times do not establish physical
device performance.
