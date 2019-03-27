#!MF_PYTHONBIN

# Copyright (C) 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# I've been meaning to write this for a while, and I need it
# now to test. Soooo...

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

parser = OptionParser(usage = "Usage: %prog [task option] [config name option] [other options]")
AGGREGATOR = CmdlineOpArgumentAggregator(parser)

group = OptionGroup(parser, "Task option")
group.add_option("--task",
                 metavar = "task",
                 dest = "task",
                 type = "string",
                 help = "name of the task to use. Must be the first argument, if present. Obligatory if the system knows of more than one task. Known tasks are: " + ", ".join(PLUGIN_DIR.keys()))
parser.add_option_group(group)

group = OptionGroup(parser, "Config name option")
group.add_option("--config_name",
                 metavar = "name",
                 dest = "config_name",
                 type = "string",
                 help = "name of the model build config to use. Must be the first argument after --task, if present. Optional. Default model build config will be used if no config is specified.")
parser.add_option_group(group)

group = OptionGroup(parser, "Control options")
MAT.ExecutionContext.addOptions(group)
parser.add_option_group(group)


def UsageError(msg):
    global parser
    print >> sys.stderr, msg
    parser.print_help()
    sys.exit(1)

# Figure out the task. I need the task and config arguments, both, before
# I try to digest the rest of the command line.

allTasks = PLUGIN_DIR.getAllTasks()

TASK = None

args = sys.argv[1:]
if args and args[0] == "--task":
    if len(args) > 1:
        TASK = PLUGIN_DIR.getTask(args[1])
        if TASK is None:
            UsageError("Unknown task '%s'." % args[1])
        args[0:2] = []
    else:
        UsageError("No argument to --task specified.")
else:
    if "--task" in args:
        UsageError("--task appears in non-initial position")
    if len(allTasks) == 1:
        TASK = allTasks[0]
    else:
        UsageError("No task specified and more than one task available.")

if args and args[0] == "--config_name":
    if len(args) > 1:
        buildInfo = TASK.getModelInfo(configName = args[1])
        if buildInfo is None:
            UsageError("Unknown model build config name '%s'." % args[1])
        args[0:2] = []
    else:
        UsageError("No argument to --config_name specified.")
else:
    if "--config_name" in args:
        UsageError("--config_name appears somewhere other than immediately after --task")
    buildInfo = TASK.getModelInfo()
    if buildInfo is None:
        UsageError("No default model build config found.")

buildInfo.getModelClass().addOptions(AGGREGATOR, heading = "Options for model class creation")

def _fileTypeCallback(optionObj, flag, value, parser):
    global AGGREGATOR
    setattr(parser.values, optionObj.dest, value)
    try:
        cls = MAT.DocumentIO.getInputDocumentIOClass(value)
        cls.addInputOptions(AGGREGATOR)
    except KeyError:
        print "Error: file_type must be one of " + ", ".join(["'"+x+"'" for x in MAT.DocumentIO.allInputDocumentIO(exclusions = ['raw'])])
        parser.print_help()
        sys.exit(1)

# Make sure that the JSON arguments are always available.

_jsonIO = MAT.DocumentIO.getDocumentIOClass('mat-json')
_jsonIO.addInputOptions(AGGREGATOR)

group = OptionGroup(parser, "Input options")
group.add_option("--input_dir", dest = "input_dir", action = "append",
                 metavar = "dir",
                 help = "A directory, all of whose files will be used in the model construction. Can be repeated. May be specified with --input_files.")
group.add_option("--input_files", dest = "input_files", action = "append",
                 metavar = "re",
                 help = "A glob-style pattern describing full pathnames to use in the model construction. May be specified with --input_dir. Can be repeated.")
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
group.add_option("--model_file",
                 dest = "model_file",
                 metavar = "file",
                 help = "Location to save the created model. The directory must already exist. Obligatory if --save_as_default_model isn't specified.")
group.add_option("--save_as_default_model",
                 action = "store_true",
                 dest = "save_as_default_model",
                 help = "If the the task.xml file for the task specifies the <default_model> element, save the model in the specified location, possibly overriding any existing model.")
parser.add_option_group(group)                  

options, args = parser.parse_args(args)

if TASK is None:
    UsageError("No task specified and more than one task available.")

if args:
    UsageError("Extra arguments found: %s" % " ".join(args))

# Now, figure out the output file.

MODEL_FILE = None

if options.model_file:
    # Overrides everything.
    MODEL_FILE = os.path.abspath(options.model_file)
    if not os.path.isdir(os.path.dirname(MODEL_FILE)):
        UsageError("Model file directory doesn't exist.")
elif options.save_as_default_model:
    MODEL_FILE = TASK.getDefaultModel()
    if MODEL_FILE is None:
        UsageError("Model build info does not specify a default model.")
else:
    UsageError("Neither --model_file nor --save_as_default_model specified.")

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

MAT.ExecutionContext.extractOptions(options)

b = buildInfo.buildModelBuilder(**AGGREGATOR.convertToKW(options))

b.run(MODEL_FILE, list(FILES), oStream = sys.stdout)
