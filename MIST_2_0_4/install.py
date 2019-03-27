# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# This script does the real work of the installation. The first
# thing it needs to check is whether it was invoked with Python
# 2.6 or later. Notice that this is NOT an executable Python
# script; it must be called as "python install.py".

# During installation, it will be called from install.sh, but it
# shouldn't be required. So let's just be absolutely sure.

import sys, glob

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

# OK, we know we've got the right version of Python.

import os, re, shutil

# This file is intended to be installed at the root of the
# package. 

MAT_BUNDLE_HOME = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, os.path.join(MAT_BUNDLE_HOME, "src", "MAT", "build"))

import MAT_distutils

#
# Utilities
# 

def notify(s):
    print "#\n# %s\n#\n" % s

from MAT_distutils import shellOutput, MATManifest, VersionExtractor, chooseExecutable

P_AS_FILE, P_AS_DIR = range(2)

def checkOnPlatform(path, plat, mode = P_AS_FILE):
    if (mode is P_AS_FILE and not os.path.isfile(path)) or \
       (mode is P_AS_DIR and not os.path.isdir(path)):
        print "%s not found; your %s installation is incomplete." % (executable, plat)
        sys.exit(1)
    else:
        return path

# There are three different options worth considering here:
# sys.platform = win32
# other

#
# Toplevel
#

import getopt

def Usage():
    print "Usage: install.py [ --no_terminator_prompt ]"
    sys.exit(1)

opts, args = getopt.getopt(sys.argv[1:], "", ["no_terminator_prompt"])

if args:
    Usage()

TERMINATOR_PROMPT = True
for k, v in opts:
    if k == "--no_terminator_prompt":
        TERMINATOR_PROMPT = False
    else:
        Usage()

# On MacOS X and Windows, we're going to use Terminator.
# Let's see if we can work that in. The idea is not to have to
# run X11 on either platform.

# Update: the tabbed terminal is now optional.

# Here are the settings we need.
# PYTHONBIN= sys.executable in Python
# TABBED_TERMINAL_BIN= <bundle>/build/mrxvt/bin/mrxvt on Unix
# JSON_PYTHONLIB= <bundle>/build/simplejson
# YUI_JS_LIB= <bundle>/src/<whatever the dir is in the manifest>
# CHERRYPY_PYTHONLIB = <bundle>/src/<cherrypydir>
# MUNKRES_PYTHONLIB = <bundle>src/<munkresdir>

# In this table, we have the settings which are make-or-break; if
# the specified file isn't in the specified location, something is
# very, very wrong.

import glob

KNOWN_PLATFORMS = {"Solaris": {},
                   "Linux": {},
                   "MacOS X Tiger": {"GCC": "/usr/bin/gcc",
                                     "GNU_MAKE": "/usr/bin/make"},
                   "MacOS X Leopard": {"GCC": "/usr/bin/gcc",
                                       "GNU_MAKE": "/usr/bin/make",
                                       "JAVA_HOME_CANDIDATES": glob.glob("/System/Library/Frameworks/JavaVM.framework/Versions/*/Home/bin")},
                   "MacOS X Snow Leopard": {"GCC": "/usr/bin/gcc",
                                            "GNU_MAKE": "/usr/bin/make"},
                   'Windows': {'GCC': None,
                               'GNU_MAKE': None,
                               "JAVA_HOME_CANDIDATES":
                               glob.glob("c:/Program Files/Java/*/bin") + glob.glob("c:/Program Files (x86)/Java/*/bin")
                               }
                   }

THIS_PLATFORM = None

COMPILE_SIMPLEJSON = True

if sys.platform == "win32":
    THIS_PLATFORM = "Windows"
elif sys.platform == "linux2":
    THIS_PLATFORM = "Linux"
elif sys.platform == "sunos5":
    THIS_PLATFORM = "Solaris"
elif sys.platform == "darwin":
    # Gotta check uname. That's the only way, apparently.
    e = VersionExtractor("(?P<major>[0-9]+)(\.(?P<minor>[0-9]+)(\.(?P<subminor>[0-9]+))?)?",
                         "%s -r", ("major", "minor", "subminor"))
    version = e.extractVersion("uname")
    if e.atLeastVersion((9,), version):
        if e.atLeastVersion((10,), version):    
            THIS_PLATFORM = "MacOS X Snow Leopard"
            if minV < 6:
                # Because 10.4 build support is what simplejson wants, and
                # it's not available by default in Python 2.6, we can't try to compile
                # simplejson - just copy it.
                COMPILE_SIMPLEJSON = False
        else:
            THIS_PLATFORM = "MacOS X Leopard"
    else:
        # Not really, but close enough for the moment.
        THIS_PLATFORM = "MacOS X Tiger"
else:
    print "This platform is not supported."
    sys.exit(1)

notify("Reading manifest...")

manifestDir = MATManifest(MAT_BUNDLE_HOME)
manifestDir.load()

# Let's use a dictionary.

# Gotta find the dependency jar.

Settings = {
    "PYTHONBIN": sys.executable,
    "YUI_JS_LIB": os.path.join(MAT_BUNDLE_HOME, "src", manifestDir["yui_dir"]),
    "CHERRYPY_PYTHONLIB": os.path.join(MAT_BUNDLE_HOME, "src", manifestDir["cherrypy"]),
    "MUNKRES_PYTHONLIB": os.path.join(MAT_BUNDLE_HOME, "src", manifestDir["munkres"]),
    "JCARAFE_JAR": glob.glob(os.path.join(MAT_BUNDLE_HOME, "src", manifestDir["jcarafe"], "*-bin.jar"))[0]
                               
    }

UnsavedSettings = []

# We already know we have Python.

# First thing: check for Java 1.6 or later. We want to find the
# latest version that satisfies the criteria.

notify("Checking for Java...")

javaBin = chooseExecutable("Java, version 1.6.0_04 or later",
                           execName = "java",
                           execExtraDirs = KNOWN_PLATFORMS[THIS_PLATFORM].get("JAVA_HOME_CANDIDATES"),
                           versionChecker = ('java version "(?P<major>[0-9]+)(\.(?P<minor>[0-9]+)(\.(?P<subminor>[0-9]+)(_(?P<subsubminor>[0-9]+))?)?)?"', '"%s" -version 2>&1', ("major", "minor", "subminor", "subsubminor"), (1, 6, 0, 4), None),
                           failureString = "is not a recent enough version of Java.",
                           execFailureString = "No appropriate version of Java found. Exiting.",
                           exitOnFailure = True)

Settings["JAVA_BIN"] = javaBin

# Tabbed terminal.

TERMINATOR_FOUND_PROMPT = """The Terminator tabbed terminal application is
not installed in its expected location at /Applications/Terminator.app.
This application is not required for this package to run, but can be a convenient
tool when used via src/MAT/bin/MATWeb.

You may have Terminator installed somewhere else, or you may not have
installed it yet. If you have not installed Terminator, you can find an
installation bundle in for it in the 'external' subdirectory of this package;
please install it and then return to this installation.
"""

TERMINATOR_NOTFOUND_PROMPT = """The Terminator tabbed terminal application is
not installed in its expected location at /Applications/Terminator.app.
This application is not required for this package to run, but can be a convenient
tool when used via src/MAT/bin/MATWeb. No installation package for
Terminator has been provided with this distribution.
"""

# Tabbed terminal is not required, and may not be in the tarball.

USE_MRXVT = False

if THIS_PLATFORM in ['Linux', 'Solaris']:
    if manifestDir.has_key('mrxvt'):
        if re.search("\s", MAT_BUNDLE_HOME):
            # mrxvt will not build when there's a space in the path.
            print "Warning: skipping build of mrxvt tabbed terminal because the MAT install path"
            print "contains whitespace. If you want to use mrxvt, unpack the MAT tarball"
            print "in a directory path which has no whitespace in it."
        else:
            Settings["TABBED_TERMINAL_BIN"] = os.path.join(MAT_BUNDLE_HOME, "build", "mrxvt", "bin", "mrxvt")
            USE_MRXVT = True
elif THIS_PLATFORM in ['MacOS X Tiger', 'MacOS X Leopard', "MacOS X Snow Leopard"]:
    # Terminator supposedly works on Windows and MacOS X. We've
    # been working with the developers to fix some bugs in it.
    appBin = "/Applications/Terminator.app"
    if not manifestDir.has_key("terminator"):
        tPrompt = TERMINATOR_NOTFOUND_PROMPT
    else:
        tPrompt = TERMINATOR_FOUND_PROMPT
    def terminatorFilterFn(v):
        return os.path.isdir(v) and os.path.isfile(os.path.join(v, "Contents/MacOS/Terminator"))
    appBin = chooseExecutable("Terminator", execCandidates = ["/Applications/Terminator.app",
                                                              "/Applications/Terminator/Terminator.app"],
                              filterFn = lambda v: os.path.isdir(v),
                              failureString = "is not a Mac application.",
                              promptIntro = tPrompt,
                              execPrompt = "Please provide the path to the Terminator application, or hit <return> to skip: ")
    if appBin:
        Settings["TABBED_TERMINAL_BIN"] = os.path.join(appBin, "Contents/MacOS/Terminator")
    else:
        print "No path to the Terminator application specified. Skipping."

elif THIS_PLATFORM in ['Windows']:
    if manifestDir.has_key('console'):
        Settings['TABBED_TERMINAL_BIN'] = os.path.join(MAT_BUNDLE_HOME, "external", manifestDir['console'], "Console2", "Console.exe")

# Check gcc, GNU make. I want GCC for simplejson, for which it's not strictly necessary.
# I want GCC and GNU_MAKE for mrxvt, but if it's missing, I'll just skip mrxvt. And
# some of the plugins may want them too. So don't exit on failure.

if THIS_PLATFORM != "Windows":

    notify("Checking for GNU make...")

    if THIS_PLATFORM in ["MacOS X Tiger", "MacOS X Leopard",
                         "MacOS X Snow Leopard"]:
        GNU_MAKE = chooseExecutable("GNU make",
                                    execCandidates = [KNOWN_PLATFORMS[THIS_PLATFORM]["GNU_MAKE"]],
                                    execFailureString = "No appropriate version of GNU make found. Some steps of your build may be skipped, or your build may fail.")
    else:
        GNU_MAKE = chooseExecutable("GNU make, version 3.79.1 or later",
                                    execName = "make",
                                    versionChecker = ("GNU Make( version)? (?P<major>[0-9]+)(\.(?P<minor>[0-9]+)(\.(?P<subminor>[0-9]+))?)?", "%s --version 2>/dev/null", ("major", "minor", "subminor"), (3, 79, 1), None),
                                    failureString = "is not a recent enough version of GNU make.",
                                    execFailureString = "No appropriate version of GNU make found. Some steps of your build may be skipped, or your build may fail.")
        
    UnsavedSettings.append(("GNU make", GNU_MAKE))

    notify("Checking for gcc...")
    
    if THIS_PLATFORM in ["MacOS X Tiger", "MacOS X Leopard",
                         "MacOS X Snow Leopard"]:
        GCC = chooseExecutable("gcc",
                               execCandidates = [KNOWN_PLATFORMS[THIS_PLATFORM]["GCC"]],
                               execFailureString = "No appropriate version of gcc found. Some steps of your build may be skipped, or your build may fail.")

    else:

        GCC = chooseExecutable("gcc, version 3 or later",
                               execName = "gcc",
                               versionChecker = ("gcc version (?P<major>[0-9]+)(\.(?P<minor>[0-9]+)(\.(?P<subminor>[0-9]+))?)?", "%s -v 2>&1", ("major", "minor", "subminor"), (3,), None),
                               failureString = "is not a recent enough version of gcc.",
                               execFailureString = "No appropriate version of gcc found. Some steps of your build may be skipped, or your build may fail.")

    UnsavedSettings.append(("GCC", GCC))
    
    # Finally, let's see whether we should set up psutil.

    if manifestDir.has_key("psutil"):
        # This may very well fail, because there's no GCC.
        # Don't enable it by default; just make it available.
        Settings["PSUTIL_PYTHONLIB"] = os.path.join(MAT_BUNDLE_HOME, "build", "psutil", "lib", "python")

else:
    GCC = GNU_MAKE = None

notify("Settings:")

padding = max(map(len, Settings.keys() + [x[0] for x in UnsavedSettings]))

for k, v in UnsavedSettings + Settings.items():
    s = "%%-%ds : %%s" % padding
    print s % (k, v)

#
# Actual  build
#

# OK, now that we have all the settings, build the thing.

if USE_MRXVT:

    if (GCC is None) or (GNU_MAKE is None):
        print "Skipping build of mrxvt; either gcc or GNU make is missing. No tabbed terminal will be available."
        del Settings["TABBED_TERMINAL_BIN"]
    else:

        notify("Building mrxvt...")

        # Disable a couple things which aren't needed.

        if os.system('cd "%s"; ./configure --prefix="%s" --disable-xft --disable-png CC="%s"; "%s"; "%s" install' % \
                     (os.path.join(MAT_BUNDLE_HOME, "src", manifestDir["mrxvt"]),
                      os.path.join(MAT_BUNDLE_HOME, "build", "mrxvt"),
                      GCC, GNU_MAKE, GNU_MAKE)) != 0:
            print "Build and install of mrxvt failed. No tabbed terminal will be available."
            del Settings["TABBED_TERMINAL_BIN"]

if Settings.has_key("PSUTIL_PYTHONLIB"):
    if os.system('cd "%s"; "%s" setup.py build --build-lib "%s"' % \
                 (os.path.join(MAT_BUNDLE_HOME, "src", manifestDir["psutil"]),
                  Settings["PYTHONBIN"],
                  os.path.join(MAT_BUNDLE_HOME, "build", "psutil", "lib", "python"))) != 0:
        print "Build and install of psutil failed. Fine-grained reporting of subprocess statistics will be unavailable."
        del Settings["PSUTIL_PYTHONLIB"]

# OK, now we actually build MAT.

notify("Creating MAT settings file...")

fp = open(os.path.join(MAT_BUNDLE_HOME, "src", "MAT", "etc", "MAT_settings.config.in"), "r")
s = fp.read()
fp.close()

newSettingsFile = os.path.join(MAT_BUNDLE_HOME, "MAT_settings.config")

# UGH. If I'm going to use re.sub, I have to prevent the
# backslashes in the string literal from being interpreted
# in their escaped format. The docs explicitly say this will
# happen.
for k, v in Settings.items():    
    s = re.compile("^%s:.*$" % k, re.M).sub(lambda match: "%s: %s" % (k, v), s)
fp = open(newSettingsFile, "w")
fp.write(s)
fp.close()

notify("Building MAT...")

sys.path.insert(0, os.path.join(MAT_BUNDLE_HOME, "src", "MAT", "etc"))
from config_utilities import configureMAT

try:
    configureMAT(newSettingsFile)
except:
    print "Build of MAT failed. Exiting."
    sys.exit(1)

notify("Building MAT tasks...")

sys.path.insert(0, os.path.join(MAT_BUNDLE_HOME, "src", "MAT", "lib", "mat", "python"))
from MAT.PluginMgr import PluginDirMgr, PluginError
import subprocess

i = 0
BuildSettings = Settings.copy()
BuildSettings.update(dict(UnsavedSettings))
# Just in case somebody copied this directory and is just rerunning
# the installer, let's make sure we wipe out the tasks record first.
pluginFile = os.path.join(MAT_BUNDLE_HOME, "src", "MAT", "lib", "mat", "python", "MAT", "Plugins", "plugins.txt")
if os.path.exists(pluginFile):
    os.remove(pluginFile)
for taskName in manifestDir.getTaskEntries():
    taskDir = os.path.join(MAT_BUNDLE_HOME, "src", "tasks", taskName)
    if os.path.exists(os.path.join(taskDir, "dist.py")):
        import imp
        # Load it as a special name. We won't be using the name.
        mName = "MAT_task%d_dist" % i
        i += 1
        m = imp.load_module(mName, *imp.find_module("dist", [taskDir]))
        if hasattr(m, "install"):
            m.install(taskDir, BuildSettings, THIS_PLATFORM, MAT_BUNDLE_HOME)
    # Now, install the task.
    try:
        PluginDirMgr().installPluginDir(taskDir, verbose = True)
    except Exception, e:
        print "Warning:", str(e)
        print "Installation of plugin failed. Build failed as a result. Exiting."
        sys.exit(1)

notify("Done.")

sys.exit(0)
