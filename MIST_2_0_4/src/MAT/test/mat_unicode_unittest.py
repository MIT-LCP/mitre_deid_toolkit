# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from mat_unittest_resources import PluginContextTestCase
import MAT

import os

# We want the error to report which document it barfs on.
# Bug 17863.

# Hm. Overtaken by events here. Now that we actually handle Unicode,
# and we don't write out the \u elements, the tokenizer has no way
# of failing. So let's write out a JSON file instead. Nope, I'm
# too smart for myself. The JSON writer ALWAYS dumps the real
# Unicode. So I'll have to fail sooner.

# And now, since we have a Java tokenizer, tokenization should succeed,
# not fail.

class UnicodeTokenErrorTestCase(PluginContextTestCase):

    def runTest(self):

        import codecs

        # Invent a doc path.        
        docPath = os.path.join(self.testContext["TMPDIR"], "unicode_error.txt")
        # Use a random single character not in ASCII space.        
        s = u'\u6709'

        # Now, try to tokenize it. The setup is a bit
        # elaborate.
        
        impl = self.task.getTaskImplementation("Demo", ["zone", "tokenize"])
        
        import MAT.ToolChain, MAT.Document

        e = MAT.ToolChain.MATEngine(impl, "Demo")
        e.RunDataPairs([(docPath, MAT.DocumentIO.getDocumentIO("raw").readFromUnicodeString(s, taskSeed = impl))], ["zone", "tokenize"])

# Now the command line.

class UnicodeCommandLineErrorTestCase(MAT.UnitTest.CmdlinesTestCase):

    def setUp(self):
        # Save a latin1 file with a nonbreaking space.
        import codecs
        
        # Invent a doc path.        
        docPath = os.path.join(self.testContext["TMPDIR"], "unicode_cmdline_error.txt")
        # \240 is Latin 1 non-breaking space.
        s = u'I\240like\240peas.'
        fp = codecs.open(docPath, "w", "latin1")
        fp.write(s)
        fp.close()

    # And the cmdline block just tries to load the file. This should break
    # unless the encoding is latin1.

    cmdBlock = {"header": "Test Latin 1 reading.",
                "cmd": ["%(MAT_PKG_HOME)s/bin/MATEngine",
                        "--other_app_dir",
                        "%(MAT_PKG_HOME)s/sample/ne",
                        "--input_file",
                        "%(TMPDIR)s/unicode_cmdline_error.txt",
                        "--task",
                        "Named Entity",
                        "--workflow",
                        "Demo",
                        "--input_file_type",
                        "raw",
                        "--steps",
                        ""]}

    def runTest(self):
        pass

    def testAscii1(self):
        # Test ascii default.
        MAT.UnitTest.CmdlinesTestCase.runTest(self, expectFailure = True)

    def testAscii2(self):
        oldCmd = self.cmdBlock["cmd"]            
        self.cmdBlock["cmd"] = self.cmdBlock["cmd"] + ["--input_encoding", "ascii"]
        MAT.UnitTest.CmdlinesTestCase.runTest(self, expectFailure = True)
        self.cmdBlock["cmd"] = oldCmd

    def testLatin1(self):        
        oldCmd = self.cmdBlock["cmd"]            
        self.cmdBlock["cmd"] = self.cmdBlock["cmd"] + ["--input_encoding", "latin1"]
        MAT.UnitTest.CmdlinesTestCase.runTest(self)
        self.cmdBlock["cmd"] = oldCmd

class XMLIOOffsetTest(PluginContextTestCase):

    # The problem here is that I need to make sure that the offsets do the right thing
    # when we get double-byte characters.
    def testXMLIO(self):
        xmlInput = u"<foobar>This is what <PERSON>John</PERSON> felt a Greek \u0390 should look like</foobar>"
        xmlOutput = u"<foobar>This is what John felt a Greek \u0390 should look like</foobar>"
        io = MAT.DocumentIO.getDocumentIO('xml-inline', task = self.task, xml_input_is_overlay = True)
        d = io.readFromUnicodeString(xmlInput)
        self.assertTrue(xmlOutput == d.signal)

