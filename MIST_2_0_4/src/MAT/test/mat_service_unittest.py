# Copyright (C) 2010 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from mat_unittest_resources import PluginContextTestCase, CmdlinePluginContextTestCase
import MAT

_rawIO = MAT.DocumentIO.getDocumentIO('raw')

import os, sys, glob

class RemoteTestCase(CmdlinePluginContextTestCase, 
                      MAT.UnitTest.CherryPyTestMixin):

    def testAutotag(self):

        # Make sure a model is built.
        buildInfo = self.task.getModelInfo()
        builder = buildInfo.buildModelBuilder()
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))        
        builder.run(self.task.getDefaultModel(),
                    jsonFiles, oStream = sys.stdout)

        self.runFunctionUnderCherryPy(self._testAutotag, "s09flkjselifef", taggerService = True)

    def _testAutotag(self, port, wsKey):

        doc = _rawIO.readFromSource(os.path.join(self.sampleDir, "resources", "data", "raw", "voa7.txt"))
        e = MAT.ToolChain.MATEngine(taskObj = self.task, workflow = "Demo")
        e.RunDataPairs([("<test>", doc)], ["zone", "tokenize"])

        # Don't need the wsKey. But I DO need a working client.

        w = MAT.WebClient.WebClient("http://localhost:%d" % port, proxies = {})

        doc = w.doSteps(doc, "Named Entity", "Demo", "tag")
        self.failUnless(len(doc.getAnnotations(self.task.getAnnotationTypesByCategory("content"))) > 0)
        

# And now a test to ensure that remote tagging respects zones.

class RemoteZoneTestCase(CmdlinePluginContextTestCase, 
                         MAT.UnitTest.CherryPyTestMixin):

    def _buildModel(self):

        # Make sure a model is built.
        buildInfo = self.task.getModelInfo()
        builder = buildInfo.buildModelBuilder()
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))        
        builder.run(self.task.getDefaultModel(),
                    jsonFiles, oStream = sys.stdout)

    def testRemoteZoneAutotag(self):

        self._buildModel()
        self.runFunctionUnderCherryPy(self._testRemoteZoneAutotag, "s09flkjselifef", taggerService = True)

    def _testRemoteZoneAutotag(self, port, wsKey):

        doc = MAT.DocumentIO.getDocumentIO('mat-json').readFromSource(os.path.join(self.sampleDir, "resources", "data", "json", "voa7.txt.json"))
        e = MAT.ToolChain.MATEngine(taskObj = self.task, workflow = "Demo")
        outPairs = e.RunDataPairs([("<test>", doc)], undoThrough = "tokenize")
        outDoc = outPairs[0][1]

        # Make all the zone annotations of zero length.
        for z in outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("zone")):
            z.end = z.start

        # Don't need the wsKey. But I DO need a working client.

        w = MAT.WebClient.WebClient("http://localhost:%d" % port, proxies = {})

        outDoc = w.doSteps(outDoc, "Named Entity", "Demo", "tokenize,tag")

        for z in outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("zone")):
            self.failUnless(z.end == z.start)
        print [((hasattr(a, "start") and a.start) or None,
                (hasattr(a, "end") and a.end) or None,
                a.atype.lab) for a in outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("content"))]
        self.failUnless(len(outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("content"))) == 0)

    def testRemoteZoneAutotagWithStrayTokens(self):

        self._buildModel()
        self.runFunctionUnderCherryPy(self._testRemoteZoneAutotagWithStrayTokens, "s09flkjselifef", taggerService = True)

    def _testRemoteZoneAutotagWithStrayTokens(self, port, wsKey):

        doc = MAT.DocumentIO.getDocumentIO('mat-json').readFromSource(os.path.join(self.sampleDir, "resources", "data", "json", "voa7.txt.json"))
        e = MAT.ToolChain.MATEngine(taskObj = self.task, workflow = "Demo")
        outPairs = e.RunDataPairs([("<test>", doc)], undoThrough = "tag")
        outDoc = outPairs[0][1]

        # Make all the zone annotations of zero length. Gotta do the same thing
        # with the SEGMENTs, now that we're using SEGMENTs for administration.
        for z in outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("zone")):
            z.end = z.start
        for z in outDoc.getAnnotations(["SEGMENT"]):
            z.end = z.start

        # Don't need the wsKey. But I DO need a working client.

        w = MAT.WebClient.WebClient("http://localhost:%d" % port, proxies = {})

        outDoc = w.doSteps(outDoc, "Named Entity", "Demo", "tag")

        for z in outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("zone")):
            self.failUnless(z.end == z.start)
        print [(a.start, a.end, a.atype.lab) for a in outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("content"))]
        self.failUnless(len(outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("content"))) == 0)
