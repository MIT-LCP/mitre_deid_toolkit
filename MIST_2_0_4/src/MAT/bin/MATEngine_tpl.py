#!MF_PYTHONBIN

# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.


import os, sys

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

#
# Toplevel
#

OTHER_DIRS = []

# Hm. Now, the plugins can arise in other directories, and I have to read
# those plugins before I can parse the command line arguments. Grrr. This
# is ugly, but the new optparse module is a one of those
# "the first step is a doozy" modules.

iStart = 0

while True:
    try:
        i = 1 + sys.argv[1:].index("--other_app_dir", iStart)
        if i < len(sys.argv) - 1:
            OTHER_DIRS.append(sys.argv[i + 1])
        iStart = i + 2
    except ValueError:
        break

# Also, the settings file.

try:
    i = 1 + sys.argv[1:].index("--settings_file")
    if i < len(sys.argv) - 1:
        os.environ["MAT_SETTINGS_FILE"] = sys.argv[i + 1]
except ValueError:
    pass

import MAT

from MAT.Operation import OptionParser, OptionGroup

PLUGIN_DIR = MAT.PluginMgr.LoadPlugins(*OTHER_DIRS)

ENGINE = None
AGGREGATOR = None

# We want to be able to present progressive help, so we first want
# to be able to construct a core option parser, which we can print
# out if --task is missing or there is more than one task.
    
# Once the task and workflow are set, you can add the
# other options.

def _createEngine(parser):
    global ENGINE, PLUGIN_DIR, AGGREGATOR
    options = parser.values
    foundError = False
    try:        
        # Don't pass in the TASK_OBJ, because it's not an eligible leaf task yet.
        ENGINE = CmdlineMATEngine(task = options.task, workflow = options.workflow, pluginDir = PLUGIN_DIR)
    except MAT.ToolChain.ShortUsageConfigurationError, (engine, err):
        print "Error:", err
        createCoreOptions().print_help()
        sys.exit(1)
    except MAT.ToolChain.ConfigurationError, (engine, err):        
        print "Error:", err
        foundError = True
        ENGINE = engine
    if ENGINE and ENGINE.taskObj:
        parser.usage += "\n\n" + PLUGIN_DIR.formatCmdlineMetadata(ENGINE.taskObj)
        ENGINE.taskObj.addOptions(AGGREGATOR)
    if foundError:
        parser.print_help()
        sys.exit(1)

def _taskCallback(optionObj, flag, value, parser):
    setattr(parser.values, optionObj.dest, value)
    if parser.values.workflow is not None:
        _createEngine(parser)

def _workflowCallback(optionObj, flag, value, parser):
    setattr(parser.values, optionObj.dest, value)
    if parser.values.task is not None:
        _createEngine(parser)

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

def createCoreOptions():

    parser = OptionParser(usage = "Usage: %prog [core options] [input/output/task options] [other options]")
    group = OptionGroup(parser, "Core options")
    group.add_option("--other_app_dir", action="append",
                     dest = "other_dirs",
                     metavar = "dir",
                     help = "additional directory to load a task from. Optional and repeatable.")
    group.add_option("--settings_file",
                     dest = "settings_file",
                     metavar = "file",
                     help = "a file of settings to use which overwrites existing settings. The file should be a Python config file in the style of the template in etc/MAT_settings.config.in. Optional.")
    group.add_option("--task", dest = "task",
                     type = "string",
                     metavar = "task",
                     action = "callback",
                     callback = _taskCallback,
                     help = "name of the task to use. Obligatory if the system knows of more than one task. Known tasks are: " + ", ".join(PLUGIN_DIR.keys()))
    MAT.ExecutionContext.addOptions(group)
    parser.add_option_group(group)
    return parser

def createGeneralOptions():
    parser = createCoreOptions()
    # Now, add all the other arguments.
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
    group = OptionGroup(parser, "Output options")
    group.add_option("--output_file", dest = "output_file",
                     metavar = "file",
                     help = "Where to save the output. Optional. Must be paired with --input_file. A single dash ('-') will cause the engine to write to standard output.")
    group.add_option("--output_dir", dest = "output_dir",
                     metavar = "dir",
                     help = "Where to save the output. Optional. Must be paired with --input_dir.")
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
    group = OptionGroup(parser, "Task options")
    group.add_option("--workflow", dest = "workflow",
                     type = "string",
                     metavar = "workflow",
                     action = "callback",
                     callback = _workflowCallback,
                     help = "The name of a workflow, as specified in some task.xml file. Required if more than one workflow is available. See above for available workflows.")
    group.add_option("--steps", dest = "steps",
                     metavar = "step,step,...",
                     help = "Some ordered subset of the steps in the specified workflow. The steps should be concatenated with a comma. See above for available steps.")
    group.add_option("--print_steps", dest = "print_steps",
                     metavar = "step,step,...",
                     help = "Some subset of the steps in the specified workflow. Verbose details about these steps will be printed. The steps should be concatenated with a comma.")
    group.add_option("--undo_through", dest = "undo_through",
                     metavar = "step",
                     help = "A step in the current workflow. All possible steps already done in the document which follow this step are undone, including this step, before any of the steps in --steps are applied. You can use this flag in conjunction with --steps to rewind and then reapply operations.")
    parser.add_option_group(group)
    return parser

from MAT.ToolChain import MATEngine

class CmdlineMATEngine(MATEngine):

    def __init__(self, *args, **kw):
        self.print_steps = []
        self.mostRecentReportedStep = None
        MATEngine.__init__(self, *args, **kw)

    def Run(self, print_steps = None, **kw):
        
        if print_steps is None:
            pass
        elif type(print_steps) is str:
            self.print_steps = print_steps.split(",")
            if self.print_steps == ['']:
                self.print_steps = []
        else:
            # We're going to surgically alter it.
            self.print_steps = print_steps[:]

        return MATEngine.Run(self, **kw)

    def RunDataPairs(self, iDataPairs, *args, **params):
        res = MATEngine.RunDataPairs(self, iDataPairs, *args, **params)
        self._maybeFinishNonFancyPrinting(None)
        return res

    def _maybeFinishNonFancyPrinting(self, stepName):
        if stepName != self.mostRecentReportedStep:
            # Changing. If the last step was not fancy,
            # then add a newline for that round.
            if self.mostRecentReportedStep is not None:
                if self.mostRecentReportedStep not in self.print_steps:
                    print

    def ReportStepResult(self, stepObj, fname, iData):
        stepName = stepObj.stepName
        self._maybeFinishNonFancyPrinting(stepName)
        if self.mostRecentReportedStep != stepName:
            firstInStep = True
        else:
            firstInStep = False
        self.mostRecentReportedStep = stepName
        if stepName in self.print_steps:
            printFancy = True
        else:
            printFancy = False
        if (not printFancy) and firstInStep:
            print stepName, ":",
        
        if printFancy:
            print "=== %s: %s result:" % (os.path.basename(fname), stepName.capitalize())
            if isinstance(iData, MAT.Document.AnnotatedDoc):
                print MAT.DocumentIO.getDocumentIO('mat-json').writeToUnicodeString(iData)
            elif type(iData) is type(""):
                print iData
        else:
            # Newline will be printed later
            print os.path.basename(fname),
            sys.stdout.flush()


# I need to call this AGAIN if we have a task but something
# breaks. Here, I need all the possible arguments from all the tasks
# in order to parse the commandline.

parser = createGeneralOptions()
AGGREGATOR = MAT.Operation.CmdlineOpArgumentAggregator(parser)

options, args = parser.parse_args()

if args:
    print >> sys.stderr, "Extra arguments found:", " ".join(args)
    createCoreOptions().print_help()
    sys.exit(1)

if ENGINE is None:
    if options.task:
        # Just to generate the error.
        _createEngine(parser)
    else:
        # If engine is None, --task was not defined.
        print "Error: task not specified."
        createCoreOptions().print_help()
        sys.exit(1)

MAT.ExecutionContext.extractOptions(options)

# Only collect those values which aren't None. We don't want to
# override the defaults in the function invocation. Because of the new way
# we handle options, the aggregator contains all the parse arguments.

RunArgs = AGGREGATOR.convertToKW(options)
for arg in ["other_app_dir", "task", "settings_file", "workflow",
            "subprocess_debug", "subprocess_statistics", "preserve_tempfiles",
            "tmpdir_root", "debug"]:
    try:
        del RunArgs[arg]
    except:
        pass

try:
    ENGINE.Run(**RunArgs)
except MAT.ToolChain.NoUsageConfigurationError, (engine, err):
    print "Error:", err
    sys.exit(1)
except MAT.ToolChain.ShortUsageConfigurationError, (engine, err):
    print "Error:", err
    createCoreOptions().print_help()
    sys.exit(1)
except MAT.ToolChain.ConfigurationError, (engine, err):
    print "Error:", err
    parser.print_help()
    sys.exit(1)
