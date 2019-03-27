# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# I need to run the model builder, and look at the output to see if
# the right things happened with the PSA enhancements.

from mat_unittest_resources import CmdlinePluginContextTestCase, CmdlinePluginContextTestCaseWithTeardown
import MAT.DocumentIO, MAT.ToolChain, MAT.JavaCarafe, MAT.CarafeTrain
import os, sys, glob, re, shutil

_jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')

class PSATestEngineSettings(CmdlinePluginContextTestCase):

    def testNoPSA(self):

        # Read the experiment XML file, to get the trainer name.

        noPsaTmp = os.path.join(self.testContext["TMPDIR"], "testnopsa")

        expPath = os.path.join(noPsaTmp, "tmptestexp")
        e = MAT.CarafeTrain.ExperimentEngine(**MAT.CarafeTrain.fromXML(os.path.join(self.sampleDir, "test", "exp", "exp_no_psa.xml"), dir = expPath, corpusPrefix = os.path.join(self.sampleDir, "resources", "data", "json")))
        c = e.corporaList[0]
        e.markDone = False
        e.force = False
        c.setContext(e)
        c.prepare()
        mTemplate = e.modelSetList[0]
        mList = list(mTemplate.yieldInstances(e))
        m = mList[0]
        self.assertEqual(m.builder.trainingMethod, None)

    def testPSA(self):

        # Read the experiment XML file, to get the trainer name.

        psaTmp = os.path.join(self.testContext["TMPDIR"], "testpsa")

        expPath = os.path.join(psaTmp, "tmptestexp")
        e = MAT.CarafeTrain.ExperimentEngine(**MAT.CarafeTrain.fromXML(os.path.join(self.sampleDir, "test", "exp", "exp.xml"), dir = expPath, corpusPrefix = os.path.join(self.sampleDir, "resources", "data", "json")))
        e.markDone = False
        e.force = False
        c = e.corporaList[0]
        c.setContext(e)
        c.prepare()
        mTemplate = e.modelSetList[0]
        mList = list(mTemplate.yieldInstances(e))
        m = mList[0]
        self.assertEqual(m.builder.maxIterations, 6)
        self.assertEqual(m.builder.trainingMethod, "psa")

class PSADirectTest(CmdlinePluginContextTestCase):

    def testNoPSA(self):

        task = MAT.PluginMgr.LoadPlugins()["Named Entity"]

        noPsaTmp = os.path.join(self.testContext["TMPDIR"], "testnopsadirect")

        buildInfo = task.getModelInfo()
        self.assertEqual(buildInfo.getModelClass(), MAT.JavaCarafe.CarafeModelBuilder)

        builder = buildInfo.buildModelBuilder(training_method = "")

        tmpPath = os.path.join(noPsaTmp, "modeldocs")
        os.makedirs(tmpPath)
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        builder.run(os.path.join(noPsaTmp, "tmpmodel"),
                    jsonFiles, docTmpDir = tmpPath, oStream = sys.stdout)

        path = os.path.join(tmpPath, "voa7.txt.json")
        tdoc = _jsonIO.readFromSource(path)
        zones = tdoc.orderAnnotations(["zone"])
        self.assertEqual(len(zones), 1)

    def testPSA(self):

        task = MAT.PluginMgr.LoadPlugins()["Named Entity"]

        psaTmp = os.path.join(self.testContext["TMPDIR"], "testpsadirect")

        buildInfo = task.getModelInfo()
        self.assertEqual(buildInfo.getModelClass(), MAT.JavaCarafe.CarafeModelBuilder)

        builder = buildInfo.buildModelBuilder()
        
        tmpPath = os.path.join(psaTmp, "modeldocs")
        os.makedirs(tmpPath)
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        builder.run(os.path.join(psaTmp, "tmpmodel"),
                    jsonFiles, docTmpDir = tmpPath, oStream = sys.stdout)

        path = os.path.join(tmpPath, "voa7.txt.json")
        tdoc = _jsonIO.readFromSource(path)
        zones = tdoc.orderAnnotations(["zone"])
        # This used to be >, but PSA no longer does random segmentation.
        self.failUnless(len(zones) == 1)

# Now, test the same thing with the ENAMEX-style annotations.

class EnamexPSADirectTest(CmdlinePluginContextTestCase):

    def setUp(self):
        CmdlinePluginContextTestCase.setUp(self, subdir = "ne_enamex", name = "Named Entity (ENAMEX)")

    def testNoPSA(self):

        task = MAT.PluginMgr.LoadPlugins()["Named Entity (ENAMEX)"]

        noPsaTmp = os.path.join(self.testContext["TMPDIR"], "enamextestnopsadirect")

        buildInfo = task.getModelInfo()
        self.assertEqual(buildInfo.getModelClass(), MAT.JavaCarafe.CarafeModelBuilder)

        builder = buildInfo.buildModelBuilder(training_method = "")

        tmpPath = os.path.join(noPsaTmp, "modeldocs")
        os.makedirs(tmpPath)
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        builder.run(os.path.join(noPsaTmp, "tmpmodel"),
                    jsonFiles, docTmpDir = tmpPath, oStream = sys.stdout)

        path = os.path.join(tmpPath, "voa7.txt.json")
        tdoc = _jsonIO.readFromSource(path)
        zones = tdoc.orderAnnotations(["zone"])
        self.assertEqual(len(zones), 1)

    def testPSA(self):

        task = MAT.PluginMgr.LoadPlugins()["Named Entity (ENAMEX)"]

        psaTmp = os.path.join(self.testContext["TMPDIR"], "enamextestpsadirect")

        buildInfo = task.getModelInfo()
        self.assertEqual(buildInfo.getModelClass(), MAT.JavaCarafe.CarafeModelBuilder)

        builder = buildInfo.buildModelBuilder()
        
        tmpPath = os.path.join(psaTmp, "modeldocs")
        os.makedirs(tmpPath)
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        builder.run(os.path.join(psaTmp, "tmpmodel"),
                    jsonFiles, docTmpDir = tmpPath, oStream = sys.stdout)

        path = os.path.join(tmpPath, "voa7.txt.json")
        tdoc = _jsonIO.readFromSource(path)
        zones = tdoc.orderAnnotations(["zone"])
        # This used to be >, but PSA no longer does random segmentation.
        self.failUnless(len(zones) == 1)

class PSATestFromTask(CmdlinePluginContextTestCase):

    def testNoPSA(self):

        task = MAT.PluginMgr.LoadPlugins()["Named Entity"]

        noPsaTmp = os.path.join(self.testContext["TMPDIR"], "testnopsafromtask")

        buildInfo = task.getModelInfo()
        builder = buildInfo.buildModelBuilder(training_method = "")
        tmpPath = os.path.join(noPsaTmp, "modeldocs")
        os.makedirs(tmpPath)
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        builder.run(os.path.join(noPsaTmp, "tmpmodel"),
                    jsonFiles, docTmpDir = tmpPath, 
                    oStream = sys.stdout)

        path = os.path.join(tmpPath, "voa7.txt.json")
        tdoc = _jsonIO.readFromSource(path)
        zones = tdoc.orderAnnotations(["zone"])
        self.assertEqual(len(zones), 1)

    def testPSA(self):

        task = MAT.PluginMgr.LoadPlugins()["Named Entity"]

        psaTmp = os.path.join(self.testContext["TMPDIR"], "testpsafromtask")

        buildInfo = task.getModelInfo()
        builder = buildInfo.buildModelBuilder()
        tmpPath = os.path.join(psaTmp, "modeldocs")
        os.makedirs(tmpPath)
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        builder.run(os.path.join(psaTmp, "tmpmodel"),
                    jsonFiles, docTmpDir = tmpPath, 
                    oStream = sys.stdout)

        path = os.path.join(tmpPath, "voa7.txt.json")
        tdoc = _jsonIO.readFromSource(path)
        zones = tdoc.orderAnnotations(["zone"])
        # This used to be >, but PSA no longer does random segmentation.
        self.failUnless(len(zones) == 1)

class TestXML(CmdlinePluginContextTestCase):

    def testXML(self):
        
        task = MAT.PluginMgr.LoadPlugins()["Named Entity"]
        psaTmp = os.path.join(self.testContext["TMPDIR"], "testxml")

        buildInfo = task.getModelInfo()
        builder = buildInfo.buildModelBuilder(file_type = 'xml-inline')
        tmpPath = os.path.join(psaTmp, "modeldocs")
        os.makedirs(tmpPath)
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "xml", "*.xml"))
        builder.run(os.path.join(psaTmp, "tmpmodel"),
                    jsonFiles, docTmpDir = tmpPath, 
                    oStream = sys.stdout)

class BuildInfoTest(CmdlinePluginContextTestCase):

    def testNoConfig(self):

        task = MAT.PluginMgr.LoadPlugins()["Named Entity"]
        self.assertEqual(task.getModelInfo('boohoo'), None)

    def testDefaultConfig(self):

        task = MAT.PluginMgr.LoadPlugins()["Named Entity"]

        psaTmp = os.path.join(self.testContext["TMPDIR"], "testdefaultconfig")
        os.mkdir(psaTmp)
        
        buildInfo = task.getModelInfo()
        builder = buildInfo.buildModelBuilder()
        
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        builder.run(task.getDefaultModel(), jsonFiles,
                    oStream = sys.stdout, tmpDir = psaTmp)
        
        path = os.path.join(psaTmp, "docs", "voa7.txt.json")
        tdoc = _jsonIO.readFromSource(path)
        zones = tdoc.orderAnnotations(["zone"])
        # This used to be >, but PSA no longer does random segmentation.
        self.assertTrue(len(zones) == 1)

    def testNondefaultConfig(self):

        task = MAT.PluginMgr.LoadPlugins()["Named Entity"]

        psaTmp = os.path.join(self.testContext["TMPDIR"], "testnondefaultconfig")
        os.mkdir(psaTmp)
        
        buildInfo = task.getModelInfo(configName = 'alt_model_build')
        builder = buildInfo.buildModelBuilder()
        
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        builder.run(task.getDefaultModel(), jsonFiles,
                    oStream = sys.stdout, tmpDir = psaTmp)
        
        path = os.path.join(psaTmp, "docs", "voa7.txt.json")
        tdoc = _jsonIO.readFromSource(path)
        zones = tdoc.orderAnnotations(["zone"])
        self.assertEqual(len(zones), 1)

import MAT

class CmdlineModelBuildTest(CmdlinePluginContextTestCaseWithTeardown):

    cmdBlock = {"header": "Model build.",
                "cmd": ["%(MAT_PKG_HOME)s/bin/MATModelBuilder",
                        "--task", "Named Entity",
                        "--input_files", "%(MAT_PKG_HOME)s/sample/ne/resources/data/json/*.txt.json",
                        "--model_file", "%(TMPDIR)s/model_file"]}

    def tearDown(self):
        MAT.UnitTest.CmdlinesTestCase.tearDown(self)
        CmdlinePluginContextTestCase.tearDown(self)

class PartialSegmentTest(CmdlinePluginContextTestCase):

    def testPartialSegmentModelBuild(self):
                
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")
        buildInfo = self.task.getModelInfo()
        builder = buildInfo.buildModelBuilder()

        tmpPath = os.path.join(self.testContext["TMPDIR"], "segmenttest")
        docTmpDir = os.path.join(tmpPath, "docTmp")
        os.makedirs(docTmpDir)
        jsonFiles = [docPath]
        # How the hell do I grab the output from the model builder?
        from StringIO import StringIO
        catcher = StringIO()
        import MAT.ExecutionContext
        # Make sure subprocess verbose is on.
        vb = MAT.ExecutionContext._SUBPROCESS_DEBUG
        MAT.ExecutionContext.setSubprocessDebug(10)
        builder.run(os.path.join(tmpPath, "tmpmodel"),
                    jsonFiles, docTmpDir = docTmpDir, oStream = catcher)
        MAT.ExecutionContext.setSubprocessDebug(vb)
        # Find the record of how many features there are.
        m = re.search("There are (\d+) total features:", catcher.getvalue())
        self.failIf(m is None)
        i = int(m.group(1))
        d = _jsonIO.readFromSource(docPath)
        # Find the content annotations, and pick the
        # end of the middle annotation for the place to segment.
        c = d.orderAnnotations(self.task.getAnnotationTypesByCategory('content'))
        midC = c[len(c) / 2]
        segs = d.orderAnnotations(["SEGMENT"])
        # There should be one segment.
        self.failIf(len(segs) != 1)
        oldEnd = segs[0].end
        segs[0].end = midC.end
        d.createAnnotation(midC.end, oldEnd, "SEGMENT", {"status": "non-gold", "annotator": None})
        otherTmpDir = os.path.join(tmpPath, "jsontmp")
        os.makedirs(otherTmpDir)
        otherDocPath = os.path.join(otherTmpDir, "voa1.txt.json")
        _jsonIO.writeToTarget(d, otherDocPath)
        # Now, build the model again.
        catcher = StringIO()
        MAT.ExecutionContext.setSubprocessDebug(10)
        builder.run(os.path.join(tmpPath, "tmpmodel"),
                    [otherDocPath], docTmpDir = docTmpDir, oStream = catcher)
        MAT.ExecutionContext.setSubprocessDebug(vb)
        # Find the record of how many features there are.
        m = re.search("There are (\d+) total features:", catcher.getvalue())
        self.failIf(m is None)
        i2 = int(m.group(1))        
        self.assertTrue(i > i2)

    # I can do better than that. 
    def testPartialSegmentModelBuildBetter(self):
                        
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")
        buildInfo = self.task.getModelInfo()
        builder = buildInfo.buildModelBuilder()

        tmpPath = os.path.join(self.testContext["TMPDIR"], "segmenttest2")
        docTmpDir = os.path.join(tmpPath, "docTmp")
        os.makedirs(docTmpDir)
        d = _jsonIO.readFromSource(docPath)
        # Find the content annotations, and pick the
        # end of the middle annotation for the place to segment.
        c = d.orderAnnotations(self.task.getAnnotationTypesByCategory('content'))
        midC = c[len(c) / 2]
        segs = d.orderAnnotations(["SEGMENT"])
        # There should be one segment.
        self.failIf(len(segs) != 1)
        oldEnd = segs[0].end
        segs[0].end = midC.end
        d.createAnnotation(midC.end, oldEnd, "SEGMENT", {"status": "non-gold", "annotator": None})
        otherTmpDir = os.path.join(tmpPath, "jsontmp")
        os.makedirs(otherTmpDir)
        tmpDocPath = os.path.join(otherTmpDir, "voa1.txt.json")
        _jsonIO.writeToTarget(d, tmpDocPath)
        # Now, get another document, and mark its only segment non-gold, but leave
        # the annotator.
        docPath2 = os.path.join(self.sampleDir, "resources", "data", "json", "voa7.txt.json")
        d2 = _jsonIO.readFromSource(docPath2)
        segs = d2.orderAnnotations(["SEGMENT"])
        for seg in segs:
            seg["status"] = "non-gold"
            seg["annotator"] = "user1"
        tmpDocPath2 = os.path.join(otherTmpDir, "voa7.txt.json")
        _jsonIO.writeToTarget(d2, tmpDocPath2)
        
        # Now, build the model. First, use all the docs. Then, use the modified docs,
        # with the non-gold regions. Then, use the modified docs, without the non-gold regions.

        modelDir = os.path.join(tmpPath, "tmpmodel")
        builder.run(modelDir,
                    [docPath, docPath2], docTmpDir = docTmpDir, collectCorpusStatistics = True)
        fullStats = builder.corpusStatistics
        if os.path.isdir(modelDir):
            shutil.rmtree(modelDir)
        else:
            os.remove(modelDir)
        
        buildInfo = self.task.getModelInfo()
        builder = buildInfo.buildModelBuilder()
        builder.run(modelDir,
                    [tmpDocPath, tmpDocPath2], docTmpDir = docTmpDir, collectCorpusStatistics = True)
        segmentStats = builder.corpusStatistics
        if os.path.isdir(modelDir):
            shutil.rmtree(modelDir)
        else:
            os.remove(modelDir)

        buildInfo = self.task.getModelInfo()
        builder = buildInfo.buildModelBuilder(partial_training_on_gold_only = True)
        builder.run(modelDir,
                    [tmpDocPath, tmpDocPath2], docTmpDir = docTmpDir, collectCorpusStatistics = True)
        goldOnlyStats = builder.corpusStatistics
        if os.path.isdir(modelDir):
            shutil.rmtree(modelDir)
        else:
            os.remove(modelDir)

        # So now, what do we expect?

        # First, we expect the first and second to use 2 docs, and the third
        # only 1.
        self.assertEqual(2, fullStats["totalDocuments"])
        self.assertEqual(2, segmentStats["totalDocuments"])
        self.assertEqual(1, goldOnlyStats["totalDocuments"])

        # Next, we expect the total number of tokens in the segmentStats
        # to be less than the fullStats.
        self.assertTrue(fullStats["totalTokens"] > segmentStats["totalTokens"])

    # I want to test this, eventually, when I manage to capture the error and
    # display it intelligently. But I can't do that yet.
    
    def notestNoAnnotationsError(self):

        docPath = os.path.join(self.sampleDir, "resources", "data", "raw", "voa1.txt")
        buildInfo = self.task.getModelInfo()
        builder = buildInfo.buildModelBuilder()

        tmpPath = os.path.join(self.testContext["TMPDIR"], "noannotstest")
        docTmpDir = os.path.join(tmpPath, "docTmp")
        os.makedirs(docTmpDir)
        d = MAT.DocumentIO.getDocumentIO("raw", encoding = "ascii").readFromSource(docPath)
        for annot in d.getAnnotations(["SEGMENT"]):
            annot["status"] = "human gold"
        docPath2 = os.path.join(tmpPath, "tmpdoc")
        _jsonIO.writeToTarget(d, docPath2)
        modelDir = os.path.join(tmpPath, "tmpmodel")
        builder.run(modelDir, [docPath2], docTmpDir = docTmpDir)

class WhitespaceCorpusStatisticsTest(CmdlinePluginContextTestCase):

    def _generateTestDoc(self, signal, tupList):
        d = MAT.Document.AnnotatedDoc(signal = signal, globalTypeRepository = self.task.getAnnotationTypeRepository())
        for s, lab in tupList:
            sIndex = signal.find(s)
            rIndex = sIndex + len(s)
            d.createAnnotation(sIndex, rIndex, lab)
        import re
        for m in re.finditer("\S+", signal):
            d.createAnnotation(m.start(), m.end(), "lex")
        return d
    
    def testBiggerByOne(self):

        signal = u"The future President in our United States of America has announced his resignation."

        hypD = self._generateTestDoc(signal, [("President ", "PERSON")])
        
        buildInfo = self.task.getModelInfo()
        builder = buildInfo.buildModelBuilder()
        thisTotalItems, thisTotalItemTokens, thisTotalItemsByTag, \
                            thisTotalTokens, thisTotalItemTokensByTag = \
                            builder.collectDocumentStatistics(hypD, [(0, len(signal))])
        self.assertEqual(thisTotalItemTokens, 1)
        self.assertEqual(thisTotalItemTokensByTag["PERSON"], 1)
        
    def testSmallerByOne(self):

        signal = u"The future President in our United States of America has announced his resignation."

        hypD = self._generateTestDoc(signal, [("Presiden", "PERSON"), ("tates", "LOCATION")])
        
        buildInfo = self.task.getModelInfo()
        builder = buildInfo.buildModelBuilder()
        thisTotalItems, thisTotalItemTokens, thisTotalItemsByTag, \
                            thisTotalTokens, thisTotalItemTokensByTag = \
                            builder.collectDocumentStatistics(hypD, [(0, len(signal))])
        self.assertEqual(thisTotalItemTokens, 0)
        self.assertEqual(thisTotalItemTokensByTag["PERSON"], 0)
        self.assertEqual(thisTotalItemTokensByTag["LOCATION"], 0)
        
        

