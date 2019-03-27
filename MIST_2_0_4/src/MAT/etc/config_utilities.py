# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# This file manages the settings utilities in a way that both
# the config parser and the initial setup can deal with.

# Our settings files are still bash-style files. The way
# to capture the settings is to
# call "set" in an empty environment, and then load the values,
# and then call "set" in that richer environment, and take
# the difference.

import subprocess, os, re, stat, shutil, sys

# MAT_PKG_HOME is the parent directory.

MAT_PKG_HOME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

#
# File inventories
#

PYEXECS = ["MATAnnotationInfoToJSON", "MATEngine", "MATWeb", "MATManagePluginDirs", "MATScore",
           "MATExperimentEngine", "MATWorkspaceEngine", "MATModelBuilder",
           "MATWebClient", "MATRetokenize", "MATTransducer", "MATCreateComparisonDocument",
           "MATUpdateTaskXML", "MATUpdateWorkspace1To2", "MATReport"]

#
# Public utilities
#

import ConfigParser

def loadSettingsFile(sFile):
    p = ConfigParser.RawConfigParser()
    p.optionxform = str
    p.read([sFile])
    versionFile = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "VERSION"), "r")
    version = versionFile.read().strip()
    versionFile.close()    
    p.set("_GLOBALS", "MAT_PKG_HOME", MAT_PKG_HOME)
    p.set("_GLOBALS", "MAT_PKG_PYLIB", os.path.join(MAT_PKG_HOME, "lib", "mat", "python"))
    p.set("_GLOBALS", "MAT_VERSION", version)
    return p

# I have to escape backslashes.
    
def configureMAT(sFile):
    SETTINGS = loadSettingsFile(sFile)
    # Set up config.
    print "Creating config file..."
    fp = open(os.path.join(MAT_PKG_HOME, "lib", "mat", "python", "MAT", "MAT_settings.config"), "w")
    SETTINGS.write(fp)
    fp.close()
    # This MAY be a relic from when I needed to reference these files in etc.
    # I think I can get rid of it, but I'm not sure.
    shutil.copyfile(sFile, os.path.join(MAT_PKG_HOME, "etc", "MAT_settings.config"))
    # Now, set up the Python scripts.
    for p in PYEXECS:
        fp = open(os.path.join(MAT_PKG_HOME, "bin", p+"_tpl.py"), "r")
        s = fp.read()
        fp.close()
        for opt in SETTINGS.options("_GLOBALS"):
            s = s.replace("MF_"+opt, SETTINGS.get("_GLOBALS", opt).replace("\\", "\\\\"))
        outPath = os.path.join(MAT_PKG_HOME, "bin", p)
        print "Creating", os.path.join("bin", p), "..."
        if sys.platform == "win32":
            fp = open(outPath + ".cmd", "w")
            # Write out a parent executable command. Inspired by
            # http://effbot.org/pyfaq/how-do-i-make-python-scripts-executable.htm
            print >> fp, '@setlocal enableextensions & "%s" -x "%%~f0" %%* & goto :EOF' % sys.executable
            fp.write(s)
            fp.close()
        else:
            fp = open(outPath, "w")
            fp.write(s)
            fp.close()
            # Make it world executable. On Windows, this is superfluous.
            os.chmod(outPath, os.stat(outPath).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
