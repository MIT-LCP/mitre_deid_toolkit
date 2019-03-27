#!MF_PYTHONBIN

# Copyright (C) 2007 - 2011 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.


import os, sys

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

#
# Toplevel
#

# This was gutted from MATEngine.

import MAT

from MAT.Operation import OptionParser, OptionGroup

PLUGIN_DIR = MAT.PluginMgr.LoadPlugins()

parser = OptionParser()
AGGREGATOR = MAT.Operation.CmdlineOpArgumentAggregator(parser)

# We want to be able to present progressive help, so we first want
# to be able to construct a core option parser, which we can print
# out if --task is missing or there is more than one task.
    
# Once the task and workflow are set, you can add the
# other options.

def _inputFileTypeCallback(optionObj, flag, value, parser):
    global AGGREGATOR
    setattr(parser.values, optionObj.dest, value)
    try:
        cls = MAT.DocumentIO.getInputDocumentIOClass(value)
        cls.addInputOptions(AGGREGATOR)
    except KeyError:
        print "Error: input_file_type must be one of " + ", ".join(["'"+x+"'" for x in MAT.DocumentIO.allInputDocumentIO()])
        parser.print_help()
        sys.exit(1)
        
def _outputFileTypeCallback(optionObj, flag, value, parser):
    global AGGREGATOR
    setattr(parser.values, optionObj.dest, value)
    try:
        cls = MAT.DocumentIO.getOutputDocumentIOClass(value)
        cls.addOutputOptions(AGGREGATOR)
    except KeyError:
        print "Error: output_file_type must be one of " + ", ".join(["'"+x+"'" for x in MAT.DocumentIO.allOutputDocumentIO()])
        parser.print_help()
        sys.exit(1)

group = OptionGroup(parser, "Core options")
group.add_option("--task", dest = "task",
                 type = "string",
                 metavar = "task",
                 help = "name of the task to use, if helpful to the reader/writer. Optional. Known tasks are: " + ", ".join(PLUGIN_DIR.keys()))
group.add_option("--verbose", dest = "verbose", action="store_true",
                 help = "If specified, report each file to stdout as it's transduced.")
MAT.ExecutionContext.addOptions(group)
parser.add_option_group(group)

group = OptionGroup(parser, "Input options")
group.add_option("--input_file", dest = "input_file",
                 metavar = "file",
                 help = "The file to process. Either this or --input_dir must be specified. A single dash ('-') will cause the engine to read from standard input.")
group.add_option("--input_dir", dest = "input_dir",
                 metavar = "dir",
                 help = "The directory to process. Either this or --input_file must be specified.")
group.add_option("--input_file_re", dest = "input_file_re",
                 metavar = "re",
                 help = "If --input_dir is specified, a regular expression to match the filenames in the directory against. The pattern must cover the entire filename (and only the filename, not the full path).")
group.add_option("--input_encoding", dest = "input_encoding",
                 metavar = "encoding",
                 help = "Input character encoding for files which require one. Default is ascii.")
group.add_option("--input_file_type", dest = "input_file_type",
                 type = "string",
                 action = "callback",
                 callback = _inputFileTypeCallback,
                 metavar = " | ".join(MAT.DocumentIO.allInputDocumentIO()),
                 help = "The file type of the input. One of " + ", ".join(MAT.DocumentIO.allInputDocumentIO()) + ". Required.")
parser.add_option_group(group)

group = OptionGroup(parser, "Conversion options")
group.add_option("--document_mapping_xml", dest = "document_mapping_xml",
                 metavar = "xml_string",
                 help = "If present, the mapping XML will be applied to the document(s) before they're saved. Only one of this and --document_mapping_xml_file can be provided")
group.add_option("--document_mapping_xml_file", dest = "document_mapping_xml_file",
                 metavar = "filename",
                 help = "If present, the mapping XML file will be applied to the document(s) before they're saved. Only one of this and --document_mapping_xml can be provided")
group.add_option("--document_mapping_record", dest="document_mapping_record",
                 help = "If --document_mapping_xml or --document_mapping_xml_file are present, or if the reader itself has a convertor registered for the task, this option specifies a file to save a CSV record of the mapping to. If the value of this option is '-', the record will be printed out in plain text to the terminal.")
parser.add_option_group(group)

group = OptionGroup(parser, "Output options")
group.add_option("--output_file", dest = "output_file",
                 metavar = "file",
                 help = "Where to save the output. Either this or --output_dir must be provided. Must be paired with --input_file. A single dash ('-') will cause the engine to write to standard output.")
group.add_option("--output_dir", dest = "output_dir",
                 metavar = "dir",
                 help = "Where to save the output. Either this or --output_file must be provided. Must be paired with --input_dir.")
group.add_option("--output_fsuff", dest = "output_fsuff",
                 metavar = "suffix",
                 help = "The suffix to add to each filename when --output_dir is specified. If absent, the name of each file will be identical to the name of the file in the input directory.")
group.add_option("--output_file_type", dest = "output_file_type",
                 type = "string",
                 action = "callback",
                 callback = _outputFileTypeCallback,
                 metavar = " | ".join(MAT.DocumentIO.allOutputDocumentIO()),
                 help = "The type of the file to save. One of " + ", ".join(MAT.DocumentIO.allOutputDocumentIO()) + ". Required if either --output_file or --output_dir is specified.")
group.add_option("--output_encoding", dest = "output_encoding",
                 metavar = "encoding",
                 help = "Output character encoding for those that need one. Default is ascii.")
parser.add_option_group(group)

if len(sys.argv) == 1:
    # Just print help.
    parser.print_help()
    sys.exit(1)

options, args = parser.parse_args()

if args:
    print >> sys.stderr, "Error: extra arguments found:", " ".join(args)
    parser.print_help()
    sys.exit(1)

MAT.ExecutionContext.extractOptions(options)

task = None
if options.task:
    task = PLUGIN_DIR.getTask(options.task)
    if task is None:
        print >> sys.stderr, "Error: task '%s' unknown." % options.task
        parser.print_help()

from MAT.DocumentIO import DocumentInstructionSetEngine, DocumentInstructionSetEngineConvertor
conversionEngine = None

RECORD_CONVERSIONS = options.document_mapping_record

if options.document_mapping_xml or options.document_mapping_xml_file:
    if options.document_mapping_xml and options.document_mapping_xml_file:
        print >> sys.stderr, "Error: only one of --document_mapping_xml and --document_mapping_xml_file can be provided"
        parser.print_help()

    # You can record conversions of a conversion that's
    # registered on a reader. But it will be a bug
    # to have a conversionEngine AND a convertor on
    # the reader.

    if options.document_mapping_xml:
        xmlStr = options.document_mapping_xml
        if type(xmlStr) is str:
            xmlStr = xmlStr.decode("utf8")
        conversionEngine = DocumentInstructionSetEngine(instructionSetXML = xmlStr, recordConversions = (RECORD_CONVERSIONS is not None))
    else:
        conversionEngine = DocumentInstructionSetEngine(instructionSetFile = options.document_mapping_xml_file, recordConversions = (RECORD_CONVERSIONS is not None))

# Only collect those values which aren't None. We don't want to
# override the defaults in the function invocation. Because of the new way
# we handle options, the aggregator contains all the parse arguments.

RunArgs = AGGREGATOR.convertToKW(options)

for arg in ["task", 
            "subprocess_debug", "subprocess_statistics", "preserve_tempfiles",
            "tmpdir_root", "debug", "document_mapping_xml", "document_mapping_xml_file"]:
    try:
        del RunArgs[arg]
    except:
        pass

from MAT.ExecutionContext import _DEBUG

dm = MAT.DocumentIO.DocumentIOManager(task = task)
try:
    dm.configure(**RunArgs)
except Exception, e:
    if _DEBUG:
        raise
    else:
        print >> sys.stderr, "Error: " + str(e)
        sys.exit(1)

if not dm.isWriteable():
    print >> sys.stderr, "Error: no appropriate output specification provided (--output_dir for --input_dir, or --output_file for --input_file)."
    sys.exit(1)

# Now, let's see whether we have multiple convertors.

if conversionEngine and dm.inputFileType.convertor:
    print >> sys.stderr, "Error: the specified reader already has a convertor registered; multiple convertors not permitted."
    sys.exit(1)

recordingConversionEngine = None
if RECORD_CONVERSIONS:
    recordingConversionEngine = conversionEngine

if (not conversionEngine) and RECORD_CONVERSIONS and dm.inputFileType.convertor and \
   isinstance(dm.inputFileType.convertor, DocumentInstructionSetEngineConvertor):
    # Add the conversion registration to the input convertor.
    dm.inputFileType.convertor.engine.enableConversionRecording()
    recordingConversionEngine = dm.inputFileType.convertor.engine

if RECORD_CONVERSIONS and (not recordingConversionEngine):
    # If we're trying to record conversions, but there's no
    # convertor to record, bail.
    print >> sys.stderr, "Error: --document_mapping_record was specified, but no conversion engine was found."
    sys.exit(1)

# If there's a load error, just keep going.

try:
    for fname, doc, err in dm.loadPairsIncrementally(keepGoing = True):
        if options.verbose:
            print "Transducing", fname
        if doc is None:
            print >> sys.stderr, ("Warning: skipped %s; error: %s" % (fname, err))
        else:
            if conversionEngine:
                # The logic is a bit tortured here. I frankly ought to just
                # hook up this convertor to the input reader, but that would
                # give me reader errors which I don't anticipate, and I want
                # to catch and ignore ALL conversion errors. So I can't put it
                # there. But I can't hang it on the output conversion, because
                # the convertor doesn't HAVE an outputConvert method, perhaps
                # for good reasons. So all I can do here is exactly what I do
                # in perhapsConvert() and deserializeAndConvert() in DocumentIO:
                # copy over the phasesDone if it's present.
                try:
                    origDoc = doc
                    doc = MAT.Document.AnnotatedDoc(globalTypeRepository = doc.atypeRepository.globalTypeRepository)
                    if origDoc.metadata.has_key("phasesDone"):
                        doc.metadata["phasesDone"] = origDoc.metadata["phasesDone"][:]
                    conversionEngine._execute(origDoc, doc)
                except Exception, e:
                    if _DEBUG:
                        raise
                    else:
                        print >> sys.stderr, ("Warning: couldn't convert %s: %s" % (fname, str(e)))
            if RECORD_CONVERSIONS == "-":
                for sourceA, targetA, removalReason in recordingConversionEngine.conversionList:
                    if targetA:
                        print "Mapped", sourceA.describe(), "to", targetA.describe()
                    else:
                        print "Discarded", sourceA.describe(), "because", (removalReason or "(unknown)")
                recordingConversionEngine.conversionList = []
               
            try:
                dm.writeDocument(fname, doc)
            except Exception, e:
                # This catches the write errors which aren't expected.
                if _DEBUG:      
                    raise
                else:
                    print >> sys.stderr, ("Warning: couldn't write %s: %s" % (fname, str(e)))

    if recordingConversionEngine and RECORD_CONVERSIONS and (RECORD_CONVERSIONS is not None) \
       and (RECORD_CONVERSIONS != "-"):
        # Save it.
        from MAT.Score import WriteableTable
        t = WriteableTable()
        try:
            headers, allRows = recordingConversionEngine.conversionRecorder.getHeadersAndRows()
            t.writeCSV(RECORD_CONVERSIONS, headers, allRows)
        except Exception, e:
            if _DEBUG:
                raise
            else:
                print >> sys.stderr, ("Warning: couldn't write CSV mapping record %s: %s" % (RECORD_CONVERSIONS, str(e)))
except Exception, e:
    # This catches the read errors which aren't expected.
    if _DEBUG:
        raise
    else:
        print >> sys.stderr, "Error: " + str(e)
        sys.exit(1)

sys.exit(0)
