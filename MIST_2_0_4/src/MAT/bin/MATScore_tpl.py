#!MF_PYTHONBIN

# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import os, sys

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

import MAT.PluginMgr

PLUGIN_DIR = MAT.PluginMgr.LoadPlugins()

import MAT.Document, MAT.Score

#
# Toplevel
#

from MAT.Operation import OptionParser, OptionGroup

parser = OptionParser(usage = "Usage: %prog [options]")

# Progressive enhancement.
from MAT.Operation import CmdlineOpArgumentAggregator
AGGREGATOR = CmdlineOpArgumentAggregator(parser)

# Gotta add the groups first, before we populate them,
# if we have activation options.

group = OptionGroup(parser, "Core options")
group.add_option("--task", dest = "task",
                 metavar = "task",
                 help = "Optional. If specified, the scorer will use the tags (or tag+attributes) specified in the named task. Known tasks are: " + ", ".join(PLUGIN_DIR.keys()))
group.add_option("--content_annotations", dest = "content_annotations",
                 metavar = "label,label,...",
                 help = "Optional. If no task is specified, the scorer requires additional, external information to determine which annotations are content annotations. Use this flag to provide a commma-separated sequence of annotation labels which should be treated as content annotations. Ignored if --task is present.")
group.add_option("--token_annotations", dest = "token_annotations",
                 metavar = "label,label,...",
                 help = "Optional. If no task is specified, the scorer requires additional, external information to determine which annotations are token annotations. Use this flag to provide a commma-separated sequence of annotation labels which should be treated as token annotations. Ignored if --task is present.")
group.add_option("--equivalence_class", dest="equivalence_class",
                 metavar = "equivlabel oldlabel,oldlabel,...",
                 action = "append",
                 nargs = 2,
                 help = "Optional and repeatable. In some cases, you may wish to collapse two or more labels into a single equivalence class when you run the scorer. The first argument to this parameter is the label for the equivalence class; the second argument is a comma-separated sequence of existing annotation labels. Note: when you're specifying the existing labels, and you want to refer to an attribute set, use the value of the 'name' attribute of the attr_set from the task.xml file.")
group.add_option("--ignore", dest="ignore",
                 metavar = "label,label,...",
                 help = "Optional. In some cases, you may wish to ignore some labels entirely. The value of this parameter is a comma-separated sequence of annotation labels. If an annotation in the reference or hypothesis bears this label, it will be as if the annotation is simply not present. Note: when you're specifying the annotation labels, and you want to refer to an attribute set, use the value of the 'name' attribute of the attr_set from the task.xml file.")
group.add_option("--similarity_profile", dest="similarity_profile",
                 metavar = "profile",
                 help = "If provided, the name of a similarity profile in the provided task. Ignored if --task is not provided.")
group.add_option("--score_profile", dest="score_profile",
                 metavar = "profile",
                 help = "If provided, the name of a score profile in the provided task. Ignored if --task is not provided.")
parser.add_option_group(group)

hypgroup = OptionGroup(parser, "Hypothesis options")
parser.add_option_group(hypgroup)

refgroup = OptionGroup(parser, "Reference options")
parser.add_option_group(refgroup)

scoregroup = OptionGroup(parser, "Score output options")
parser.add_option_group(scoregroup)

hypgroup.add_option("--file", dest = "file",
                    metavar = "file",
                    help = "The hypothesis file to evaluate. Must be paired with --ref_file. Either this or --dir must be specified.")
hypgroup.add_option("--dir", dest = "dir",
                    metavar = "dir",
                    help = "A directory of files to evaluate. Must be paired with --ref_dir. Either this or --file must be specified.")
hypgroup.add_option("--file_re", dest = "file_re",
                    metavar = "regexp",
                    help = "A Python regular expression to filter the basenames of hypothesis files when --dir is used. Optional. The expression should match the entire basename.")
hypgroup.add_activation_option("--file_type", AGGREGATOR, MAT.DocumentIO.DocumentIO, subtype = "inputArgs",
                               classFilters = ["excluderaw"],
                               default = "mat-json", help = "The file type of the hypothesis documents. Default is mat-json.")
hypgroup.add_option("--encoding", dest = "encoding",
                    metavar = "encoding",
                    help = "Hypothesis file character encoding. Default is the default encoding of the file type. Ignored for file types such as mat-json which have fixed encodings.")
hypgroup.add_option("--gold_only", dest = "gold_only",
                    action = "store_true",
                    help = "Under normal circumstances, if segments are present, all segments are compared. Use this flag to restriction the comparison to those regions which overlap with 'human gold' or 'reconciled' segments in the hypothesis.")

refgroup.add_option("--ref_file", dest = "ref_file",
                    metavar = "file",
                    help = "The reference file to compare the hypothesis to. Must be paired with --file. Either this or --ref_dir must be specified.")
refgroup.add_option("--ref_dir", dest = "ref_dir",
                    metavar = "dir",
                    help = "A directory of files to compare the hypothesis to. Must be paired with --dir. Either this or --ref_file must be specified.")
refgroup.add_option("--ref_fsuff_off", dest = "ref_fsuff_off",
                    metavar = "suff",
                    help = "When --ref_dir is used, each qualifying file in the hypothesis dir is paired, by default, with a file in the reference dir with the same basename. This parameter specifies a suffix to remove from the hypothesis file before searching for a pair in the reference directory. If both this and --ref_fsuff_on are present, the removal happens before the addition.")
refgroup.add_option("--ref_fsuff_on", dest = "ref_fsuff_on",
                    metavar = "suff",
                    help = "When --ref_dir is used, each qualifying file in the hypothesis dir is paired, by default, with a file in the reference dir with the same basename. This parameter specifies a suffix to add to the hypothesis file before searching for a pair in the reference directory. If both this and --ref_fsuff_off are present, the removal happens before the addition.")
refgroup.add_activation_option("--ref_file_type", AGGREGATOR, MAT.DocumentIO.DocumentIO, subtype = "inputArgs",
                               activatedPrefix = "ref_",
                               classFilters = ["excluderaw"],
                               default = "mat-json", help = "The file type of the reference documents. Default is mat-json.")
refgroup.add_option("--ref_encoding", dest = "ref_encoding",
                    metavar = "encoding",
                    help = "Reference file character encoding. Default is the default encoding of the file type. Ignored for file types such as mat-json which have fixed encodings.")
refgroup.add_option("--ref_gold_only", dest = "ref_gold_only",
                    action = "store_true",
                    help = "Under normal circumstances, if segments are present, all segments are compared. Use this flag to restrict the comparison to those regions which overlap with 'human gold' or 'reconciled' segments in the reference.")

scoregroup.add_option("--tag_output_mismatch_details", dest = "tag_output_mismatch_details", action = "store_true",
                 help = "By default, the tag scores, like the other scores, present a single value for all the mismatches. If this option is specified, the tag scores will provide a detailed breakdown of the various mismatches: overmarks, undermarks, overlaps, label clashes, etc.")
scoregroup.add_option("--details", dest = "details",
                      action = "store_true",
                      help = "If present, generate a separate spreadsheet providing detailed alignments of matches and errors.")
scoregroup.add_option("--confusability", dest = "confusability",
                      action = "store_true",
                      help = "If present, generate a separate spreadsheet providing a token- or pseudo-token-level confusability matrix for all paired tokens. If any token is paired more than once, the confusability matrix will not be generated (because the result would make no sense). The null label comparisons are included in the matrix.")
scoregroup.add_option("--by_token", dest = "by_token",
                      action = "store_true",
                      help = "By default, the scorer generates aggregate tag-level scores. If this flag is present, generate a separate spreadsheet showing aggregate token-level scores.")
scoregroup.add_option("--by_pseudo_token", dest = "by_pseudo_token",
                      action = "store_true",
                      help = "By default, the scorer generates aggregate tag-level scores. If this flag is present, generate a separate spreadsheet showing aggregate scores using what we're call 'pseudo-tokens', which is essentially the spans created by the union of whitespace boundaries and span boundaries. For English and other Roman-alphabet languages, this score should be very, very close to the token-level score, without requiring the overhead of having actual token annotations in the document.")
scoregroup.add_option("--by_character", dest = "by_character",
                      action = "store_true",
                      help = "By default, the scorer generates aggregate tag-level scores. If this flag is present, generate a separate spreadsheet showing aggregate character-scores. For languages like Chinese, this score may provide some useful sub-phrase metrics without requiring the overhead of having token annotations in the document.")
scoregroup.add_option("--compute_confidence_data", dest = "compute_confidence_data",
                      action = "store_true",
                      help = "If present, the scorer will compute means and variances for the various metrics provided in the tag and token spreadsheets, if --csv-output_dir is specified.")
scoregroup.add_option("--csv_output_dir", dest = "csv_output_dir",
                      metavar = "dir",
                      help = "By default, the scorer formats text tables to standard output. If this flag is present, the scores will be written as CSV files to <dir>/bytag.csv, <dir>/bytoken.csv, and <dir>/details.csv.By default, the scorer formats text tables to standard output. If this flag is present, the scores (if requested) will be written as CSV files to <dir>/bytag_<format>.csv, <dir>/bytoken_<format>.csv, <div>/bypseudotoken_<format>.csv, <dir>/bychar_<format>.csv, <dir>/details.csv, and <dir>/confusability.csv. The value or values for <format> are governed by the --csv_formula_output option.")
scoregroup.add_option("--csv_formula_output", dest = "csv_formula_output",
                      help = "A comma-separated list of options for CSV output. The possibilities are 'oo' (formulas with OpenOffice separators), 'excel' (formulas with Excel separators), 'literal' (no formulas). The scorer will produce CSV output files for each of the conditions you specify. By default, if --csv_output_dir is specified, this value is 'excel'. Note that the OpenOffice and Excel formula formats are incompatible with each other, so you'll only be able to open output files with Excel separators in Excel, etc.")

options, args = parser.parse_args()

def Usage():
    global parser
    parser.print_help()
    sys.exit(1)

if args:
    Usage()

INPUT_FILE = options.file
INPUT_DIR = options.dir
INPUT_FILE_RE = options.file_re
REF_FILE = options.ref_file
REF_DIR = options.ref_dir
REF_FSUFF_OFF = options.ref_fsuff_off
REF_FSUFF_ON = options.ref_fsuff_on
SHOW_DETAILS = options.details
SHOW_CONFUSABILITY = options.confusability
SHOW_BY_TOKEN = options.by_token
SHOW_BY_PSEUDO_TOKEN = options.by_pseudo_token
SHOW_BY_CHARACTER = options.by_character
CSV_OUTPUT_DIR = options.csv_output_dir
FILE_TYPE = options.file_type
REF_FILE_TYPE = options.ref_file_type
HYP_IO = REF_IO = None

if (INPUT_FILE is None) and (INPUT_DIR) is None:
    print "One of --file or --dir must be specified."
    Usage()

if (INPUT_FILE is not None) and (INPUT_DIR is not None):
    print "Only one of --file or --dir can be specified."
    Usage()

if (INPUT_FILE is not None) and (REF_FILE is None):
    print "--file requires --ref_file."
    Usage()

if (INPUT_DIR is not None) and (REF_DIR is None):
    print "--dir requires --ref_dir."
    Usage()

if (INPUT_FILE is not None) and (REF_DIR is not None):
    print "Ignoring --ref_dir with --file."

if (INPUT_DIR is not None) and (REF_FILE is not None):
    print "Ignoring --ref_file with --dir."

if (INPUT_FILE is not None):
    if (REF_FSUFF_OFF is not None):
        print "Ignoring --ref_fsuff_off with --file."
    if (REF_FSUFF_ON is not None):
        print "Ignoring --ref_fsuff_on with --file."
    if (INPUT_FILE_RE is not None):
        print "Ignoring --file_re with --file."

REF_FSUFF_ON = REF_FSUFF_ON or ""
REF_FSUFF_OFF = REF_FSUFF_OFF or ""

fmt = MAT.Score.ScoreFormat(csvFormulaOutput = options.csv_formula_output)

# And now, we're ready to do something.

FPAIRS = []

if INPUT_FILE is not None:
    FPAIRS.append((os.path.abspath(INPUT_FILE), os.path.abspath(REF_FILE)))
else:
    if INPUT_FILE_RE is not None:
        import re
        INPUT_FILE_RE = re.compile("^"+INPUT_FILE_RE+"$")
    files = os.listdir(INPUT_DIR)
    for f in files:
        if (INPUT_FILE_RE is None) or (INPUT_FILE_RE.match(f)):
            fullP = os.path.join(INPUT_DIR, f)
            if not os.path.isdir(fullP):
                if REF_FSUFF_OFF and f[-len(REF_FSUFF_OFF):] == REF_FSUFF_OFF:
                    f = f[:-len(REF_FSUFF_OFF)]
                if REF_FSUFF_ON:
                    f = f + REF_FSUFF_ON
                FPAIRS.append((fullP, os.path.join(REF_DIR, f)))

# Now, we have all the pairs.

import MAT.Score

task = None
CONTENT_ANNOTATIONS = None
TOKEN_ANNOTATIONS = None
if options.task:
    task = PLUGIN_DIR.getTask(options.task)
    if task is None:
        print >> sys.stderr, "Error: task '%s' unknown." % options.task
        Usage()
else:
    if options.content_annotations:
        CONTENT_ANNOTATIONS = options.content_annotations.split(",")
    else:
        print >> sys.stderr, "Neither a task nor content annotations are specified; scoring will be pointless."
        Usage()
    if options.token_annotations:
        TOKEN_ANNOTATIONS = options.token_annotations.split(",")

if SHOW_DETAILS:
    SHOW_DETAILS = None
else:
    SHOW_DETAILS = False
if SHOW_BY_TOKEN:
    SHOW_BY_TOKEN = None
else:
    SHOW_BY_TOKEN = False
if SHOW_BY_PSEUDO_TOKEN:
    SHOW_BY_PSEUDO_TOKEN = None
else:
    SHOW_BY_PSEUDO_TOKEN = False
if SHOW_BY_CHARACTER:
    SHOW_BY_CHARACTER = None
else:
    SHOW_BY_CHARACTER = False

EQUIV_CLASSES = None
if options.equivalence_class:
    EQUIV_CLASSES = {}
    for k, v in options.equivalence_class:
        for oldLabel in [x.strip() for x in v.split(",")]:
            EQUIV_CLASSES[oldLabel] = k
IGNORE_LABELS = None
if options.ignore:
    IGNORE_LABELS = [v.strip() for v in options.ignore.split(",")]

scoreObj = MAT.Score.Score(format = fmt, task = task, tokenResultTable = SHOW_BY_TOKEN,
                           detailResultTable = SHOW_DETAILS,
                           pseudoTokenResultTable = SHOW_BY_PSEUDO_TOKEN,
                           characterResultTable = SHOW_BY_CHARACTER,
                           showTagOutputMismatchDetails = options.tag_output_mismatch_details,
                           computeConfidenceData = options.compute_confidence_data,
                           contentAnnotations = CONTENT_ANNOTATIONS,
                           tokenAnnotations = TOKEN_ANNOTATIONS,
                           equivalenceClasses = EQUIV_CLASSES,
                           labelsToIgnore = IGNORE_LABELS,
                           computeConfusability = SHOW_CONFUSABILITY,
                           restrictRefToGoldSegments = options.ref_gold_only,
                           restrictHypToGoldSegments = options.gold_only,
                           similarityProfile = options.similarity_profile,
                           scoreProfile = options.score_profile)

values = AGGREGATOR.convertToKW(options)
try:
    del values["task"]
except KeyError:
    pass

# REF_FILE_TYPE and FILE_TYPE are now the actual classes.

if REF_FILE_TYPE is not None:
    REF_IO = REF_FILE_TYPE(task = task,
                           encoding = values.get("ref_encoding", None), **values.get("ref_") or {})
# I don't have to isolate those values that aren't from the ref side.
if FILE_TYPE is not None:
    HYP_IO = FILE_TYPE(task = task, **values)

scoreObj.addFilenamePairs(FPAIRS, refIO = REF_IO, hypIO = HYP_IO)

if options.by_token and (not scoreObj.foundSomeTokens):
    print "Skipping token scoring because no tokens were found in the input documents."

if CSV_OUTPUT_DIR is not None:
    scoreObj.writeCSV(CSV_OUTPUT_DIR)
else:
    print scoreObj.formatResults()
