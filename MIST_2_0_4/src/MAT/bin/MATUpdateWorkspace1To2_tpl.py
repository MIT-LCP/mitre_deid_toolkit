#!MF_PYTHONBIN

# Copyright (C) 2011 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import os, sys, glob, shutil

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

MAT_PKG_HOME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The point of this script is to reconstruct 1.x workspaces as 2.0 workspaces.

import MAT

#
# Guts
#

class UpdateError(Exception):
    pass

# Checking the old workspace.

def checkOldWorkspace(oldWorkspace):
    if (not os.path.isdir(os.path.join(oldWorkspace, "folders"))) or \
       (not os.path.isfile(os.path.join(oldWorkspace, "properties.txt"))) or \
       (not os.path.isdir(os.path.join(oldWorkspace, "models"))) or \
       (not os.path.isdir(os.path.join(oldWorkspace, "folders", "raw_unprocessed"))) or \
       (not os.path.isdir(os.path.join(oldWorkspace, "folders", "in_process"))) or \
       (not os.path.isdir(os.path.join(oldWorkspace, "folders", "autotagged"))) or \
       (not os.path.isdir(os.path.join(oldWorkspace, "folders", "completed"))):
        raise UpdateError, ("Directory %s does not appear to be a MAT 1.x workspace." % oldWorkspace)        

    # OK, it's a version 1.x workspace. Now, load the property cache (at least THAT hasn't changed)
    # and find the task.

    import ConfigParser
    p = ConfigParser.RawConfigParser()
    p.optionxform = str
    p.read([os.path.join(oldWorkspace, "properties.txt")])
    try:
        TASK = p.get("_GLOBALS", "task")
    except:
        raise UpdateError, ("The workspace at %s doesn't appear to have a task specified." % oldWorkspace)
    # Heck, let's grab the max old models, just for completeness.
    try:
        MAX_OLD_MODELS = int(p.get("_GLOBALS", "maxoldmodels"))
    except:
        MAX_OLD_MODELS = 0

    print "Found workspace at %s for task '%s'." % (oldWorkspace, TASK)
    return TASK, MAX_OLD_MODELS

# Checking the task.


def checkTask(task):
    PLUGIN_DIR = MAT.PluginMgr.LoadPlugins()
    TASK_OBJ = PLUGIN_DIR.getTask(TASK)
    if TASK_OBJ is None:
        raise UpdateError, ("Couldn't find a task named '%s'." % TASK)

    # Has the task been updated? It'll need to have a workspace operation for import,
    # but not for tagprep.

    wsOps = TASK_OBJ.getWorkspaceOperations()
    if wsOps.has_key("tagprep") and not wsOps.has_key("import"):
        raise UpdateError, ("""The workspace operations for the task '%s' have not been updated.
    Edit %s and replace the 'tagprep' operation with the 'import' operation.""" % \
        (TASK, os.path.join(TASK_OBJ.taskRoot, "task.xml")))
    elif not wsOps.has_key("import"):
        raise UpdateError, ("""The task '%s' has no 'import' workspace operation.
    Update %s before continuing.""" % \
        (TASK, os.path.join(TASK_OBJ.taskRoot, "task.xml")))

# Actually doing the copy.


def duplicateWorkspace(oldWorkspace, newWorkspace, task, maxOldModels, initialUser):
    import MAT.Workspace

    print "Creating new workspace at %s." % newWorkspace
    newWs = MAT.Workspace.Workspace(newWorkspace, create = True, taskName = task,
                                    maxOldModels = maxOldModels, initialUsers = initialUser)

    # First, get all the basenames from the old workspace.
    fileNameRecord = os.path.join(oldWorkspace, "filenames.txt")
    basenames = set()
    if os.path.isfile(fileNameRecord):
        fp = open(fileNameRecord, "r")
        for line in fp.readlines():
            basenames.add(line.strip())
        fp.close()

    # Here's the dispensation:
    # - anything in "raw, unprocessed" should simply be imported with file type raw.
    # - anything in "rich, incoming" should simply be imported, with an initial user.
    # The import operation takes care of adding SEGMENTs for existing zones if there
    # are no zones.
    # - anything in "in process" should simply be imported, with an initial user.
    # - anything in "completed" should be marked gold.
    # - anything in "autotagged" should be given the MACHINE user.

    # If there are no such basenames, don't call importFiles - it'll barf with
    # a "no basenames affected" error.

    rawBasenames = list(set(os.listdir(os.path.join(oldWorkspace, "folders", "raw_unprocessed"))) & basenames)
    if rawBasenames:
        print "Importing basenames from 'raw, unprocessed':", " ".join(rawBasenames)
        newWs.importFiles([os.path.join(oldWorkspace, "folders", "raw_unprocessed", b) for b in rawBasenames],
                          "core", encoding = "utf-8", file_type = "raw")

    richIncomingBasenames = list(set(os.listdir(os.path.join(oldWorkspace, "folders", "rich_incoming"))) & basenames)
    if richIncomingBasenames:
        print "Importing basenames from 'rich, incoming':", " ".join(richIncomingBasenames)
        newWs.importFiles([os.path.join(oldWorkspace, "folders", "rich_incoming", b) for b in richIncomingBasenames],
                          "core", users = initialUser)

    inProcessBasenames = list(set(os.listdir(os.path.join(oldWorkspace, "folders", "in_process"))) & basenames)
    if inProcessBasenames:
        print "Importing basenames from 'in process':", " ".join(inProcessBasenames)
        newWs.importFiles([os.path.join(oldWorkspace, "folders", "in_process", b) for b in inProcessBasenames],
                          "core", users = initialUser)

    completedBasenames = list(set(os.listdir(os.path.join(oldWorkspace, "folders", "completed"))) & basenames)
    if completedBasenames:
        print "Importing basenames from 'completed':", " ".join(completedBasenames)
        newWs.importFiles([os.path.join(oldWorkspace, "folders", "completed", b) for b in completedBasenames],
                          "core", users = initialUser, document_status = "gold")

    autotaggedBasenames = list(set(os.listdir(os.path.join(oldWorkspace, "folders", "autotagged"))) & basenames)
    if autotaggedBasenames:
        print "Importing basenames from 'autotagged':", " ".join(autotaggedBasenames)
        newWs.importFiles([os.path.join(oldWorkspace, "folders", "autotagged", b) for b in autotaggedBasenames],
                          "core", users = "MACHINE")

    # If there's a model...
    if os.path.isdir(os.path.join(oldWorkspace, "models")):
        print "Copying model."
        shutil.rmtree(newWs.modelDir)
        shutil.copytree(os.path.join(oldWorkspace, "models"), newWs.modelDir)

    newWs.task.workspaceUpdate1To2(newWs, oldWorkspace, basenames, initialUser)

    print "Dumping workspace database."
    
    newWs.runOperation("dump_database", [], fromCmdline = True)

#
# Toplevel
#

from MAT.Operation import OptionParser, OptionGroup

parser = OptionParser(usage = """Usage: %prog [options] old_workspace new_workspace initial_user

old_workspace: a pre-2.0 MAT workspace directory
new_workspace: a location for your 2.0-compliant workspace copy. This directory must not already exist.
initial_user: a user to register as the first user for your workspace""")
MAT.ExecutionContext.addOptions(parser)
options, args = parser.parse_args()
MAT.ExecutionContext.extractOptions(options)
from MAT.ExecutionContext import _DEBUG

if len(args) != 3:
    parser.print_help()
    sys.exit(1)

[OLD_WORKSPACE, NEW_WORKSPACE, INITIAL_USER] = args

# First, we need to make sure the old directory really is a workspace, and that it's
# a version 1 workspace. Obviously, we can't do that by opening the workspace,
# since the library is completely different.

OLD_WORKSPACE = os.path.realpath(os.path.abspath(OLD_WORKSPACE))
NEW_WORKSPACE = os.path.realpath(os.path.abspath(NEW_WORKSPACE))

if not os.path.isdir(OLD_WORKSPACE):
    print >> sys.stderr, "Directory %s does not exist." % OLD_WORKSPACE
    sys.exit(1)

if os.path.exists(NEW_WORKSPACE):
    print >> sys.stderr, "Can't create a new workspace in existing location %s." % NEW_WORKSPACE
    sys.exit(1)

try:
    TASK, MAX_OLD_MODELS = checkOldWorkspace(OLD_WORKSPACE)
except UpdateError, e:
    if _DEBUG:
        raise
    else:
        print >> sys.stderr, str(e)
    sys.exit(1)

try:
    checkTask(TASK)
except UpdateError, e:
    if _DEBUG:
        raise
    else:
        print >> sys.stderr, str(e)
    sys.exit(1)

# OK, the task is known and current, and the old workspace is real. We ought to be able
# to create a new workspace now.

try:
    duplicateWorkspace(OLD_WORKSPACE, NEW_WORKSPACE, TASK, MAX_OLD_MODELS, INITIAL_USER)
except Exception, e:
    if _DEBUG:
        raise
    else:
        print >> sys.stderr, e
        print >> sys.stderr, "Encountered an error during conversion. Removing new workspace. Rerun with --debug for more details."
        try:
            shutil.rmtree(NEW_WORKSPACE)
        except:
            pass
    sys.exit(1)
