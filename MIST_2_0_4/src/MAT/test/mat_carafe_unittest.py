# Copyright (C) 2010 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from mat_unittest_resources import PluginContextTestCase
import MAT.DocumentIO, MAT.ToolChain
import os, shutil, sys, glob

# And now, a test to see if Carafe respects the zoning. We train on
# a single document, and then tag that document, but make the zone size 0.

class CarafeZoneTestCase(PluginContextTestCase):

    def testTaggingRespectsZoning(self):

        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")
        buildInfo = self.task.getModelInfo()
        builder = buildInfo.buildModelBuilder()

        tmpPath = os.path.join(self.testContext["TMPDIR"], "zonetest")
        docTmpDir = os.path.join(tmpPath, "docTmp")
        os.makedirs(docTmpDir)
        jsonFiles = [docPath]
        builder.run(os.path.join(tmpPath, "tmpmodel"),
                    jsonFiles, docTmpDir = docTmpDir, oStream = sys.stdout)

        # Now, let's tag that same document.
        e = MAT.ToolChain.MATEngine(self.task.getTaskImplementation("Demo", []), "Demo")
        _jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')
        doc = _jsonIO.readFromSource(docPath)
        outPairs = e.RunDataPairs([("<doc>", doc)], undoThrough = "tokenize")
        outDoc = outPairs[0][1]
        # Make all the zone annotations of zero length.
        for z in outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("zone")):
            z.end = z.start
        outPairs = e.RunDataPairs(outPairs, steps = ["tokenize", "tag"], tagger_local = True,
                                  tagger_model = os.path.join(tmpPath, "tmpmodel"))
        try:
            for z in outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("zone")):
                self.failUnless(z.end == z.start)
            self.failUnless(len(outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("content"))) == 0)
        finally:
            shutil.rmtree(tmpPath)

    def testTaggingRespectsZoningWithStrayTokens(self):

        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")
        buildInfo = self.task.getModelInfo()
        builder = buildInfo.buildModelBuilder()

        tmpPath = os.path.join(self.testContext["TMPDIR"], "zonetest2")
        docTmpDir = os.path.join(tmpPath, "docTmp2")
        os.makedirs(docTmpDir)
        jsonFiles = [docPath]
        builder.run(os.path.join(tmpPath, "tmpmodel"),
                    jsonFiles, docTmpDir = docTmpDir, oStream = sys.stdout)

        # Now, let's tag that same document.
        e = MAT.ToolChain.MATEngine(self.task.getTaskImplementation("Demo", []), "Demo")
        _jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')
        doc = _jsonIO.readFromSource(docPath)
        outPairs = e.RunDataPairs([("<doc>", doc)], undoThrough = "tag")
        outDoc = outPairs[0][1]
        # Make all the zone annotations of zero length. Actually, at the moment,
        # we'd have to do this for SEGMENTs instead, because that's what
        # Carafe now pays attention to.
        for z in outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("zone")):
            z.end = z.start
        for z in outDoc.getAnnotations(["SEGMENT"]):
            z.end = z.start
        outPairs = e.RunDataPairs(outPairs, steps = ["tag"], tagger_local = True,
                                  tagger_model = os.path.join(tmpPath, "tmpmodel"))
        try:
            for z in outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("zone")):
                self.failUnless(z.end == z.start)
            self.failUnless(len(outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("content"))) == 0)
        finally:
            shutil.rmtree(tmpPath)

class CarafePartialTagTestCase(PluginContextTestCase):

    def testPartialTag(self):
        # Build a model.
        psaTmp = os.path.join(self.testContext["TMPDIR"], "testpartialtag")
        os.mkdir(psaTmp)
        modelPath = os.path.join(psaTmp, "tmpmodel")
        docDir = os.path.join(psaTmp, "docs")
        os.mkdir(docDir)
        
        buildInfo = self.task.getModelInfo()
        builder = buildInfo.buildModelBuilder()

        contentCategories = self.task.getAnnotationTypesByCategory("content")
        
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        builder.run(modelPath, jsonFiles,
                    oStream = sys.stdout, tmpDir = docDir)

        # Now, take a sample document, wipe its content annotations,
        # and tag it. Nothing should happen, because it's gold
        
        _jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa6.txt.json")
        d = _jsonIO.readFromSource(docPath)

        d.removeAnnotations(atypes = contentCategories)
        d.stepUndone("tag")

        # Now, tag it.
        e = MAT.ToolChain.MATEngine(self.task.getTaskImplementation("Demo", []), "Demo")
        outPairs = e.RunDataPairs([("<doc>", d)], steps = ["tag"], tagger_local = True,
                                  tagger_model = modelPath)
        outD = outPairs[0][1]
        self.assertTrue(len(outD.getAnnotations(contentCategories)) == 0)

        # Now, change the lone segment to non-gold, MACHINE.
        segs = outD.getAnnotations(["SEGMENT"])
        self.assertTrue(len(segs) == 1)
        segs[0]["annotator"] = "MACHINE"
        segs[0]["status"] = "non-gold"

        outD.stepUndone("tag")
        outPairs = e.RunDataPairs(outPairs, steps = ["tag"], tagger_local = True,
                                  tagger_model = modelPath)

        # Now, the content annotations should be > 0.

        outD = outPairs[0][1]
        contentAnnots = outD.getAnnotations(contentCategories)
        self.assertTrue(len(contentAnnots) > 0)

        # Find the middle one, and modify the segs appropriately.
        c = contentAnnots[len(contentAnnots) / 2]
        segs = outD.getAnnotations(["SEGMENT"])
        self.assertTrue(len(segs) == 1)

        oldEnd = segs[0].end
        segs[0].end = c.end
        outD.createAnnotation(c.end, oldEnd, "SEGMENT", {"annotator": "human", "status": "human gold"})

        # Now, delete the annotations again.
        outD.removeAnnotations(atypes = contentCategories)

        # Tag again.
        outD.stepUndone("tag")
        outPairs = e.RunDataPairs(outPairs, steps = ["tag"], tagger_local = True,
                                  tagger_model = modelPath)

        newContentAnnots = outD.orderAnnotations(contentCategories)
        self.assertTrue(len(newContentAnnots) > 0)
        self.assertTrue(len(newContentAnnots) < len(contentAnnots))
        self.assertTrue(newContentAnnots[-1].end <= oldEnd)

        # Now, let's make sure that retagging doesn't double the annotations in a segment.
        # Well, we also have to make sure that retagging is POSSIBLE. For Carafe, it's
        # if it's untagged, or there's some SEGMENT that can still be tagged.

        # We also need to make sure that retagging doesn't duplicate the annotations
        # in the gold segment. So let's mark the second segment non-gold for a moment, then
        # undo the tag step, and tag the whole thing. THEN we mark the second segment gold
        # and retag.

        allSegs = outD.orderAnnotations(["SEGMENT"])
        allSegs[1]["annotator"] = "MACHINE"
        allSegs[1]["status"] = "non-gold"

        outPairs = e.RunDataPairs(outPairs, steps = ["tag"], tagger_local = True,
                                  tagger_model = modelPath, undoThrough = "tag")

        # At this point, we should have ONE segment, actually, because
        # we had two adjacent retaggable segments, which were collapsed.

        allSegs = outD.orderAnnotations(["SEGMENT"])
        self.assertEqual(len(allSegs), 1)
        self.assertEqual(allSegs[0]["annotator"], "MACHINE")
        self.assertEqual(allSegs[0]["status"], "non-gold")

        # So now, we add another annotation, again. But in order to REALLY test this
        # with Carafe, we can't change the segment boundaries, because that modifies
        # the regions that Carafe looks at, which can change the results. So what I
        # REALLY, REALLY need to do is: segment it. Mark the first region gold. Undo the tagging
        # but not with undo through. Tag it. Now, we should have tags just in the second region.
        # THEN, mark the SECOND region gold, and the FIRST region non-gold, and TAG IT
        # TWICE MORE.

        contentAnnots = outD.getAnnotations(contentCategories)

        # Find the middle one, and modify the segs appropriately.
        c = contentAnnots[len(contentAnnots) / 2]
        oldEnd = allSegs[0].end
        allSegs[0].end = c.end
        outD.createAnnotation(c.end, oldEnd, "SEGMENT", {"annotator": "MACHINE", "status": "non-gold"})
        allSegs[0]["status"] = "human gold"
        allSegs[0]["annotator"] = "human"

        outD.removeAnnotations(atypes = contentCategories)
        outD.stepUndone("tag")

        allSegs = outD.orderAnnotations(["SEGMENT"])
        
        outPairs = e.RunDataPairs(outPairs, steps = ["tag"], tagger_local = True,
                                  tagger_model = modelPath)
        
        self.assertTrue(outD.orderAnnotations(contentCategories)[0].start >= allSegs[1].start)

        allSegs[0]["status"] = "non-gold"
        allSegs[0]["annotator"] = "MACHINE"
        allSegs[1]["status"] = "human gold"
        allSegs[1]["annotator"] = "human"            

        # OK, first check to see if it's still taggable.

        self.assertTrue([step for step in e.operationalTask.getWorkflows()[e.workFlow].stepList if step.stepName == "tag"][0].stepCanBeDone(outD))

        # Now, tag it to fill the first segment.

        outPairs = e.RunDataPairs(outPairs, steps = ["tag"], tagger_local = True,
                                  tagger_model = modelPath)

        newContentAnnots = outD.orderAnnotations(contentCategories)

        allSegs = outD.orderAnnotations(["SEGMENT"])
        
        firstSegAnnots = [c for c in newContentAnnots if c.start >= allSegs[0].start and c.end <= allSegs[0].end]
        secondSegAnnots = [c for c in newContentAnnots if c.start >= allSegs[1].start and c.end <= allSegs[1].end]
        
        # Finally, we tag it again. There should be just as many segments in the new segAnnots,
        # but different ones.

        outPairs = e.RunDataPairs(outPairs, steps = ["tag"], tagger_local = True,
                                  tagger_model = modelPath)

        finalContentAnnots = outD.orderAnnotations(contentCategories)
        newSegAnnots = [c for c in finalContentAnnots
                        if c.start >= allSegs[0].start and c.end <= allSegs[0].end]

        # Same length.
        self.assertEqual(len(firstSegAnnots), len(newSegAnnots))
        # Same content (same model, same segments)
        self.assertEqual([(c.atype.lab, c.start, c.end) for c in firstSegAnnots],
                         [(c.atype.lab, c.start, c.end) for c in newSegAnnots])
        # Different annotations.
        self.assertTrue(set(firstSegAnnots) != set(newSegAnnots))

        # These should be exactly the same annotations, because we haven't
        # modified them.
        self.assertEqual(set(secondSegAnnots),
                         set([c for c in finalContentAnnots if c.start >= allSegs[1].start and c.end <= allSegs[1].end]))
