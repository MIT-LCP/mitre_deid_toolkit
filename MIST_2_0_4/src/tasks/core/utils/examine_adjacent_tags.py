# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# This file takes a set of hypothesis files, along with their gold versions,
# and reports on what happened with sequences of adjacent tags in the
# gold versions. The suspicion, at this point, is that they're all
# collapsed to single tags in the decoding, and it's a Carafe bug.

import sys, os, re, glob

#
# Guts
#

def examine_adjacent_tags(hypPath, refPath):

    _jsonIO = MAT.Document.getDocumentIO('mat-json')

    refDoc = _jsonIO.readFromSource(refPath)
    hypDoc = _jsonIO.readFromSource(hypPath)

    # This is going to fail, because the document doesn't have getAnnotationTypesByCategory
    # anymore. But I'm not going to fix it, because I don't think this is used.

    refContentAnnots = refDoc.orderAnnotations(refDoc.getAnnotationTypesByCategory("content"))
    hypContentAnnots = hypDoc.orderAnnotations(hypDoc.getAnnotationTypesByCategory("content"))
    lexAnnots = refDoc.orderAnnotations(refDoc.getAnnotationTypesByCategory("token"))

    # So the idea is first to generate a table from start and
    # end for the tokens.

    tStartMap = {}
    tEndMap = {}
    j = 0
    for t in lexAnnots:
        tStartMap[t.start] = j
        tEndMap[t.end] = j
        j += 1

    # Now, we loop through the ref annotations.

    curAnnotSeq = []
    multSeqs = []
    
    for annot in refContentAnnots:

        # If the last token in the most recent annotation is the token
        # before the first token in the current annotation, it's adjacent.

        if not curAnnotSeq:
            curAnnotSeq.append(annot)

        elif (tEndMap[curAnnotSeq[-1].end] + 1 == tStartMap[annot.start]) and \
             (curAnnotSeq[-1].atype is annot.atype):
            curAnnotSeq.append(annot)
            
        else:
            # Otherwise, it's not. Save a sequence of length > 1.
            if len(curAnnotSeq) > 1:
                multSeqs.append([curAnnotSeq[0].start, curAnnotSeq[-1].end, curAnnotSeq, None])
            curAnnotSeq = [annot]

    if len(curAnnotSeq) > 1:
        multSeqs.append([curAnnotSeq[0].start, curAnnotSeq[-1].end, curAnnotSeq, None])
        

    # So now, we have all the long sequences, in order. Now what?
    # Now, let's go through the tokens and record which annotation is over them,
    # if any.

    whichAnnot = {}
    for t in lexAnnots:
        whichAnnot[tStartMap[t.start]] = None

    for annot in hypContentAnnots:
        startLex = tStartMap[annot.start]
        endLex = tEndMap[annot.end]

        while startLex <= endLex:
            whichAnnot[startLex] = annot
            startLex += 1

    # Now, I can look, for each ref multi seq, what's on it.

    if multSeqs:
        print "Found", len(multSeqs), "multseqs in", os.path.basename(hypPath)

    for multSeq in multSeqs:

        elts = []

        startLex = tStartMap[multSeq[0]]
        endLex = tEndMap[multSeq[1]]

        while startLex < endLex:
            whatsThere = whichAnnot[startLex]

            if (not elts) or (elts[-1] is not whatsThere):
                elts.append(whatsThere)

            startLex += 1

        toks = []
        
        for i in range(len(elts)):

            elt = elts[i]
            if elt is None:
                toks.append("tok(s)")
            else:
                lab = elt.atype.lab
                if i == 0:
                    lab = "+"+lab
                if i == len(elts) - 1:
                    lab = lab + "+"
                toks.append(lab)
        multSeq[3] = toks

        print [(x.atype.lab, x.start, x.end) for x in multSeq[2]], toks
        # print [x.atype.lab for x in multSeq[2]], toks
    
#
# Toplevel
#

if len(sys.argv) != 6:
    print "Usage: examine_adjacent_tags.py MAT_home hyp_dir ref_dir hyp_pat ref_pat"
    sys.exit(1)

[MAT_HOME, HYP_DIR, REF_DIR, HYP_PAT, REF_PAT] = sys.argv[1:]

sys.path.insert(0, os.path.join(MAT_HOME, "lib", "mat", "python"))

import MAT
import MAT.Document

HYP_FILES = glob.glob(os.path.join(HYP_DIR, "*"))

HYP_RE = re.compile("^"+HYP_PAT+"$")

print "Testing", len(HYP_FILES), "files."

# Try to find a matching file in the REF_DIR. The basenames should
# be the same.

for hyp in HYP_FILES:
    m = HYP_RE.match(hyp)
    if m is None:
        print "Couldn't match pattern in", hyp
        continue
    fName = REF_PAT % m.group(1)
    p = os.path.join(REF_DIR, fName)
    if not os.path.exists(p):
        print "Couldn't find", fName, "in", REF_DIR
        continue
    examine_adjacent_tags(hyp, p)

sys.exit(0)
