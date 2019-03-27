# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# This file contains common classes required by the various core
# elements.

import MAT.UnitTest, os

class PluginContextTestCase(MAT.UnitTest.SampleTestCase):

    instantiable = False

    # No teardown needed.

    def setUp(self, subdir = "ne", name = "Named Entity"):
        MAT.UnitTest.SampleTestCase.setUp(self)
        self.sampleDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", subdir)
        # There are some tests that rely on there being a single task in pDict.
        # Unfortunately, ne now has an enhanced task as well. So.
        self.fullPDict = MAT.PluginMgr.LoadPlugins(self.sampleDir)
        self.pDict = MAT.PluginMgr.LoadPlugins(self.sampleDir)
        self.task = self.pDict.getTask(name)
        if len(self.pDict.values()) > 1:
            for t in self.pDict.values():
                if t is not self.task:
                    self.pDict.pruneTask(t)
            
class CmdlinePluginContextTestCase(MAT.UnitTest.SampleTestCase):

    instantiable = False

    # No teardown needed.

    def setUp(self, subdir = "ne", name = "Named Entity"):
        MAT.UnitTest.SampleTestCase.setUp(self)        
        self.sampleDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", subdir)
        mgr = MAT.PluginMgr.PluginDirMgr()
        mgr.installPluginDir(self.sampleDir, verbose = True)
        self.pDict = MAT.PluginMgr.LoadPlugins()
        self.task = self.pDict.getTask(name)

# Not sure why this is needed in addition to the above, but I don't have
# the time to figure it out.

class CmdlinePluginContextTestCaseWithTeardown(MAT.UnitTest.CmdlinesTestCase, CmdlinePluginContextTestCase):

    def setUp(self, *args, **kw):
        MAT.UnitTest.CmdlinesTestCase.setUp(self)
        CmdlinePluginContextTestCase.setUp(self, *args, **kw)
    
    def tearDown(self):
        MAT.UnitTest.CmdlinesTestCase.tearDown(self)
        CmdlinePluginContextTestCase.tearDown(self)

#
# And now, some document resources.
#

import MAT.Document, MAT.ReconciliationDocument

# In order to test things appropriately, we really need to be able to build our own documents.

class TestError(Exception):
    pass

import re

class TestDocument(MAT.Document.AnnotatedDoc):

    def _findWordInToks(self, toks, word, nth):
        wordCount = -1
        i = 0
        for tok in toks:
            if self.signal[tok.start:tok.end] == word:
                wordCount += 1
                if wordCount == nth:
                    # Found it.
                    break
            i += 1
        if wordCount < nth:
            raise TestError, ("couldn't find nth occurrence of '%s', n = %d" % (word, nth))
        return i

    def _tokenize(self):
        # Just break on whitespace.
        if not hasattr(self, "_tokens"):
            self._tokens = [self.createAnnotation(m.start(), m.end(), "lex") for m in re.finditer("\S+", self.signal)]
        return self._tokens
    
    def addAnnotationAt(self, task, word, nth, nWords, type, attrs = None):
        # We have no tokens in this task, so let's make 'em up.
        toks = self._tokenize()
        i = self._findWordInToks(toks, word, nth)
        if i + nWords > len(toks):
            raise TestError, ("couldn't add %d toks to token position %d" % (nWords, i))
        aStart = toks[i].start
        aEnd = toks[i + nWords - 1].end
        self.createAnnotation(aStart, aEnd, type, attrs)

    def _getToken(self, word, nth):
        toks = self._tokenize()
        i = self._findWordInToks(toks, word, nth)
        # Grab all the segments, and find the one which overlaps the
        # end index of this token.
        return toks[i]

    def _findSegmentIncludingEndOf(self, word, nth, canEqual = False):
        tok = self._getToken(word, nth)
        seg = self._findSegmentIncludingIndex(tok.end, canEqual = canEqual)
        if seg is not None:
            return tok, seg
        else:
            return None, None

    def _findSegmentIncludingIndex(self, idx, canEqual = False):
        for seg in self.getAnnotations(["SEGMENT"]):
            if (seg.start < idx) and \
               ((seg.end > idx) or (canEqual and (seg.end == idx))):
                # It must OVERLAP. If there's an index that is =,
                # we don't need to do anything.
                return seg
        return None

    def addSegmentBoundaryAfter(self, task, word, nth):
        tok, segToRemove = self._findSegmentIncludingEndOf(word, nth)
        if segToRemove is not None:
            self.removeAnnotation(segToRemove)
            self.createAnnotation(segToRemove.start, tok.end, "SEGMENT", segToRemove.attrs[:])
            self.createAnnotation(tok.end, segToRemove.end, "SEGMENT", segToRemove.attrs[:])

    def updateSegment(self, task, word, nth, attrs):
        tok, segToUpdate = self._findSegmentIncludingEndOf(word, nth)
        if segToUpdate is not None:
            for k, v in attrs:
                segToUpdate[k] = v

# The order here doesn't matter, because there are no overrides.

class ReconciliationTestDocument(TestDocument, MAT.ReconciliationDocument.ReconciliationDoc):

    def _addVote(self, seg, content, annotator, task):
        return self.createSpanlessAnnotation("VOTE", {"content": content,
                                                      "annotator": annotator,
                                                      "segment": seg,
                                                      "chosen": "no",
                                                      # I think I need this.
                                                      "new": "yes",
                                                      "comment": None})
