# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# This is the toplevel MAT compile file. It replaces a Unix
# makefile. Its goals are to create the MAT settings file, and then
# to build executable binaries of the MAT scripts.

from optparse import OptionParser
import os, sys, re

# I do this in install as well, but it's good to do it here too.

if not hasattr(sys, "version_info"):
    print >> sys.stderr, "Python 2.x required (2.6 or later)."
    sys.exit(1)

majV, minV = sys.version_info[:2]

if majV != 2 or (minV < 6):
    print >> sys.stderr, "Python 2.x required (2.6 or later)."
    sys.exit(1)

if sys.platform == "cygwin":
    print >> sys.stderr, "Cygwin is no longer supported, because Cygwin Python is distributed without sqlite bindings."
    sys.exit(1)

#
# Toplevel
#

parser = OptionParser(usage = """Usage: %prog [options] [target]
target (optional): one of build, clean, distclean. Default is build.""")
parser.add_option("--mat_settings_file",
                  dest = "mat_settings_file",
                  metavar = "file",
                  help = "Optional. A Python config file based on the template found in etc/MAT_settings.sh.in. If not provided, the MAT_SETTINGS_FILE environment variable must be set.")

opts, args = parser.parse_args()
if len(args) > 1:
    parser.print_help()
    sys.exit(1)
elif len(args) == 1:
    if args[0] not in ["build", "clean", "distclean"]:
        parser.print_help()
        sys.exit(1)
    else:
        TARGET = args[0]
else:
    TARGET = "build"                         

MAT_SETTINGS_FILE = opts.mat_settings_file
if MAT_SETTINGS_FILE is None:
    MAT_SETTINGS_FILE = os.environ.get("MAT_SETTINGS_FILE")

if MAT_SETTINGS_FILE is None:
    print >> sys.stderr, "MAT_SETTINGS_FILE isn't defined."
    sys.exit(1)

MAT_PKG_HOME = os.path.dirname(os.path.abspath(__file__))

# Now, we do settings. The way to capture the settings is to
# call "set" in an empty environment. Do we want this here, or in a separate

sys.path.insert(0, os.path.join(MAT_PKG_HOME, "etc"))
from config_utilities import configureMAT, PYEXECS

if TARGET == "build":
    configureMAT(MAT_SETTINGS_FILE)

elif TARGET in ["clean", "distclean"]:
    def _removeMATFiles(fList):
        for f in fList:
            try:
                p = os.path.join(MAT_PKG_HOME, *f)
                print "Removing", p[len(MAT_PKG_HOME) + 1:], "..."
                os.remove(p)
            except:
                pass
    def _findRecursively(pat):
        for root, dirs, files in os.walk(MAT_PKG_HOME):
            for f in files:
                if pat.match(f):
                    yield (root, f)

    if sys.platform == "win32":
        PYEXECS = [s + ".cmd" for s in PYEXECS]
    _removeMATFiles([("bin", p) for p in PYEXECS] + \
                    [("etc", "MAT_settings.sh"), ("lib", "mat", "python", "MAT", "MAT_settings.sh")] +
                    list(_findRecursively(re.compile("^.*\.pyc$"))) +
                    list(_findRecursively(re.compile("^.*~$"))) +
                    list(_findRecursively(re.compile("^#.*$"))) +
                    list(_findRecursively(re.compile("^\.#.*$"))))
    if TARGET == "distclean":
        _removeMATFiles([("lib", "mat", "python", "MAT", "Plugins", "plugins.txt")])
