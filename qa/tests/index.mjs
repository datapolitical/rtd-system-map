// Entry point so `node --test qa/tests/` works as qa/BRIEF.md says.
//
// Node 26 does not accept a bare directory for --test (it tries to load it as a
// module), so the directory resolves through this file's package.json "main".
// Each test file can also be run on its own, or all of them with
// `node --test "qa/tests/*.qa.mjs"`.

import './gtfs.qa.mjs';
import './stations.qa.mjs';
import './geometry.qa.mjs';
import './directory.qa.mjs';
import './arcgis.qa.mjs';
