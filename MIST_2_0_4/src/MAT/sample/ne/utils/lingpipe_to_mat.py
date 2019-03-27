# A quick script to convert from the NE demo format

# : [194-200:PERSON@-Infinity, 212-225:PERSON@-Infinity, 346-363:PERSON@-Infinity, 447-453:ORGANIZATION@-Infinity, 643-649:PERSON@-Infinity, 654-664:LOCATION@-Infinity, 742-753:PERSON@-Infinity, 802-841:ORGANIZATION@-Infinity, 848-853:PERSON@-Infinity, 880-889:LOCATION@-Infinity, 934-940:LOCATION@-Infinity, 1019-1023:ORGANIZATION@-Infinity, 1096-1106:ORGANIZATION@-Infinity, 1234-1240:ORGANIZATION@-Infinity, 1250-1256:PERSON@-Infinity, 1367-1377:PERSON@-Infinity, 1521-1527:PERSON@-Infinity, 1732-1738:PERSON@-Infinity, 1882-1890:LOCATION@-Infinity]

# to an annotated file.

# The format I established in RunFileChunker was

# Working on <filename>
# then search for " : " at the beginning of a line.

#
# Guts
#

import re,  os, sys

ENTRY_PAT = re.compile("(\d+)-(\d+):(.+?)@")

# We need to tokenize, and then align.

def createAnnotatedDocument(taskImpl, path, docString):
    jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')
    d = jsonIO.readFromSource(path, task = taskImpl)

    # This isn't really right.
    aTypes = {}
    for key in tagTable.keys():
        aTypes[key.lower()] = d.findAnnotationType(key)

    taskImpl.getStep("Demo", "zone").do(d)
    entries = docString.split(", ")
    for e in entries:
        m = ENTRY_PAT.match(e)
        if m is not None:
            start = m.group(1)
            end = m.group(2)
            tag = m.group(3)            
            d.createAnnotation(int(start), int(end), aTypes[tag.lower()])
        else:
            print "Don't get record", e

    d.adjustTagsToTokens(taskImpl)
    d.setStepsDone(["zone", "tag"])

    outPath = os.path.join(os.path.dirname(path), os.path.basename(path) + ".json")
    print "Writing", outPath
    jsonIO.writeToTarget(d, outPath)

#
# Toplevel
#

if len(sys.argv) != 3:
    print "Usage: lingpipe_to_mat.py mat_home lingpipe_output"
    sys.exit(1)

[MAT_HOME, LP_OUTPUT] = sys.argv[1:]

sys.path.insert(0, os.path.join(MAT_HOME, "lib", "mat", "python"))

import MAT.Document
import MAT.PluginMgr

fp = open(LP_OUTPUT, "r")
s = fp.read()
fp.close()
plugins = MAT.PluginMgr.LoadPlugins()
task = plugins["Named Entity"]
taskImpl = task.getTaskImplementation('Demo', [])

DOC_PAT = re.compile("^ : [[](.*)[]]$", re.M)
START_PAT = re.compile("^Working on (.*)", re.M)

i = 0
while i < len(s):
    m = START_PAT.search(s, i)
    if m is None:
        break
    path = m.group(1)
    m = DOC_PAT.search(s, m.end())
    if m is None:
        break
    docString = m.group(1)
    createAnnotatedDocument(taskImpl, path, docString)
    i = m.end()
