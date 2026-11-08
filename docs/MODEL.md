# The model

This file describes what FaDeS computes for a wall. The paper gives the reasons for each choice, the verification, and
the results. Section numbers below are those of the paper. Every parameter below can be set for any wall, in the
interface and on the command line; the defaults are the values of the paper's campaigns.

## Frame and geometry

The model is a vertical section of the façade, 1 m deep. The x axis is horizontal, positive towards the street; y is
vertical, upwards. The origin is at the street face of the façade, at ground level, so the wall occupies
-t ≤ x ≤ 0.

- **H**: height of the façade. **Hr**: height of the part that overturns. In a total collapse Hr = H. In a partial
  collapse the panel hinges at H - Hr above the street, and a residual wall of height H - Hr stays in place.
- **t**: thickness of the wall.
- **bx × by**: block size (bx across the thickness, by along the height). Diatone courses of height 0.20 m run across
  the full thickness every 2 m. A diatone step of 0 disables them.
- **ρ**: density. Mass per metre of façade = ρ × area of the section.

A rigid backstop sits behind the inner face of the wall: the building, which stops blocks from falling inwards.

## Rigid phase (Sect. 2 and 3)

The panel starts at rest, tilted towards the street about its outer toe by θ0 = atan(t/Hr) + δ, with δ = 0.5°. Its
centroid is therefore just past the toe. The toe is a unilateral Coulomb contact (friction μ), so at each instant the
panel is in one of three regimes:

- it rotates about the toe;
- the toe slides on its support;
- the panel is in flight.

The equations of motion are integrated with fourth-order Runge–Kutta (h = 10⁻⁴ s). Regime changes and impacts are
located by bisection. The phase ends at the first impact of any other vertex with the street, or of the panel with
the residual wall.

## Break-up (Sect. 2 and 4)

At the instant of that impact the panel is divided into its blocks. Each block takes the velocity of the panel at its
own centroid: translation plus rotation, the rigid velocity field. The blocks start touching, with no gap.

Breaking up at the first impact is the main assumption of the model. A real panel can break earlier, during the
fall, or arrive less fractured. Sect. 4 of the paper examines when a panel stays whole during the fall. The code also
offers break-up at a fraction of the impact angle, and an unbroken panel, for sensitivity studies. Neither option is
used in the campaigns.

## Debris phase (Sect. 2)

The blocks are handed to planck.js 1.5.0, a JavaScript port of Box2D. Settings:

| setting | value |
|---|---|
| time step | 1/480 s |
| velocity / position iterations | 60 / 30 |
| linear slop | 0.5 mm (polygon skin 1 mm, compensated in the block size) |
| restitution | e on every contact; contacts slower than 0.1 m/s are fully inelastic |
| friction | μ between blocks and against the residual wall, μg against the street |

The debris is at rest when two conditions hold together for 0.5 s of simulated time:

- the kinetic energy is below 10⁻⁵ times its value at break-up;
- no point of any block moves faster than 5 mm/s.

States are checked every 0.05 s. A run is capped at 60 s. Runs that reach the cap are reported as such, and the
summaries of the paper leave them out.

An energy monitor checks that the total mechanical energy never grows and that no block exceeds the speed it could
gain by falling from the top of the wall. Either would reveal a numerical ejection.

## Measures (Sect. 2)

Measures are taken on the final positions of the blocks. The distance of a block is the x of its farthest vertex
(far edge).

- **P95 by mass**: the smallest distance within which at least 95 % of the mass lies. The same definition gives P50,
  P80, P90 and P99, both by mass and by count.
- **Lmax**: the far edge of the farthest block. Lmax measured on the centroids is also stored.
- **Profile**: the height of the debris heap on 5 cm bins.

The same definitions are applied to the blocks at the instant of break-up. This is how the increment of Sect. 5 is
computed: P95 at rest minus P95 at break-up, seed by seed.

## The street

A street width W, measured from the street face of the façade, adds three measures to a run:

- the width left free, W − P95, or 0 when P95 reaches W;
- whether P95 and Lmax reach W;
- the height of the debris heap at the distance W, read from the profile.

A study reports the median and the smallest free width over the seeds, and the number of seeds whose P95 or Lmax
reaches W. The model has no building across the street: the far side is a measure, not an obstacle, so the debris that
reaches it is not stopped there.

## Run-to-run variability (Sect. 2)

Each seed draws three things from a normal distribution, with a fixed random generator (the standard deviations
below are those of the paper; they can be changed, or set to zero for a single deterministic run):

- the start angle δ (sd 0.2°);
- the position of every joint between blocks (sd 10 % of the nominal block size). The blocks always fill the
  section, and none is smaller than 20 % of the nominal size;
- μ and μg (sd 5 %).

The paper uses seeds 1–20; any other seed can be used. A seed gives the same draws on every computer.

## Statistics (Sect. 5)

Values per wall are medians over the seeds that reached rest. For an even count the median is the mean of
the two middle values, as in Python's `statistics.median`. The increment is the median of the per-seed differences, not
the difference of the medians.

## Reproducibility

The engine integrates thousands of contacts for tens of seconds. Its trajectory therefore depends on the last bit of
`Math.sin`, `cos`, `tan`, `atan`, `atan2` and `log`, which JavaScript does not fix: the result depends on the runtime and
the processor. For example, Node.js on Apple Silicon uses fused multiply–add in these functions, and its x86-64 build
does not.

The program carries its own implementation of these six functions, `src/sim/detmath.js`. It is a translation of fdlibm,
the library that V8 also uses. The program installs it in every worker thread, so all computers give the same bits.
`test/determinism.test.js` checks this against stored values. The paper's runs used the native functions of Node.js
24 on Apple Silicon. Compared with them:

- most runs are identical;
- in the others, P95 differs by less than 0.1 % and Lmax by less than 0.5 % (largest differences found: 0.08 % and
  0.34 %, in a sample of runs from all four campaigns);
- the break-up measures agree to 10⁻¹⁵.

To repeat the paper bit for bit on Apple Silicon with Node.js 24, run the command line with `--native-math`.
`test/paper_bitidentity.test.js` does this on such a machine and is skipped elsewhere.

## Options not used in the paper

The code contains some options that no campaign of the paper uses. They are kept for further study and are not
reachable from the interface:

- a road sloping away from the façade;
- an ideal pinned hinge at the toe;
- the rigid phase computed by the engine instead of analytically;
- two-leaf walls with a rubble core;
- walls that crumble into grains;
- air drag.
