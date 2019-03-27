# Copyright (C) 2012 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# This script is a little clumsy, because it attempts to use ONLY
# the replacement engine Python and nothing else. So it doesn't
# import MAT, and what it needs to do with the JSON is take it apart
# by hand.

import sys, os, codecs

def Usage():
    print >> sys.stderr, """Usage: docReplace.py [ --json_dir <dir> ] [ --task_py_dir <dir> ] [ --task_resource_dir <dir> ] jsonDoc replacer corePyDir coreResourceDir moduleName className

jsonDoc: a document in MAT Json format
replacer: the name of a replacer, e.g. "clear -> clear"
corePyDir: the python/ directory in src/tasks/core
coreResourceDir: the resources/ directory in src/tasks/core
moduleName: the name of the Python module which contains the specific subclass of StandaloneReplacementEngine
className: the name of the specific subclass of StandaloneReplacementEngine

--json_dir <d>: a directory containing simplejson, for Python versions before 2.6, or Jython
--task_py_dir <d>: the python/ directory in a task. May be repeated.
--task_resource_dir <d>: the resources/ directory in a task. May be repeated."""
    sys.exit(1)

import getopt

opts, args = getopt.getopt(sys.argv[1:], "", ["json_dir=", "task_py_dir=", "task_resource_dir="])

if len(args) != 6:
    Usage()

[DOC, REPLACER, CORE_PY_DIR, CORE_RESOURCE_DIR, SRE_MODULE, SRE_CLASS] = args

JSON_DIR = None
TASK_PY_DIRS = []
TASK_RESOURCE_DIRS = []
for k, v in opts:
    if k == "--json_dir":
        JSON_DIR = v
    elif k == "--task_py_dir":
        TASK_PY_DIRS.append(os.path.abspath(v))
    elif k == "--task_resource_dir":
        TASK_RESOURCE_DIRS.append(os.path.abspath(v))

# Set up the imports.
sys.path = TASK_PY_DIRS + [CORE_PY_DIR] + sys.path

try:
    exec "import %s" % SRE_MODULE
except ImportError, e:
    print >> sys.stderr, e
    sys.exit(1)

try:
    rClass = eval("%s.%s" % (SRE_MODULE, SRE_CLASS))
except ValueError, e:
    print >> sys.stderr, e
    sys.exit(1)

import ReplacementEngine

if not issubclass(rClass, ReplacementEngine.StandaloneReplacementEngine):
    print >> sys.stderr, "The requested class is not a subclass of ReplacementEngine.StandaloneReplacementEngine"
    sys.exit(1)

e = rClass()
for p in TASK_RESOURCE_DIRS:
    e.addResourceDir(p)
e.addResourceDir(os.path.abspath(CORE_RESOURCE_DIR))

try:
    import json
except ImportError:
    # Python 2.5, or Jython.
    if JSON_DIR is None:
        print >> sys.stderr, "No dir for simplejson specified. Exiting."
        sys.exit(1)
    sys.path.insert(0, JSON_DIR)
    import simplejson as json

if DOC == "-":
    d = json.loads(sys.stdin.read())
else:
    fp = codecs.open(DOC, "r", "utf-8")
    d = json.loads(fp.read())
    fp.close()

evt = e.newEvent(d["signal"])

annotsToReplace = set(e.getReplaceableLabels())

for aset in d["asets"]:
    if aset["type"] in annotsToReplace:
        for s, e in aset["annots"]:
            evt.addTuple(aset["type"], s, e)

try:
    evt.convert(REPLACER)
except ReplacementEngine.StandaloneReplacementEngineError, e:
    print "Error:", str(e)
    sys.exit(1)

print evt.getReplacedSignal().encode("ascii", "ignore"), evt.getReplacedTuples()
sys.exit(0)
