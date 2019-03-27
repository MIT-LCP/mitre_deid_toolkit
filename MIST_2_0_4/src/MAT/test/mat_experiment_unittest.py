# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from mat_unittest_resources import CmdlinePluginContextTestCase, PluginContextTestCase, \
     CmdlinePluginContextTestCaseWithTeardown
import MAT
import os, shutil
    
# Test the experiment engine. We have to make sure that the sample ne task is there.

MV_HEADERS = ["precision_mean",
              "precision_variance",
              "recall_mean",
              "recall_variance",
              "fmeasure_mean",
              "fmeasure_variance",
              "tag_sensitive_accuracy_mean",
              "tag_sensitive_accuracy_variance",
              "tag_sensitive_error_rate_mean",
              "tag_sensitive_error_rate_variance",
              "tag_blind_accuracy_mean",
              "tag_blind_accuracy_variance",
              "tag_blind_error_rate_mean",
              "tag_blind_error_rate_variance"]

class SampleExperimentTestCase(CmdlinePluginContextTestCaseWithTeardown):

    def runTest(self):
        self.runCmdblock(header = "Run a sample experiment.",
                         tmpdir = "%(TMPDIR)s/sample_ne_exp",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATExperimentEngine",
                                "--exp_dir",
                                "%(TMPDIR)s/sample_ne_exp",
                                "--pattern_dir",
                                "%(MAT_PKG_HOME)s/sample/ne/resources/data/json",
                                "%(MAT_PKG_HOME)s/sample/ne/test/exp/exp.xml"])
        # Now, check the scores to ensure that they have variance columns in them.
        expDir = os.path.join(self.testContext["TMPDIR"], "sample_ne_exp")
        import csv
        fp = open(os.path.join(expDir, "allbytoken_excel.csv"), "r")
        row = csv.reader(fp).next()
        fp.close()
        for header in MV_HEADERS:
            self.failUnless(header in row)
        fp = open(os.path.join(expDir, "runs", "test_run", "ne_model", "bytoken_excel.csv"), "r")
        row = csv.reader(fp).next()
        fp.close()
        for header in MV_HEADERS:
            self.failUnless(header in row)

# The detailed tests are over in mat_workspace_unittest.py. Here, we're just
# making sure the overall syntax works.

class SampleWorkspaceExperimentTestCase(CmdlinePluginContextTestCaseWithTeardown):

    def runTest(self):
        # Set up a workspace, first. Some gold, some not.
        wsDir = os.path.join(self.testContext["TMPDIR"], "testWorkspace")
        
        w = MAT.Workspace.Workspace(wsDir, taskName = "Named Entity", create = True,
                                    initialUsers = ["user1"])
        import glob
        docs = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "voa[1-8].txt.json"))

        w.importFiles(docs, "core", strip_suffix = ".txt.json")

        docs = [os.path.join(self.sampleDir, "resources", "data", "raw", "voa9.txt"),
                os.path.join(self.sampleDir, "resources", "data", "raw", "voa10.txt")]
        
        w.importFiles(docs, "core", file_type = "raw", strip_suffix = ".txt")

        self.runCmdblock(header = "Run a sample experiment.",
                         tmpdir = "%(TMPDIR)s/sample_ne_exp_ws",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATExperimentEngine",
                                "--exp_dir",
                                "%(TMPDIR)s/sample_ne_exp_ws",
                                "--pattern_dir",
                                "%(MAT_PKG_HOME)s/sample/ne/resources/data/json",
                                "--binding",
                                "WS="+wsDir,
                                "%(MAT_PKG_HOME)s/sample/ne/test/exp/exp_workspace.xml"])
        # Now, check the scores to ensure that they have variance columns in them.
        expDir = os.path.join(self.testContext["TMPDIR"], "sample_ne_exp_ws")
        import csv
        fp = open(os.path.join(expDir, "allbytoken_excel.csv"), "r")
        row = csv.reader(fp).next()
        fp.close()
        for header in MV_HEADERS:
            self.failUnless(header in row)
        fp = open(os.path.join(expDir, "runs", "test", "test", "bytoken_excel.csv"), "r")
        row = csv.reader(fp).next()
        fp.close()
        for header in MV_HEADERS:
            self.failUnless(header in row)
        
    

class SampleExperimentSplitTestCase(CmdlinePluginContextTestCaseWithTeardown):

    def runTest(self):
        self.runCmdblock(header = "Run a sample experiment.",
                         tmpdir = "%(TMPDIR)s/sample_ne_split_exp",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATExperimentEngine",
                                "--exp_dir",
                                "%(TMPDIR)s/sample_ne_split_exp",
                                "--pattern_dir",
                                "%(MAT_PKG_HOME)s/sample/ne/resources/data/json",
                                "%(MAT_PKG_HOME)s/sample/ne/test/exp/exp_split.xml"])
        # Now, check the scores to ensure that they have variance columns in them.
        expDir = os.path.join(self.testContext["TMPDIR"], "sample_ne_split_exp")
        import csv
        fp = open(os.path.join(expDir, "allbytoken_excel.csv"), "r")
        row = csv.reader(fp).next()
        fp.close()
        for header in MV_HEADERS:
            self.failUnless(header in row)
        fp = open(os.path.join(expDir, "runs", "test", "test", "bytoken_excel.csv"), "r")
        row = csv.reader(fp).next()
        fp.close()
        for header in MV_HEADERS:
            self.failUnless(header in row)

class SampleExperimentInCodeTestCase(PluginContextTestCase):

    def runTest(self):

        # I'm going to run a simple experiment, constructed from objects.
        expDir = os.path.join(self.testContext["TMPDIR"], "sample_ne_exp_in_code")
        os.makedirs(expDir)
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        from MAT.CarafeTrain import ExperimentEngine, PreparedCorpus, TrainingRun, TestRun
        e = ExperimentEngine(dir = expDir, task = self.task,
                             corpora = [PreparedCorpus("test", partitions = [("train", 4), ("test", 1)],
                                                       filePats = ["*.json"], prefix = patternDir)],
                             models = [TrainingRun("test", trainingCorpora = [("test", "train")])],
                             runs = [TestRun("test", model = "test", testCorpora = [("test", "test")],
                                             engineOptions = {"steps": "zone,tokenize,tag", "workflow": "Demo"})])
        e.run()
        
        # Now, check the scores to ensure that they have variance columns in them.
        import csv
        fp = open(os.path.join(expDir, "allbytoken_excel.csv"), "r")
        row = csv.reader(fp).next()
        fp.close()
        for header in MV_HEADERS:
            self.failUnless(header in row)
        fp = open(os.path.join(expDir, "runs", "test", "test", "bytoken_excel.csv"), "r")
        row = csv.reader(fp).next()
        fp.close()
        for header in MV_HEADERS:
            self.failUnless(header in row)
        
    def tearDown(self):
        PluginContextTestCase.tearDown(self)
        shutil.rmtree(os.path.join(self.testContext["TMPDIR"], "sample_ne_exp_in_code"))

class SampleExperimentTestCaseNoConfidence(CmdlinePluginContextTestCaseWithTeardown):

    def runTest(self):
        self.runCmdblock(header ="Run a sample experiment.",
                         tmpdir = "%(TMPDIR)s/sample_ne_exp",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATExperimentEngine",
                                "--dont_compute_confidence",
                                "--exp_dir",
                                "%(TMPDIR)s/sample_ne_exp",
                                "--pattern_dir",
                                "%(MAT_PKG_HOME)s/sample/ne/resources/data/json",
                                "%(MAT_PKG_HOME)s/sample/ne/test/exp/exp.xml"])
        # Now, check the scores to ensure that they don't have variance columns in them.
        expDir = os.path.join(self.testContext["TMPDIR"], "sample_ne_exp")
        import csv
        fp = open(os.path.join(expDir, "allbytoken_excel.csv"), "r")
        row = csv.reader(fp).next()
        fp.close()
        for header in MV_HEADERS:
            self.failIf(header in row)
        fp = open(os.path.join(expDir, "runs", "test_run", "ne_model", "bytoken_excel.csv"), "r")
        row = csv.reader(fp).next()
        fp.close()
        for header in MV_HEADERS:
            self.failIf(header in row)

class SampleExperimentTestCaseIterative(CmdlinePluginContextTestCaseWithTeardown):

    cmdBlock = {"header": "Run a sample experiment.",
                "tmpdir": "%(TMPDIR)s/sample_ne_exp",
                "cmd": ["%(MAT_PKG_HOME)s/bin/MATExperimentEngine",
                        "--exp_dir",
                        "%(TMPDIR)s/sample_ne_exp",
                        "--pattern_dir",
                        "%(MAT_PKG_HOME)s/sample/ne/resources/data/json",
                        "%(MAT_PKG_HOME)s/sample/ne/test/exp/exp_iterative.xml"]}

class SampleExperimentTestCaseXMLInput(CmdlinePluginContextTestCaseWithTeardown):

    cmdBlock = {"header": "Run a sample experiment.",
                "tmpdir": "%(TMPDIR)s/sample_ne_exp",
                "cmd": ["%(MAT_PKG_HOME)s/bin/MATExperimentEngine",
                        "--exp_dir",
                        "%(TMPDIR)s/sample_ne_exp",
                        "--pattern_dir",
                        "%(MAT_PKG_HOME)s/sample/ne/resources/data/xml",
                        "%(MAT_PKG_HOME)s/sample/ne/test/exp/exp_xml_input.xml"]}

class SampleExperimentTestCaseXMLSimpleInput(CmdlinePluginContextTestCaseWithTeardown):

    cmdBlock = {"header": "Run a sample experiment.",
                "tmpdir": "%(TMPDIR)s/sample_ne_exp",
                "cmd": ["%(MAT_PKG_HOME)s/bin/MATExperimentEngine",
                        "--exp_dir",
                        "%(TMPDIR)s/sample_ne_exp",
                        "--pattern_dir",
                        "%(MAT_PKG_HOME)s/sample/ne/resources/data/xml_simple",
                        "%(MAT_PKG_HOME)s/sample/ne/test/exp/exp_xml_simple_input.xml"]}

class SampleExperimentTestCaseBatchTestRuns(CmdlinePluginContextTestCaseWithTeardown):

    cmdBlock = {"header": "Run a sample experiment.",
                "tmpdir": "%(TMPDIR)s/sample_ne_exp",
                "cmd": ["%(MAT_PKG_HOME)s/bin/MATExperimentEngine",
                        "--batch_test_runs",
                        "--exp_dir",
                        "%(TMPDIR)s/sample_ne_exp",
                        "--pattern_dir",
                        "%(MAT_PKG_HOME)s/sample/ne/resources/data/json",
                        "%(MAT_PKG_HOME)s/sample/ne/test/exp/exp.xml"]}

class SampleExperimentWithoutDirTestCase(CmdlinePluginContextTestCaseWithTeardown):

    cmdBlock = {"header": "Run a sample experiment.",
                "cmd": ["%(MAT_PKG_HOME)s/bin/MATExperimentEngine",
                        "--batch_test_runs",
                        "--exp_dir",
                        "%(TMPDIR)s/sample_ne_exp",
                        "--pattern_dir",
                        "%(MAT_PKG_HOME)s/sample/ne/resources/data/json",
                        "%(MAT_PKG_HOME)s/sample/ne/test/exp/exp.xml"]}

    def tearDown(self):
        CmdlinePluginContextTestCaseWithTeardown.tearDown(self)
        shutil.rmtree(os.path.join(self.testContext["TMPDIR"], "sample_ne_exp"))

# And do it again with the ENAMEX-style, because there are all sorts
# of bugs lurking there.

class EnamexSampleExperimentTestCase(CmdlinePluginContextTestCaseWithTeardown):

    cmdBlock = {"header": "Run a sample experiment.",
                "tmpdir": "%(TMPDIR)s/sample_ne_enamex_exp",
                "cmd": ["%(MAT_PKG_HOME)s/bin/MATExperimentEngine",
                        "--exp_dir",
                        "%(TMPDIR)s/sample_ne_enamex_exp",
                        "--pattern_dir",
                        "%(MAT_PKG_HOME)s/sample/ne_enamex/resources/data/json",
                        "%(MAT_PKG_HOME)s/sample/ne_enamex/test/exp/exp.xml"]}

    def setUp(self):
        CmdlinePluginContextTestCaseWithTeardown.setUp(self, subdir = "ne_enamex")

class EnamexSampleExperimentWithoutDirTestCase(CmdlinePluginContextTestCaseWithTeardown):

    cmdBlock = {"header": "Run a sample experiment.",
                "cmd": ["%(MAT_PKG_HOME)s/bin/MATExperimentEngine",
                        "--exp_dir",
                        "%(TMPDIR)s/sample_ne_enamex_exp",
                        "--pattern_dir",
                        "%(MAT_PKG_HOME)s/sample/ne_enamex/resources/data/json",
                        "%(MAT_PKG_HOME)s/sample/ne_enamex/test/exp/exp.xml"]}

    def setUp(self):
        CmdlinePluginContextTestCaseWithTeardown.setUp(self, subdir = "ne_enamex")

    def tearDown(self):
        CmdlinePluginContextTestCaseWithTeardown.tearDown(self)
        shutil.rmtree(os.path.join(self.testContext["TMPDIR"], "sample_ne_enamex_exp"))

class SampleExperimentTestCaseLimitedUndo(CmdlinePluginContextTestCaseWithTeardown):

    def runTest(self):
        self.runCmdblock(header ="Run a sample experiment.",
                         tmpdir = "%(TMPDIR)s/sample_ne_exp",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATExperimentEngine",
                                "--exp_dir",
                                "%(TMPDIR)s/sample_ne_exp",
                                "--pattern_dir",
                                "%(MAT_PKG_HOME)s/sample/ne/resources/data/xml_simple",
                                "%(MAT_PKG_HOME)s/sample/ne/test/exp/exp_xml_limited_undo.xml"])
        # Now, check the run input to ensure that it still has phases done, and that
        # there are zone and lex tags, but no content tags.
        expDir = os.path.join(self.testContext["TMPDIR"], "sample_ne_exp")
        runInputDir = os.path.join(expDir, "runs", "test", "test", "run_input")
        # Grab the first document.
        doc = os.path.join(runInputDir, os.listdir(runInputDir)[0])
        d = MAT.DocumentIO.getDocumentIO("mat-json").readFromSource(doc)
        self.assertTrue("zone" in d.getStepsDone())
        self.assertTrue("tokenize" in d.getStepsDone())
        self.assertTrue("tag" not in d.getStepsDone())
        self.assertTrue(len(d.getAnnotations(self.task.getAnnotationTypesByCategory("token"))) > 0)
        self.assertTrue(len(d.getAnnotations(self.task.getAnnotationTypesByCategory("zone"))) > 0)
        self.assertTrue(len(d.getAnnotations(self.task.getAnnotationTypesByCategory("content"))) == 0) 

# I'm getting absolutely fed up with defining new XML files over and over and over.

# Must be CmdlinePlugin instead of Plugin because I'm not passing
# in a plugin dictionary.

class ExperimentInheritedCorpusTestCase(CmdlinePluginContextTestCase):

    REMOTE_CORPUS_XML = """
<experiment task='Named Entity'>
  <corpora dir="corpora">
    <partition name="sp1" fraction=".3"/>
    <partition name="sp2" fraction=".3"/>
    <partition name="sp3" fraction=".4"/>
    <corpus name="test">
      <pattern>*.json</pattern>
    </corpus>
  </corpora>
</experiment>"""
    
    LOCAL_CORPUS_XML = """
<experiment task='Named Entity'>
  <corpora dir="corpora">
    <corpus name="local_test" source_corpus_dir="../inherited_split/corpora/test"/>
  </corpora>
</experiment>"""
    
    LOCAL_CORPUS_XML_WITH_VAR = """
<experiment task='Named Entity'>
  <binding name="OTHERDIR" value="../inherited_split/corpora/test"/>
  <corpora dir="corpora">
    <corpus name="local_test" source_corpus_dir="$(EXP_DIR)/$(OTHERDIR)"/>
  </corpora>
</experiment>"""
    
    LOCAL_CORPUS_XML_WITH_SPLIT = """
<experiment task='Named Entity'>
  <corpora dir="corpora">
    <partition name="sp4" fraction=".5"/>
    <partition name="sp5" fraction=".5"/>
    <corpus name="local_test" source_corpus_dir="../inherited_split/corpora/test"/>
  </corpora>
</experiment>"""

    LOCAL_CORPUS_XML_WITH_LIMIT = """
<experiment task='Named Entity'>
  <corpora dir="corpora">
    <size max_size="5"/>
    <corpus name="local_test" source_corpus_dir="../inherited_split/corpora/test"/>
  </corpora>
</experiment>"""

    REMOTE_CORPUS_XML_WITH_LIMIT = """
<experiment task='Named Entity'>
  <corpora dir="corpora">
    <size max_size="5"/>
    <partition name="sp1" fraction=".3"/>
    <partition name="sp2" fraction=".3"/>
    <partition name="sp3" fraction=".4"/>
    <corpus name="test">
      <pattern>*.json</pattern>
    </corpus>
  </corpora>
</experiment>"""

    LOCAL_CORPUS_XML_WITH_BIG_LIMIT = """
<experiment task='Named Entity'>
  <corpora dir="corpora">
    <size max_size="10"/>
    <corpus name="local_test" source_corpus_dir="../inherited_split/corpora/test"/>
  </corpora>
</experiment>"""
    
    REMOTE_CORPUS_XML_WITH_TRUNCATION = """
<experiment task='Named Entity'>
  <corpora dir="corpora">
    <size max_size="5" truncate_document_list="yes"/>
    <partition name="sp1" fraction=".3"/>
    <partition name="sp2" fraction=".3"/>
    <partition name="sp3" fraction=".4"/>
    <corpus name="test">
      <pattern>*.json</pattern>
    </corpus>
  </corpora>
</experiment>"""

    REMOTE_CORPUS_XML_WITH_PREP = """
<experiment task='Named Entity'>
  <corpora dir="corpora">
    <prep workflow="Demo" steps="" input_file_type="mat-json"/>
    <partition name="sp1" fraction=".3"/>
    <partition name="sp2" fraction=".3"/>
    <partition name="sp3" fraction=".4"/>
    <corpus name="test">
      <pattern>*.json</pattern>
    </corpus>
  </corpora>
</experiment>"""

    def testInheritedSplit(self):

        expDir = os.path.join(self.testContext["TMPDIR"], "inherited_split")
        os.makedirs(expDir)
        fp = open(os.path.join(expDir, "exp.xml"), "w")
        fp.write(self.REMOTE_CORPUS_XML)
        fp.close()

        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        
        from MAT.CarafeTrain import ExperimentEngine, fromXML
        e1 = ExperimentEngine(**fromXML(os.path.join(expDir, "exp.xml"),
                                        corpusPrefix = patternDir,                              
                                        dir = expDir))
        e1.run()

        # Now, let's build a new directory.

        expLocalDir = os.path.join(self.testContext["TMPDIR"], "inherited_split_local")
        os.makedirs(expLocalDir)
        fp = open(os.path.join(expLocalDir, "exp.xml"), "w")
        fp.write(self.LOCAL_CORPUS_XML)
        fp.close()
        
        e2 = ExperimentEngine(**fromXML(os.path.join(expLocalDir, "exp.xml"),
                                        dir = expLocalDir))
        e2.run()

        remoteCorpus = e1.corporaTable["test"]
        localCorpus = e2.corporaTable["local_test"]
        for k in remoteCorpus.partitionDict.keys():
            self.assertEqual(set(remoteCorpus.getFiles(partition = k)), 
                             set(localCorpus.getFiles(partition = k)))

    def testInheritedSplitWithVar(self):

        expDir = os.path.join(self.testContext["TMPDIR"], "inherited_split")
        os.makedirs(expDir)
        fp = open(os.path.join(expDir, "exp.xml"), "w")
        fp.write(self.REMOTE_CORPUS_XML)
        fp.close()

        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        
        from MAT.CarafeTrain import ExperimentEngine, fromXML
        e1 = ExperimentEngine(**fromXML(os.path.join(expDir, "exp.xml"),
                                        corpusPrefix = patternDir,                              
                                        dir = expDir))
        e1.run()

        # Now, let's build a new directory.

        expLocalDir = os.path.join(self.testContext["TMPDIR"], "inherited_split_local")
        os.makedirs(expLocalDir)
        fp = open(os.path.join(expLocalDir, "exp.xml"), "w")
        fp.write(self.LOCAL_CORPUS_XML_WITH_VAR)
        fp.close()
        
        e2 = ExperimentEngine(**fromXML(os.path.join(expLocalDir, "exp.xml"),
                                        dir = expLocalDir))
        e2.run()

        remoteCorpus = e1.corporaTable["test"]
        localCorpus = e2.corporaTable["local_test"]
        for k in remoteCorpus.partitionDict.keys():
            self.assertEqual(set(remoteCorpus.getFiles(partition = k)), 
                             set(localCorpus.getFiles(partition = k))) 

    def testInheritedSplitWithLimit(self):

        expDir = os.path.join(self.testContext["TMPDIR"], "inherited_split")
        os.makedirs(expDir)
        fp = open(os.path.join(expDir, "exp.xml"), "w")
        fp.write(self.REMOTE_CORPUS_XML_WITH_LIMIT)
        fp.close()

        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        
        from MAT.CarafeTrain import ExperimentEngine, fromXML
        e1 = ExperimentEngine(**fromXML(os.path.join(expDir, "exp.xml"),
                                        corpusPrefix = patternDir,                              
                                        dir = expDir))
        e1.run()

        remoteCorpus = e1.corporaTable["test"]
        for k in remoteCorpus.partitionDict.keys():
            self.assertTrue(set(remoteCorpus.getFiles(partition = k)) < set(remoteCorpus.partitionDict[k]))
        self.assertEqual(len(remoteCorpus.getFiles()), 5)
        # And the truncated partitions must equal the truncate file list.
        allFiles = []
        for k in remoteCorpus.partitionDict.keys():
            allFiles += remoteCorpus.getFiles(partition = k)
        self.assertEqual(len(allFiles), len(remoteCorpus.getFiles()))
        self.assertEqual(set(allFiles), set(remoteCorpus.getFiles()))

        # Now, let's build a new directory.

        expLocalDir = os.path.join(self.testContext["TMPDIR"], "inherited_split_local")
        os.makedirs(expLocalDir)
        fp = open(os.path.join(expLocalDir, "exp.xml"), "w")
        fp.write(self.LOCAL_CORPUS_XML)
        fp.close()
        
        e2 = ExperimentEngine(**fromXML(os.path.join(expLocalDir, "exp.xml"),
                                        dir = expLocalDir))
        e2.run()

        localCorpus = e2.corporaTable["local_test"]
        for k in remoteCorpus.partitionDict.keys():
            # But the files shouldn't have been changed.
            self.assertEqual(set(remoteCorpus.partitionDict[k]), set(localCorpus.partitionDict[k]))        

    def testLimitOverride(self):

        expDir = os.path.join(self.testContext["TMPDIR"], "inherited_split")
        os.makedirs(expDir)
        fp = open(os.path.join(expDir, "exp.xml"), "w")
        fp.write(self.REMOTE_CORPUS_XML_WITH_LIMIT)
        fp.close()

        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        
        from MAT.CarafeTrain import ExperimentEngine, fromXML
        e1 = ExperimentEngine(**fromXML(os.path.join(expDir, "exp.xml"),
                                        corpusPrefix = patternDir,                              
                                        dir = expDir))
        e1.run()

        # Now, let's build a new directory.

        expLocalDir = os.path.join(self.testContext["TMPDIR"], "inherited_split_local")
        os.makedirs(expLocalDir)
        fp = open(os.path.join(expLocalDir, "exp.xml"), "w")
        fp.write(self.LOCAL_CORPUS_XML_WITH_BIG_LIMIT)
        fp.close()
        
        e2 = ExperimentEngine(**fromXML(os.path.join(expLocalDir, "exp.xml"),
                                        dir = expLocalDir))
        e2.run()

        localCorpus = e2.corporaTable["local_test"]
        self.assertEqual(len(localCorpus.getFiles()), 10)

    def testSplitOverride(self):

        expDir = os.path.join(self.testContext["TMPDIR"], "inherited_split")
        os.makedirs(expDir)
        fp = open(os.path.join(expDir, "exp.xml"), "w")
        fp.write(self.REMOTE_CORPUS_XML_WITH_LIMIT)
        fp.close()

        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        
        from MAT.CarafeTrain import ExperimentEngine, fromXML
        e1 = ExperimentEngine(**fromXML(os.path.join(expDir, "exp.xml"),
                                        corpusPrefix = patternDir,                              
                                        dir = expDir))
        e1.run()

        # Now, let's build a new directory.

        expLocalDir = os.path.join(self.testContext["TMPDIR"], "inherited_split_local")
        os.makedirs(expLocalDir)
        fp = open(os.path.join(expLocalDir, "exp.xml"), "w")
        fp.write(self.LOCAL_CORPUS_XML_WITH_SPLIT)
        fp.close()
        
        e2 = ExperimentEngine(**fromXML(os.path.join(expLocalDir, "exp.xml"),
                                        dir = expLocalDir))
        e2.run()

        localCorpus = e2.corporaTable["local_test"]
        self.assertEqual(set(localCorpus.partitionDict.keys()), set(["sp4", "sp5"]))
        self.assertEqual(len(localCorpus.getFiles()), 5)
        allFiles = []
        for k in localCorpus.partitionDict.keys():
            allFiles += localCorpus.getFiles(partition = k)
        self.assertEqual(set(localCorpus.getFiles()), set(allFiles))

    def testRemoteTruncate(self):

        expDir = os.path.join(self.testContext["TMPDIR"], "inherited_split")
        os.makedirs(expDir)
        fp = open(os.path.join(expDir, "exp.xml"), "w")
        fp.write(self.REMOTE_CORPUS_XML_WITH_TRUNCATION)
        fp.close()

        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        
        from MAT.CarafeTrain import ExperimentEngine, fromXML
        e1 = ExperimentEngine(**fromXML(os.path.join(expDir, "exp.xml"),
                                        corpusPrefix = patternDir,                              
                                        dir = expDir))
        e1.run()

        # Now, let's build a new directory.

        expLocalDir = os.path.join(self.testContext["TMPDIR"], "inherited_split_local")
        os.makedirs(expLocalDir)
        fp = open(os.path.join(expLocalDir, "exp.xml"), "w")
        fp.write(self.LOCAL_CORPUS_XML_WITH_BIG_LIMIT)
        fp.close()
        
        e2 = ExperimentEngine(**fromXML(os.path.join(expLocalDir, "exp.xml"),
                                        dir = expLocalDir))
        e2.run()

        localCorpus = e2.corporaTable["local_test"]
        # 5, even though I asked for ten, because the remote corpus
        # is already truncated.
        self.assertEqual(len(localCorpus.getFiles()), 5)

    
    def testPrep(self):

        expDir = os.path.join(self.testContext["TMPDIR"], "inherited_split")
        os.makedirs(expDir)
        fp = open(os.path.join(expDir, "exp.xml"), "w")
        fp.write(self.REMOTE_CORPUS_XML_WITH_PREP)
        fp.close()

        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        
        from MAT.CarafeTrain import ExperimentEngine, fromXML
        e1 = ExperimentEngine(**fromXML(os.path.join(expDir, "exp.xml"),
                                        corpusPrefix = patternDir,                              
                                        dir = expDir))
        e1.run()

        # So now, we should have the expDir directory as the prefix for all
        # the documents in the corpus.
        
        remoteCorpus = e1.corporaTable["test"]
        prepPath = os.path.join(e1.dir, "corpora", "test", "preprocessed", "out")
        for f in remoteCorpus.getFiles():            
            self.assertTrue(f.startswith(prepPath))

    def testPrepWithLocalSplit(self):

        expDir = os.path.join(self.testContext["TMPDIR"], "inherited_split")
        os.makedirs(expDir)
        fp = open(os.path.join(expDir, "exp.xml"), "w")
        fp.write(self.REMOTE_CORPUS_XML_WITH_PREP)
        fp.close()

        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        
        from MAT.CarafeTrain import ExperimentEngine, fromXML
        e1 = ExperimentEngine(**fromXML(os.path.join(expDir, "exp.xml"),
                                        corpusPrefix = patternDir,                              
                                        dir = expDir))
        e1.run()
        
        expLocalDir = os.path.join(self.testContext["TMPDIR"], "inherited_split_local")
        os.makedirs(expLocalDir)
        fp = open(os.path.join(expLocalDir, "exp.xml"), "w")
        fp.write(self.LOCAL_CORPUS_XML_WITH_SPLIT)
        fp.close()
        
        e2 = ExperimentEngine(**fromXML(os.path.join(expLocalDir, "exp.xml"),
                                        dir = expLocalDir))
        e2.run()

        localCorpus = e2.corporaTable["local_test"]
        prepPath = os.path.join(e1.dir, "corpora", "test", "preprocessed", "out")
        for f in localCorpus.getFiles():
            self.assertTrue(f.startswith(prepPath))

    def testInheritedSplitWithLocalLimit(self):

        expDir = os.path.join(self.testContext["TMPDIR"], "inherited_split")
        os.makedirs(expDir)
        fp = open(os.path.join(expDir, "exp.xml"), "w")
        fp.write(self.REMOTE_CORPUS_XML)
        fp.close()

        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        
        from MAT.CarafeTrain import ExperimentEngine, fromXML
        e1 = ExperimentEngine(**fromXML(os.path.join(expDir, "exp.xml"),
                                        corpusPrefix = patternDir,                              
                                        dir = expDir))
        e1.run()

        # Now, let's build a new directory.

        expLocalDir = os.path.join(self.testContext["TMPDIR"], "inherited_split_local")
        os.makedirs(expLocalDir)
        fp = open(os.path.join(expLocalDir, "exp.xml"), "w")
        fp.write(self.LOCAL_CORPUS_XML_WITH_LIMIT)
        fp.close()
        
        e2 = ExperimentEngine(**fromXML(os.path.join(expLocalDir, "exp.xml"),
                                        dir = expLocalDir))
        e2.run()

        remoteCorpus = e1.corporaTable["test"]
        localCorpus = e2.corporaTable["local_test"]
        for k in remoteCorpus.partitionDict.keys():
            self.assertTrue(set(remoteCorpus.getFiles(partition = k)) >= set(localCorpus.getFiles(partition = k)))
            # But the files shouldn't have been changed.
            self.assertEqual(set(remoteCorpus.partitionDict[k]), set(localCorpus.partitionDict[k]))
        self.assertEqual(len(localCorpus.getFiles()), 5)

    def testInheritedSplitWithTruncation(self):

        expDir = os.path.join(self.testContext["TMPDIR"], "inherited_split")
        os.makedirs(expDir)
        fp = open(os.path.join(expDir, "exp.xml"), "w")
        fp.write(self.REMOTE_CORPUS_XML_WITH_TRUNCATION)
        fp.close()

        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        
        from MAT.CarafeTrain import ExperimentEngine, fromXML
        e1 = ExperimentEngine(**fromXML(os.path.join(expDir, "exp.xml"),
                                        corpusPrefix = patternDir,                              
                                        dir = expDir))
        e1.run()

        remoteCorpus = e1.corporaTable["test"]
        for k in remoteCorpus.partitionDict.keys():
            self.assertEqual(set(remoteCorpus.getFiles(partition = k)),
                             set(remoteCorpus.partitionDict[k]))
        # And the truncated partitions must equal the truncate file list.
        allFiles = []
        for k in remoteCorpus.partitionDict.keys():
            allFiles += remoteCorpus.getFiles(partition = k)
        self.assertEqual(len(allFiles), len(remoteCorpus.getFiles()))
        self.assertEqual(set(allFiles), set(remoteCorpus.getFiles()))

        # Now, let's build a new directory.

        expLocalDir = os.path.join(self.testContext["TMPDIR"], "inherited_split_local")
        os.makedirs(expLocalDir)
        fp = open(os.path.join(expLocalDir, "exp.xml"), "w")
        fp.write(self.LOCAL_CORPUS_XML)
        fp.close()
        
        e2 = ExperimentEngine(**fromXML(os.path.join(expLocalDir, "exp.xml"),
                                        dir = expLocalDir))
        e2.run()

        localCorpus = e2.corporaTable["local_test"]
        self.assertEqual(len(localCorpus.getFiles()), 5)

    def tearDown(self):
        CmdlinePluginContextTestCase.tearDown(self)
        # If the tests failed, we don't want to make things worse.
        try:
            shutil.rmtree(os.path.join(self.testContext["TMPDIR"], "inherited_split"))
        except:
            pass
        try:
            shutil.rmtree(os.path.join(self.testContext["TMPDIR"], "inherited_split_local"))
        except:
            pass

class ExperimentManyIterationsTestCase(CmdlinePluginContextTestCase):

    def runTest(self):
        
        expDir = os.path.join(self.testContext["TMPDIR"], "many_iterators")
        os.makedirs(expDir)

        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        expFile = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "test", "exp", "exp_many_iterators.xml")
        from MAT.CarafeTrain import ExperimentEngine, fromXML
        e = ExperimentEngine(**fromXML(expFile,
                                       corpusPrefix = patternDir,                              
                                       dir = expDir))
        e.run()
        # Now, we examine the result. 6 models, 18 runs. There's no particular order for the
        # models - corpus iterations may or may not come before build iterations. Actually,
        # if I'm going to respect "innermost", build iterations have to come last.
        # So the order of the file sizes with max_iterations from 2 to 6 by 2
        # and corpus from 4 to 8 by 4 should be: 4 4 4 8 8 8.
        allInstances = e.getModel("test").allInstances
        self.assertEqual(len(allInstances), 6)
        self.assertEqual([len(m.trainingSet.getFiles()) for m in allInstances],
                         [4, 4, 4, 8, 8, 8])
        self.assertTrue(set(allInstances[0].trainingSet.getFiles()) < set(allInstances[3].trainingSet.getFiles()))
        self.assertTrue(set(allInstances[1].trainingSet.getFiles()) < set(allInstances[4].trainingSet.getFiles()))
        self.assertTrue(set(allInstances[2].trainingSet.getFiles()) < set(allInstances[5].trainingSet.getFiles()))
        self.assertTrue(set(allInstances[0].trainingSet.getFiles())
                        == set(allInstances[1].trainingSet.getFiles())
                        == set(allInstances[2].trainingSet.getFiles()))
        self.assertEqual([m.engineSettings["max_iterations"] for m in allInstances],
                         [2, 4, 6, 2, 4, 6])
        # The runs have a similar structure.
        allRuns = e.runTable["test"].allInstances
        self.assertEqual(len(allRuns), 18)
        self.assertEqual([r.engineOptions["prior_adjust"] for r in allRuns],
                         [-1.0, 0.0, 1.0] * 6)

class ExperimentRestartedCorpusSizeIteratorTestCase(CmdlinePluginContextTestCase):

    def runTest(self):
        # What's the test look like? Seems to me that I need to create a corpus,
        # build a model, and then restart in the same directory. The chances of
        # the same elements being chosen in the same order for multiple runs
        # is very, very slim.
        
        expDir = os.path.join(self.testContext["TMPDIR"], "restarted_size_iterators")
        os.makedirs(expDir)

        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        expFile = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "test", "exp", "exp_iterative.xml")
        from MAT.CarafeTrain import ExperimentEngine, CorpusSizeIterator, PreparedCorpus, TrainingRun, _unmarkDone
        e = ExperimentEngine(dir = expDir, task = self.task,
                             corpora = [PreparedCorpus("test", partitions = [("train", 4), ("test", 1)],
                                                       filePats = ["*.json"], prefix = patternDir)],
                             models = [TrainingRun("test", trainingCorpora = [("test", "train")],
                                                   iterators = [CorpusSizeIterator(startVal = 6, increment = 1)])])
        e.run()
        # Now, let's retrieve the training set files. They won't be
        # in order, because of the shuffling, so I'm going to need to
        # look specifically at the next-to-last iteration.
        allInstances = e.getModel("test").allInstances
        self.assertEqual(len(allInstances), 3)
        self.assertEqual([len(m.trainingSet.getFiles()) for m in allInstances],
                         [6, 7, 8])
        firstSet = allInstances[0].trainingSet.getFiles()
        secondSet = allInstances[1].trainingSet.getFiles()[:]
        thirdSet = allInstances[2].trainingSet.getFiles()[:]
        # Now, mark 7 and 8 as not done.
        _unmarkDone(allInstances[1].modelDir)
        _unmarkDone(allInstances[2].modelDir)
        # Get a new experiment object, and rerun.
        e = ExperimentEngine(dir = expDir, task = self.task,
                             corpora = [PreparedCorpus("test", partitions = [("train", 4), ("test", 1)],
                                                       filePats = ["*.json"], prefix = patternDir)],
                             models = [TrainingRun("test", trainingCorpora = [("test", "train")],
                                                   iterators = [CorpusSizeIterator(startVal = 6, increment = 1)])])
        e.run()
        allInstances = e.getModel("test").allInstances
        self.assertEqual(set(secondSet), set(allInstances[1].trainingSet.getFiles()))
