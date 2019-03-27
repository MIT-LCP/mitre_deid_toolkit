#!MF_PYTHONBIN

# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import os, sys, glob, shutil

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

MAT_PKG_HOME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The point of this script is to retokenize and realign documents which
# were previously tokenized,  with any tokenizer. It ONLY operates on
# MAT JSON files.

import MAT

PLUGIN_DIR = MAT.PluginMgr.LoadPlugins()

_jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')

#
# Guts
#

def retokenizePairs(filePairs, taskObj):

    outDir = dict(filePairs)
    
    # Now, we open each document, remove the tokens. Batch tokenize the
    # whole lot of them. Then align and save.

    iDataPairs = [(f, _jsonIO.readFromSource(f, taskSeed = taskObj)) for f, outF in filePairs]
    
    lexTypes = taskObj.getAnnotationTypesByCategory('token')

    # Tokenize step.

    tokStep = MAT.JavaCarafe.CarafeTokenizationStep("tokenize", taskObj, "Retokenization")

    pairsToTokenize = []

    # Remove the annotations. If there are no tokens, don't tokenize.
    for f, annotSet in iDataPairs:
        if tokStep.isDone(annotSet):
            tokStep.undo(annotSet)
            pairsToTokenize.append((f, annotSet))
        else:
            print "Warning: skipping because not currently tokenized:", f

    # Tokenize.
    tokStep.doBatch(pairsToTokenize)

    for f, annotSet in pairsToTokenize:
        # Align.
        annotSet.adjustTagsToTokens(taskObj)
        # Save.
        print "Saving", outDir[f]
        _jsonIO.writeToTarget(annotSet, outDir[f])

#
# Cmdline parsing and setup
#

from optparse import OptionParser, OptionGroup

parser = OptionParser(usage = """Usage: %prog [core_options] files [file_options]
       %prog [core_options] workspaces <workspace>...""")
parser.disable_interspersed_args()
group = OptionGroup(parser, "Core options")
MAT.ExecutionContext.addOptions(group)
parser.add_option_group(group)

group = OptionGroup(parser, "File options")
group.add_option("--task",
                 metavar = "task",
                 dest = "task",
                 type = "string",
                 help = "name of the task to use. Obligatory if the system knows of more than one task. Known tasks are: " + ", ".join(PLUGIN_DIR.keys()))
group.add_option("--input_dir", dest = "input_dir", action = "append",
                 metavar = "dir",
                 help = "A directory, all of whose files will be retokenized. Can be repeated. May be specified with --input_files.")
group.add_option("--input_files", dest = "input_files", action = "append",
                 metavar = "re",
                 help = "A glob-style pattern describing the files to be retokenized. May be specified with --input_dir. Can be repeated.")
group.add_option("--output_dir", dest = "output_dir", 
                 metavar = "dir",
                 help = "A directory in which to place the retokenized documents.")
parser.add_option_group(group)

if len(sys.argv) < 2:
    parser.print_help()
    sys.exit(1)

coreOptions, args = parser.parse_args()

MAT.ExecutionContext.extractOptions(coreOptions)

if args[0] == "files":

    options, ignore = parser.parse_args(args[1:])

    allTasks = PLUGIN_DIR.getAllTasks()

    def UsageError(msg):
        global parser
        print >> sys.stderr, msg
        parser.print_help()
        sys.exit(1)

    if options.task is not None:
        TASK = PLUGIN_DIR.getTask(options.task)
        if TASK is None:
            UsageError("Unknown task '%s'." % options.task)
    elif len(allTasks) == 1:
        TASK = allTasks[0]
    else:
        UsageError("No task specified and more than one task available.")

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

    if options.output_dir is None:
        UsageError("No output directory specified.")
    else:
        OUTPUT_DIR = options.output_dir
        if not os.path.exists(OUTPUT_DIR):
            os.makedirs(OUTPUT_DIR)
        elif not os.path.isdir(OUTPUT_DIR):
            UsageError("Value of --output_dir exists, but is not a directory.")

    retokenizePairs([(f, os.path.join(OUTPUT_DIR, os.path.basename(f))) for f in FILES],
                    TASK)

elif args[0] == "workspaces":

    for wDir in args[1:]:
        # For each workspace, open it up, find all the files in each rich
        # folder, rename the file to ".orig" and retokenize the pairs.
        w = MAT.Workspace.Workspace(wDir)
        print "Retokenizing", wDir
        for fName, f in w.folders.items():
            if f.docIO is w.richFileIO:
                files = f.getFiles()
                if files:
                    print "Folder", fName
                    for f in files:
                        os.rename(f, f+".oldtok")
                    retokenizePairs([(f+".oldtok", f) for f in files], w.task)                

else:
    print >> sys.stderr, "First argument must be 'files' or 'workspaces'"
    parser.print_help()
    sys.exit(1)

sys.exit(0)
