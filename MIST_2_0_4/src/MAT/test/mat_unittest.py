# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# Here, we're going to do all the unittest stuff, including testing
# tasks and command lines. The infrastructure will take a bit of
# time to build, of course. We'll also try to use the Windmill Web testing
# system to test the interactive stuff.

# But first things first. The idea will be that every application
# will have a test directory, which will contain a mat_unittest.py
# file and/or a windmill test file, appropriately named. In this
# script, we're only going to deal with the Python unit tests.
# At least for the moment; Windmill is Python-based, so....

# We know where we are.

import sys, os

MAT_HOME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

sys.path.insert(0, os.path.join(MAT_HOME, "lib", "mat", "python"))
import MAT

import unittest, MAT.UnitTest

#
# Main
#

def Usage():
    print "Usage: mat_unittest.py [ --debug ] [ --quiet ] [ --verbose ] [ --tmpdir <d> ] [ --block_context_teardown ] [ --setting <a>=<b> ]* [ --categories a,b,c... ] [ --class_name_pattern p ] [ --test_name_pattern p ] app_dir..."
    print "--debug: pass debug to unittest."
    print "--quiet: quiet execution."
    print "--verbose: verbose execution."
    print "--tmpdir <d>: the temp directory will be created in <d> instead of the default location"
    print "--block_context_teardown: don't clean up the context at the end (so tmpdir remains)"
    print "--setting <a>=<b>: provide a setting to the test context"
    print """--categories <a,b,c...>: an optional comma-delimited list of core categories to test. If present,
  the system will test only files in the unittest directory named mat_<category>_unittest.py."""
    print """--class_name_pattern <p>: an optional pattern to filter unit test class names."""
    print """--test_name_pattern <p>: an optional pattern to filter the individual test method names."""
    sys.exit(1)

import getopt
try:
    opts, args = getopt.getopt(sys.argv[1:], "", ["debug", "block_context_teardown", "quiet",
                                                  "verbose", "tmpdir=", "setting=", "categories=",
                                                  "class_name_pattern=", "test_name_pattern="])
except getopt.GetoptError:
    Usage()

VERBOSITY = 1
DEBUG = False
TMPDIR = None
BLOCK_TEARDOWN = False
SETTINGS = {}
CATEGORIES = None
CLASS_NAME_PAT = None
TEST_NAME_PAT = None

for key, val in opts:
    if key == "--debug":
        DEBUG = True
    elif key == "--block_context_teardown":
        BLOCK_TEARDOWN = True
    elif key == "--quiet":
        VERBOSITY = 0
    elif key == "--verbose":
        VERBOSITY = 2
    elif key == "--tmpdir":
        TMPDIR = val
    elif key == "--categories":
        CATEGORIES = val.split(",")
        if CATEGORIES == ['']:
            CATEGORIES = []
    elif key == "--class_name_pattern":
        CLASS_NAME_PAT = val
    elif key == "--test_name_pattern":
        TEST_NAME_PAT = val
    elif key == "--setting":
        pair = val.split("=", 1)
        if len(pair) != 2:
            print "Warning: ignoring ill-formed setting '%s'" % val
        SETTINGS[pair[0]] = pair[1]
    else:
        Usage()

loader = MAT.UnitTest.TestLoader()
if CLASS_NAME_PAT is not None:
    loader.filterClassNames(CLASS_NAME_PAT)
if TEST_NAME_PAT is not None:
    loader.filterTestNames(TEST_NAME_PAT)
context = MAT.UnitTest.getTestContext(blockTeardown = BLOCK_TEARDOWN)
context.setTmpDir(TMPDIR)
for key, val in SETTINGS.items():
    context[key] = val

suite = unittest.TestSuite()

# First, load any tests defined in the core.
suite.addTest(loader.loadTestsFromModule(MAT.UnitTest))

# Then let's load the tests in the core. There should be no
# tests in this file. Make sure this directory is in the
# path.

oldSysPath = sys.path[:]
sys.path[0:0] = os.path.dirname(__file__)
if CATEGORIES is None:
    import glob
    files = glob.glob(os.path.join(os.path.dirname(__file__), "mat_*_unittest.py"))
    for file in files:
        suite.addTest(loader.loadTestsFromModule(__import__(os.path.splitext(os.path.basename(file))[0])))
else:
    for category in CATEGORIES:
        if os.path.isfile(os.path.join(os.path.dirname(__file__), "mat_" + category + "_unittest.py")):
            suite.addTest(loader.loadTestsFromModule(__import__("mat_" + category + "_unittest")))
sys.path = oldSysPath

suite.addTest(loader.loadTestsFromModule(__import__("__main__")))

# And now, let's load the tests from the various plugin dirs.
# One problem is that if there are tests which refer to classes in
# other plugin dirs, that's a problem. I haven't set up the
# import path appropriately. It's gotta be the same algorithm that's used
# in PluginMgr.py, in LoadPluginsFromDirs

plugins = MAT.PluginMgr.LoadPlugins()

import glob

# It's not clear to me that we need this - sys.modules seems to
# be updated by the way I load the plugins, in which case all the
# references will already be loaded.

sys.path[0:0] = [p.taskRoot for p in plugins.values()]

for site in args:
    paths = glob.glob(os.path.join(site, "test", "*.py"))
    for p in paths:
        print "Loading tests from", p
        # Add the prefix to the path, momentarily.
        oldSysPath = sys.path[:]
        sys.path[0:0] = [os.path.join(site, "test")]
        context.setLocal({"TASK_DIR": site})
        suite.addTest(loader.loadTestsFromName(os.path.splitext(os.path.basename(p))[0]))
        context.clearLocal(["TASK_DIR"])
        # Return the path.
        sys.path = oldSysPath

try:
    if DEBUG:
        suite.debug()
    else:
        unittest.TextTestRunner(verbosity=VERBOSITY).run(suite)
finally:
    context.tearDown()
