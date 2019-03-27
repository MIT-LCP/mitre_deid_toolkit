#!MF_PYTHONBIN

# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import os, sys

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

#
# Toplevel
#

from MAT.Operation import OptionParser
import MAT.ExecutionContext

parser = OptionParser(usage = """Usage: %prog [options] <xml_file>

<xml_file>: An experiment XML file""")
parser.add_option("--force", action = "store_true",
                  dest = "force",
                  help = "redo all analysis")
parser.add_option("--batch_test_runs", action = "store_true",
                  dest = "batch_test_runs",
                  help = "don't interleave test runs with model builds")
parser.add_option("--mark_done", action = "store_true",
                  dest = "mark_done",
                  help = "forcibly mark the experiment as done")
parser.add_option("--exp_dir", dest = "exp_dir",
                  metavar = "dir",
                  help = "optionally, the directory to use for the record of the experiment. This directory path is used when no 'dir' attribute is provided to the <experiment> element in the experiment XML file.")
parser.add_option("--pattern_dir", dest = "pattern_dir",
                  metavar = "dir",
                  help = "optionally, this path is the prefix used for relative directory paths in file patterns in the <pattern> element in the corpora in the experiment XML file. Otherwise, these patterns must be absolute pathnames.")
parser.add_option("--binding", dest = "bindings",
                  action = "append",
                  metavar = "key=value",
                  help = "optionally, add a binding to be used in expanding settings in the experiment file. These values override values in the experiment file itself.")
parser.add_option("--csv_formula_output", dest = "csv_formula_output",
                      help = "A comma-separated list of options for CSV output. The possibilities are 'oo' (formulas with OpenOffice separators), 'excel' (formulas with Excel separators), 'literal' (no formulas). The experiment engine will produce CSV output files for each of the conditions you specify. By default, this value is 'excel'. Note that the OpenOffice and Excel formula formats are incompatible with each other, so you'll only be able to open output files with Excel separators in Excel, etc.")
parser.add_option("--dont_compute_confidence", dest = "dont_compute_confidence",
                  action = "store_true",
                  help = "By default, the experiment engine computes confidence measures. This process can be time consuming. Disable it with this flag.")
parser.add_option("--dont_rescore", dest = "dont_rescore",
                  action = "store_true",
                  help = "By default, the experiment engine rescores complete runs when it's restarted. Use this flag to disable this feature. This should only be used for debugging purposes, because the scores from the completed runs won't be accumulated in this mode.")
MAT.ExecutionContext.addOptions(parser)
options, args = parser.parse_args()

FORCE = options.force
INTERLEAVE = not options.batch_test_runs
MARK_DONE = options.mark_done
EXP_DIR = options.exp_dir
PATTERN_DIR = options.pattern_dir
COMPUTE_CONFIDENCE = not options.dont_compute_confidence
RESCORE_RUNS = not options.dont_rescore

if len(args) != 1:
    parser.print_help()
    sys.exit(1)

MAT.ExecutionContext.extractOptions(options)

import MAT.Score

fmt = MAT.Score.ScoreFormat(csvFormulaOutput = options.csv_formula_output)

bindings = options.bindings
bindingDict = {}
if bindings:
    for k in bindings:
        toks = k.split("=", 1)
        if len(toks) != 2:
            print >> sys.stderr, "binding value must contain exactly one equals sign (=)"
            sys.exit(1)
        bindingDict[toks[0].strip()] = toks[1].strip()

xmlFile = args[0]

import MAT.CarafeTrain

e = MAT.CarafeTrain.ExperimentEngine(computeConfidence = COMPUTE_CONFIDENCE,
                                     **MAT.CarafeTrain.fromXML(xmlFile, dir = EXP_DIR, corpusPrefix = PATTERN_DIR,
                                                               bindingDict = bindingDict))

e.run(force = FORCE, interleave = INTERLEAVE, markDone = MARK_DONE,
      format = fmt, rescoreRuns = RESCORE_RUNS)
