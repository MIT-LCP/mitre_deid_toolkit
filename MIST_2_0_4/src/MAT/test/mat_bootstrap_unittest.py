# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from mat_unittest_resources import PluginContextTestCase
import MAT
import os, shutil

# Testing the simpler bootstrapper.

class BootstrapBasicTestCase(PluginContextTestCase):

    def setUp(self):
        PluginContextTestCase.setUp(self)
        self.expDir = os.path.join(self.testContext["TMPDIR"], "sample_ne_exp_in_code")
        os.makedirs(self.expDir)
                
    def tearDown(self):
        PluginContextTestCase.tearDown(self)
        shutil.rmtree(self.expDir)

class SimpleBootstrapTestCase(BootstrapBasicTestCase):
        
    def testSimple(self):
        # I'm going to do a simple boostrap, constructed from objects.
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        from MAT.Bootstrap import Bootstrapper, DocumentSet, TrainingRun, TestRun
        e = Bootstrapper(dir = self.expDir, task = self.task,
                         corpora = [DocumentSet("test", partitions = [("train", 4), ("test", 1)],
                                                filePats = ["*.json"], prefix = patternDir)],
                         models = [TrainingRun("test", trainingCorpora = [("test", "train")])],
                         runs = [TestRun("test", model = "test", testCorpora = [("test", "test")],
                                         engineOptions = {"steps": "zone,tokenize,tag", "workflow": "Demo"})])
        e.run()
        # OK, now we need to make sure that there's a model, and that in the
        # run input and the hyp input, there are two files each, whose names are
        # the prefix of the test slice of the test corpus.
        self.assertTrue(len(e.getModel("test").allInstances) == 1)
        m = e.getModel("test").allInstances[0]
        self.assertTrue(os.path.exists(os.path.join(m.modelDir, "model")))
        files = e.corporaTable["test"].getFiles(partition = "test")
        self.assertEqual(len(files), 2)
        self.assertEqual(len(m.trainingSet.getFiles()), 8)
        self.assertTrue(len(e.runTable["test"].allInstances) == 1)
        r = e.runTable["test"].allInstances[0]
        runDir = r.runDir
        for file in files:
            self.assertTrue(os.path.exists(os.path.join(runDir, "hyp", os.path.basename(file)) + ".prepped.tag.json"))
            self.assertTrue(os.path.exists(os.path.join(runDir, "run_input", os.path.basename(file)) + ".prepped"))

    def testFiveWay(self):
        # I'm going to do a simple boostrap, constructed from objects.
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        from MAT.Bootstrap import Bootstrapper, DocumentSet, TrainingRun, TestRun
        e = Bootstrapper(dir = self.expDir, task = self.task,
                         corpora = [DocumentSet("test",
                                                partitions = [("s1", 1), ("s2", 1), ("s3", 1), ("s4", 1), ("s5", 1)],
                                                filePats = ["*.json"], prefix = patternDir)],
                         models = [TrainingRun("s1234", trainingCorpora = [("test", "s1"),
                                                                           ("test", "s2"),
                                                                           ("test", "s3"),
                                                                           ("test", "s4")]),
                                   TrainingRun("s1235", trainingCorpora = [("test", "s1"),
                                                                           ("test", "s2"),
                                                                           ("test", "s3"),
                                                                           ("test", "s5")]),
                                   TrainingRun("s1245", trainingCorpora = [("test", "s1"),
                                                                           ("test", "s2"),
                                                                           ("test", "s4"),
                                                                           ("test", "s5")]),
                                   TrainingRun("s1345", trainingCorpora = [("test", "s1"),
                                                                           ("test", "s3"),
                                                                           ("test", "s4"),
                                                                           ("test", "s5")]),
                                   TrainingRun("s2345", trainingCorpora = [("test", "s2"),
                                                                           ("test", "s3"),
                                                                           ("test", "s4"),
                                                                           ("test", "s5")])],
                         runs = [TestRun("s1", model = "s2345", testCorpora = [("test", "s1")],
                                         engineOptions = {"steps": "zone,tokenize,tag", "workflow": "Demo"}),
                                 TestRun("s2", model = "s1345", testCorpora = [("test", "s2")],
                                         engineOptions = {"steps": "zone,tokenize,tag", "workflow": "Demo"}),
                                 TestRun("s3", model = "s1245", testCorpora = [("test", "s3")],
                                         engineOptions = {"steps": "zone,tokenize,tag", "workflow": "Demo"}),
                                 TestRun("s4", model = "s1235", testCorpora = [("test", "s4")],
                                         engineOptions = {"steps": "zone,tokenize,tag", "workflow": "Demo"}),
                                 TestRun("s5", model = "s1234", testCorpora = [("test", "s5")],
                                         engineOptions = {"steps": "zone,tokenize,tag", "workflow": "Demo"})])
        e.run()
        # OK, now we need to make sure that there's a model, and that in the
        # run input and the hyp input, there are two files each, whose names are
        # the prefix of the test slice of the test corpus.
        for m, mTemplate in e.modelSetTable.items():
            self.assertTrue(len(mTemplate.allInstances) == 1)
            self.assertTrue(os.path.exists(os.path.join(e.getModelDir(mTemplate.allInstances[0]), "model")))
            self.assertEqual(len(mTemplate.allInstances[0].trainingSet.getFiles()), 8)
        for p in ["s1", "s2", "s3", "s4", "s5"]:
            files = e.corporaTable["test"].getFiles(partition = p)
            self.assertEqual(len(files), 2)
            r = e.runTable[p]
            self.assertTrue(len(r.allInstances) == 1)
            runDir = r.allInstances[0].runDir
            for file in files:
                self.assertTrue(os.path.exists(os.path.join(runDir, "hyp", os.path.basename(file)) + ".prepped.tag.json"))
                self.assertTrue(os.path.exists(os.path.join(runDir, "run_input", os.path.basename(file)) + ".prepped"))

class BootstrapIncrementTestCase(BootstrapBasicTestCase):

    def testIncrement(self):
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        from MAT.Bootstrap import Bootstrapper, DocumentSet, TrainingRun, TestRun, IncrementIterator
        e = Bootstrapper(dir = self.expDir, task = self.task,
                         corpora = [DocumentSet("test", partitions = [("train", 4), ("test", 1)],
                                                filePats = ["*.json"], prefix = patternDir)],
                         models = [TrainingRun("test", trainingCorpora = [("test", "train")],
                                               iterators = [IncrementIterator("engineSettings", "max_iterations",
                                                                              4, 8, 2)])],
                         runs = [TestRun("test", model = "test", testCorpora = [("test", "test")],
                                         engineOptions = {"steps": "zone,tokenize,tag", "workflow": "Demo"})])
        e.run()
        # OK, this works. There should be a subdirectory for each model.
        self.assertTrue(len(e.getModel("test").allInstances) == 3)
        for m in e.getModel("test").allInstances:
            self.assertTrue(os.path.exists(os.path.join(m.modelDir, "model")))
            self.assertEqual(len(m.trainingSet.getFiles()), 8)
        self.assertEqual([m.engineSettings["max_iterations"] for m in e.getModel("test").allInstances], [4, 6, 8])
        self.assertEqual([m.modelSubdir for m in e.getModel("test").allInstances],
                         ["test_max_iterations_4", "test_max_iterations_6", "test_max_iterations_8"])
        files = e.corporaTable["test"].getFiles(partition = "test")
        self.assertEqual(len(files), 2)
        self.assertTrue(len(e.runTable["test"].allInstances) == 3)
        for r in e.runTable["test"].allInstances:            
            runDir = r.runDir
            for file in files:
                self.assertTrue(os.path.exists(os.path.join(runDir, "hyp", os.path.basename(file)) + ".prepped.tag.json"))
                self.assertTrue(os.path.exists(os.path.join(runDir, "run_input", os.path.basename(file)) + ".prepped"))
        self.assertEqual([os.path.basename(r.runDir) for r in e.runTable["test"].allInstances],
                         ["test_max_iterations_4", "test_max_iterations_6", "test_max_iterations_8"])

    def testIncrementNoLastStep(self):
        # There should be a difference between forceLast and not forceLast.
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        from MAT.Bootstrap import Bootstrapper, DocumentSet, TrainingRun, TestRun, IncrementIterator
        e = Bootstrapper(dir = self.expDir, task = self.task,
                         corpora = [DocumentSet("test", partitions = [("train", 4), ("test", 1)],
                                                filePats = ["*.json"], prefix = patternDir)],
                         models = [TrainingRun("test", trainingCorpora = [("test", "train")],
                                               iterators = [IncrementIterator("engineSettings", "max_iterations",
                                                                              4, 7, 2)])])
        e.run()
        # OK, this works. There should be a subdirectory for each model.
        self.assertTrue(len(e.getModel("test").allInstances) == 2)

    def testIncrementLastStep(self):
        # There should be a difference between forceLast and not forceLast.
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        from MAT.Bootstrap import Bootstrapper, DocumentSet, TrainingRun, TestRun, IncrementIterator
        e = Bootstrapper(dir = self.expDir, task = self.task,
                         corpora = [DocumentSet("test", partitions = [("train", 4), ("test", 1)],
                                                filePats = ["*.json"], prefix = patternDir)],
                         models = [TrainingRun("test", trainingCorpora = [("test", "train")],
                                               iterators = [IncrementIterator("engineSettings", "max_iterations",
                                                                              4, 7, 2, forceLast = True)])])
        e.run()
        # OK, this works. There should be a subdirectory for each model.
        self.assertTrue(len(e.getModel("test").allInstances) == 3)

    def testDoubleModelIncrement(self):
        # Forcing last here because of float rounding.
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        from MAT.Bootstrap import Bootstrapper, DocumentSet, TrainingRun, TestRun, IncrementIterator
        e = Bootstrapper(dir = self.expDir, task = self.task,
                         corpora = [DocumentSet("test", partitions = [("train", 4), ("test", 1)],
                                                filePats = ["*.json"], prefix = patternDir)],
                         models = [TrainingRun("test", trainingCorpora = [("test", "train")],
                                               engineSettings = {"l1": True},
                                               iterators = [IncrementIterator("engineSettings", "max_iterations",
                                                                              4, 8, 2),
                                                            IncrementIterator("engineSettings", "l1_c",
                                                                              0.1, 0.3, .1, forceLast = True)])])
        e.run()
        self.assertTrue(len(e.getModel("test").allInstances) == 9)
        self.assertEqual([m.engineSettings["max_iterations"] for m in e.getModel("test").allInstances],
                         [4, 4, 4, 6, 6, 6, 8, 8, 8])
        self.assertEqual([str(m.engineSettings["l1_c"]) for m in e.getModel("test").allInstances],
                         ['0.1', '0.2', '0.3','0.1', '0.2', '0.3','0.1', '0.2', '0.3'])
        self.assertEqual([m.engineSettings["l1"] for m in e.getModel("test").allInstances],
                         [True] * 9)
        self.assertEqual([m.modelSubdir for m in e.getModel("test").allInstances],
                         ["test_max_iterations_4_l1_c_0_1", "test_max_iterations_4_l1_c_0_2",
                          "test_max_iterations_4_l1_c_0_3",
                          "test_max_iterations_6_l1_c_0_1", "test_max_iterations_6_l1_c_0_2",
                          "test_max_iterations_6_l1_c_0_3",
                          "test_max_iterations_8_l1_c_0_1", "test_max_iterations_8_l1_c_0_2",
                          "test_max_iterations_8_l1_c_0_3"])

    def testModelPlusRunIncrement(self):
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        from MAT.Bootstrap import Bootstrapper, DocumentSet, TrainingRun, TestRun, IncrementIterator
        e = Bootstrapper(dir = self.expDir, task = self.task,
                         corpora = [DocumentSet("test", partitions = [("train", 4), ("test", 1)],
                                                filePats = ["*.json"], prefix = patternDir)],
                         models = [TrainingRun("test", trainingCorpora = [("test", "train")],
                                               iterators = [IncrementIterator("engineSettings", "max_iterations",
                                                                              4, 8, 2)])],
                         runs = [TestRun("test", model = "test", testCorpora = [("test", "test")],
                                         engineOptions = {"steps": "zone,tokenize,tag", "workflow": "Demo"},
                                         iterators = [IncrementIterator("engineOptions", "prior_adjust",
                                                                        -1, 1, 1)])])
        e.run()
        # OK, this works. There should be a subdirectory for each model.
        self.assertTrue(len(e.getModel("test").allInstances) == 3)
        self.assertEqual([m.engineSettings["max_iterations"] for m in e.getModel("test").allInstances], [4, 6, 8])
        self.assertEqual([m.modelSubdir for m in e.getModel("test").allInstances],
                         ["test_max_iterations_4", "test_max_iterations_6", "test_max_iterations_8"])
        self.assertTrue(len(e.runTable["test"].allInstances) == 9)
        # Interleaved, so model dominant.
        self.assertEqual([(os.path.basename(os.path.dirname(r.runDir)), os.path.basename(r.runDir))
                          for r in e.runTable["test"].allInstances],
                         [("test_prior_adjust__1", "test_max_iterations_4"),
                          ("test_prior_adjust_0", "test_max_iterations_4"),
                          ("test_prior_adjust_1", "test_max_iterations_4"),
                          ("test_prior_adjust__1", "test_max_iterations_6"),
                          ("test_prior_adjust_0", "test_max_iterations_6"),
                          ("test_prior_adjust_1", "test_max_iterations_6"),
                          ("test_prior_adjust__1", "test_max_iterations_8"),
                          ("test_prior_adjust_0", "test_max_iterations_8"),
                          ("test_prior_adjust_1", "test_max_iterations_8")])

class CorpusSizeTestCase(BootstrapBasicTestCase):

    def testCorpusSizeSimple(self):
        # There should be a difference between forceLast and not forceLast.
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        from MAT.Bootstrap import Bootstrapper, DocumentSet, TrainingRun, TestRun, CorpusSizeIterator
        e = Bootstrapper(dir = self.expDir, task = self.task,
                         corpora = [DocumentSet("test", partitions = [("train", 4), ("test", 1)],
                                                filePats = ["*.json"], prefix = patternDir)],
                         models = [TrainingRun("test", trainingCorpora = [("test", "train")],
                                               iterators = [CorpusSizeIterator(2)])])
        e.run()
        # OK, this works. There should be a subdirectory for each model.
        allInstances = e.getModel("test").allInstances
        self.assertEqual(len(allInstances), 4)
        self.assertEqual([len(m.trainingSet.getFiles()) for m in allInstances],
                         [2, 4, 6, 8])
        self.assertTrue(set(allInstances[0].trainingSet.getFiles()) < set(allInstances[1].trainingSet.getFiles()))
        self.assertTrue(set(allInstances[1].trainingSet.getFiles()) < set(allInstances[2].trainingSet.getFiles()))
        self.assertTrue(set(allInstances[2].trainingSet.getFiles()) < set(allInstances[3].trainingSet.getFiles()))

class DocumentRandomizationTestCase(BootstrapBasicTestCase):

    # The order of documents in both the partitioned and nonpartitioned cases should be
    # random. The chances of this test failing by accident are 1 in 10 million.

    def testDocumentSetRandomization(self):
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        from MAT.Bootstrap import DocumentSet
        fList = [DocumentSet("test", filePats = ["*.json"], prefix = patternDir).files[0] for i in range(8)]
        self.assertNotEqual(fList, [fList[0]] * 8)

    def testDocumentSetPartitionRandomization(self):
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        from MAT.Bootstrap import DocumentSet
        dList = [DocumentSet("test", partitions = [("train", 4), ("test", 1)],
                             filePats = ["*.json"], prefix = patternDir) for i in range(8)]
        self.assertNotEqual([d.getFiles("train") for d in dList],
                            [dList[0].getFiles("train")] * 8)
        self.assertNotEqual([d.getFiles("test") for d in dList],
                            [dList[0].getFiles("test")] * 8)


class FixedBootstrapTestCase(BootstrapBasicTestCase):
        
    def testSimple(self):
        # I'm going to do a simple boostrap, constructed from objects.
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne", "resources", "data", "json")
        from MAT.Bootstrap import Bootstrapper, DocumentSet, TrainingRun, TestRun
        e = Bootstrapper(dir = self.expDir, task = self.task,
                         corpora = [DocumentSet("test", partitions = [("train", 3),
                                                                      ("test", DocumentSet.FIXED_PARTITION_REMAINDER)],
                                                partitionIsFixed = True,
                                                filePats = ["*.json"], prefix = patternDir)],
                         models = [TrainingRun("test", trainingCorpora = [("test", "train")])],
                         runs = [TestRun("test", model = "test", testCorpora = [("test", "test")],
                                         engineOptions = {"steps": "zone,tokenize,tag", "workflow": "Demo"})])
        e.run()
        # OK, now we need to make sure that there's a model, and that in the
        # run input and the hyp input, there are two files each, whose names are
        # the prefix of the test slice of the test corpus.
        self.assertTrue(len(e.getModel("test").allInstances) == 1)
        m = e.getModel("test").allInstances[0]
        self.assertTrue(os.path.exists(os.path.join(m.modelDir, "model")))
        files = e.corporaTable["test"].getFiles(partition = "test")
        self.assertEqual(len(files), 7)
        self.assertEqual(len(m.trainingSet.getFiles()), 3)
        self.assertTrue(len(e.runTable["test"].allInstances) == 1)
        r = e.runTable["test"].allInstances[0]
        runDir = r.runDir
        for file in files:
            self.assertTrue(os.path.exists(os.path.join(runDir, "hyp", os.path.basename(file)) + ".prepped.tag.json"))
            self.assertTrue(os.path.exists(os.path.join(runDir, "run_input", os.path.basename(file)) + ".prepped"))
