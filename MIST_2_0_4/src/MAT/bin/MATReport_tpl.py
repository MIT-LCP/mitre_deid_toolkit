#!MF_PYTHONBIN

# Copyright (C) 2010 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import os, sys

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

# Must import MAT so that sys.path is enhanced.

import MAT

PLUGIN_DIR = MAT.PluginMgr.LoadPlugins()

#
# Toplevel
#

from MAT.Operation import CmdlineOpArgumentAggregator, OptionParser, OptionGroup
from MAT.Score import WriteableTable

parser = OptionParser(usage = "Usage: %prog [options]")
AGGREGATOR = CmdlineOpArgumentAggregator(parser)
CONCORDANCE_WINDOW = 32

def UsageError(msg):
    global parser
    print >> sys.stderr, msg
    parser.print_help()
    sys.exit(1)

def _fileTypeCallback(optionObj, flag, value, parser):
    global AGGREGATOR
    setattr(parser.values, optionObj.dest, value)
    try:
        cls = MAT.DocumentIO.getInputDocumentIOClass(value)
        cls.addInputOptions(AGGREGATOR)
    except KeyError:
        UsageError("Error: file_type must be one of " + ", ".join(["'"+x+"'" for x in MAT.DocumentIO.allInputDocumentIO(exclusions = ['raw'])]))

group = OptionGroup(parser, "Core options")
group.add_option("--task",
                 metavar = "task",
                 dest = "task",
                 type = "string",
                 help = "name of the task to use.  Obligatory if neither --content_annotations nor --content_annotations_all are provided, and more than one task is registered. Known tasks are: " + ", ".join(PLUGIN_DIR.keys()))
group.add_option("--content_annotations", dest = "content_annotations",
                 metavar = "label,label,...",
                 help = "Optional. If --task is not provided, the reporter requires additional, external information to determine which annotations are content annotations. Use this flag to provide a comma-separated sequence of annotation labels which should be treated as content annotations.")
group.add_option("--content_annotations_all",
                 action = "store_true",
                 help = "Optional. If neither --task nor --content_annotations are provided, this flag will cause all labels in the document to be treated as content annotations.")
group.add_option("--verbose", action = "store_true",
                 help = "If present, the tool will provide detailed information on its progress.")
parser.add_option_group(group)

group = OptionGroup(parser, "Input options")
group.add_option("--input_dir", dest = "input_dir", action = "append",
                 metavar = "dir",
                 help = "A directory, all of whose files will be reported on. Can be repeated. May be specified with --input_files.")
group.add_option("--input_files", dest = "input_files", action = "append",
                 metavar = "re",
                 help = "A glob-style pattern describing full pathnames to be reported on. May be specified with --input_dir. Can be repeated.")
group.add_option("--file_type", dest = "file_type",
                 type = "string",
                 action = "callback",
                 callback = _fileTypeCallback,
                 metavar = " | ".join(MAT.DocumentIO.allInputDocumentIO(exclusions = ['raw'])),
                 help = "The file type of the input. One of " + ", ".join(MAT.DocumentIO.allInputDocumentIO(exclusions = ['raw'])) + ". Default is mat-json.")
group.add_option("--encoding", dest = "encoding",
                 type = "string",
                 metavar = "encoding",
                 help = 'The encoding of the input. The default is the appropriate default for the file type.')
parser.add_option_group(group)

group = OptionGroup(parser, "Output options")
group.add_option("--output_dir", dest = "output_dir", metavar="dir",
                 help = "The output directory for the reports. Will be created if it doesn't exist. Required.")
group.add_option("--csv", dest = "csv", action = "store_true",
                 help = "Generate a CSV file in the output directory, with concordance-style data: file, location, content, left and right context, annotation label. At least one of this option and --txt must be provided.")
group.add_option("--txt", dest = "txt", action = "store_true",
                 help = "Generate a text file in the output directory, with concordance-style data, sorted first by annotation label and then by content. At least one of this option and --csv must be provided.")
group.add_option("--concordance_window", dest = "concordance_window", type = "int",
                 metavar = "chars",
                 help = "Use the specified value as the window size on each side of the concordance. Default is %d." % CONCORDANCE_WINDOW)
group.add_option("--omit_concordance_context", dest = "omit_concordance_context", action = "store_true",
                 help = "Omit the left and right concordance context from the output.")
group.add_option("--file_csv", dest = "file_csv", action = "store_true",
                 help = "Generate a separate CSV file consisting of file-level statistics such as file size in characters and number of annotations of each type.")
group.add_option("--interpolate_file_info", dest = "interpolate_file_info", action = "store_true",
                 help = "Instead of a separate CSV file for the file-level statistics, interpolate them into the concordance.")
group.add_option("--include_spanless", action = "store_true",
                 help = "By default, only spanned content annotations are produced. If this flag is present, spanless annotations (without position or left or right context, of course) will be included. If the spanless annotations refer to spanned annotations, the text context of the referred annotations will be inserted in the 'text' column.")
group.add_option("--partition_by_label", dest = "partition_by_label", action = "store_true",
                 help = "If present, in addition to the standard output file report.csv and/or report.txt, the tool will generate a separate spreadsheet for each label, with a column for each attribute.")
parser.add_option_group(group)

# Make sure that the JSON arguments are always available.

_jsonIO = MAT.DocumentIO.getDocumentIOClass('mat-json')
_jsonIO.addInputOptions(AGGREGATOR)

options, args = parser.parse_args()

# Figure out the task. I need the task and config arguments, both, before
# I try to digest the rest of the command line.

allTasks = PLUGIN_DIR.getAllTasks()

TASK = None
CACHED_LABELS = None
if options.task is not None:
    TASK = PLUGIN_DIR.getTask(options.task)
    if TASK is None:
        UsageError("Unknown task '%s'." % options.task)
    CACHED_LABELS = TASK.getAnnotationTypesByCategory("content")
elif options.content_annotations:
    CACHED_LABELS = [s.strip() for s in options.content_annotations.split(",")]
elif options.content_annotations_all:
    pass
elif len(allTasks) == 1:
    TASK = allTasks[0]
    CACHED_LABELS = TASK.getAnnotationTypesByCategory("content")
else:
    UsageError("Neither --task nor --content_annotations nor --content_annotations_all is specified, and more than one task is known.")

if args:
    UsageError("Extra arguments found: %s" % " ".join(args))

if not (options.csv or options.txt):
    UsageError("Either --csv or --txt must be provided.")

if not options.output_dir:
    UsageError("--output_dir must be provided.")
elif os.path.exists(options.output_dir) and (not os.path.isdir(options.output_dir)):
    UsageError("value of --output_dir exists, but is not a directory.")

# Finally, figure out the file list.

FILES = set()

import glob

if options.input_dir is not None:
    for dir in options.input_dir:
        if not os.path.isdir(dir):
            print >> sys.stderr, "Warning: skipping nonexistent directory '%s'." % dir
            continue
        for elt in os.listdir(dir):
            p = os.path.join(dir, elt)
            if os.path.isfile(p):
                FILES.add(p)
if options.input_files is not None:                
    for pat in options.input_files:
        for elt in glob.glob(pat):
            if os.path.isfile(elt):
                FILES.add(elt)

if len(FILES) == 0:
    UsageError("No files specified.")

if options.file_type is None:
    options.file_type = 'mat-json'

kw = AGGREGATOR.convertToKW(options)
# "task" needs to be an actual object.
try:
    del kw["task"]
except:
    pass
IO_TYPE = MAT.DocumentIO.getDocumentIO(options.file_type, task = TASK, **kw)

DO_CONCORDANCE = not options.omit_concordance_context
if options.concordance_window is not None:
    CONCORDANCE_WINDOW = options.concordance_window

reporter = MAT.Document.AnnotationReporter(partitionByLabel = options.partition_by_label)
reporter.addPosition(concordanceContext = DO_CONCORDANCE, concordanceWindow = CONCORDANCE_WINDOW)

# For each file, load the document using IO_TYPE, and extract the content
# annotations.

fileData = {}
allLabels = set()

for path in FILES:
    if options.verbose:
        print "Generating statistics for", path, "..."
    basename = os.path.basename(path)
    doc = IO_TYPE.readFromSource(path)
    fileData[basename] = {"length": len(doc.signal)}
    if CACHED_LABELS is not None:
        aNames = CACHED_LABELS
    else:
        # Only if --content_annotations_all was provided.
        aNames = doc.atypeRepository.keys()
    allLabels.update(aNames)
    fileData[basename]["annots"] = reporter.addDocument(doc, basename, aNames, includeSpanless = options.include_spanless)
    
if not os.path.exists(options.output_dir):
    os.makedirs(options.output_dir)

if options.csv:
    if options.verbose:
        print "Generating main CSV file..."
    headers, csvRows = reporter.getHeadersAndRows()
    if options.interpolate_file_info:
        # The basename will be first, because we used addDocument.
        labelIndex = headers.index("label")
        headers[1:1] = ["file_size", "count_for_label"]
        finalRows = []
        for r in csvRows:
            file = r[0]
            label = r[labelIndex]
            fileInfo = fileData[file]
            finalRows.append([file, fileInfo["length"], fileInfo["annots"][label]] + r[1:])
        csvRows = finalRows
    # Once we've interpolated the file info, the label is superfluous.
    labelIndex = headers.index("label")
    csvRows = [r[0:labelIndex] + r[labelIndex + 1:] for r in csvRows]
    headers = headers[0:labelIndex] + headers[labelIndex+1:]
    WriteableTable().writeCSV(os.path.join(options.output_dir, "report.csv"), headers, csvRows)
    
    if options.partition_by_label:
        for k, (headers, theseRows) in reporter.getPartitionedHeadersAndRows().items():
            if options.verbose:
                print "Generating CSV file for %s..." % k
            WriteableTable().writeCSV(os.path.join(options.output_dir, "report_"+k+".csv"), headers, theseRows)

if options.txt:
    if options.verbose:
        print "Generating main text file..."
    import codecs
    # First, let's create the rows I'm working with. Remove newlines!
    import re
    NL_PAT = re.compile("[\n\r]")
    def formatNL(sep, s):
        if s is None:
            return ""
        else:
            return NL_PAT.sub(sep, s)
    
    def formatLoc(file, start, end):
        if (start is None) or (end is None):
            return file
        else:
            return "%s:%d-%d" % (file, start, end)

    ignore, allRows = reporter.getHeadersAndRows()    
                    
    if DO_CONCORDANCE:
        if options.interpolate_file_info:
            headers = ["Location", "File size", "#Annots", "Left context", "Text", "Label", "Right context"]
            txtRows = [(formatLoc(file, start, end), str(fileData[file]["length"]),
                        str(fileData[file]["annots"][label]),
                        formatNL(" ", left),
                        formatNL(" ", text), description, formatNL(" ", right))
                       for (file, start, end, left, text, label, description, right) in allRows]
        else:
            headers = ["Location", "Left context", "Text", "Label", "Right context"]
            txtRows = [(formatLoc(file, start, end), formatNL(", ", left),
                        formatNL(" ", text), description, formatNL(" ", right))
                       for (file, start, end, left, text, label, description, right) in allRows]
    elif options.interpolate_file_info:
        headers = ["Location", "File size", "#Annots", "Text", "Label"]
        txtRows = [(formatLoc(file, start, end), str(fileData[file]["length"]),
                    str(fileData[file]["annots"][label]),
                    formatNL(" ", text), description)
                   for (file, start, end, text, label, description) in allRows]
    else:
        headers = ["Location", "Text", "Label"]
        txtRows = [(formatLoc(file, start, end), formatNL(" ", text), description)
                   for (file, start, end, text, label, description) in allRows]

    # Now, sometimes the overall line length is going to be enormous, thanks to
    # very complex, recursive label descriptions. So I should test this.

    skipIt = False
    for row in txtRows:
        if sum([len(s) for s in row]) > (6 * CONCORDANCE_WINDOW):
            print >> sys.stderr, "Skipping main text file output because row length exceeds 6 * concordance window."
            skipIt = True
            break
        
    if not skipIt:
        fp = codecs.open(os.path.join(options.output_dir, "report.txt"), "w", 'utf-8')
        fp.write(WriteableTable().format(headers, txtRows))
        fp.close()

    if options.partition_by_label:
        for k, (origHeaders, theseRows) in reporter.getPartitionedHeadersAndRows().items():
            if options.verbose:
                print "Generating text file for %s..." % k
            textIndex = origHeaders.index("text")
            headers = ["Location", "ID"]
            if DO_CONCORDANCE:
                headers += ["Left context", "Text"]
                rcIndex = origHeaders.index("right context")
                headers += origHeaders[textIndex + 1:rcIndex]
                headers.append("Right context")
                txtRows = []
                lcIndex = origHeaders.index("left context")
                for row in theseRows:
                    file, start, end, aid, left, text = row[:6]
                    txtRows.append([formatLoc(file, start, end), str(aid), formatNL(", ", left), formatNL(" ", text)] + \
                                   [s or "" for s in row[6:rcIndex]] + [formatNL(" ", row[rcIndex])])
            else:
                headers += ["Text"]
                headers += origHeaders[textIndex + 1:]
                txtRows = []
                for row in theseRows:
                    file, start, end, aid, text = row[:5]
                    txtRows.append([formatLoc(file, start, end), str(aid), formatNL(" ", text)] + \
                                   [s or "" for s in row[5:]])
            skipIt = False
            for row in txtRows:
                if sum([len(s) for s in row]) > (6 * CONCORDANCE_WINDOW):
                    print >> sys.stderr, "Skipping text file output for %s because row length exceeds 6 * concordance window." % k
                    skipIt = True
                    break

            if not skipIt:
                fp = codecs.open(os.path.join(options.output_dir, "report_"+k+".txt"), "w", 'utf-8')
                fp.write(WriteableTable().format(headers, txtRows))
                fp.close()

if options.file_csv:
    if options.verbose:
        print "Generating file info CSV..."
    labels = list(allLabels)
    labels.sort()
    WriteableTable().writeCSV(os.path.join(options.output_dir, "file_report.csv"), ("file", "file_size") + tuple(labels),
                              [(os.path.basename(path), fileData[os.path.basename(path)]["length"]) +
                               tuple([fileData[os.path.basename(path)]["annots"].get(label, 0) for label in labels])
                               for path in FILES])

if options.verbose:
    print "Done."
