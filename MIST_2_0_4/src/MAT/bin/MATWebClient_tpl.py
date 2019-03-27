#!MF_PYTHONBIN

# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# Here, I provide a command-line interface to the Web client tester.

import os, sys

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

import MAT

PLUGIN_DIR = MAT.PluginMgr.LoadPlugins(*OTHER_DIRS)

#
# Toplevel
#

from MAT.Operation import OptionParser, OptionGroup

# The command-line processing will be very similar to MATEngine, except there's
# no directory option. And then there's whether it's a workspace operation or not.
# So a combination of both. But since we're not actually building an engine, we
# can't do progressive enhancement, except for the input and output formats.

parser = OptionParser(usage = "Usage: MATWebClient [ do_steps | ws_import_file | ws_operation ] [ options ]")

if len(sys.argv) < 2:
    print "Error: not enough arguments."
    parser.print_help()
    sys.exit(1)

if sys.argv[1] == "do_steps":
    group = OptionGroup("Options for do_steps")
    group.add_option("--task", dest = "task",
                     type = "string",
                     metavar = "task",
                     action = "callback",
                     callback = _taskCallback,
                     help = "name of the task to use. Obligatory if the system knows of more than one task. Known tasks are: " + ", ".join(PLUGIN_DIR.keys()))
    group.add_option("--input_file", dest = "input_file",
                     metavar = "file",
                     help = "The file to process. Obligatory. A single dash ('-') will cause the engine to read from standard input.")
    group.add_option("--input_encoding", dest = "input_encoding",
                     metavar = "encoding",
                     help = "Input character encoding for files which require one. Default is ascii.")
    group.add_option("--input_file_type", dest = "input_file_type",
                     type = "string",
                     action = "callback",
                     callback = _inputFileTypeCallback,
                     metavar = " | ".join(MAT.DocumentIO.allInputDocumentIO(exclusions = ["raw"])),
                     help = "The file type of the input. One of " + ", ".join(MAT.DocumentIO.allInputDocumentIO(exclusions = ["raw"])) + ". Required.")
    group.add_option("--output_file", dest = "output_file",
                     metavar = "file",
                     help = "Where to save the output. Optional. A single dash ('-') will cause the engine to write to standard output.")
    group.add_option("--output_file_type", dest = "output_file_type",
                     type = "string",
                     action = "callback",
                     callback = _outputFileTypeCallback,
                     metavar = " | ".join(MAT.DocumentIO.allOutputDocumentIO(exclusions = ["raw"])),
                     help = "The type of the file to save. One of " + ", ".join(MAT.DocumentIO.allOutputDocumentIO(exclusions = ["raw"])) + ". Required if --output_file is specified.")
    group.add_option("--output_encoding", dest = "output_encoding",
                     metavar = "encoding",
                     help = "Output character encoding for those that need one. Default is ascii.")
    group.add_option("--workflow", dest = "workflow",
                     type = "string",
                     metavar = "workflow",
                     action = "callback",
                     callback = _workflowCallback,
                     help = "The name of a workflow, as specified in some task.xml file. Required if more than one workflow is available. See above for available workflows.")
    group.add_option("--steps", dest = "steps",
                     metavar = "step,step,...",
                     help = "Some ordered subset of the steps in the specified workflow. The steps should be concatenated with a comma. See above for available steps.")
    group.add_option("--data_pair", dest = "data_pair",
                     metavar = "k=v",
                     action = "append",
                     help = "Additional key-value pairs expected or desired by the specified operation")
    parser.add_option_group(group)


elif sys.argv[1] == "ws_import_file":
    pass
elif sys.argv[1] == "ws_operation":
    pass
else:
    print "Error: first argument must be one of do_steps, ws_import_file, ws_operation."
    parser.print_help()
    sys.exit(1)
