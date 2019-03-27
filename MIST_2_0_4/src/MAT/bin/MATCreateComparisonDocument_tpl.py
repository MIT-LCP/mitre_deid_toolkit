#!MF_PYTHONBIN

# Copyright (C) 2012 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import os, sys

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

import MAT

PLUGIN_DIR = MAT.PluginMgr.LoadPlugins()

from MAT.Operation import OptionParser, OptionGroup

parser = OptionParser(usage = """Usage: %prog [options] task_name output_doc pivot_doc otherdoc...

task_name: the name of a known task. Known tasks are: """ + ", ".join(PLUGIN_DIR.keys()) + """
output_doc: the file to save the comparison document to.
pivot_doc: the document to which each of the other documents will be compared.
otherdoc...: a sequence of other documents, which all share the same signal with the pivot_doc.""")

# Progressive enhancement.
from MAT.Operation import CmdlineOpArgumentAggregator
AGGREGATOR = CmdlineOpArgumentAggregator(parser)

parser.add_activation_option("--file_type", AGGREGATOR, MAT.DocumentIO.DocumentIO, subtype = "inputArgs",
                             classFilters = ["excluderaw"],
                             default = "mat-json", help = "The file type of the input documents. Default is mat-json.")
parser.add_option("--similarity_profile", dest="similarity_profile",
                 metavar = "profile",
                 help = "If provided, the name of a similarity profile in the specified task.")
options, args = parser.parse_args()

def Usage():
    global parser
    parser.print_help()
    sys.exit(1)

if len(args) < 4:
    Usage()

values = AGGREGATOR.convertToKW(options)

[TASKNAME, OUTPUT_DOC, PIVOT_DOCNAME] = args[0:3]
OTHERS = args[3:]

try:
    TASK = PLUGIN_DIR[TASKNAME]
except KeyError:
    print >> sys.stderr, "Can't find task '%s'. Exiting." % TASKNAME
    Usage()

values = AGGREGATOR.convertToKW(options)

_fileInput = options.file_type(task = TASK, **values)

_jsonIO = MAT.DocumentIO.getDocumentIO("mat-json", task = TASK)

PIVOT_DOC = _fileInput.readFromSource(PIVOT_DOCNAME)
OTHERDOCS = [_fileInput.readFromSource(f) for f in OTHERS]

import MAT.ComparisonDocument

pivotLabel = "compDoc0"
otherLabels = ["compDoc" + str(i + 1) for i in range(len(OTHERDOCS))]

d = MAT.ComparisonDocument.generateComparisonDocument(TASK, PIVOT_DOC, OTHERDOCS,
                                                      pivotLabel = pivotLabel,
                                                      otherLabels = otherLabels,
                                                      similarityProfile = options.similarity_profile)

# We must add a table which records the filenames, for the UI.

compData = d.metadata["comparison"]
pairs = compData["pairs"]
pairs[0]["pivotDocName"] = os.path.basename(PIVOT_DOCNAME)
for i in range(len(pairs)):
    pairs[i]["otherDocName"] = os.path.basename(OTHERS[i])

_jsonIO.writeToTarget(d, OUTPUT_DOC)
