#!MF_PYTHONBIN

# Copyright (C) 2012 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import os, sys, copy

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

MAT_PKG_HOME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The point of this script is to dump the information about the annotations
# in a particular task to JSON for use in other bindings, such as Javascript or Java.

import MAT

#
# Guts
#

def fetchJSONStringForTask(pluginDir, taskName, removeRedundantInfo, removeNoncontentAnnotations,
                           prettyPrint, simplified):
    jsonData = pluginDir.getCGIMetadata()[taskName]
    finalJsonData = dict([(k, jsonData[k]) for k in ["annotationSetRepository", "tagOrder", "alphabetizeLabels", "tagHierarchy"]])
    if removeRedundantInfo or removeNoncontentAnnotations:
        # Copy it if I'm going to modify it.
        finalJsonData["annotationSetRepository"] = MAT.PluginMgr.PluginTaskDescriptor.simplifyJSONDisplayAnnotationRepository(finalJsonData["annotationSetRepository"], removeRedundantInfo = removeRedundantInfo, removeNoncontentAnnotations = removeNoncontentAnnotations)
    if simplified:
        # Just dump the list of types - but each one of them has to have
        # the "type" attribute added to them.
        typeData = finalJsonData["annotationSetRepository"]["types"]
        tagOrder = finalJsonData["tagOrder"]
        # I have to make sure that we do the elements which
        # aren't mentioned in the tag order - these are likely to be
        # things which are the true labels corresponding to effective labels.
        finalJsonData = []
        allMapped = set()
        for t in tagOrder:
            try:
                d = copy.deepcopy(typeData[t])
                d["type"] = t
                finalJsonData.append(d)
                allMapped.add(t)
            except KeyError:
                pass

        for t, v in typeData.items():
            if v.has_key("effective_labels"):
                for k in v["effective_labels"].keys():
                    if k not in allMapped:
                        d = copy.deepcopy(v)
                        d["type"] = t
                        finalJsonData.append(d)
                        allMapped.add(t)
                        break
                    
        # One more round, for those cases where we're rendering
        # something that has no tag order at all.

        for t, v in typeData.items():
            if t not in allMapped:
                d = copy.deepcopy(v)
                d["type"] = t
                finalJsonData.append(d)
                allMapped.add(t)
                    
    # OK, now we've cleaned up finalJsonData.
    import json
    if prettyPrint:
        return json.dumps(finalJsonData, sort_keys = True, indent = 2)
    else:
        return json.dumps(finalJsonData)

#
# Toplevel
#

from MAT.Operation import OptionParser, OptionGroup

import MAT.PluginMgr

PLUGIN_DIR = MAT.PluginMgr.LoadPlugins()

parser = OptionParser(usage = """Usage: %prog [options] task outfile

task: the name of a MAT task. Known tasks are: """ + ", ".join(PLUGIN_DIR.keys()) + """
outfile: the output file to write the JSON version of the annotation info to. If the file
  is '-', the JSON will be written to standard output.""")

parser.add_option("--dont_remove_redundant_info", action="store_true",
                  help = "By default, the tool removes redundant information to improve readability. If this flag is present, the redundant information will be retained. Both the Java library and the Javascript standalone viewer are configured to repopulate redundant information.")
parser.add_option("--compact", action="store_true",
                  help = "By default, the tool pretty-prints its JSON output. If this flag is present, the JSON will not be pretty-printed.")
parser.add_option("--keep_noncontent_annotations", action="store_true",
                  help = "By default, the tool does not preserve token, zone or admin annotation type descriptors. If this flag is present, all annotation types will be presented.")
parser.add_option("--simplified", action="store_true",
                  help = "By default, the tool dumps all the annotation-related task information, including tag order, hierarchy, etc., even if this information is not present. If this flag is present, the tool will dump a somewhat simpler order which is just a list of the annotation types.")

options, args = parser.parse_args()

REMOVE_REDUNDANT_INFO = not options.dont_remove_redundant_info
REMOVE_NONCONTENT_ANNOTATIONS = not options.keep_noncontent_annotations
PRETTY_PRINT = not options.compact
SIMPLIFIED = options.simplified

if len(args) != 2:
    parser.print_help()
    sys.exit(1)

[TASK, OUTFILE] = args

task = PLUGIN_DIR.getTask(TASK)
if task is None:
    print >> sys.stderr, "Error: task '%s' unknown." % TASK
    sys.exit(1)

if OUTFILE != "-":
    OUTFILE = os.path.abspath(OUTFILE)
    if not os.path.isdir(os.path.dirname(OUTFILE)):
        print >> sys.stderr, "Error: output directory '%s' unknown." % os.path.dirname(OUTFILE)
        sys.exit(1)

# At this point, we know about the task and the outfile. Time to convert.

s = fetchJSONStringForTask(PLUGIN_DIR, TASK, REMOVE_REDUNDANT_INFO, REMOVE_NONCONTENT_ANNOTATIONS, PRETTY_PRINT, SIMPLIFIED)

if OUTFILE == "-":
    print s
else:
    fp = open(OUTFILE, "w")
    fp.write(s)
    fp.close()
    print "Wrote %s." % OUTFILE

sys.exit(0)
