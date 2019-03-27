# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from mat_unittest_resources import PluginContextTestCase, CmdlinePluginContextTestCase
import MAT
_jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')

import os, sys, shutil

# Now, we test the workspaces. If I have any sense, I'll write the tests
# as I go along.

# First test. I don't need any additional plugins.

class WorkspaceErrorTestCase(MAT.UnitTest.MATTestCase):

    def testNonexistent(self):
        
        workspace = os.path.join(self.testContext["TMPDIR"], "testWorkspace")
        if os.path.isdir(workspace):
            import shutil
            shutil.rmtree(workspace)
        # Ensure we're getting an operation error on a nonexistent
        # workspace.
        try:
            MAT.Workspace.Workspace(workspace)
            self.fail("access of nonexistent workspace didn't fail")
        except MAT.Workspace.WorkspaceError, err:
            self.failUnless(str(err).find("no workspace at") > -1)

    def testBadDir(self):
        
        workspace = os.path.join(self.testContext["TMPDIR"], "testWorkspace")
        if not os.path.isdir(workspace):
            os.mkdir(workspace)
        # Ensure we're getting an operation error on a nonexistent
        # workspace.
        try:
            MAT.Workspace.Workspace(workspace)
            self.fail("access of bad workspace dir didn't fail")
        except MAT.Workspace.WorkspaceError, err:
            self.failUnless(str(err).find("not a legal workspace") > -1)
        import shutil
        shutil.rmtree(workspace)

class WorkspaceBaseTestCase(CmdlinePluginContextTestCase):

    def setUp(self):
        CmdlinePluginContextTestCase.setUp(self)
        self.wdir = os.path.join(self.testContext["TMPDIR"], "testWorkspace")
        if os.path.isdir(self.wdir):
            import shutil
            shutil.rmtree(self.wdir)
        self.workspaces = []

    def _createWorkspace(self, **kw):
        w = MAT.Workspace.Workspace(self.wdir, **kw)
        self.workspaces.append(w)
        return w        

    def tearDown(self):
        CmdlinePluginContextTestCase.tearDown(self)
        # Note that sometimes I open the DB at the end
        # of the operation in order to check things. In
        # Windows, you can't delete the DB file if
        # there's an open connection to it. So let's force
        # the close.
        for w in self.workspaces:
            w.closeDB()
        if os.path.isdir(self.wdir):
            import shutil
            shutil.rmtree(self.wdir)
                
class WorkspaceCoreTestCase(WorkspaceBaseTestCase):

    # This is only interesting if there are multiple tasks defined.
    # So we'd better make sure there are multiple tasks defined.
    
    def testNoTask(self):

        # Ensure we're getting an operation error on a nonexistent
        # workspace.
        if len(self.pDict.keys()) < 2:
            k, v = self.pDict.items()[0]
            # Just duplicate it for the moment. No harm done.
            self.pDict[k + "00000"] = v
        try:
            self._createWorkspace(create = True, pluginDir = self.pDict,
                                  initialUsers = ["user1"])
            self.fail("access of bad workspace dir didn't fail")
        except MAT.Workspace.WorkspaceError, err:
            self.failUnless(str(err).find("no task specified") > -1)

    def testSettings(self):

        w = self._createWorkspace(taskName = "Named Entity",
                                  create = True, maxOldModels = 3,
                                  initialUsers = ["user1"])
        w2 = self._createWorkspace()
        self.assertEqual(w.maxOldModels, w2.maxOldModels)

    def testPermissions(self):
        # Note that only the read-only bit can be set in Windows.
        # Actually, none of the permission stuff appears to work.
        # It seems that os.access and os.chmod don't interact
        # correctly, even if I use stat.S_IREAD like the docs say.
        w = self._createWorkspace(taskName = "Named Entity",
                                  create = True, maxOldModels = 3,
                                  initialUsers = ["user1"])
        # Now, fiddle with the permissions.
        if sys.platform != "win32":
            curPerms = os.stat(self.wdir).st_mode        
            os.chmod(self.wdir, 0)
            try:
                self._createWorkspace()
                # BE SURE TO CHANGE IT BACK.
                os.chmod(self.wdir, curPerms)
                self.fail("bad permissions didn't fail")
            except MAT.Workspace.WorkspaceError, err:
                # BE SURE TO CHANGE IT BACK.
                os.chmod(self.wdir, curPerms)
                self.failUnless(str(err).find("insufficient permissions") > -1)
            os.chmod(self.wdir, curPerms)
        if sys.platform != "win32":
            curPerms = os.stat(w.modelDir).st_mode
            import stat
            # Make it read/execute. Should be accessible for reading
            # but not writing.
            os.chmod(w.modelDir, stat.S_IRUSR | stat.S_IXUSR)

            w2 = self._createWorkspace()
            # BE SURE TO CHANGE IT BACK.
            if not w2.dirsAccessible(forWriting = False):
                os.chmod(w.modelDir, curPerms)
                self.fail("dirs not accessible in read-only mode")
            if w2.dirsAccessible():
                os.chmod(w.modelDir, curPerms)
                self.fail("dirs accessible in rw mode")
            os.chmod(w.modelDir, curPerms)

    def testEngineCantWrite(self):
        
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob
        rawFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))

        try:        
            e = MAT.ToolChain.MATEngine(workflow = 'Demo', task = 'Named Entity')
            e.Run(input_file = rawFiles[0], input_file_type = "raw",
                  output_file = os.path.join(self.wdir, "folders", "core", "foo"),
                  output_file_type = "mat-json")
            self.fail("writing to workspace didn't fail")
        except MAT.ToolChain.ConfigurationError, err:
            self.failUnless(str(err).find("can't write to a workspace") > -1)

        try:        
            e = MAT.ToolChain.MATEngine(workflow = 'Demo', task = 'Named Entity')
            e.Run(input_dir = os.path.join(self.sampleDir, "resources", "data", "raw"),
                  input_file_type = "raw",
                  output_dir = os.path.join(self.wdir, "folders", "core"),
                  output_file_type = "mat-json")
            self.fail("writing to workspace didn't fail")
        except MAT.ToolChain.ConfigurationError, err:
            self.failUnless(str(err).find("can't write to a workspace") > -1)

    def testBadImport(self):

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob
        rawFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))

        try:
            w.importFiles(rawFiles, "export")
            self.fail("importing to unimportable folder didn't fail")
        except MAT.Workspace.WorkspaceError, err:
            self.failUnless(str(err).find("unimportable folder") > -1)

    def testImportToolchainError(self):
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob
        rawFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))
        # Change the operation settings for import.
        opDict = w.task.getWorkspaceOperations()
        opDict['import']['workflow'] = 'Tokenless hand annotation'
        # This should fail with a WorkspaceError; any other error is a problem.
        try:
            w.importFiles(rawFiles, "core", file_type = "raw")
            self.fail("bad import didn't fail")
        except MAT.Workspace.WorkspaceError, e:
            pass
        except:
            self.fail("threw wrong error")        

    def testImportFileType(self):

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])
        # Try importing a JSON file as XML inline.
        jsonFile = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")

        # Next, try to import the JSON file using XML.

        try:
            w.importFiles([jsonFile], "core", fileIO = MAT.DocumentIO.getDocumentIO("xml-inline"))
            self.fail("importing json to completed using xml didn't fail")
        except MAT.Workspace.WorkspaceError, err:
            self.failUnless(str(err).find("import operation failed") > -1)

        # Next, try to import an XML file using JSON.
        
        xmlFile1 = os.path.join(self.sampleDir, "resources", "data", "xml", "voa1.xml")
        
        try:
            w.importFiles([xmlFile1], "core", fileIO = _jsonIO)
            self.fail("importing xml to completed using json  didn't fail")
        except MAT.Workspace.WorkspaceError, err:
            self.failUnless(str(err).find("import operation failed") > -1)

        # Now, try it again using the default, which should be JSON.
        
        try:
            w.importFiles([xmlFile1], "core")
            self.fail("importing xml to completed using json didn't fail")
        except MAT.Workspace.WorkspaceError, err:
            self.failUnless(str(err).find("import operation failed") > -1)

        # Now, really import it. Then, we read the document and check the signal type
        # in the metadata. If we imported it using XML overlay, then it should
        # have signal_type xml.

        w.importFiles([xmlFile1], "core", fileIO = MAT.DocumentIO.getDocumentIO("xml-inline", task = self.task),
                      users = "user1")
        d, lockId = w.openWorkspaceFile("core", os.path.basename(xmlFile1), user = "user1")
        self.assertEqual(d.metadata.get("signal_type"), None)

        xmlFile2 = os.path.join(self.sampleDir, "resources", "data", "xml", "voa2.xml")

        w.importFiles([xmlFile2], "core",
                      fileIO = MAT.DocumentIO.getDocumentIO("xml-inline", xml_input_is_overlay = True, task = self.task),
                      users = "user1")
        d, lockId = w.openWorkspaceFile("core", os.path.basename(xmlFile2), user = "user1")
        self.assertEqual(d.metadata.get("signal_type"), "xml")

    def testUnassignedImport(self):

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        xmlFile1 = os.path.join(self.sampleDir, "resources", "data", "xml", "voa1.xml")

        try:
            w.importFiles([xmlFile1], "core", fileIO = MAT.DocumentIO.getDocumentIO("xml-inline", task = self.task))
            self.fail("importing xml unassigned didn't fail")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("imported document has annotated segment without an annotator") > -1)

    def testUnzonedImport(self):

        # In order to try this, we have to create a temp file containing
        # a JSON file which has already been processed, but has no zones.

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])
        jsonFile = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")
        path = os.path.join(self.testContext["TMPDIR"], "json_test")
        d = _jsonIO.readFromSource(jsonFile)
        d.removeAnnotations(["SEGMENT"])
        _jsonIO.writeToTarget(d, path)

        try:
            w.importFiles([path], "core")
            self.fail("importing segmentless JSON unassigned didn't fail")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("imported document has annotated segment without an annotator") > -1)

    def testSimpleRawImport(self):
        
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        # Now, let's use some sample files. Let's import some files.
        # Import some raw files to raw, unprocessed, some to completed.
        # Do it in multiple batches, check the contents of the
        # directories at each point. Make sure that when we
        # import things to completed that the signal in the
        # raw processed file is identical to the signal in the
        # document.

        import glob, random

        rawFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))
        random.shuffle(rawFiles)

        # Select a few raw files. There are 10 of each.

        someRawFiles = rawFiles[:3]

        self.assertEqual(w.importFiles(someRawFiles, "core", file_type = "raw"), 3)

        # Check to see whether the files are there, and then test their status.

        rawBasenames = [os.path.basename(p) for p in someRawFiles]
        rawBasenames.sort()

        rawUnprocessedContents = os.listdir(w.folders["core"].dir)
        rawUnprocessedContents.sort()

        contentsFromFolder = w.folders["core"].getBasenames()
        contentsFromFolder.sort()
        
        self.assertEqual(rawUnprocessedContents, rawBasenames)
        self.assertEqual(contentsFromFolder, rawBasenames)

        self.assertEqual(["unannotated"], list(set([r[2] for r in w.getDB().basenameInfo(rawBasenames)])))
        
        self.assertEqual(os.listdir(w.folders["export"].dir), [])
        
        # Open a second instance of the workspace, and get the basenames.

        w2 = self._createWorkspace()
        otherBasenames = w2.getBasenames()
        otherBasenames.sort()

        self.assertEqual(rawUnprocessedContents, otherBasenames)

    def testUnicodeImport(self):

        # Use a random single character not in ASCII space.        
        s = u'\u6709'

        path = os.path.join(self.testContext["TMPDIR"], "unicode_test")
        # Write it out in an odd encoding.
        import codecs
        fp = codecs.open(path, "w", "big5")
        fp.write(s)
        fp.close()

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        w.importFiles([path], "core", file_type = "raw", encoding = 'big5')

        # Now, open the file in the workspace, and make sure the
        # string is the UTF-8 equivalent of the input, not the BIG5 equivalent.

        wsDoc = w.folders['core'].openFile('unicode_test')
        wsBytes = wsDoc.signal

        self.assertEqual(wsBytes, s)

    def testStrippedRawImport(self):
        
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        # Now, let's use some sample files. Let's import some files.
        # Import some raw files to raw, unprocessed, some to completed.
        # Do it in multiple batches, check the contents of the
        # directories at each point. Make sure that when we
        # import things to completed that the signal in the
        # raw processed file is identical to the signal in the
        # document.

        import glob, random

        rawFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))
        random.shuffle(rawFiles)

        # Select a few raw files. There are 10 of each.

        someRawFiles = rawFiles[:3]

        self.assertEqual(w.importFiles(someRawFiles, "core", file_type = "raw", strip_suffix = ".txt"), 3)

        # Check to see whether the files are there.

        rawBasenames = [os.path.basename(p)[:-4] for p in someRawFiles]
        rawBasenames.sort()

        rawUnprocessedContents = os.listdir(w.folders["core"].dir)
        rawUnprocessedContents.sort()

        contentsFromFolder = w.folders["core"].getBasenames()
        contentsFromFolder.sort()
        
        self.assertEqual(rawUnprocessedContents, rawBasenames)
        self.assertEqual(contentsFromFolder, rawBasenames)

        self.assertEqual(["unannotated"], list(set([r[2] for r in w.getDB().basenameInfo(rawBasenames)])))
        
        # Open a second instance of the workspace, and get the basenames.

        w2 = self._createWorkspace()
        otherBasenames = w2.getBasenames()

        otherBasenames.sort()

        self.assertEqual(rawUnprocessedContents, otherBasenames)

    def testStrippedJSONImport(self):
        
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

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

        self.assertEqual(w.importFiles(someJsonFiles, "core", document_status = "gold",
                                       users = "user1", strip_suffix = ".txt.json"), 3)

        # Check to see whether the files are there.

        basenames = [os.path.basename(p)[:-9] for p in someJsonFiles]
        basenames.sort()

        completedContents = os.listdir(w.folders["core"].dir)
        completedContents.sort()

        contentsFromFolder = w.folders["core"].getBasenames()
        contentsFromFolder.sort()
        
        self.assertEqual(completedContents, basenames)
        self.assertEqual(contentsFromFolder, basenames)

        # I ask these documents to be gold, but they're already reconciled.
        self.assertEqual(["reconciled"], list(set([r[2] for r in w.getDB().basenameInfo(basenames)])))

        # Open a second instance of the workspace, and get the basenames.

        w2 = self._createWorkspace()
        otherBasenames = w2.getBasenames()
        otherBasenames.sort()

        self.assertEqual(completedContents, otherBasenames)

        # Now, copy some more, including files that we've already
        # copied.

        someJsonFiles = jsonFiles[:7]

        try:
            w.importFiles(someJsonFiles, "core", strip_suffix = ".txt.json")
            self.fail("should have hit an error")
        except MAT.Workspace.WorkspaceError, e:
            self.assertTrue(str(e).index("no files imported") > -1)

        someJsonFiles = jsonFiles[3:7]
        
        self.assertEqual(w.importFiles(someJsonFiles, "core", document_status = "gold", users = "user1",
                                       strip_suffix = ".txt.json"), 4)

        basenames = [os.path.basename(p)[:-9] for p in jsonFiles[:7]]
        basenames.sort()

        completedContents = os.listdir(w.folders["core"].dir)
        completedContents.sort()

        contentsFromFolder = w.folders["core"].getBasenames()
        contentsFromFolder.sort()
        
        self.assertEqual(completedContents, basenames)
        self.assertEqual(contentsFromFolder, basenames)

        # The documents are already reconciled, so even though we asked to make them
        # gold, they should still be reconciled.
        self.assertEqual(["reconciled"], list(set([r[2] for r in w.getDB().basenameInfo(basenames)])))
        
        # Open a second instance of the workspace, and get the basenames.

        w2 = self._createWorkspace()
        otherBasenames = w2.getBasenames()
        otherBasenames.sort()

        self.assertEqual(completedContents, otherBasenames)

    def testModelBuild(self):

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob

        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))

        # Pull them all into completed.

        self.assertEqual(w.importFiles(jsonFiles, "core", document_status = "reconciled",
                                       strip_suffix = ".txt.json"),
                         len(jsonFiles))

        self.assertEqual(["reconciled"], list(set([r[2] for r in w.getDB().basenameInfo(w.getBasenames())])))

        # Now, run the model build operation.

        w.runFolderOperation("core", "modelbuild")

        # Make sure it built the model.
        
        self.failUnless(os.path.exists(os.path.join(w.modelDir, "model")))
        self.failUnless(os.path.exists(os.path.join(w.modelDir, "model_basenames")))
        fp = open(os.path.join(w.modelDir, "model_basenames"), "r")
        builtFiles = [line.strip() for line in fp.readlines()]
        fp.close()
        builtFiles.sort()
        jsonBasenames = w.getBasenames()
        jsonBasenames.sort()

        self.assertEqual(builtFiles, jsonBasenames)

    def testLimitedModelBuild(self):

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob, random

        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))

        # Pull them all into completed.

        self.assertEqual(w.importFiles(jsonFiles, "core", document_status = "reconciled",
                                       strip_suffix = ".txt.json"),
                         len(jsonFiles))

        self.assertEqual(["reconciled"], list(set([r[2] for r in w.getDB().basenameInfo(w.getBasenames())])))

        random.shuffle(jsonFiles)

        # Now, run the model build operation.

        basenames = [os.path.basename(p)[:-9] for p in jsonFiles][:5]

        w.runFolderOperation("core", "modelbuild", basenames = basenames)

        # Make sure it built the model.
        
        self.failUnless(os.path.exists(os.path.join(w.modelDir, "model")))
        self.failUnless(os.path.exists(os.path.join(w.modelDir, "model_basenames")))
        fp = open(os.path.join(w.modelDir, "model_basenames"), "r")
        builtFiles = [line.strip() for line in fp.readlines()]
        fp.close()
        builtFiles.sort()
        basenames.sort()

        self.assertEqual(builtFiles, basenames)
        
    def testModelBuildPlusAutotag(self):

        # Import half the JSON files to completed, the rest of the
        # raw to raw, unprocessed. Then modelbuild plus autotag,
        # then autotag again with a limited set of basenames.

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob, random

        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        random.shuffle(jsonFiles)
        someJsonFiles = jsonFiles[:5]

        # Pull them into completed.

        self.assertEqual(w.importFiles(someJsonFiles, "core", document_status = "reconciled",
                                       strip_suffix = ".txt.json"),
                         len(someJsonFiles))

        # Now, grab the rest of them:

        txtFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))

        # Import them. Some are duplicates, so we have to skip them.

        try:
            w.importFiles(txtFiles, "core", file_type = "raw",
                          strip_suffix = ".txt")
            self.fail("Should have hit an error")
        except MAT.Workspace.WorkspaceError, e:
            self.assertTrue(str(e).index("no files imported") > -1)

        someTxtFiles = [f for f in txtFiles
                        if f.replace(os.sep +"raw" + os.sep,
                                     os.sep + "json" + os.sep) + ".json" not in someJsonFiles]

        self.assertEqual(w.importFiles(someTxtFiles, "core", file_type = "raw",
                                       strip_suffix = ".txt"),
                         len(txtFiles) - len(someJsonFiles))

        self.assertEqual(["reconciled"], list(set([r[2] for r in w.getDB().basenameInfo([os.path.splitext(os.path.splitext(os.path.basename(x))[0])[0] for x in someJsonFiles])])))
        self.assertEqual(["unannotated"], list(set([r[2] for r in w.getDB().basenameInfo([os.path.splitext(os.path.basename(x))[0] for x in someTxtFiles])])))

        # Now, let's modelbuild and autotag. Let's only autotag some
        # of the available files.

        txtBasenames = [r[1] for r in w.getDB().basenameInfo([os.path.splitext(os.path.basename(x))[0] for x in someTxtFiles])]

        random.shuffle(txtBasenames)
        someTxtBasenames = txtBasenames[:2]

        w.runFolderOperation("core", "modelbuild", do_autotag = True,
                             autotag_basename_list = someTxtBasenames)

        # Now, all the basenames in someTxtBasenames should be uncorrected
        # and the remainder should be in unannotated, and the
        # processed ones should be reconciled. 

        someTxtBasenames.sort()
        theRest = txtBasenames[2:]
        theRest.sort()
        contentsFromRaw = [r[1] for r in w.getDB().basenameInfo(txtBasenames) if r[2] == "unannotated"]
        contentsFromRaw.sort()

        self.assertEqual(theRest, contentsFromRaw)

        contentsFromAuto = [r[1] for r in w.getDB().basenameInfo(txtBasenames) if r[2] == "uncorrected"]
        contentsFromAuto.sort()

        self.assertEqual(someTxtBasenames, contentsFromAuto)

        # Now, let's specify basenames. Process some of theRest, and all of
        # someTxtBasenames. This should not break, even though we're asking for
        # some documents to be autotagged which aren't in those directories.
        # The result should be that what we DON'T process from theRest should
        # now be in raw, unprocessed, and autotagged should contain everything
        # among the text basenames except what we omitted from theRest.

        w.runFolderOperation("core", "autotag", basenames = theRest[:-1])

        contentsFromRaw = [r[1] for r in w.getDB().basenameInfo(txtBasenames) if r[2] == "unannotated"]
        contentsFromRaw.sort()        

        self.assertEqual([theRest[-1]], contentsFromRaw)

        contentsFromAuto = [r[1] for r in w.getDB().basenameInfo(txtBasenames) if r[2] == "uncorrected"]
        contentsFromAuto.sort()
        allTagged = someTxtBasenames + theRest[:-1]
        allTagged.sort()

        self.assertEqual(allTagged, contentsFromAuto)
        
    def testOperationInternals(self):

        import glob, random

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])
        
        txtFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))

        o = w.getOperation("import", ["core"] + txtFiles)

        # Let's take apart runFolderOperation().

        self.assertEqual(txtFiles, list(o.args[1:]))

        o.do(file_type = "raw")

        self.assertEqual(o.imported, len(txtFiles))

    def testSegmentMarkings(self):
        
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        # Now, let's use some sample files. Let's import some files.
        # Import some raw files to raw, unprocessed, some to completed.
        # Do it in multiple batches, check the contents of the
        # directories at each point. Make sure that when we
        # import things to completed that the signal in the
        # raw processed file is identical to the signal in the
        # document.

        import glob, random

        rawFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))
        random.shuffle(rawFiles)

        # Select a few raw files. There are 10 of each.

        someRawFiles = rawFiles[:3]
        w.importFiles(someRawFiles, "core", file_type = "raw")

        rawBasenames = [os.path.basename(p) for p in someRawFiles]
        rawBasenames.sort()

        # Now, the files should be in "in process".

        contentsFromInProcess = [r[1] for r in w.getDB().basenameInfo(w.folders["core"].getBasenames()) if r[2] == "unannotated"]
        contentsFromInProcess.sort()

        self.assertEqual(rawBasenames, contentsFromInProcess)

        # And every one of them should have segments which are non-gold, null.
        for b in contentsFromInProcess:
            d = w.folders["core"].openFile(b)
            segs = d.getAnnotations(["SEGMENT"])
            self.assertTrue(len(segs) > 0)
            for seg in segs:
                self.assertTrue(seg.get("annotator") is None)
                self.assertTrue(seg.get("status") == "non-gold")

        # Now, we mark them completed.

        o = w.getFolderOperation("core", "markgold", basenames = rawBasenames)
        o.parameters = {"user": "user1"}
        o.doOperation()

        contentsFromCompleted = [r[1] for r in w.getDB().basenameInfo(w.folders["core"].getBasenames()) if r[2] == "gold"]
        contentsFromCompleted.sort()

        self.assertEqual(rawBasenames, contentsFromCompleted)
        for b in contentsFromCompleted:
            d = w.folders["core"].openFile(b)
            segs = d.getAnnotations(["SEGMENT"])
            self.assertTrue(len(segs) > 0)
            for seg in segs:
                self.assertTrue(seg.get("status") == "human gold")

    # Let's do a quick check for prettyName. This is something I added, and I'm
    # now using it in getting the affected folders for markcompleted.

    def testPrettyName(self):

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])
        o = w.getFolderOperation("core", "markgold")
        self.assertTrue("core" in o.getAffectedFolders())
        
class WorkspaceRichInputCase(WorkspaceBaseTestCase):

    def setUp(self):
        WorkspaceBaseTestCase.setUp(self)
        self.richDir = os.path.join(self.testContext["TMPDIR"], "richDocs")
        if os.path.isdir(self.richDir):
            shutil.rmtree(self.richDir)
        os.mkdir(self.richDir)
        import glob
        rawFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))
        _rawReader = MAT.DocumentIO.getDocumentIO("raw")        
        for f in rawFiles:
            _jsonIO.writeToTarget(_rawReader.readFromSource(f),
                                  os.path.join(self.richDir, os.path.basename(f) + ".json"))

    def tearDown(self):
        WorkspaceBaseTestCase.tearDown(self)
        if os.path.isdir(self.richDir):
            shutil.rmtree(self.richDir)            

    def testSimpleRichImport(self):
        
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        # Now, let's use some sample files. Let's import some files.
        # Import some raw files to raw, unprocessed, some to completed.
        # Do it in multiple batches, check the contents of the
        # directories at each point. Make sure that when we
        # import things to completed that the signal in the
        # raw processed file is identical to the signal in the
        # document.

        # This is no longer a particularly interesting test, because
        # rich files are imported the same way raw files are.

        import glob, random

        richFiles = glob.glob(os.path.join(self.richDir, "*.txt.json"))
        random.shuffle(richFiles)

        # Select a few raw files. There are 10 of each.

        someRichFiles = richFiles[:3]

        self.assertEqual(w.importFiles(someRichFiles, "core"), 3)

        # Check to see whether the files are there.

        richBasenames = [os.path.basename(p) for p in someRichFiles]
        richBasenames.sort()

        richUnprocessedContents = os.listdir(w.folders["core"].dir)
        richUnprocessedContents.sort()

        contentsFromFolder = w.folders["core"].getBasenames()
        contentsFromFolder.sort()        
        
        self.assertEqual(richUnprocessedContents, richBasenames)
        self.assertEqual(contentsFromFolder, richBasenames)

        # Open a second instance of the workspace, and get the basenames.

        w2 = self._createWorkspace()
        otherBasenames = w2.getBasenames()
        otherBasenames.sort()

        self.assertEqual(richUnprocessedContents, otherBasenames)

    def testStrippedRichImport(self):
        
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        # Now, let's use some sample files. Let's import some files.
        # Import some rich files to rich, unprocessed, some to completed.
        # Do it in multiple batches, check the contents of the
        # directories at each point. Make sure that when we
        # import things to completed that the signal in the
        # rich processed file is identical to the signal in the
        # document.

        import glob, random

        richFiles = glob.glob(os.path.join(self.richDir, "*.txt.json"))
        random.shuffle(richFiles)

        # Select a few rich files. There are 10 of each.

        someRichFiles = richFiles[:3]

        self.assertEqual(w.importFiles(someRichFiles, "core", strip_suffix = ".txt.json"), 3)

        # Check to see whether the files are there.

        richBasenames = [os.path.basename(p)[:-9] for p in someRichFiles]
        richBasenames.sort()

        richUnprocessedContents = os.listdir(w.folders["core"].dir)
        richUnprocessedContents.sort()

        contentsFromFolder = w.folders["core"].getBasenames()
        contentsFromFolder.sort()
        
        self.assertEqual(richUnprocessedContents, richBasenames)
        self.assertEqual(contentsFromFolder, richBasenames)

        # Open a second instance of the workspace, and get the basenames.

        w2 = self._createWorkspace()
        otherBasenames = w2.getBasenames()
        otherBasenames.sort()

        self.assertEqual(richUnprocessedContents, otherBasenames)
        
    def testModelBuildPlusAutotag(self):

        # Import half the JSON files to completed, the rest of the
        # rich to rich, unprocessed. Then modelbuild plus autotag,
        # then autotag again with a limited set of basenames.

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob, random

        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        random.shuffle(jsonFiles)
        someJsonFiles = jsonFiles[:5]

        # Pull them into completed.

        self.assertEqual(w.importFiles(someJsonFiles, "core", document_status = "reconciled",
                                       strip_suffix = ".txt.json"),
                         len(someJsonFiles))

        # Now, grab the rest of them:

        richFiles = glob.glob(os.path.join(self.richDir, "*.txt.json"))

        # Import them. Some are duplicates, so we have to skip them.

        try:
            w.importFiles(richFiles, "core",
                          strip_suffix = ".txt.json")
            self.fail("Should have hit an error")
        except MAT.Workspace.WorkspaceError, e:
            self.assertTrue(str(e).index("no files imported") > -1)

        someRichFiles = [f for f in richFiles
                         if os.path.basename(f) not in [os.path.basename(x) for x in someJsonFiles]]
        
        self.assertEqual(w.importFiles(someRichFiles, "core",
                                       strip_suffix = ".txt.json"),
                         len(richFiles) - len(someJsonFiles))

        # Now, let's modelbuild and autotag. Let's only autotag some
        # of the available files.

        richBasenames = [r[1] for r in w.getDB().basenameInfo(w.folders["core"].getBasenames()) if r[2] == "unannotated"]

        random.shuffle(richBasenames)
        someRichBasenames = richBasenames[:2]

        w.runFolderOperation("core", "modelbuild", do_autotag = True,
                             autotag_basename_list = someRichBasenames)

        # Now, all the basenames in someTxtBasenames should be in autotagged,
        # and the remainder should be in rich, unprocessed, and the
        # processed ones should be in rich processed. But remember, the
        # files imported to completed will ALSO be there, so I have to
        # take that into account.

        someRichBasenames.sort()
        theRest = richBasenames[2:]
        theRest.sort()
        contentsFromRich = [r[1] for r in w.getDB().basenameInfo(w.folders["core"].getBasenames()) if r[2] == "unannotated"]
        contentsFromRich.sort()

        self.assertEqual(theRest, contentsFromRich)

        contentsFromAuto = [r[1] for r in w.getDB().basenameInfo(w.folders["core"].getBasenames()) if r[2] == "uncorrected"]
        contentsFromAuto.sort()

        self.assertEqual(someRichBasenames, contentsFromAuto)

        # Now, let's specify basenames. Process some of theRest, and all of
        # someRichBasenames. This should not break, even though we're asking for
        # some documents to be autotagged which aren't in those directories.
        # The result should be that what we DON'T process from theRest should
        # now be in raw, unprocessed, and autotagged should contain everything
        # among the text basenames except what we omitted from theRest.

        w.runFolderOperation("core", "autotag", basenames = theRest[:-1])

        contentsFromRaw = [r[1] for r in w.getDB().basenameInfo(w.folders["core"].getBasenames()) if r[2] == "unannotated"]
        contentsFromRaw.sort()        

        self.assertEqual([theRest[-1]], contentsFromRaw)

        contentsFromAuto = [r[1] for r in w.getDB().basenameInfo(w.folders["core"].getBasenames()) if r[2] == "uncorrected"]
        contentsFromAuto.sort()
        allTagged = someRichBasenames + theRest[:-1]
        allTagged.sort()

        self.assertEqual(allTagged, contentsFromAuto)

# Now, test everything, exactly the same, except on the command line.

class WorkspaceCmdlineTestCase(WorkspaceBaseTestCase, MAT.UnitTest.CmdlinesTestCase):

    def setUp(self):
        MAT.UnitTest.CmdlinesTestCase.setUp(self)
        WorkspaceBaseTestCase.setUp(self)

    def tearDown(self):
        MAT.UnitTest.CmdlinesTestCase.tearDown(self)
        WorkspaceBaseTestCase.tearDown(self)

    def testSettings(self):
        self.runCmdblock(header = "Test settings.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "create",
                                "--initial_users", "user1",
                                "--task",
                                'Named Entity',
                                "--max_old_models",
                                "3"])
        w2 = self._createWorkspace()
        self.assertEqual(3, w2.maxOldModels)

    def testBadImport(self):

        self.runCmdblock(header = "Simple raw import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "create",
                                "--initial_users", "user1",
                                "--task",
                                'Named Entity'])

        import glob
        rawFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))

        self.runCmdblock(header = "Do the import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "import",
                                "--file_type", "raw",
                                "export"] + rawFiles,
                         expectFailure = True)
        
    def testSimpleRawImport(self):

        self.runCmdblock(header = "Simple raw import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "create",
                                "--initial_users", "user1",
                                "--task",
                                'Named Entity'])

        # Now, let's use some sample files. Let's import some files.
        # Import some raw files to raw, unprocessed, some to completed.
        # Do it in multiple batches, check the contents of the
        # directories at each point. Make sure that when we
        # import things to completed that the signal in the
        # raw processed file is identical to the signal in the
        # document.

        import glob, random

        rawFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))
        random.shuffle(rawFiles)

        # Select a few raw files. There are 10 of each.

        someRawFiles = rawFiles[:3]

        self.runCmdblock(header = "Do the import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "import",
                                "--file_type", "raw",
                                "core"] + someRawFiles)

        w = self._createWorkspace()
        
        # Check to see whether the files are there, and then test their status.

        rawBasenames = [os.path.basename(p) for p in someRawFiles]
        rawBasenames.sort()

        rawUnprocessedContents = os.listdir(w.folders["core"].dir)
        rawUnprocessedContents.sort()

        contentsFromFolder = w.folders["core"].getBasenames()
        contentsFromFolder.sort()
        
        self.assertEqual(rawUnprocessedContents, rawBasenames)
        self.assertEqual(contentsFromFolder, rawBasenames)

        self.assertEqual(["unannotated"], list(set([r[2] for r in w.getDB().basenameInfo(rawBasenames)])))
        
        self.assertEqual(os.listdir(w.folders["export"].dir), [])
        
        # Open a second instance of the workspace, and get the basenames.

        w2 = self._createWorkspace()
        otherBasenames = w2.getBasenames()
        otherBasenames.sort()

        self.assertEqual(rawUnprocessedContents, otherBasenames)
        
    def testStrippedRawImport(self):

        self.runCmdblock(header = "Simple raw import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "create",
                                "--initial_users", "user1",
                                "--task",
                                'Named Entity'])

        # Now, let's use some sample files. Let's import some files.
        # Import some raw files to raw, unprocessed, some to completed.
        # Do it in multiple batches, check the contents of the
        # directories at each point. Make sure that when we
        # import things to completed that the signal in the
        # raw processed file is identical to the signal in the
        # document.

        import glob, random

        rawFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))
        random.shuffle(rawFiles)

        # Select a few raw files. There are 10 of each.

        someRawFiles = rawFiles[:3]

        self.runCmdblock(header = "Do the import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "import",
                                "--strip_suffix",
                                ".txt", "--file_type", "raw",
                                "core"] + someRawFiles)

        w = self._createWorkspace()
        
        # Check to see whether the files are there.

        rawBasenames = [os.path.basename(p)[:-4] for p in someRawFiles]
        rawBasenames.sort()

        rawUnprocessedContents = os.listdir(w.folders["core"].dir)
        rawUnprocessedContents.sort()

        contentsFromFolder = w.folders["core"].getBasenames()
        contentsFromFolder.sort()
        
        self.assertEqual(rawUnprocessedContents, rawBasenames)
        self.assertEqual(contentsFromFolder, rawBasenames)

        self.assertEqual(["unannotated"], list(set([r[2] for r in w.getDB().basenameInfo(rawBasenames)])))
        
        # Open a second instance of the workspace, and get the basenames.

        w2 = self._createWorkspace()
        otherBasenames = w2.getBasenames()
        otherBasenames.sort()

        self.assertEqual(rawUnprocessedContents, otherBasenames)

    def testStrippedJSONImport(self):
        
        self.runCmdblock(header = "Simple JSON import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "create",
                                "--initial_users", "user1",
                                "--task",
                                'Named Entity'])

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

        self.runCmdblock(header = "Do the import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "import",
                                "--strip_suffix",
                                ".txt.json", "--document_status", "gold", "--users", "user1",
                                "core"] + someJsonFiles)

        w = self._createWorkspace()
        
        # Check to see whether the files are there.

        basenames = [os.path.basename(p)[:-9] for p in someJsonFiles]
        basenames.sort()

        completedContents = os.listdir(w.folders["core"].dir)
        completedContents.sort()

        contentsFromFolder = w.folders["core"].getBasenames()
        contentsFromFolder.sort()
        
        self.assertEqual(completedContents, basenames)
        self.assertEqual(contentsFromFolder, basenames)

        # These files were imported as gold, but they were already reconciled.
        self.assertEqual(["reconciled"], list(set([r[2] for r in w.getDB().basenameInfo(basenames)])))

        # Open a second instance of the workspace, and get the basenames.

        w2 = self._createWorkspace()
        otherBasenames = w2.getBasenames()
        otherBasenames.sort()

        self.assertEqual(completedContents, otherBasenames)

        # Now, copy some more, including files that we've already
        # copied.

        someJsonFiles = jsonFiles[:7]

        self.runCmdblock(header = "Do the import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "import",
                                "--strip_suffix",
                                ".txt.json", "--document_status", "gold", "--users", "user1",
                                "core"] + jsonFiles[3:7])

        basenames = [os.path.basename(p)[:-9] for p in jsonFiles[:7]]
        basenames.sort()

        completedContents = os.listdir(w.folders["core"].dir)
        completedContents.sort()

        contentsFromFolder = w.folders["core"].getBasenames()
        contentsFromFolder.sort()
        
        self.assertEqual(completedContents, basenames)
        self.assertEqual(contentsFromFolder, basenames)

        # These files were asked to be gold, but they're already reconciled.
        self.assertEqual(["reconciled"], list(set([r[2] for r in w.getDB().basenameInfo(basenames)])))
        
        # Open a second instance of the workspace, and get the basenames.

        w2 = self._createWorkspace()
        otherBasenames = w2.getBasenames()
        otherBasenames.sort()

        self.assertEqual(completedContents, otherBasenames)

    def testModelBuild(self):

        self.runCmdblock(header = "Model build.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "create",
                                "--initial_users", "user1",
                                "--task",
                                'Named Entity'])

        import glob

        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))

        # Pull them all into completed.

        self.runCmdblock(header = "Do the import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "import",
                                "--strip_suffix",
                                ".txt.json", "--document_status", "reconciled",
                                "core"] + jsonFiles)

        # Now, run the model build operation.

        self.runCmdblock(header = "Build the model.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "modelbuild",
                                "core"])

        # Make sure it built the model.

        w = self._createWorkspace()
        
        self.failUnless(os.path.exists(os.path.join(w.modelDir, "model")))
        self.failUnless(os.path.exists(os.path.join(w.modelDir, "model_basenames")))
        fp = open(os.path.join(w.modelDir, "model_basenames"), "r")
        builtFiles = [line.strip() for line in fp.readlines()]
        fp.close()
        builtFiles.sort()
        jsonBasenames = w.getBasenames()
        jsonBasenames.sort()

        self.assertEqual(builtFiles, jsonBasenames)
        
    def testModelBuildPlusAutotag(self):

        # Import half the JSON files to completed, the rest of the
        # raw to raw, unprocessed. Then modelbuild plus autotag,
        # then autotag again with a limited set of basenames.

        self.runCmdblock(header = "Model build.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "create",
                                "--initial_users", "user1",
                                "--task",
                                'Named Entity'])

        import glob, random

        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        random.shuffle(jsonFiles)
        someJsonFiles = jsonFiles[:5]

        # Pull them into completed.

        self.runCmdblock(header = "Do the import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "import",
                                "--strip_suffix",
                                ".txt.json", "--document_status", "reconciled",
                                "core"] + someJsonFiles)

        # Now, grab the rest of them:

        txtFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))

        # Import them. We'll hit an error if we try to import the same files again, so
        # we have to filter them.
        
        someTxtFiles = [x for x in txtFiles if x.replace(os.sep +"raw" + os.sep, os.sep +"json" + os.sep) + ".json" not in someJsonFiles]
        
        self.runCmdblock(header = "Do the import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "import",
                                "--strip_suffix",
                                ".txt", "--file_type", "raw",
                                "core"] + \
                         someTxtFiles)

        # Now, let's modelbuild and autotag. Let's only autotag some
        # of the available files.

        w = self._createWorkspace()

        self.assertEqual(["reconciled"], list(set([r[2] for r in w.getDB().basenameInfo([os.path.splitext(os.path.splitext(os.path.basename(x))[0])[0] for x in someJsonFiles])])))
        self.assertEqual(["unannotated"], list(set([r[2] for r in w.getDB().basenameInfo([os.path.splitext(os.path.basename(x))[0] for x in someTxtFiles])])))

        txtBasenames = [r[1] for r in w.getDB().basenameInfo([os.path.splitext(os.path.basename(x))[0] for x in someTxtFiles])]

        random.shuffle(txtBasenames)
        someTxtBasenames = txtBasenames[:2]

        self.runCmdblock(header = "Build the model.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "modelbuild",
                                "--do_autotag",
                                "--autotag_basenames",
                                " ".join(someTxtBasenames),
                                "core"])
        
        # Now, all the basenames in someTxtBasenames should be uncorrected
        # and the remainder should be in unannotated, and the
        # processed ones should be reconciled. 

        someTxtBasenames.sort()
        theRest = txtBasenames[2:]
        theRest.sort()
        contentsFromRaw = [r[1] for r in w.getDB().basenameInfo(txtBasenames) if r[2] == "unannotated"]
        contentsFromRaw.sort()

        self.assertEqual(theRest, contentsFromRaw)

        contentsFromAuto = [r[1] for r in w.getDB().basenameInfo(txtBasenames) if r[2] == "uncorrected"]
        contentsFromAuto.sort()

        self.assertEqual(someTxtBasenames, contentsFromAuto)

        # Now, let's specify basenames. Process some of theRest, and all of
        # someTxtBasenames. This should not break, even though we're asking for
        # some documents to be autotagged which aren't in those directories.
        # The result should be that what we DON'T process from theRest should
        # now be in raw, unprocessed, and autotagged should contain everything
        # among the text basenames except what we omitted from theRest.
        
        self.runCmdblock(header = "Autotag.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "autotag",
                                "core"] + theRest[:-1])

        contentsFromRaw = [r[1] for r in w.getDB().basenameInfo(txtBasenames) if r[2] == "unannotated"]
        contentsFromRaw.sort()        

        self.assertEqual([theRest[-1]], contentsFromRaw)

        contentsFromAuto = [r[1] for r in w.getDB().basenameInfo(txtBasenames) if r[2] == "uncorrected"]
        contentsFromAuto.sort()
        allTagged = someTxtBasenames + theRest[:-1]
        allTagged.sort()

        self.assertEqual(allTagged, contentsFromAuto)

    def testSegmentMarkings(self):

        self.runCmdblock(header = "Segment markings.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "create",
                                "--initial_users", "user1",
                                "--task",
                                'Named Entity'])

        w = self._createWorkspace()
        
        # Now, let's use some sample files. Let's import some files.
        # Import some raw files to raw, unprocessed, some to completed.
        # Do it in multiple batches, check the contents of the
        # directories at each point. Make sure that when we
        # import things to completed that the signal in the
        # raw processed file is identical to the signal in the
        # document.

        import glob, random

        rawFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))
        random.shuffle(rawFiles)
        
        # Select a few raw files. There are 10 of each.

        someRawFiles = rawFiles[:3]
        self.runCmdblock(header = "Do the import.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine",
                                self.wdir,
                                "import",
                                "--file_type", "raw",
                                "core"] + someRawFiles)

        rawBasenames = [os.path.basename(p) for p in someRawFiles]
        rawBasenames.sort()

        # Now, the files should be in "in process".

        contentsFromInProcess = [r[1] for r in w.getDB().basenameInfo(w.folders["core"].getBasenames()) if r[2] == "unannotated"]
        contentsFromInProcess.sort()

        self.assertEqual(rawBasenames, contentsFromInProcess)

        # And every one of them should have segments which are non-gold, null.
        for b in contentsFromInProcess:
            d = w.folders["core"].openFile(b)
            segs = d.getAnnotations(["SEGMENT"])
            self.assertTrue(len(segs) > 0)
            for seg in segs:
                self.assertTrue(seg.get("annotator") is None)
                self.assertTrue(seg.get("status") == "non-gold")

        # Now, we mark them completed.

        self.runCmdblock(header = "Mark complete.",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATWorkspaceEngine", "--debug",
                                self.wdir,
                                "markgold", "--user", "user1",
                                "core"] + rawBasenames)

        contentsFromCompleted = [r[1] for r in w.getDB().basenameInfo(w.folders["core"].getBasenames()) if r[2] == "gold"]
        contentsFromCompleted.sort()

        self.assertEqual(rawBasenames, contentsFromCompleted)
        for b in contentsFromCompleted:
            d = w.folders["core"].openFile(b)
            segs = d.getAnnotations(["SEGMENT"])
            self.assertTrue(len(segs) > 0)
            for seg in segs:
                self.assertTrue(seg.get("status") == "human gold")

from MAT.UnitTest import ThreadTest

class WorkspaceSimultaneousAccessTestCase(WorkspaceBaseTestCase):
    
    def testSimultaneousAccess(self):

        # I'm going to need threads here. First, import some files, so I can
        # build a model.

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob

        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))

        # Pull them all into completed.

        w.importFiles(jsonFiles, "core", strip_suffix = ".txt.json", document_status = "reconciled")

        # In order to do anything under threads, we have to capture
        # any errors and reraise them. For a more complex example, see
        # MAT.UnitTest.

        import time
        t1 = ThreadTest(self)
        t1.start(lambda: w.runFolderOperation("core", "modelbuild"))

        # Wait for a bit, so it can get started.

        time.sleep(.1)

        def tryToRemoveBasenames(w):
            try:
                w.removeBasenames("voa1")
                self.fail("operation should have been locked out")
            except MAT.Workspace.WorkspaceError, err:
                self.failUnless(str(err).find("processing other request") > -1)

        t2 = ThreadTest(self)
        t2.start(tryToRemoveBasenames, w)

        t1.join()
        t2.join()

class WorkspaceNewFeaturesTestCase(WorkspaceBaseTestCase):
    
    def testAutotagRollback(self):

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob, codecs
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "voa[12].txt.json"))

        # Import some documents.        
        w.importFiles(jsonFiles, "core", document_status = "reconciled",
                      strip_suffix = ".txt.json")

        # Build a model.
        w.runFolderOperation("core", "modelbuild")
        # Import some more documents.

        w.importFiles([os.path.join(self.sampleDir, "resources", "data", "raw", "voa3.txt")], "core", file_type = "raw",
                      strip_suffix = ".txt")
        
        # Now, mark the voa3 document as read-only, so writing fails.
        import stat
        p = w.folders["core"].getFiles(["voa2"])[0]
        # Cache the document contents of voa3.
        voa3p = w.folders["core"].getFiles(["voa3"])[0]
        fp = codecs.open(voa3p, "r", "utf-8")
        voa3s = fp.read()
        fp.close()
        origMode = os.stat(p)[stat.ST_MODE]

        # Now, make the voa2 path unwriteable. NOTE: This will generate a
        # warning when trying to restore when we unwind the autotag transaction.
        os.chmod(p, origMode & ~stat.S_IWUSR & ~stat.S_IWGRP & ~stat.S_IWOTH)
        
        # Now, we tag, and bad things will happen.
        try:
            w.runFolderOperation("core", "autotag")
            self.fail("Should have hit an error")
        except MAT.Workspace.WorkspaceError, err:
            pass

        # And the document should still be unannotated.
        self.failUnless(w.getDB().basenameInfo(["voa3"])[0][2] == 'unannotated')
        # And the contents of voa3 should be undisturbed.
        fp = codecs.open(voa3p, "r", "utf-8")
        voa3sNow = fp.read()
        fp.close()
        self.failUnless(voa3s == voa3sNow)

        # Now, restore the permissions.
        os.chmod(p, origMode)
        
        # Can't get the permission stuff to work on
        # Windows with directories.
        if sys.platform != "win32":
            # And set the directory to be unreadable.
            origMode = os.stat(os.path.dirname(p))[stat.ST_MODE]
            os.chmod(os.path.dirname(p), origMode & ~stat.S_IWUSR & ~stat.S_IWGRP & ~stat.S_IWOTH)

            # Now, we tag, and bad things will happen.
            try:
                w.runFolderOperation("core", "autotag")
                self.fail("Should have hit an error")
            except MAT.Workspace.WorkspaceError, err:
                # Restore it first, in case the test fails.
                pass
            # And the document should still be unannotated.

            self.assertEqual(w.getDB().basenameInfo(["voa3"])[0][2], 'unannotated')
            # And the contents of voa3 should be undisturbed.
            fp = codecs.open(voa3p, "r", "utf-8")
            voa3sNow = fp.read()
            fp.close()
            self.failUnless(voa3s == voa3sNow)

            # And restore it.
            os.chmod(os.path.dirname(p), origMode)

    def testAssignmentRollback(self):

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1", "user2"])

        import glob
        rawDocs = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "voa[67].txt"))

        w.importFiles(rawDocs, "core", file_type = "raw", strip_suffix = ".txt")
        
        # Now, lock the second one.
        d, lockId = w.openWorkspaceFile("core", "voa7", user = "user1")
        try:
            w.runOperation("assign", ('voa6', 'voa7'), user = "user1")
            self.fail("assignment should have failed")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("because it's locked") > -1)
        # Now, make sure that the basename info is still intact. At the moment,
        # we can't set up the transaction so that a stray file that's created
        # is removed.
        bInfo = w.getDB().basenameInfo(["voa6", "voa7"])
        self.failUnlessEqual(set([r[0] for r in bInfo]), set(["voa6", "voa7"]))

    def testUsers(self):
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob, codecs
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "voa[12].txt.json"))

        
        # Import some documents.        
        w.importFiles(jsonFiles, "core", document_status = "reconciled",
                      strip_suffix = ".txt.json")

        try:
            d, lockId = w.openWorkspaceFile("core", "voa1")
            self.fail("shouldn't have been able to open the file")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("unknown user") > -1)

        d, lockId = w.openWorkspaceFile("core", "voa1", user = "user1")

        # You should be able to open a document as yourself, not as anyone else.
        try:
            w.openWorkspaceFile("core", "voa1", user = "user2")
            self.fail("shouldn't have been able to open the file")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("locked document") > -1)

        try:
            d, lockId = w.openWorkspaceFile("core", "voa1", user = "user1")
        except MAT.Workspace.WorkspaceError, e:
            self.fail("should have been able to open the file")

        otherD, otherTxId = w.openWorkspaceFile("core", "voa1", read_only = True)
        self.failUnless(otherTxId is None)

        # Close the file.
        
        w.runFolderOperation("core", "save", basenames = ["voa1"],
                             lock_id = lockId, release_lock = True)
        
    def testSimpleRemoval(self):

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob, codecs
        rawDocs = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "voa[67].txt"))

        w.importFiles(rawDocs, "core", file_type = "raw",
                      strip_suffix = ".txt")
        
        w.removeAllBasenames()
        # Nothing should be left.
        self.failUnlessEqual(os.listdir(w.folders["core"].dir), [])
        self.failUnlessEqual(w.getDB().allBasenames(), [])        

    def testPartialRemoval(self):
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob, codecs
        rawDocs = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "voa[678].txt"))

        w.importFiles(rawDocs, "core", file_type = "raw",
                      strip_suffix = ".txt")
        w.removeBasenames(['voa7', 'voa6'])
        # Nothing should be left.
        self.failUnlessEqual(os.listdir(w.folders["core"].dir), ['voa8'])
        self.failUnlessEqual(w.getDB().allBasenames(), ['voa8'])

    def testSimpleAssignment(self):
        
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1", "user2"])         

        import glob, codecs
        rawDocs = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "voa[67].txt"))

        w.importFiles(rawDocs, "core", file_type = "raw",
                      strip_suffix = ".txt")
        
        w.runOperation("assign", ('voa6',), user = "user1,user2")
        
        bInfo = w.getDB().basenameInfo(["voa6", "voa7"])
        self.failUnlessEqual(set([r[0] for r in bInfo]), set(['voa6_user1', 'voa6_user2', 'voa7']))
        self.failUnlessEqual(set(os.listdir(w.getFolder("core").dir)),
                             set(['voa6_user1', 'voa6_user2', 'voa7']))
        w.runOperation("assign", ('voa7',), user = "user1")
        bInfo = w.getDB().basenameInfo(["voa6", "voa7"])
        self.failUnlessEqual(set([r[0] for r in bInfo]), set(['voa6_user1', 'voa6_user2', 'voa7_user1']))
        self.failUnlessEqual(set(os.listdir(w.getFolder("core").dir)),
                             set(['voa6_user1', 'voa6_user2', 'voa7_user1']))

    def testAssignmentOnImport(self):
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1", "user2"])

        import glob, codecs
        rawDocs = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "voa[67].txt"))

        w.importFiles(rawDocs, "core", file_type = "raw",
                      strip_suffix = ".txt", assign = True, users = 'user1,user2')
        
        bInfo = w.getDB().basenameInfo(["voa6", "voa7"])
        self.failUnlessEqual(set([r[0] for r in bInfo]), set(['voa6_user1', 'voa6_user2', 'voa7_user1', 'voa7_user2']))
        self.failUnlessEqual(set(os.listdir(w.getFolder("core").dir)),
                             set(['voa6_user1', 'voa6_user2', 'voa7_user1', 'voa7_user2']))

    def testBadAssignmentOnImport(self):

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1", "user2"])

        import glob, codecs
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "voa[12].txt.json"))
        
        # Import some gold standard documents
        try:
            w.importFiles(jsonFiles, "core", document_status = "reconciled",
                          strip_suffix = ".txt.json", assign = True, users = "user1")
            self.fail("gold standard import should have failed")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("can't assign reconciled documents to users") > -1)
            
    def testMultipleAutotag(self):

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1", "user2"])

        import glob, codecs
        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "voa[12].txt.json"))
        
        w.importFiles(jsonFiles, "core", document_status = "reconciled",
                      strip_suffix = ".txt.json")
        
        # Build a model.
        w.runFolderOperation("core", "modelbuild")
        
        # Insert another document, assign to each user.
        w.importFiles([os.path.join(self.sampleDir, "resources", "data", "raw", "voa3.txt")], "core", file_type = "raw",
                      strip_suffix = ".txt", assign=True, users="user1,user2")
        # Autotag.
        w.runFolderOperation("core", "autotag")
        # Three docs, two reconciled, one uncorrected but
        # assigned to multiple people.

        bsDict = {("voa1", "voa1"): ["reconciled", None, None],
                  ("voa2", "voa2"): ["reconciled", None, None],
                  ("voa3_user1", "voa3"): ["uncorrected", "user1", None],
                  ("voa3_user2", "voa3"): ["uncorrected", "user2", None]}
        
        # bsDict is a hash from (docname, basename) to (status, assigned, locked)
        basenames = set([k[1] for k in bsDict.keys()])
        
        for docName, basename, status, assignedUser, lockedBy in w.getDB().basenameInfo(list(basenames)):
            try:
                bStatus, bAssigned, bLocked = bsDict[(docName, basename)]
            except KeyError:
                continue
            self.failUnless(status == bStatus and assignedUser == bAssigned and lockedBy == bLocked,
                            "%s != %s or %s != %s or %s != %s" % (status, bStatus, assignedUser, bAssigned, lockedBy, bLocked))

    def testUncorrectedImport(self):
        
        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        xmlFile1 = os.path.join(self.sampleDir, "resources", "data", "xml", "voa1.xml")

        w.importFiles([xmlFile1], "core", users = "MACHINE",
                      fileIO = MAT.DocumentIO.getDocumentIO("xml-inline", task = self.task))
        self.assertEqual(["voa1.xml"], [r[1] for r in w.getDB().basenameInfo(["voa1.xml"]) if r[2] == "uncorrected"])

    def testForceUnlock(self):

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        import glob, codecs
        rawDocs = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "voa[67].txt"))

        w.importFiles(rawDocs, "core", file_type = "raw",
                      strip_suffix = ".txt")

        doc, lockId = w.openWorkspaceFile("core", "voa6", user = "user1")

        # Now, unlock it.

        w.runOperation("force_unlock", ("core", "voa6"), user = "user1")

        # Now, it better be unlocked.

        self.assertEqual(w.getDB().coreGetLockIDInfo(lockId), (None, None, None))

# Now, let's test the experiment stuff. We have to test this both from the experiment
# engine and from the workspace. And really, what we need to do is test the document
# selection.

from MAT.CarafeTrain import TestRun, TrainingRun, ExperimentEngine, \
    WorkspaceCorpusSet, WorkspaceCorpus, fromXML

class WorkspaceExperimentTestCase(WorkspaceBaseTestCase):

    def testWorkspaceExperiment(self):

        # I need a third user that I'm not going to test against, which
        # provides a gold document, so that there's ALWAYS something in the
        # remainder when I check the workspace operation experiment results.

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1", "user2", "user3"])
        
        import glob
        docs = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "voa[1-6].txt.json"))

        w.importFiles(docs, "core", strip_suffix = ".txt.json")

        docs = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "voa[7-9].txt")) + \
               [os.path.join(self.sampleDir, "resources", "data", "raw", "voa10.txt")]

        # Now, these will be unannotated, and should never be grabbed. 
        w.importFiles(docs, "core", file_type = "raw", strip_suffix = ".txt")

        w.runOperation("assign", ("voa7", "voa8"), user = "user1,user2,user3")

        # Mark a couple of them gold.

        w.runOperation("markgold", ("core", "voa9"), user = "user1")
        w.runOperation("markgold", ("core", "voa8"), user = "user2")
        w.runOperation("markgold", ("core", "voa8"), user = "user3")

        w.runOperation("add_to_basename_set", ("set1", "voa1", "voa3", "voa5", "voa7", "voa9"))
        w.runOperation("add_to_basename_set", ("set2", "voa4", "voa8", "voa10"))

        w.runOperation("list", (), fromCmdline = True)
        w.runOperation("list_basename_sets", (), fromCmdline = True)

        # So now, we have a variety of documents which can be sliced and diced in various ways.

        self._testViaProperties(w, ["voa1", "voa2", "voa3", "voa4", "voa5", "voa6", "voa8_user2",
                                    "voa9"],
                                users = "user2", includeUnassigned = True,
                                documentStatuses = "gold,reconciled")

        self._testViaXML(w, ["voa1", "voa2", "voa3", "voa4", "voa5", "voa6", "voa8_user2",
                             "voa9"],
                         """<experiment task='Named Entity'>
  <workspace_corpora workspace_dir='$(WS)'>
    <workspace_corpus name='test' document_statuses='gold,reconciled' users='user2'/>
  </workspace_corpora>
</experiment>""")

        self._testViaXML(w, ["voa1", "voa2", "voa3", "voa4", "voa5", "voa6", "voa8_user2",
                             "voa9"],
                         """<experiment task='Named Entity'>
  <workspace_corpora workspace_dir='$(WS)' users='user2'>
    <workspace_corpus name='test' document_statuses='gold,reconciled'/>
  </workspace_corpora>
</experiment>""")

        self._testViaXML(w, ["voa1", "voa2", "voa3", "voa4", "voa5", "voa6", "voa8_user2",
                             "voa9"],
                         """<experiment task='Named Entity'>
  <workspace_corpora workspace_dir='$(WS)' document_statuses='gold,reconciled' users='user2'>
    <workspace_corpus name='test'/>
  </workspace_corpora>
</experiment>""")

        self._testViaProperties(w, ["voa8_user2", "voa8_user3"],
                                documentStatuses = "gold", includeUnassigned = False)

        self._testViaXML(w, ["voa8_user2", "voa8_user3"],
                         """<experiment task='Named Entity'>
  <workspace_corpora workspace_dir='$(WS)'>
    <workspace_corpus name='test' document_statuses='gold' include_unassigned='no'/>
  </workspace_corpora>
</experiment>""")

        self._testViaXML(w, ["voa8_user2", "voa8_user3"],
                         """<experiment task='Named Entity'>
  <workspace_corpora workspace_dir='$(WS)' document_statuses='gold'>
    <workspace_corpus name='test' include_unassigned='no'/>
  </workspace_corpora>
</experiment>""")        

        self._testViaXML(w, ["voa8_user2", "voa8_user3"],
                         """<experiment task='Named Entity'>
  <workspace_corpora workspace_dir='$(WS)' document_statuses='gold' include_unassigned='no'>
    <workspace_corpus name='test'/>
  </workspace_corpora>
</experiment>""")

        self._testViaProperties(w, ["voa1", "voa3", "voa5", "voa8_user2", "voa4", "voa9"],
                                basenameSets = "set1,set2",
                                users = "user2")

        self._testViaXML(w, ["voa1", "voa3", "voa5", "voa8_user2", "voa4", "voa9"],
                         """<experiment task='Named Entity'>
  <workspace_corpora workspace_dir='$(WS)'>
    <workspace_corpus name='test' basename_sets='set1,set2' users='user2'/>
  </workspace_corpora>
</experiment>""")

        self._testViaXML(w, ["voa1", "voa3", "voa5", "voa8_user2", "voa4", "voa9"],
                         """<experiment task='Named Entity'>
  <workspace_corpora workspace_dir='$(WS)' basename_sets='set1,set2'>
    <workspace_corpus name='test' users='user2'/>
  </workspace_corpora>
</experiment>""")

        self._testViaXML(w, ["voa1", "voa3", "voa5", "voa8_user2", "voa4", "voa9"],
                         """<experiment task='Named Entity'>
  <workspace_corpora workspace_dir='$(WS)' basename_sets='set1,set2' users='user2'>
    <workspace_corpus name='test'/>
  </workspace_corpora>
</experiment>""")

        self._testViaProperties(w, ["voa1", "voa3", "voa5", "voa8_user2", "voa4", "voa9"],
                                basenamePatterns = "voa1,voa[1345],voa[7-9],voa10",
                                users = "user2")

        self._testViaXML(w, ["voa1", "voa3", "voa5", "voa8_user2", "voa4", "voa9"],
                         """<experiment task='Named Entity'>
  <workspace_corpora workspace_dir='$(WS)'>
    <workspace_corpus name='test' basename_patterns='voa1,voa[1345],voa[7-9],voa10' users='user2'/>
  </workspace_corpora>
</experiment>""")

        self._testViaXML(w, ["voa1", "voa3", "voa5", "voa8_user2", "voa4", "voa9"],
                         """<experiment task='Named Entity'>
  <workspace_corpora workspace_dir='$(WS)' basename_patterns='voa1,voa[1345],voa[7-9],voa10'>
    <workspace_corpus name='test' users='user2'/>
  </workspace_corpora>
</experiment>""")

        self._testViaXML(w, ["voa1", "voa3", "voa5", "voa8_user2", "voa4", "voa9"],
                         """<experiment task='Named Entity'>
  <workspace_corpora workspace_dir='$(WS)' basename_patterns='voa1,voa[1345],voa[7-9],voa10' users='user2'>
    <workspace_corpus name='test'/>
  </workspace_corpora>
</experiment>""")

    def _testViaProperties(self, w, expectedBasenames, users = None, includeUnassigned = True,
                           documentStatuses = None, basenameSets = None,
                           basenamePatterns = None):
        import shutil
        # Test both the experiment and the workspace. Test the engine directly
        # at both levels.
        testExp = os.path.join(self.testContext["TMPDIR"], "testExp")
        try:
            c = WorkspaceCorpus("test",
                                documentStatuses = documentStatuses,
                                basenameSets = basenameSets,
                                users = users,
                                includeUnassigned = includeUnassigned,
                                basenamePatterns = basenamePatterns)
            e = ExperimentEngine(dir = testExp, task = w.task,
                                 workspaceCorpusSets = [WorkspaceCorpusSet(w.dir,
                                                                           workspaceCorpora = [c])])
            e.run()
            self._checkPreparedFiles(expectedBasenames, testExp)
        finally:
            shutil.rmtree(testExp)
            
        try:
            c = WorkspaceCorpus("test")
            e = ExperimentEngine(dir = testExp, task = w.task,
                                 workspaceCorpusSets = [WorkspaceCorpusSet(w.dir,
                                                                           documentStatuses = documentStatuses,
                                                                           basenameSets = basenameSets,
                                                                           users = users,
                                                                           includeUnassigned = includeUnassigned,
                                                                           basenamePatterns = basenamePatterns,
                                                                           workspaceCorpora = [c])])
            e.run()
            self._checkPreparedFiles(expectedBasenames, testExp)
        finally:
            shutil.rmtree(testExp)

        # Finally, inside the workspace engine.
        o = w.getOperation("run_experiment", ())
        # This may fail, because I can't block it from
        # actually running an experiment, and I may have selected
        # an empty set of files. So.
        try:
            o.do(test_document_statuses = documentStatuses,
                 test_basename_sets = basenameSets,
                 test_users = users,
                 test_exclude_unassigned = not includeUnassigned,
                 test_basename_patterns = basenamePatterns,
                 workflow = "Demo",
                 tag_step = "tag")
        except:
            # Just for informational purposes.
            # import traceback
            # traceback.print_exc()
            pass
        self._checkPreparedFiles(expectedBasenames, o.experimentDir)

    def _testViaXML(self, w, expectedBasenames, xmlString):

        import shutil, codecs
        # Test both the experiment and the workspace. Test the engine directly
        # at both levels.
        testExp = os.path.join(self.testContext["TMPDIR"], "testExp")
        os.makedirs(testExp)
        expFile = os.path.join(testExp, "exp.xml")
        fp = codecs.open(expFile, "w", "utf8")
        fp.write(xmlString)
        fp.close()

        try:
            e = ExperimentEngine(**fromXML(expFile, dir = testExp,
                                           bindingDict = {"WS": w.dir}))
            e.run()
            self._checkPreparedFiles(expectedBasenames, testExp)
        finally:
            shutil.rmtree(testExp)

        testExp = os.path.join(self.testContext["TMPDIR"], "testExp")
        os.makedirs(testExp)
        expFile = os.path.join(testExp, "exp.xml")
        fp = codecs.open(expFile, "w", "utf8")
        fp.write(xmlString)
        fp.close()

        o = w.getOperation("run_experiment", ())
        try:
            o.do(experiment_file = expFile, workspace_binding = "WS")
        except:
            # Just for informational purposes.
            # import traceback
            # traceback.print_exc()
            pass
        finally:
            shutil.rmtree(testExp)
        self._checkPreparedFiles(expectedBasenames, o.experimentDir)        

    def _checkPreparedFiles(self, expectedBasenames, expDir):
        preparedFiles = os.path.join(expDir, "corpora", "test", "prepared_files.txt")
        fp = open(preparedFiles, "r")
        fileNames = [os.path.basename(l.strip()) for l in fp.readlines()]
        fp.close()
        self.assertEqual(set(fileNames), set(expectedBasenames))

        
class WorkspaceStatusTestCase(WorkspaceBaseTestCase):

    def setUp(self):
        WorkspaceBaseTestCase.setUp(self)
        self.workspace = self._createWorkspace(taskName = "Named Entity",
                                               create = True, 
                                               initialUsers = ["user1"])

    def testLogging(self):
        self.workspace.runOperation("disable_logging", [])
        self.assertEqual(self.workspace.getDB().loggingEnabled(), False)
        self.assertEqual(self.workspace.logger, None)
        self.workspace.runOperation("enable_logging", [])
        self.assertEqual(self.workspace.getDB().loggingEnabled(), True)

    def disabledTestReconciliationPhases(self):
        self.assertEqual(self.workspace.getDB().getReconciliationPhases(), [])
        self.workspace.runOperation("configure_reconciliation", ["human_decision"])
        self.assertEqual([e.name for e in self.workspace.reconciliationPhases], ["human_decision"])
        self.assertEqual(self.workspace.getDB().getReconciliationPhases(), ["human_decision"])
        
class WorkspaceLoggerTestCase(WorkspaceBaseTestCase):

    def testModelBuildPlusAutotag(self):

        # Import half the JSON files to completed, the rest of the
        # raw to raw, unprocessed. Then modelbuild plus autotag,
        # then autotag again with a limited set of basenames.

        w = self._createWorkspace(taskName = "Named Entity", create = True,
                                  initialUsers = ["user1"])

        w.runOperation("enable_logging", [])
        
        import glob, random

        jsonFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "json", "*.txt.json"))
        random.shuffle(jsonFiles)
        someJsonFiles = jsonFiles[:5]

        # Pull them into completed.

        w.importFiles(someJsonFiles, "core", document_status = "reconciled",
                      strip_suffix = ".txt.json")

        # Now, grab the rest of them:

        txtFiles = glob.glob(os.path.join(self.sampleDir, "resources", "data", "raw", "*.txt"))

        # Import them. Some are duplicates, so we have to skip them.

        someTxtFiles = [f for f in txtFiles
                        if f.replace(os.sep +"raw" + os.sep,
                                     os.sep + "json" + os.sep) + ".json" not in someJsonFiles]

        w.importFiles(someTxtFiles, "core", file_type = "raw",
                      strip_suffix = ".txt")

        # Now, let's modelbuild and autotag. Let's only autotag some
        # of the available files.

        txtBasenames = [r[1] for r in w.getDB().basenameInfo([os.path.splitext(os.path.basename(x))[0] for x in someTxtFiles])]

        random.shuffle(txtBasenames)
        someTxtBasenames = txtBasenames[:2]

        w.runFolderOperation("core", "modelbuild", do_autotag = True,
                             autotag_basename_list = someTxtBasenames)

        # Now, all the basenames in someTxtBasenames should be uncorrected
        # and the remainder should be in unannotated, and the
        # processed ones should be reconciled. 

        theRest = txtBasenames[2:]
        theRest.sort()

        # Now, let's specify basenames. Process some of theRest, and all of
        # someTxtBasenames. This should not break, even though we're asking for
        # some documents to be autotagged which aren't in those directories.
        # The result should be that what we DON'T process from theRest should
        # now be in raw, unprocessed, and autotagged should contain everything
        # among the text basenames except what we omitted from theRest.

        w.runFolderOperation("core", "autotag", basenames = theRest[:-1])

        # OK, so now I've run a bunch of stuff. What should be in the log?

        self.assertTrue(os.path.exists(os.path.join(self.wdir, "_checkpoint")))

        # Next, we can look in the event log.
        wr = MAT.WorkspaceLogger.WorkspaceRerunner(w)
        # Read the event_log.
        import codecs, json
        fp = codecs.open(os.path.join(wr.wsLog, "event_log"), "r", "utf-8")
        dList = [json.loads(line.strip()) for line in fp.readlines()]
        fp.close()

        # There should be four entries.
        self.assertEqual(len(dList), 4)
        # The operations should be in this order:
        self.assertEqual([d["operation"]["name"] for d in dList], ["import", "import", "autotag", "autotag"])

        # We should be able to roll forward to the second timestamp.
        wr.rollForward(stopAt = dList[1]["timestamp"])

        # At this point, our rerun workspace should be in the same state as after the first import.
        self.assertEqual(set(os.listdir(os.path.join(wr.wsLog, "_rerun", "workspace", "folders", "core"))),
                         set([os.path.basename(j[:-9]) for j in someJsonFiles]))
        # Make sure it can finish.
        wr.rollForward()

# And now, users and reconciliation in the workspace.

from mat_unittest_resources import TestDocument, ReconciliationTestDocument
from MAT.ReconciliationDocument import _getListValue
from MAT.Workspace import findReconciliationPhases

class WorkspacePluginContextTestCase(MAT.UnitTest.MATTestCase):
    
    def setUp(self, taskName = "Named Entity", sampleDataDir  = "ne"):
        MAT.UnitTest.MATTestCase.setUp(self)
        # This isn't EXACTLY the right data - it's got tokens, for one thing,
        # and for another thing, it's got no segments yet. So the data
        # needs to be rezoned.
        self.sampleData = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", sampleDataDir, "resources", "data")
        self.pDict = MAT.PluginMgr.LoadPlugins()
        self.task = self.pDict.getTask(taskName)
        self.wdir = os.path.join(self.testContext["TMPDIR"], "testWorkspace")
        self.workspace = MAT.Workspace.Workspace(self.wdir, taskName = taskName, create = True,
                                                 initialUsers = ["user1"])

    def tearDown(self):
        self.workspace.closeDB()
        shutil.rmtree(self.wdir)

    def _importGoldStandardDocs(self, ws, docNames, **kw):
        p = os.path.join(self.testContext["TMPDIR"], "docprep")
        if os.path.isdir(p):
            shutil.rmtree(p)
        os.mkdir(p)
        # Read in the docs we have, forcibly undo the zone and tokenize steps,
        # save to docprep, and then import. zone should happen automagically.
        # The other issue is that the data has the wrong attribute name;
        # we use ENAMEX:TYPE in the active learning task, and the original
        # ne_enamex data uses ENAMEX:type. The way to fix this is painful:
        # do surgery directly on the annotation types.
        _jsonIO = MAT.DocumentIO.getDocumentIO("mat-json", task = self.task)
        # Untokenize. We have no tokenizer.
        untokStep = MAT.PluginMgr.CmdlineTokenizationStep(None, self.task, None)
        # Unzone. Don't care what the zoner was.
        unzoneStep = MAT.PluginMgr.ZoneStep(None, self.task, None)
        for dName in docNames:
            d = _jsonIO.readFromSource(os.path.join(self.sampleData, "json", dName))
            unzoneStep.undo(d)
            d.stepUndone("zone")
            untokStep.undo(d)
            d.stepUndone("tokenize")
            _jsonIO.writeToTarget(d, os.path.join(p, dName))
        ws.importFiles([os.path.join(p, dName) for dName in docNames], "core",
                       document_status = "reconciled", strip_suffix = ".txt.json",
                       **kw)
        shutil.rmtree(p)

    def _importRawDocs(self, ws, docNames, **kw):
        ws.importFiles([os.path.join(self.sampleData, "raw", dName) for dName in docNames], "core",
                       file_type = "raw", strip_suffix = ".txt", **kw)


class ReconciliationWorkspacePluginContextTestCase(WorkspacePluginContextTestCase):

    def setUp(self):
        WorkspacePluginContextTestCase.setUp(self, taskName = "Named Entity (ENAMEX)", sampleDataDir  = "ne_enamex")

    def _printDoc(self, doc):
        MAT.UnitTest.MATTestCase._printDoc(self, doc, self.task)

    def _checkBasenameInfo(self, ws, bsDict):
        # bsDict is a hash from (docname, basename) to (status, assigned, locked)
        basenames = set([k[1] for k in bsDict.keys()])
        for docName, basename, status, assignedUser, lockedBy in ws.getDB().basenameInfo(list(basenames)):
            try:
                bStatus, bAssigned, bLocked = bsDict[(docName, basename)]
            except KeyError:
                continue
            self.failUnless(status == bStatus and assignedUser == bAssigned and lockedBy == bLocked,
                            "%s != %s or %s != %s or %s != %s" % (status, bStatus, assignedUser, bAssigned, lockedBy, bLocked))

    def _checkReconciliationInfo(self, ws, bsDict):
        # bsDict is a hash from basenames to [curPhase, lockedBy, [(phase, reviewer, done)]]
        tables = ws.getDB().dumpDatabase(tables = ('reconciliation_phase_info', 'reconciliation_assignment_info'))
        basenames = bsDict.keys()
        dDict = dict([(b, [None, None, []]) for b in basenames])
        for t in tables:
            if t["table"] == "reconciliation_phase_info":
                for bName, phase, lockedBy, lockId in t["data"]:
                    try:
                        d = dDict[bName]
                    except KeyError:
                        continue
                    d[0] = phase
                    d[1] = lockedBy
            elif t["table"] == "reconciliation_assignment_info":
                for bName, phase, reviewer, done in t["data"]:
                    try:
                        d = dDict[bName]
                    except KeyError:
                        continue
                    d[2].append((phase, reviewer, done))
        for b, entry in bsDict.items():
            d = dDict[b]
            self.failUnless(d[0] == entry[0] and d[1] == entry[1] and set(d[2]) == set(entry[2]),
                            "%s != %s" % (d, entry))

    def _splitSegmentsAfter(self, d, annot):
        # I have this function because in the original implementation, we were
        # using a tagger that also segmented the doc for active learning, which
        # we no longer believe in. The tests that I inherited from there assumed
        # more than one segment in the reconciliation tests below.
        segs = d.orderAnnotations(["SEGMENT"])
        if len(segs) < 2:
            oldSeg = segs[0]
            aid = oldSeg.id
            oldSeg.id = None
            newSeg = oldSeg.copy()
            d._addAnnotation(newSeg)
            oldSeg.id = aid
            newSeg.start = annot.end
            oldSeg.end = annot.end

    # We need this because we haven't configured the folds in the task.xml.
    # I haven't configured the prep or engine workflows, either, but those
    # have to be specified in XML - the command line arguments must be
    # explicitly listed, but not the settings for the folders.
    
    def _submitToReconciliation(self, **kw):
        self.workspace.runFolderOperation("core", "submit_to_reconciliation",
                                          folds = 5, **kw)


# And now, the real tests.

# NOTE: These tests have been disabled until workspace reconciliation
# is supported in the UI. See also testReconciliationPhases above.

class WorkspaceReconciliationTestCase(ReconciliationWorkspacePluginContextTestCase):

    def disabledTestSimpleEntryAndExit(self):
        # In this test, we do the basic reconciliation stuff, but
        # in a workspace.
        # So first, we insert a bunch of documents and modelbuild, to give us
        # a baseline. And add a user first, because we need one now. And it
        # needs to be the human decider.
        self.workspace.runOperation("add_roles", ["user1"], roles = "all")
        self._importGoldStandardDocs(self.workspace, ["voa1.txt.json", "voa2.txt.json"])
        # Build a model.
        self.workspace.runFolderOperation("core", "modelbuild")
        # Insert another document.
        self._importRawDocs(self.workspace, ["voa3.txt"])
        # Autotag.
        self.workspace.runFolderOperation("core", "autotag")
        # Configure the workspace.
        self.workspace.configureReconciliation("crossvalidation_challenge", "human_vote", "human_decision")

        # First round of checking. Three docs, two reconciled, one uncorrected.
        self._checkBasenameInfo(self.workspace,
                                {("voa1", "voa1"): ["reconciled", None, None],
                                 ("voa2", "voa2"): ["reconciled", None, None],
                                 ("voa3", "voa3"): ["uncorrected", None, None]})
        
        # Open the document. Find the first annotation, find the segment
        # it's in, change the label, mark the segment gold. I need to go
        # through the operations in order to have the DB updated appropriately.
        # And I can't call openWorkspaceFile, because it doesn't return the
        # transaction ID yet. Oops - that only is called in test suites, so I CAN
        # fix it.
        
        docToMangle, lockId = self.workspace.openWorkspaceFile("core", "voa3", user = "user1")

        # Next round of checking. voa3 is uncorrected, but locked.
        self._checkBasenameInfo(self.workspace,
                                {("voa3", "voa3"): ["uncorrected", None, "user1"]})

        docToMangle.__class__ = TestDocument        
        firstAnnot = docToMangle.orderAnnotations(self.task.getAnnotationTypesByCategory('content'))[0]
        self._splitSegmentsAfter(docToMangle, firstAnnot)
        seg = docToMangle._findSegmentIncludingIndex(firstAnnot.end, canEqual = True)
        docToMangle.removeAnnotation(firstAnnot)
        if firstAnnot["type"] == "PERSON":
            newType = "ORGANIZATION"
        else:
            newType = "PERSON"
        docToMangle.createAnnotation(firstAnnot.start, firstAnnot.end, "ENAMEX", {"type": newType})
        seg["status"] = "human gold"
        seg["annotator"] = "user1"
        # Save it.        
        self.workspace.folders["core"].saveFile(docToMangle, "voa3")
        # And then save and close. Remember, we don't usually need to
        # perform this operation except from the UI, so it's a little clumsy -
        # you save the file above and then run the save operation, which does
        # all the updates.
        self.workspace.runFolderOperation("core", "save", basenames = ["voa3"],
                                          lock_id = lockId, release_lock = True)

        # Next round of checking. voa3 is partially gold.
        self._checkBasenameInfo(self.workspace,
                                {("voa3", "voa3"): ["partially gold", None, None]})

        # Now, submit it to reconciliation. NOTE: later, check rollback with a bad user.
        self._submitToReconciliation(basenames = ["voa3"], human_decision_user = "user1")

        # Next round of checking. voa3 is partially gold, and locked by reconciliation.
        self._checkBasenameInfo(self.workspace,
                                {("voa3", "voa3"): ["partially gold", None, "RECONCILIATION"]})
        # bsDict is a hash from basenames to [curPhase, lockedBy, [(phase, reviewer, done)]]
        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["crossvalidation_challenge", None,
                                                [("crossvalidation_challenge", "user1", 0),
                                                 ("human_vote", "user1", 0),
                                                 ("human_decision", "user1", 0)]]})

        class GoldSegReviewer:

            def __init__(self, t, basename, user):
                self.basename = basename
                self.user = user
                self.test = t

            def __enter__(self):
                self.d, self.lockId = self.test.workspace.openWorkspaceFile("reconciliation",
                                                                            self.basename, user = self.user)
                self.d.__class__ = ReconciliationTestDocument
                # There had better be exactly one human gold segment.
                goldSegs = [s for s in self.d.getAnnotations(["SEGMENT"]) if s["status"] == "human gold"]
                self.test.failUnless(len(goldSegs) == 1)

                self.goldSeg = goldSegs[0]
                return (self.d, self.goldSeg)

            def __exit__(self, exc_type, exc_value, traceback):
                self.goldSeg["reviewed_by"] = ",".join(set(_getListValue(goldSeg, "reviewed_by") + [self.user]))
                # Save it. Use the serialization, to simulate the UI exactly.
                # This is especially important when I add a vote.
                bytes = MAT.DocumentIO.getDocumentIO("mat-json", task = self.test.task).writeToByteSequence(self.d)
                # And then save and close. 
                self.test.workspace.runFolderOperation("reconciliation", "save", basenames = [self.basename],
                                                       doc = bytes, lock_id = self.lockId, release_lock = True)

        # Just open and close.
        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            pass

        # We should have automagically advanced. In fact, actually, it should have
        # exited reconciliation, because on close, it found that the
        # human vote phase was passed by.
        self.failUnless(len(self.workspace.getDB().reconciliationInfo(["voa3"])) == 0)

        # Now, let's do it again. Save the docToMangle one more time, and then
        # submit it to reconciliation, again, but this time, add a new user.

        ignore, lockId = self.workspace.openWorkspaceFile("core", "voa3", user = "user1")        
        self.workspace.folders["core"].saveFile(docToMangle, "voa3")
        self.workspace.runFolderOperation("core", "save", basenames = ["voa3"],
                                          lock_id = lockId, release_lock = True)
        
        self.workspace.registerUsers("user2")
        self._submitToReconciliation(basenames = ["voa3"], human_decision_user = "user1")

        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["crossvalidation_challenge", None,
                                                [("crossvalidation_challenge", "user1", 0),
                                                 ("human_vote", "user1", 0),
                                                 ("human_vote", "user2", 0),
                                                 ("human_decision", "user1", 0)]]})

        # NOW, do the crossvalidation challenge.

        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            pass

        # NOW, we shouldn't have advanced past anything except crossvalidation_challenge,
        # because there are multiple users, and if user2 gets there first, she may
        # add a vote, which user1 would have to review.

        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["human_vote", None,
                                                [("crossvalidation_challenge", "user1", 1),
                                                 ("human_vote", "user1", 0),
                                                 ("human_vote", "user2", 0),
                                                 ("human_decision", "user1", 0)]]})

        # At this point, we have user2 vote for user1's vote.

        with GoldSegReviewer(self, "voa3", "user2") as (d, goldSeg):
            for v in d._votesForSegments().get(goldSeg, []):
                if v["annotator"].find("user1") > -1:
                    v["annotator"] += ",user2"

        # No advance yet.
        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["human_vote", None,
                                                [("crossvalidation_challenge", "user1", 1),
                                                 ("human_vote", "user1", 0),
                                                 ("human_vote", "user2", 1),
                                                 ("human_decision", "user1", 0)]]})

        # Now, user1 votes. (We're doing all this with openWorkspaceFile; we'll do it
        # with nextDoc in the next test.) And actually, she doesn't need to do anything
        # except open and close the document.

        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            pass

        # We should have automagically advanced. In fact, actually, it should have
        # exited reconciliation, because on close, it found that the
        # human vote phase was passed by.
        self.failUnless(len(self.workspace.getDB().reconciliationInfo(["voa3"])) == 0)
        
        # OK, one more time. Same damn thing, except now user2 votes for the machine's
        # vote. This should STILL reconcile the document, since the reviewer is
        # user1.

        ignore, lockId = self.workspace.openWorkspaceFile("core", "voa3", user = "user1")        
        self.workspace.folders["core"].saveFile(docToMangle, "voa3")
        self.workspace.runFolderOperation("core", "save", basenames = ["voa3"],
                                          lock_id = lockId, release_lock = True)
        self._submitToReconciliation(basenames = ["voa3"], human_decision_user = "user1")

        # Crossvalidation challenge.

        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            pass

        # At this point, we have user2 vote for MACHINE's vote.

        with GoldSegReviewer(self, "voa3", "user2") as (d, goldSeg):
            for v in d._votesForSegments().get(goldSeg, []):
                if v["annotator"].find("MACHINE") > -1:
                    v["annotator"] += ",user2"

        # User1 votes, which automagically advances the doc out of reconciliation.

        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            pass

        self.failUnless(len(self.workspace.getDB().reconciliationInfo(["voa3"])) == 0)

        # OK, we add a THIRD user. At this point, the document is reconciled if the
        # vote is 2 to 1. Let's try that case first.

        self.workspace.registerUsers("user3", roles = "all")

        ignore, lockId = self.workspace.openWorkspaceFile("core", "voa3", user = "user1")        
        self.workspace.folders["core"].saveFile(docToMangle, "voa3")
        self.workspace.runFolderOperation("core", "save", basenames = ["voa3"],
                                          lock_id = lockId, release_lock = True)
        self._submitToReconciliation(basenames = ["voa3"], human_decision_user = "user3")
        
        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["crossvalidation_challenge", None,
                                                [("crossvalidation_challenge", "user1", 0),
                                                 ("human_vote", "user1", 0),
                                                 ("human_vote", "user2", 0),
                                                 ("human_vote", "user3", 0),
                                                 ("human_decision", "user3", 0)]]})

        # Crossvalidation challenge. 

        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            pass

        # At this point, we have user2 and user3 vote for MACHINE's vote.

        for user in ["user2", "user3"]:
            with GoldSegReviewer(self, "voa3", user) as (d, goldSeg):
                for v in d._votesForSegments().get(goldSeg, []):
                    if v["annotator"].find("MACHINE") > -1:
                        v["annotator"] += "," + user

        # User1 doesn't have to vote: she's outvoted already. But the greedy
        # advancement algorithm doesn't implement that optimization yet, because
        # in the future, we may do on-demand assignment, and we won't know in
        # the middle how many voters we have at the end.

        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["human_vote", None,
                                                [("crossvalidation_challenge", "user1", 1),
                                                 ("human_vote", "user1", 0),
                                                 ("human_vote", "user2", 1),
                                                 ("human_vote", "user3", 1),
                                                 ("human_decision", "user3", 0)]]})

        # Once user1 opens the document and saves it, her preference is recorded.
        # Because the next round has only one annotator, we advance into it,
        # and because no new votes were added, it advances out.

        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            pass
        
        self.failUnless(len(self.workspace.getDB().reconciliationInfo(["voa3"])) == 0)

        # Finally, we experiment with new votes.
        
        ignoreD, lockId = self.workspace.openWorkspaceFile("core", "voa3", user = "user1")
        
        self.workspace.folders["core"].saveFile(docToMangle, "voa3")
        self.workspace.runFolderOperation("core", "save", basenames = ["voa3"],
                                          lock_id = lockId, release_lock = True)
        self._submitToReconciliation(basenames = ["voa3"], human_decision_user = "user3")

        # Crossvalidation challenge. 

        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            pass

        # user2 votes for empty, user3 votes for the machine's vote. 

        with GoldSegReviewer(self, "voa3", "user3") as (d, goldSeg):
            for v in d._votesForSegments().get(goldSeg, []):
                if v["annotator"].find("MACHINE") > -1:
                    v["annotator"] += ",user3"
                    break

        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["human_vote", None,
                                                [("crossvalidation_challenge", "user1", 1),
                                                 ("human_vote", "user1", 0),
                                                 ("human_vote", "user2", 0),
                                                 ("human_vote", "user3", 1),
                                                 ("human_decision", "user3", 0)]]})
        
        with GoldSegReviewer(self, "voa3", "user2") as (d, goldSeg):
            d._addVote(goldSeg, "", "user2", self.task)
            
        # Now, user1 votes for MACHINE too.

        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            for v in d._votesForSegments().get(goldSeg, []):
                anns = _getListValue(v, "annotator")
                if "user1" in anns:
                    anns.remove("user1")
                    v["annotator"] = ",".join(anns)
                if v["annotator"].find("MACHINE") > -1:
                    v["annotator"] += ",user1"
                        
            self._printDoc(d)

        # But now, because user2 added a vote, user3 has to review again.
        
        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["human_vote", None,
                                                [("crossvalidation_challenge", "user1", 1),
                                                 ("human_vote", "user1", 1),
                                                 ("human_vote", "user2", 1),
                                                 ("human_vote", "user3", 0),
                                                 ("human_decision", "user3", 0)]]})

        with GoldSegReviewer(self, "voa3", "user3") as (d, goldSeg):
            pass

        # But this will cause the document to escape from reconciliation, because
        # it's got enough votes to reconcile without going to human decision.
        # (And if it went to human decision, it would exit anyway, because
        # the last reviewer is also the decider).

        self.failUnless(len(self.workspace.getDB().reconciliationInfo(["voa3"])) == 0)

        # Now, we do the same thing, but user1 votes for herself. The
        # reviewer is user3, so it doesn't advance automatically.

        ignore, lockId = self.workspace.openWorkspaceFile("core", "voa3", user = "user1")        
        self.workspace.folders["core"].saveFile(docToMangle, "voa3")
        self.workspace.runFolderOperation("core", "save", basenames = ["voa3"],
                                          lock_id = lockId, release_lock = True)
        self._submitToReconciliation(basenames = ["voa3"], human_decision_user = "user3")

        # Crossvalidation challenge. 

        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            pass

        # user2 votes for empty, user3 votes for the machine's vote. 

        with GoldSegReviewer(self, "voa3", "user3") as (d, goldSeg):
            for v in d._votesForSegments().get(goldSeg, []):
                if v["annotator"].find("MACHINE") > -1:
                    v["annotator"] += ",user3"
                    break

        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["human_vote", None,
                                                [("crossvalidation_challenge", "user1", 1),
                                                 ("human_vote", "user1", 0),
                                                 ("human_vote", "user2", 0),
                                                 ("human_vote", "user3", 1),
                                                 ("human_decision", "user3", 0)]]})
        
        with GoldSegReviewer(self, "voa3", "user2") as (d, goldSeg):
            d._addVote(goldSeg, "", "user2", self.task)

        # At this point, user 3 has to review again.

        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["human_vote", None,
                                                [("crossvalidation_challenge", "user1", 1),
                                                 ("human_vote", "user1", 0),
                                                 ("human_vote", "user2", 1),
                                                 ("human_vote", "user3", 0),
                                                 ("human_decision", "user3", 0)]]})

        with GoldSegReviewer(self, "voa3", "user3") as (d, goldSeg):
            pass
        
        # And user1 votes for herself. 

        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            pass

        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["human_decision", None,
                                                [("crossvalidation_challenge", "user1", 1),
                                                 ("human_vote", "user1", 1),
                                                 ("human_vote", "user2", 1),
                                                 ("human_vote", "user3", 1),
                                                 ("human_decision", "user3", 0)]]})
        
        # Now, the reviewer opens it. Nothing to do, since she's already reviewed it.
        # Done.

        with GoldSegReviewer(self, "voa3", "user3") as (d, goldSeg):
            self.failIf(goldSeg["to_review"] == "yes")
        
        self.failUnless(len(self.workspace.getDB().reconciliationInfo(["voa3"])) == 0)
        
        # Now, we add a fourth user. The votes will be such that no one wins, but
        # the reviewer doesn't win yet either.

        self.workspace.registerUsers("user4")

        ignore, lockId = self.workspace.openWorkspaceFile("core", "voa3", user = "user1")        
        self.workspace.folders["core"].saveFile(docToMangle, "voa3")
        self.workspace.runFolderOperation("core", "save", basenames = ["voa3"],
                                          lock_id = lockId, release_lock = True)
        self._submitToReconciliation(basenames = ["voa3"], human_decision_user = "user3")

        # Crossvalidation challenge. 

        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            pass

        # user3 votes for empty, user2 and user4 vote for the machine's vote. 
        
        with GoldSegReviewer(self, "voa3", "user3") as (d, goldSeg):
            d._addVote(goldSeg, "", "user3", self.task)

        for user in ["user2", "user4"]:
            with GoldSegReviewer(self, "voa3", user) as (d, goldSeg):
                for v in d._votesForSegments().get(goldSeg, []):
                    if v["annotator"].find("MACHINE") > -1:
                        v["annotator"] += "," + user
                        break

        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["human_vote", None,
                                                [("crossvalidation_challenge", "user1", 1),
                                                 ("human_vote", "user1", 0),
                                                 ("human_vote", "user2", 1),
                                                 ("human_vote", "user3", 1),
                                                 ("human_vote", "user4", 1),
                                                 ("human_decision", "user3", 0)]]})
        
        # And user1 votes for herself. 

        with GoldSegReviewer(self, "voa3", "user1") as (d, goldSeg):
            pass

        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["human_decision", None,
                                                [("crossvalidation_challenge", "user1", 1),
                                                 ("human_vote", "user1", 1),
                                                 ("human_vote", "user2", 1),
                                                 ("human_vote", "user3", 1),
                                                 ("human_vote", "user4", 1),
                                                 ("human_decision", "user3", 0)]]})
        
        # Now, the reviewer opens it. There IS something to review, because the
        # reviewer was outvoted by at least one other vote.

        with GoldSegReviewer(self, "voa3", "user3") as (d, goldSeg):
            self.failUnless(goldSeg["to_review"] == "yes")

        # And once we close it, it should exit reconciliation.
        self.failUnless(len(self.workspace.getDB().reconciliationInfo(["voa3"])) == 0)

class NullReconciliationTestCase(ReconciliationWorkspacePluginContextTestCase):
        
    def disabledTestAlreadyReconciled(self):
        # In this test, we do the basic reconciliation stuff, but
        # in a workspace.
        # So first, we insert a bunch of documents and modelbuild, to give us
        # a baseline. And add a user first, because we need one.
        self.workspace.runOperation("add_roles", ["user1"], roles = "all")
        self._importGoldStandardDocs(self.workspace, ["voa1.txt.json", "voa2.txt.json"])
        # Build a model.
        self.workspace.runFolderOperation("core", "modelbuild")
        # Insert another document.
        self._importRawDocs(self.workspace, ["voa3.txt"])
        # Autotag.
        self.workspace.runFolderOperation("core", "autotag")
        # Configure the workspace.
        self.workspace.configureReconciliation("crossvalidation_challenge", "human_vote", "human_decision")

        # Mark it partially gold.
        docToMangle, lockId = self.workspace.openWorkspaceFile("core", "voa3", user = "user1")
        docToMangle.__class__ = TestDocument
        firstAnnot = docToMangle.orderAnnotations(self.task.getAnnotationTypesByCategory('content'))[0]
        self._splitSegmentsAfter(docToMangle, firstAnnot)
        seg = docToMangle._findSegmentIncludingIndex(firstAnnot.end, canEqual = True)
        seg["status"] = "human gold"
        seg["annotator"] = "user1"
        # Save it.        
        self.workspace.folders["core"].saveFile(docToMangle, "voa3")
        self.workspace.runFolderOperation("core", "save", basenames = ["voa3"],
                                          lock_id = lockId, release_lock = True)                                                             

        # Next round of checking. voa3 is partially gold.
        self._checkBasenameInfo(self.workspace,
                                {("voa3", "voa3"): ["partially gold", None, None]})
        
        # Now, submit it to reconciliation. NOTE: later, check rollback with a bad user.
        self._submitToReconciliation(basenames = ["voa3"], human_decision_user = "user1")

        # Now, the only document should be completely reconciled. And in fact, it should
        # have been ejected from reconciliation.

        self.failUnless(len(self.workspace.getDB().reconciliationInfo(["voa3"])) == 0)

        # And, in fact, the core document should now have no gold 
        # segments, but rather either non-gold or reconciled.
        
        docToMangle = self.workspace.folders["core"].openFile("voa3")
        for seg in docToMangle.getAnnotations(["SEGMENT"]):
            self.failUnless(seg["status"] in ("non-gold", "reconciled"), "seg status is %s" % seg["status"])

class UserTestCase(ReconciliationWorkspacePluginContextTestCase):

    def disabledTestRoles(self):
        phases = findReconciliationPhases()
        # Register a user, with default roles.
        d = self.workspace.getDB().listUsersAndRoles()
        self.failUnless(set(d["user1"]) == set(["core_annotation"] + [p.name for p in phases.values() if p.roleIncludedInDefault]))

        self.workspace.registerUsers("user2", roles = "all")
        d = self.workspace.getDB().listUsersAndRoles()
        self.failUnless(set(d["user2"]) == set(["core_annotation"] + phases.keys()))

        # This should fail because there's already a user registered.
        try:
            self.workspace.registerUsers("user2")
            self.fail("reregister of user2 should have failed")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("already registered") > -1)

        # Add another user, with a bad phase name.

        try:
            self.workspace.registerUsers("user3", roles = "core_annotation,silly_phase")
            self.fail("registering silly_phase should have failed")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("Unknown user role") > -1)

        # Make sure that user3 really failed.
        d = self.workspace.getDB().listUsersAndRoles()
        self.failIf(d.has_key("user3"))

        # Now, the real registration.
        self.workspace.registerUsers("user3", roles = "core_annotation,human_vote")
        d = self.workspace.getDB().listUsersAndRoles()
        self.failUnless(set(d["user3"]) == set(["core_annotation", "human_vote"]))

        # OK, now, we should be able to add roles, even if they're already there.
        self.workspace.runOperation("add_roles", ("user3",), roles = "all")
        d = self.workspace.getDB().listUsersAndRoles()
        self.failUnless(set(d["user3"]) == set(["core_annotation"] + phases.keys()))

        # And we should be able to remove all roles.
        self.workspace.runOperation("remove_roles", ("user3",), roles = "all")
        d = self.workspace.getDB().listUsersAndRoles()
        self.failUnless(d["user3"] == [])

        # But if a document is open...
        self._importGoldStandardDocs(self.workspace, ["voa1.txt.json", "voa2.txt.json"])
        d, lockId = self.workspace.openWorkspaceFile("core", "voa1", user = "user1")

        # ...you shouldn't be able to remove the role.
        try:
            self.workspace.runOperation("remove_roles", ("user1",), roles = "core_annotation")
            self.fail("shouldn't have been able to remove the role")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("editing core document") > -1)

        self.workspace.runFolderOperation("core", "save", basenames = ["voa1"],
                                          lock_id = lockId, release_lock = True)

        # And user3 can't open it at all.
        try:
            d, lockId = self.workspace.openWorkspaceFile("core", "voa1", user = "user3")
            self.fail("shouldn't have been able to open voa1")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("user doesn't have the core_annotation role") > -1)

        # Now, I want to submit a document to reconciliation, and test the assignments.
        # Make the change just like above.
        
        # Build a model.
        self.workspace.runFolderOperation("core", "modelbuild")
        # Insert another document.
        self._importRawDocs(self.workspace, ["voa3.txt"])
        # Autotag.
        self.workspace.runFolderOperation("core", "autotag")
        # Configure the workspace.
        self.workspace.configureReconciliation("crossvalidation_challenge", "human_vote", "human_decision")

        # user1 has default roles, user3 has no roles, user2 has all roles.
        # So let's have user1 make the change.

        docToMangle, lockId = self.workspace.openWorkspaceFile("core", "voa3", user = "user1")

        # Next round of checking. voa3 is uncorrected, but locked.
        self._checkBasenameInfo(self.workspace,
                                {("voa3", "voa3"): ["uncorrected", None, "user1"]})

        docToMangle.__class__ = TestDocument        
        firstAnnot = docToMangle.orderAnnotations(self.task.getAnnotationTypesByCategory('content'))[0]
        self._splitSegmentsAfter(docToMangle, firstAnnot)
        seg = docToMangle._findSegmentIncludingIndex(firstAnnot.end, canEqual = True)
        docToMangle.removeAnnotation(firstAnnot)
        if firstAnnot["type"] == "PERSON":
            newType = "ORGANIZATION"
        else:
            newType = "PERSON"
        docToMangle.createAnnotation(firstAnnot.start, firstAnnot.end, "ENAMEX", {"type": newType})
        seg["status"] = "human gold"
        seg["annotator"] = "user1"
        # Save it.        
        self.workspace.folders["core"].saveFile(docToMangle, "voa3")
        # And then save and close. Remember, we don't usually need to
        # perform this operation except from the UI, so it's a little clumsy -
        # you save the file above and then run the save operation, which does
        # all the updates.
        self.workspace.runFolderOperation("core", "save", basenames = ["voa3"],
                                          lock_id = lockId, release_lock = True)

        # OK. So first, let's just submit it to reconciliation. user2 will end
        # up being the reviewer, since only she has all roles.
        
        self._submitToReconciliation(basenames = ["voa3"])

        # bsDict is a hash from basenames to [curPhase, lockedBy, [(phase, reviewer, done)]]
        self._checkReconciliationInfo(self.workspace,
                                      {"voa3": ["crossvalidation_challenge", None,
                                                [("crossvalidation_challenge", "user1", 0),
                                                 ("human_vote", "user1", 0),
                                                 ("human_vote", "user2", 0),
                                                 ("human_decision", "user2", 0)]]})

        # Now, try to remove some roles.
        try:
            self.workspace.runOperation("remove_roles", ("user2",), roles = "human_vote")
            self.fail("shouldn't have been able to remove human_vote")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("has an assignment in") > -1)

        self.workspace.runFolderOperation("reconciliation", "remove_from_reconciliation",
                                          basenames = ["voa3"], dont_reintegrate = True)
        
        # OK. Now, let's try to submit it with user3 as the decider. Should break.

        try:
            self._submitToReconciliation(basenames = ["voa3"], human_decision_user = "user3")
            self.fail("shouldn't have been able to make user3 the human_decision")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("does not have the human_decision role") > -1)

        # And now, remove the role from user2 and try.

        self.workspace.runOperation("remove_roles", ("user2",), roles = "human_decision")
        try:
            self._submitToReconciliation(basenames = ["voa3"])
            self.fail("shouldn't have been able to assign human_decision")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("no human_decision users available") > -1)

class AssignmentTestCase(WorkspacePluginContextTestCase):

    def testBadAssignmentOnImport(self):
        self.workspace.registerUsers(["user2"])
        self.workspace.runOperation("remove_roles", ("user1",), roles = "core_annotation")
        try:
            self._importRawDocs(self.workspace, ['voa6.txt', 'voa7.txt'],
                                assign = True, users = 'user1,user2')
            self.fail("raw import should have failed")
        except MAT.Workspace.WorkspaceError, e:
            self.failUnless(str(e).find("without the core_annotation role") > -1)

    def testOpen(self):
        self.workspace.registerUsers(["user2"])
        self._importGoldStandardDocs(self.workspace, ["voa1.txt.json", "voa2.txt.json"])
        self.workspace.runOperation("modelbuild", ("core",))
        self._importRawDocs(self.workspace, ['voa6.txt', 'voa7.txt', 'voa8.txt'],
                            assign = True, users = 'user1,user2')
        # Now, test an operation, making sure the right things happen
        # on the Web result.
        self.workspace.runOperation("markgold", ("core", "voa6"), user = "user1", resultFormat = MAT.Workspace.WEB_RESULT)
        # Check it.
        bInfo = self.workspace.getDB().basenameInfo(["voa6"])
        self.assertEqual("gold", [b for b in bInfo if b[3] == "user1"][0][2])
        self.assertEqual("unannotated", [b for b in bInfo if b[3] == "user2"][0][2])
        
        self.workspace.runOperation("unmarkgold", ("core", "voa6"), user = "user1", resultFormat = MAT.Workspace.WEB_RESULT)
        bInfo = self.workspace.getDB().basenameInfo(["voa6"])
        self.assertEqual("partially corrected", [b for b in bInfo if b[3] == "user1"][0][2])
        self.assertEqual("unannotated", [b for b in bInfo if b[3] == "user2"][0][2])

        # Open and autotag. First as user1.
        doc, lockId = self.workspace.runOperation("open_file", ("core", "voa7"), user = "user1",
                                                  resultFormat = MAT.Workspace.FN_RESULT)
        self.workspace.runOperation("autotag", ("core", "voa7"), lock_id = lockId, resultFormat = MAT.Workspace.WEB_RESULT)
        bInfo = self.workspace.getDB().basenameInfo(["voa7"])
        self.assertEqual("uncorrected", [b for b in bInfo if b[3] == "user1"][0][2])
        self.assertEqual("unannotated", [b for b in bInfo if b[3] == "user2"][0][2])
        # Close it.
        self.workspace.runOperation("force_unlock", ("core", "voa7"), user = "user1")

        # Now as user2, which should autotag.
        doc, lockId = self.workspace.runOperation("open_file", ("core", "voa8"), user = "user2",
                                                  resultFormat = MAT.Workspace.FN_RESULT)
        self.workspace.runOperation("autotag", ("core", "voa8"), lock_id = lockId, resultFormat = MAT.Workspace.WEB_RESULT)
        bInfo = self.workspace.getDB().basenameInfo(["voa8"])        
        self.assertEqual("unannotated", [b for b in bInfo if b[3] == "user1"][0][2])
        self.assertEqual("uncorrected", [b for b in bInfo if b[3] == "user2"][0][2])
