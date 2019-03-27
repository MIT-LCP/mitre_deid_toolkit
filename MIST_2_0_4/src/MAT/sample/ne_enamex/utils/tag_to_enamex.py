import os, sys

#
# Guts
#

def convertFile(inTask, outTask, inFile, outFile):
    jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')
    d = jsonIO.readFromSource(inFile)
    # Get all the content annots, and then remove them.
    annots = d.getAnnotations(inTask.getAnnotationTypesByCategory("content"))
    inTask.removeAnnotationsByCategory(d, "content")
    enamexType = d.findAnnotationType("ENAMEX")
    enamexType.ensureAttribute("type")
    for annot in annots:
        d.createAnnotation(annot.start, annot.end, enamexType, [annot.atype.lab])
    jsonIO.writeToTarget(d, outFile)

#
# Toplevel
#

if len(sys.argv) != 4:
    print "Usage: tag_to_enamex.py mat_home dir_in dir_out"
    sys.exit(1)

[MAT_HOME, IN_DIR, OUT_DIR] = sys.argv[1:]

sys.path.insert(0, os.path.join(MAT_HOME, "lib", "mat", "python"))

import MAT

if not os.path.exists(OUT_DIR):
    os.makedirs(OUT_DIR)

plugins = MAT.PluginMgr.LoadPlugins()
namedEntityTask = plugins["Named Entity"]
enamexTask = plugins["Named Entity (ENAMEX)"]

import glob

for jsonFile in glob.glob(os.path.join(IN_DIR, '*.json')):
    print "Doing", jsonFile
    convertFile(namedEntityTask, enamexTask, jsonFile, os.path.join(OUT_DIR, os.path.basename(jsonFile)))
