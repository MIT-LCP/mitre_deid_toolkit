#!MF_PYTHONBIN

# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.


import os, sys, glob, shutil

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

MAT_PKG_HOME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import MAT

def Usage():
    print "Usage: MATManagePluginDirs [ install | remove ] app_dir ..."
    print "       MATManagePluginDirs list"
    sys.exit(1)

if len(sys.argv) < 2:
    Usage()

if sys.argv[1] in ["install", "remove"]:
    if len(sys.argv) < 3:
        Usage()
    mgr = MAT.PluginMgr.PluginDirMgr()
    if sys.argv[1] == "install":
        meth = mgr.installPluginDir
    else:
        meth = mgr.uninstallPluginDir
    for appDir in sys.argv[2:]:
        try:
            meth(appDir, verbose = True)
        except MAT.PluginMgr.PluginError, e:
            print "Warning:", str(e)
            print "Skipping %s." % appDir
elif sys.argv[1] == "list":
    mgr = MAT.PluginMgr.PluginDirMgr()
    mgr.read()
    d = MAT.PluginMgr.LoadPlugins()
    byDir = {}
    for k, v in d.items():
        try:
            byDir[v.taskRoot].append(k)
        except KeyError:
            byDir[v.taskRoot] = [k]
    for prefix, fullPath in mgr.dirPairs:
        if prefix != "":
            continue
        whatsThere = []
        if os.path.exists(os.path.join(fullPath, "task.xml")):
            localTasks = byDir.get(fullPath)
            if localTasks is None:
                whatsThere.append("task (none visible)")
            elif len(localTasks) > 1:
                whatsThere.append("tasks: " + ", ".join(["'" + t + "'" for t in localTasks]))
            else:
                whatsThere.append("task: '" + localTasks[0] + "'")  
        if os.path.exists(os.path.join(fullPath, "demo.xml")):
            whatsThere.append("demo")
        print fullPath, "("+"; ".join(whatsThere)+")"            
else:
    print "Operation '%s' unknown." % sys.argv[1]
    Usage()


