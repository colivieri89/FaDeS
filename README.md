# Facade Debris Simulator

Desktop program that accompanies the paper *Simulating the debris of overturning masonry façades with rigid
blocks: from the falling panel to the documented collapses* (C. Olivieri, G. Vaiano, L. Sibille, G. Mochi,
F. Fabbrocino). It runs the paper's two-dimensional rigid-block model on your computer and reproduces its analyses:

1. A masonry façade overturns about its outer toe.
2. It breaks into its blocks at the first impact with the street.
3. The blocks slide and tumble until they stop.

The extent of the debris is measured on the blocks at rest.

![Single wall](docs/screenshots/2_single_wall.png)

## What it does

- **Single wall** (Sect. 2 of the paper). Choose a wall from the campaigns, or set your own height, thickness,
  block size and materials, then watch it fall. The program measures P95 by mass and Lmax, plots the cumulative mass
  and the profile of the debris, and, for a wall of the campaigns, compares the run with the paper's.
- **Total collapse** (Sect. 5, Fig. 7). Runs the 48 configurations of campaigns C1 and C2, or any subset, with 20
  seeds each. It reports P95/H at break-up and at rest, and the increment added by the debris phase. Until you run
  anything, the paper's own values are shown, computed from its stored runs. Your own documented walls can be added
  from a CSV file.

The other analyses of the paper (rigid phase, integrity during the fall, partial collapse, documented collapses,
verification) are in preparation.

Results are exported as CSV or JSON. Charts are exported as SVG or PNG.

## Installing

Installers are attached to the releases of this repository:

- **macOS**: `Facade Debris Simulator-<version>-arm64.dmg` for Apple Silicon, `...-x64.dmg` for Intel.
- **Windows**: `Facade-Debris-Simulator-Setup-<version>.exe`.

The installers are not signed with a developer certificate, so the system asks for confirmation the first time:

- **macOS**: if the program does not open, go to *System Settings → Privacy & Security* and choose *Open Anyway*.
- **Windows**: SmartScreen shows *Windows protected your PC*; choose *More info → Run anyway*.

## Running from the source code

You need [Node.js](https://nodejs.org) 24.

```sh
npm ci          # install the dependencies (planck.js, Electron, electron-builder)
npm start       # open the program
npm test        # tests: deterministic functions, reproduction of stored runs of the paper
```

The same studies run from the command line, without the interface:

```sh
node src/cli/cli.js paper                                          # the paper's Sect. 5 values, from its stored runs
node src/cli/cli.js run --H 10 --t 0.60 --seed 1                   # one wall
node src/cli/cli.js total --campaigns C1 --heights 5,10 --seeds 1-20   # part of the Sect. 5 study
node src/cli/cli.js --help
```

A stopped study resumes where it stopped: every finished run is stored as soon as it ends.

## Building the installers

```sh
npm run dist:mac    # dist/*.dmg (on a Mac)
npm run dist:win    # dist/*.exe (on Windows)
```

The workflow in `.github/workflows/build.yml` runs the tests on Linux, Windows and macOS, then builds both installers.
Pushing a tag such as `v1.0.0` creates a draft release with the installers attached.

## Agreement with the paper

The paper's 1920 runs (campaigns C1–C4, seeds 1–20) are stored in `reference/`. Runs made with the program use the
same code, parameters and random draws.

Agreement to the last bit cannot be guaranteed on every computer. The trajectory of thousands of contacts depends on
the last bit of `sin`, `cos`, `atan2` and `log`, and these are not rounded identically by every JavaScript runtime and
processor. The program therefore carries its own implementation of these functions, so that every computer gives the
same result. Against the paper:

- most runs are identical;
- in the others, P95 differs by less than 0.1 % and Lmax by less than 0.5 %.

On Apple Silicon with Node.js 24, the command line with `--native-math` reproduces the stored runs bit for bit.

[docs/MODEL.md](docs/MODEL.md) describes the model, its parameters and these checks in more detail.

## Data

The program ships no field data. Documented collapses can be loaded from a CSV file with one wall per row:

| column | meaning |
|---|---|
| `id` | identifier |
| `mechanism` | `T` (total), `P1` or `P2` (partial) |
| `H_m` | height of the façade, m |
| `t_m` | thickness of the wall, m |
| `Hr_m` | height of the overturning part (partial collapse), m |

An empty template is in `reference/documented_cases_template.csv`.

## Code layout

| folder | content |
|---|---|
| `src/sim` | the simulator: rigid phase, break-up, debris phase in planck.js, measures, deterministic functions |
| `src/analyses` | the campaigns of the paper and the summaries of each section |
| `src/runner` | parallel and resumable execution on worker threads |
| `src/main`, `src/renderer` | the desktop interface (Electron) |
| `src/cli` | the command line |
| `reference` | the stored runs of the paper |
| `test` | tests |

## Citation

If you use this program, please cite the paper (the full reference will be added on publication).

## Licence

MIT; see [LICENSE](LICENSE). `src/sim/detmath.js` is a translation of fdlibm, © Sun Microsystems, distributed with its
notice, which is kept in LICENSE. planck.js is distributed under the MIT licence.
