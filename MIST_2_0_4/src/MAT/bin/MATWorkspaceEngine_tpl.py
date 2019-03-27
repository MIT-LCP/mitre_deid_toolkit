#!MF_PYTHONBIN

# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import sys, os

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

#
# Toplevel
#

import MAT
from MAT.Operation import OptionParser, OptionGroup
from MAT.Workspace import WorkspaceGeneralOperation, WorkspaceOperation, CMDLINE_AVAILABLE_MASK

def _allOperations(cls, lst):
    if (cls.name is not None) and cls.availability & CMDLINE_AVAILABLE_MASK:
        lst.append(cls.name)
    for c in cls.__subclasses__():
        _allOperations(c, lst)
ALL_OPERATIONS = []
_allOperations(WorkspaceGeneralOperation, ALL_OPERATIONS)

parser = OptionParser(usage = """Usage: %prog [options] <dir> create ...
""" + "\n".join(["       %prog [options] <dir> " + op + " ..." for op in ALL_OPERATIONS]) + \
"""

Provide the directory and operation followed by --help for more detailed help.""")
parser.add_option("--other_app_dir", action = "append",
                  dest="other_dirs",
                  help="additional directory to load a task from. Optional.")
MAT.ExecutionContext.addOptions(parser)

parser.disable_interspersed_args()

coreOptions, args = parser.parse_args()

if len(args) < 1:
    parser.print_help()
    sys.exit(1)

# At this point, we can load the plugins.

otherDirs = coreOptions.other_dirs or []

MAT.ExecutionContext.extractOptions(coreOptions)

from MAT.ExecutionContext import _DEBUG

try:
    PLUGIN_DIR = MAT.PluginMgr.LoadPlugins(*otherDirs)
except MAT.PluginMgr.PluginError, e:
    if _DEBUG:
        raise
    else:
        print >> sys.stderr, "Fatal plugin load error: ", str(e)
        sys.exit(1)

# Now, let's do the various different operations.

# We may not have any operations; it might just be <dir>. In that case,
# we should see if it's an open workspace.

WSDIR = args[0]
if len(args) > 1:
    OP = args[1]
    OP_ARGS = args[2:]
else:
    # This will trigger 
    OP = None

if OP == "create":

    # Time to create a workspace.
    parser.set_usage("Usage: %prog [options] <dir> create [create_options]")
    group = OptionGroup(parser, "Create options")
    group.add_option("--task", action = "store",
                     dest="task", help="the name of the task to be associated with this workspace. Required if more than one task is available.")
    group.add_option("--initial_users", action = "store",
                     dest="initial_users", 
                     help="a comma-separated list of initial registered users. Required.")
    group.add_option("--max_old_models", action = "store",
                     dest="max_old_models", type="int",
                     help="number of previous models to retain after model building. Default is 0.")
    
    parser.add_option_group(group)

    options, args = parser.parse_args(OP_ARGS)

    try:

        w = MAT.Workspace.Workspace(WSDIR, create = True, taskName = options.task,
                                    maxOldModels = options.max_old_models or 0,
                                    initialUsers = (options.initial_users and [s.strip() for s in options.initial_users.split(",")]) or None,
                                    pluginDir = PLUGIN_DIR)
        print "Created workspace for task '%s' in directory %s." % (w.task.name, w.dir)
    except Exception, e:
        if _DEBUG:
            raise
        else:
            print >> sys.stderr, "Error:", str(e)
            sys.exit(1)
else:

    # Try opening an existing workspace.
    
    try:
        w = MAT.Workspace.Workspace(WSDIR, pluginDir = PLUGIN_DIR)
    except Exception, e:
        if _DEBUG:
            raise
        else:
            print >> sys.stderr, "Error:", str(e)
            sys.exit(1)


    # Now, we have an open workspace. It may have added various
    # operations, AND removed some, so...

    ALL_OPERATIONS = w.getCmdlineOperationNames(debug = _DEBUG)

    parser.set_usage("""Usage: %prog [options] <dir> create ...
""" + "\n".join(["       %prog [options] <dir> " + op + " ..." for op in ALL_OPERATIONS]) + \
"""

Provide the directory and operation followed by --help for more detailed help.""")

    if OP is None:
        parser.print_help()
        sys.exit(1)

    elif OP not in ALL_OPERATIONS:
        print >> sys.stderr, "No operation named '%s'.\n" % OP
        parser.print_help()
        sys.exit(1)
        
    else:

        opClsList = w.getOperationClasses(OP)

        # If there's only one of them, apply the usage to the parser.
        # Otherwise, apply it as a description to the underlying group.
        
        aggregator = MAT.Operation.CmdlineOpArgumentAggregator(parser)
        
        if len(opClsList) == 1:
            opLoc, opCls = opClsList[0]
            usage = opCls.getUsage(w)
            if opLoc != "<toplevel>":
                usage += "\n\nSupported by folder '%s'." % opLoc
            parser.set_usage(usage)
            opCls.addOptions(aggregator)
        else:
            # These will be folder ops. We have to ensure that they're
            # activated appropriately. But what if there are no options?
            # no group will be created. We'll have to create it ourselves. Poo.
            parser.set_usage("Usage: %prog [options] <dir> " + OP + " ...")
            for opLoc, opCls in opClsList:
                heading = ("Folder '%s'" % opLoc)
                desc = parser.expand_prog_name(opCls.getUsage(w))
                if opCls.getOptionTemplate():
                    opCls.addOptions(aggregator, heading = heading,
                                     description = desc)
                else:
                    group = OptionGroup(parser, heading, description = desc)
                    parser.add_option_group(group)
                    aggregator.forceActivation(group)

        try:
            options, args = parser.parse_args(OP_ARGS)
        except Exception, e:
            if _DEBUG:
                raise
            else:
                print >> sys.stderr, "Error:", str(e)
                parser.print_help()
                sys.exit(1)

        aggregator.storeValues(options)

        try:
            w.runOperation(OP, args, aggregator = aggregator, fromCmdline = True)
        except Exception, e:
            if _DEBUG:
                raise
            else:
                print >> sys.stderr, "Error:", str(e)
                sys.exit(1)
