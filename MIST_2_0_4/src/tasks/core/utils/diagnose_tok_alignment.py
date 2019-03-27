# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# This file attempts to debug token alignment problems.

import sys, os, random

#
# Guts
#

def diagnose_token_alignment(f, doPrompt = False, outDir = None):
    print "Checking", f, "..."
    jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')
    doc = jsonIO.readFromSource(f)
    # This is going to fail, because I don't pass in the path.
    # But I don't think it's going to be used anymore.
    numFixed = doc.adjustTagsToTokens(None, doPrompt = doPrompt, doReport = True)
    if numFixed > 0:
        print "...made", numFixed, "repairs."
        # Write the document.
        if outDir is not None:
            outF = os.path.join(outDir, os.path.basename(f))
        else:
            outF = f
        print "Writing repaired document %s." % outF
        jsonIO.writeToTarget(doc, outF)
    else:
        print "...no repairs."

#
# Toplevel
#

def Usage():
    print "Usage: diagnose_tok_alignment.py [ --out_dir <d> ] [ --noprompt ] MAT_home file ..."
    print "--out_dir: the directory to write repaired files to. If unspecified, the input file"
    print "  will be overwritten."
    print "--noprompt: don't prompt for repair."
    sys.exit(1)

import getopt

opts, args = getopt.getopt(sys.argv[1:], "", ["noprompt", "out_dir="])

if len(args) < 2:
    Usage()

OUT_DIR = None
PROMPT = True

for key, val in opts:
    if key == "--noprompt":
        PROMPT = False
    elif key == "--out_dir":
        OUT_DIR = val
    else:
        Usage()

MAT_HOME = args[0]
FILES = args[1:]

sys.path.insert(0, os.path.join(MAT_HOME, "lib", "mat", "python"))

import MAT
import MAT.Document

print "Testing", len(FILES), "files."

i = 1

for file in FILES:
    if i % 100 == 0:
        print i, "..."
    i += 1
    diagnose_token_alignment(file, doPrompt = PROMPT, outDir = OUT_DIR)

sys.exit(0)
