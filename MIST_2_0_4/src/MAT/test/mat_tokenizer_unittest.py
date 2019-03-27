# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from mat_unittest_resources import PluginContextTestCase, CmdlinePluginContextTestCase, \
     CmdlinePluginContextTestCaseWithTeardown
import MAT, os, shutil

class TokenizerTestCase(PluginContextTestCase):

    def runTest(self):
        
        # Let's make sure the tokenizer works.
        # Invent a doc path.        
        docPath = os.path.join(self.testContext["TMPDIR"], "tokenizer_test.txt")
        s = u'I like peas.'
        # Now, try to tokenize it. The setup is a bit
        # elaborate.
        
        impl = self.task.getTaskImplementation("Demo", ["tokenize", "zone"])
        
        import MAT.ToolChain, MAT.Document

        e = MAT.ToolChain.MATEngine(impl, "Demo")
        r = e.RunDataPairs([(docPath, MAT.DocumentIO.getDocumentIO("raw").readFromUnicodeString(s, taskSeed = impl))], ["zone", "tokenize"])
        if len(r) != 1:
            self.fail("Expected a single file pair back from tokenizer")
        if len(r[0]) != 2:
            self.fail("Bad file pair back from tokenizer")
        d = r[0][1]
        if not isinstance(d, MAT.Document.AnnotatedDoc):
            self.fail("Tokenizer result is not a document object")
        toks = d.atypeDict[d.anameDict['lex']]
        if len(toks) != 4:
            self.fail("Wrong number of tokens")
        toks = [d.signal[t.start:t.end] for t in toks]
        if toks != ["I", "like", "peas", "."]:
            self.fail("Wrong tokenization")

        # And let's make sure that if you try to run the tokenizer AGAIN
        # and the tokenization step isn't recorded, it still does the
        # right thing.

        d.metadata["phasesDone"] = []

        r = e.RunDataPairs([(docPath, d)], ["zone", "tokenize"])

        if len(r) != 1:
            self.fail("Expected a single file pair back from tokenizer")
        if len(r[0]) != 2:
            self.fail("Bad file pair back from tokenizer")
        d = r[0][1]
        if not isinstance(d, MAT.Document.AnnotatedDoc):
            self.fail("Tokenizer result is not a document object")
        toks = d.atypeDict[d.anameDict['lex']]
        if len(toks) != 4:
            self.fail("Wrong number of tokens")
        toks = [d.signal[t.start:t.end] for t in toks]
        if toks != ["I", "like", "peas", "."]:
            self.fail("Wrong tokenization")
        

# And also, I need to check to see whether the right things happen when
# tokenization from the old OCaml tokenizer to the new Java tokenizer
# does the right thing when the previous token overlapped with multiple
# annotations.

SIGNAL = """{"signal":"I went to Schleswig-Holstein with my mother.\u000a","metadata":{"phasesDone":["zone","tokenize","tag"]},"asets":[{"type":"lex","attrs":[],"annots":[[0,1],[2,6],[7,9],[10,19],[19,20],[20,28],[29,33],[34,36],[37,43],[43,44]]},{"type":"zone","attrs":["region_type"],"annots":[[0,45,"body"]]},{"type":"LOCATION","attrs":[],"annots":[[7,19]]},{"type":"ORGANIZATION","attrs":[],"annots":[[20,33]]}]}"""

class RetokenizationTestCase(CmdlinePluginContextTestCaseWithTeardown):

    def runTest(self):
        p = os.path.join(self.testContext["TMPDIR"], "retok_test")
        os.makedirs(p)
        fp = open(os.path.join(p, "retok_test.json"), "w")
        fp.write(SIGNAL)
        fp.close()        
        self.runCmdblock(cmd = ["%(MAT_PKG_HOME)s/bin/MATRetokenize",
                                "files",
                                "--task",
                                'Named Entity',
                                "--input_files",
                                "%(TMPDIR)s/retok_test/retok_test.json",
                                "--output_dir",
                                "%(TMPDIR)s/retok_test/out"])
        doc = MAT.DocumentIO.getDocumentIO("mat-json").readFromSource(os.path.join(self.testContext["TMPDIR"], "retok_test", "out", "retok_test.json"))
        # There should still be one location, but it'll be bigger.
        locs = doc.getAnnotations(["LOCATION"])
        self.assertEqual(len(locs), 1)
        self.assertEqual(locs[0].start, 7)
        self.assertEqual(locs[0].end, 28)
        orgs = doc.getAnnotations(["ORGANIZATION"])
        # There should still be one organization, but it'll be smaller.
        self.assertEqual(len(orgs), 1)
        self.assertEqual(orgs[0].start, 29)
        self.assertEqual(orgs[0].end, 33)

    def tearDown(self):
        CmdlinePluginContextTestCase.tearDown(self)
        shutil.rmtree(os.path.join(self.testContext["TMPDIR"], "retok_test"))

# And now, let's see if the tokenizer respects the zones.

class TokenizerZoneTestCase(PluginContextTestCase):

    def testTokenizationRespectsZoning(self):

        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")

        # Now, let's tag that same document.
        e = MAT.ToolChain.MATEngine(self.task.getTaskImplementation("Demo", []), "Demo")
        _jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')
        doc = _jsonIO.readFromSource(docPath)
        outPairs = e.RunDataPairs([("<doc>", doc)], undoThrough = "tokenize")
        outDoc = outPairs[0][1]
        # Make all the zone annotations of zero length.
        for z in outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("zone")):
            z.end = z.start
        outPairs = e.RunDataPairs(outPairs, steps = ["tokenize"])
        for z in outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("zone")):
            self.failUnless(z.end == z.start)
        self.failUnless(len(outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("token"))) == 0)

# Check tokenization of commas. Ben points out that he can't
# afford to customize the tokenizer - this may have been his last hurrah.

class CommaTokenizationTestCase(PluginContextTestCase):

    def testCommaTokenization(self):

        doc = MAT.Document.AnnotatedDoc(signal = u"His number is 800-555-6432, and I found 54,326 others.")
        e = MAT.ToolChain.MATEngine(self.task.getTaskImplementation("Demo", []), "Demo")
        
        outPairs = e.RunDataPairs([("<doc>", doc)], steps = ["zone", "tokenize"])
        outDoc = outPairs[0][1]
        toks = outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("token"))
        # There had better be a token from 26 - 27 (first comma), and from 40 - 46 (second comma).
        self.failUnless([outDoc.signal[a.start:a.end] for a in toks] == [u'His', u'number', u'is', u'800-555-6432', u',', u'and', u'I', u'found', u'54,326', u'others', u'.'])

# Here, we run the tokenizer on XML in the new Java Carafe tokenizer.
# If --handle_tags is present, it'll tokenize as XML.

class XMLTokenizationTestCase(PluginContextTestCase):

    def testNormalTokenization(self):

        doc = MAT.Document.AnnotatedDoc(signal = u"<doc id = 'id1'>This signal has some XML. &amp; it has < 2 entities.</doc>")
        e = MAT.ToolChain.MATEngine(self.task.getTaskImplementation("Demo", []), "Demo")
        
        outPairs = e.RunDataPairs([("<doc>", doc)], steps = ["zone", "tokenize"])
        outDoc = outPairs[0][1]
        toks = outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("token"))
        # I expect the tokenizer to be broken, but it's not clear exactly how.
        # At the moment, <doc is a single token, and the <doc> is < / doc>.
        strtoks = [outDoc.signal[a.start:a.end] for a in toks]
        print strtoks
        self.failUnless(strtoks[0] == '<doc')
        self.failUnless(strtoks[-1] == "doc>")

    def testXMLTokenization(self):
        doc = MAT.Document.AnnotatedDoc(signal = u"<doc id = 'id1'>This signal has some XML. &amp; it has one entity.</doc>")
        e = MAT.ToolChain.MATEngine(self.task.getTaskImplementation("Demo", []), "Demo")
        
        outPairs = e.RunDataPairs([("<doc>", doc)], steps = ["zone", "tokenize"], handle_tags = True)
        outDoc = outPairs[0][1]
        toks = outDoc.getAnnotations(self.task.getAnnotationTypesByCategory("token"))
        self.failUnless([outDoc.signal[a.start:a.end] for a in toks] == [u"<doc id = 'id1'>", u'This', u'signal', u'has', u'some', u'XML', u'.', u'&amp;', u'it', u'has', u'one', u'entity', u'.', u'</doc>'])

    def testBrokenXMLTokenization(self):
        doc = MAT.Document.AnnotatedDoc(signal = u"<doc id = 'id1'>This signal has some XML. &amp; it has < 2 entities.</doc>")
        e = MAT.ToolChain.MATEngine(self.task.getTaskImplementation("Demo", []), "Demo")

        try:
            e.RunDataPairs([("<doc>", doc)], steps = ["zone", "tokenize"], handle_tags = True)
            self.fail("Tokenization should have failed")
        except MAT.Error.MATError, e:
            self.failUnless(str(e).find("TokenMgrError") > -1)

class TokenizerUnicodeTestCase(PluginContextTestCase):

    def testCopyrightSymbol(self):
        # At one point, the tokenizer was barfing on copyright symbols, because
        # of a bug in the Carafe serializer.
        doc = MAT.Document.AnnotatedDoc(signal = u"Copyright \xa9 The Corporation. All Rights Reserved.")
        e = MAT.ToolChain.MATEngine(self.task.getTaskImplementation("Demo", []), "Demo")
        e.RunDataPairs([("<doc>", doc)], steps = ["zone", "tokenize"])
