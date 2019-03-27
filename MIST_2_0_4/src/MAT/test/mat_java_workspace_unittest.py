# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from mat_unittest_resources import PluginContextTestCase, CmdlinePluginContextTestCase, \
     CmdlinePluginContextTestCaseWithTeardown
import MAT

_jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')

import os, sys

# Here, we test the subset of things that's available from
# the Java client, via the Web server. We have to start up
# a Web server for each test, unfortunately.

class WorkspaceCmdlineTestCase(CmdlinePluginContextTestCaseWithTeardown, 
                               MAT.UnitTest.CherryPyTestMixin):

    def setUp(self):
        CmdlinePluginContextTestCaseWithTeardown.setUp(self)
        self.workspace = os.path.join(self.testContext["TMPDIR"], "testWorkspace")
        self.wsObjs = []
        if os.path.isdir(self.workspace):            
            import shutil
            shutil.rmtree(self.workspace)
        if sys.platform == "win32":
            self.ws_client_script = "%(MAT_PKG_HOME)s/lib/mat/java/bin/matclient.bat"
        elif sys.platform == "cygwin":
            self.ws_client_script = None
        else:
            self.ws_client_script = "%(MAT_PKG_HOME)s/lib/mat/java/bin/matclient.sh"

    # The objects created here must be closed in
    # the thread cleanup. Note that sometimes I open the DB at the end
    # of the operation in order to check things. In
    # Windows, you can't delete the DB file if
    # there's an open connection to it. So let's force
    # the close. And the close has to happen in the
    # same thread.
    
    def _createWorkspace(self, **kw):
        w = MAT.Workspace.Workspace(self.workspace, **kw)
        self.wsObjs.append(w)
        return w

    def _workspaceTearDown(self):
        for w in self.wsObjs:
            w.closeDB()
        self.wsObjs = []

    def tearDown(self):
        CmdlinePluginContextTestCaseWithTeardown.tearDown(self)
        if os.path.isdir(self.workspace):
            import shutil
            shutil.rmtree(self.workspace)
    
    def testStrippedJSONImport(self):

        if sys.platform == "cygwin":
            print >> sys.stderr, "Skipping test because of shell script problems Java native on Cygwin."
        else:
            self.runFunctionUnderCherryPy(self._testStrippedJSONImport,
                                          "woie6Efkejfl3",
                                          threadCleanup = self._workspaceTearDown)

    def _testStrippedJSONImport(self, port, wsKey):
        
        self.runCmdblock(header = "Stripped JSON import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.workspace,
                                "create", "--initial_users", "user1",
                                "--task",
                                "Named Entity"])

        # Now, let's use some sample files. Let's import some files.
        # Import some raw files to raw, unprocessed, some to completed.
        # Do it in multiple batches, check the contents of the
        # directories at each point. Make sure that when we
        # import things to completed that the signal in the
        # raw processed file is identical to the signal in the
        # document.

        import glob, random

        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        random.shuffle(jsonFiles)

        # Select a few raw files. There are 10 of each.

        someJsonFiles = jsonFiles[:3]


        # MATCgiWorkspaceClientDemo url workspace workspace_key operation folder basename [ attr=val ... ]
        for x in someJsonFiles:
            self.runCmdblock(header = "Do the import.",
                             cmd = [self.ws_client_script,
                                    "http://localhost:%d" % port,
                                    "workspace",
                                    "--strip_suffix",
                                    '.txt.json',
                                    self.workspace,
                                    wsKey,
                                    "import_file",
                                    'core',
                                    x])

        # Don't forget to close the DB.
        w = self._createWorkspace()
        
        # Check to see whether the files are there.

        basenames = [os.path.basename(p)[:-9] for p in someJsonFiles]
        basenames.sort()

        completedContents = [r[1] for r in w.getDB().basenameInfo(basenames) if r[2] == "reconciled"]
        completedContents.sort()

        contentsFromFolder = w.folders["core"].getBasenames()
        contentsFromFolder.sort()
        
        self.assertEqual(completedContents, basenames)
        self.assertEqual(contentsFromFolder, basenames)

        # Open a second instance of the workspace, and get the basenames.

        w2 = self._createWorkspace()
        otherBasenames = w2.getBasenames()
        otherBasenames.sort()

        self.assertEqual(completedContents, otherBasenames)

        # Now, copy some more, including files that we've already
        # copied.

        someJsonFiles = jsonFiles[:7]

        for x in jsonFiles[3:7]:
            self.runCmdblock(header = "Do the import.",
                             cmd = [self.ws_client_script,
                                    "http://localhost:%d" % port,
                                    "workspace",
                                    "--strip_suffix",
                                    ".txt.json",
                                    self.workspace,
                                    wsKey,
                                    "import_file",
                                    'core',
                                    x])

        basenames = [os.path.basename(p)[:-9] for p in someJsonFiles]
        basenames.sort()

        completedContents = [r[1] for r in w.getDB().basenameInfo(basenames) if r[2] == "reconciled"]
        completedContents.sort()

        contentsFromFolder = w.folders["core"].getBasenames()
        contentsFromFolder.sort()

        # Note that this will fail if the automatic reload of already-opened
        # workspaces is broken.
        
        self.assertEqual(completedContents, basenames)
        self.assertEqual(contentsFromFolder, basenames)
                
        # Open a second instance of the workspace, and get the basenames.

        w2 = self._createWorkspace()
        otherBasenames = w2.getBasenames()
        otherBasenames.sort()

        self.assertEqual(completedContents, otherBasenames)

    def testModelBuildPlusAutotag(self):

        if sys.platform == "cygwin":
            print >> sys.stderr, "Skipping test because of shell script problems Java native on Cygwin."
        else:
            # I don't much care about whether we test model building. I DO care about
            # the autotag.
            self.runFunctionUnderCherryPy(self._testModelBuildPlusAutotag,
                                          "woie6Efkejfl3",
                                          threadCleanup = self._workspaceTearDown)
            
    def _testModelBuildPlusAutotag(self, port, wsKey):

        # Import half the JSON files to completed, the rest of the
        # raw to raw, unprocessed. Then modelbuild plus autotag,
        # then autotag again with a limited set of basenames.
       
        self.runCmdblock(header = "Model build.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.workspace,
                                "create", "--initial_users", "user1",
                                "--task",
                                "Named Entity"])

        import glob, random

        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        random.shuffle(jsonFiles)
        someJsonFiles = jsonFiles[:5]

        # Pull them into completed, without worrying about remote operation.

        self.runCmdblock(header = "Do the import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.workspace,
                                "import",
                                "--strip_suffix",
                                ".txt.json",
                                'core'] + someJsonFiles)

        # Now, grab the rest of them:

        txtFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))

        # Import them. We'll hit an error if we try to import the same files again, so
        # we have to filter them.

        self.runCmdblock(header = "Do the import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.workspace,
                                "import",
                                "--strip_suffix",
                                ".txt", "--file_type", "raw",
                                'core'] + \
                         [x for x in txtFiles if x.replace(os.sep + "raw" + os.sep, os.sep + "json" + os.sep) + ".json" not in someJsonFiles])

        # Now, let's modelbuild and autotag. Let's only autotag some
        # of the available files.

        w = self._createWorkspace()

        txtBasenames = [r[1] for r in w.getDB().basenameInfo(w.getDB().allBasenames()) if r[2] == "unannotated"]

        random.shuffle(txtBasenames)

        self.runCmdblock(header = "Build the model.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.workspace,
                                'modelbuild', "core"])
        
        # Now, we autotag a single document (because that's all we can do here).

        self.runCmdblock(header = "Autotag.",
                         cmd = [self.ws_client_script,
                                "http://localhost:%d" % port,
                                "workspace_file",
                                self.workspace,
                                wsKey,
                                "autotag",
                                'core',
                                txtBasenames[0]])

        self.assertEqual([txtBasenames[0]], [r[1] for r in w.getDB().basenameInfo(w.getDB().allBasenames()) if r[2] == "uncorrected"])
        self.assertEqual(set(txtBasenames[1:]), set([r[1] for r in w.getDB().basenameInfo(w.getDB().allBasenames()) if r[2] == "unannotated"]))
