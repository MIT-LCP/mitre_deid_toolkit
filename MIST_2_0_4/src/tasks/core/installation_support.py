# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# This file contains the guts of the installation support
# code for the deidentification app.

import os, sys, re, shutil

MODEL_PAT = re.compile("""<run_settings[^>]*(tagger_model\s*=\s*['"](.*?)["'])""")

def saveCarafeResources(taskDir, bundleDir):
    # For each model, prompt for a path, then
    # copy it into the appropriate place in the bundle.
    # It might be already there, if multiple tasks use the same
    # model. Use the task.xml file to grab the initial
    # path to test.
    modelDir = os.path.join(bundleDir, "resources")
    if not os.path.exists(modelDir):
        os.makedirs(modelDir)
    fp = open(os.path.join(taskDir, "task.xml"), "r")
    s = fp.read()
    fp.close()
    m = MODEL_PAT.search(s)
    if m is not None:
        mLoc = m.group(2).strip()
        if not mLoc:
            # The string can be empty.
            return
        model = os.path.basename(mLoc)
        if not os.path.isfile(os.path.join(modelDir, model)):
            while not os.path.isfile(mLoc):
                mLoc = raw_input("File %s not found.\nPlease provide a full path for the Carafe model named %s: " % (mLoc, model)).strip()
                if mLoc == "":
                    print "No location for model %s specified. Exiting." % model
                    sys.exit(1)
            print "Copying model %s." % mLoc
            shutil.copy(mLoc, modelDir)

# There may be no place for the model, or there may be no model.

def buildDeidentificationAppAndModifySettings(taskDir, settingsDict, bundleDir):

    print "\n# Modifying task file...\n"

    fp = open(os.path.join(taskDir, "task.xml"), "r")
    s = fp.read()
    fp.close()
    m = MODEL_PAT.search(s)
    if m is not None:
        # We want to replace the full model path with the
        # resource directory location.
        mLoc = m.group(2).strip()
        if mLoc:
            # The string can be empty.
            model = os.path.basename(mLoc)
            modelPath = os.path.join(bundleDir, "resources", model)
            if os.path.exists(modelPath):
                # How do we substitute it in? Use the group indexes, duh.
                substS = s[:m.start(2)] + modelPath + s[m.end(2):]
            else:
                # Just excise the reference entirely.
                substS = s[:m.start(1)] + s[m.end(1):]
            fp = open(os.path.join(taskDir, "task.xml"), "w")
            fp.write(substS)
            fp.close()
                
