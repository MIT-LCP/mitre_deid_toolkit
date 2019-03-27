# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from mat_unittest_resources import PluginContextTestCase, \
     CmdlinePluginContextTestCase, CmdlinePluginContextTestCaseWithTeardown
import os, sys
import MAT
import MAT.Score
from MAT.UnitTest import CmdlineTestMixin

_jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')

# Need to test the scorer, both with a task that has no attributes
# and a task that has them.

# And here's a class to allow me to have the same API
# for testing that I have for the actuall spreadsheet object
# that comes back from MAT.Score.Score.

from MAT.Score import LiteralScoreColumn, ScoreResultTable

# The spreadsheets we're going to read in might have file-level
# information, plus summary lines. If they have a "file" column,
# they're eligible. If summary is True, remove all lines whose
# file column is not <all>. This is a method on SummaryScoreResultTable,
# but I can't use that class because the headers are of different classes
# in that case.

# So how do I make sure that the values are the correct type when
# I read it back in from the spreadsheet? Brute force, I suppose.

STRING_HEADERS = ["file", "tag", "type", "reflabel", "hyplabel",
                  "refcontent", "hypcontent"]
INT_HEADERS = ["test docs", "test toks",
               # Added these two after I updated Score.py.
               "test chars", "test pseudo-toks",
               "match", "refclash", "missing", "refonly",
               "reftotal", "hypclash", "spurious", "hyponly", "hyptotal",
               # Added these when I made further detail in the spreadsheet.
               "hyptagclash",
               "hypovermark", "hypundermark", "hypoverlap", 
               "hyptagplusovermark", "hyptagplusundermark", "hyptagplusoverlap", 
               "reftagclash",
               "refovermark", "refundermark", "refoverlap", 
               "reftagplusovermark", "reftagplusundermark", "reftagplusoverlap",
               "refstart", "refend", "hypstart", "hypend"]
FLOAT_HEADERS = ["precision", "recall", "fmeasure", "tag_sensitive_accuracy",
                 "tag_sensitive_error_rate", "tag_blind_accuracy",
                 "tag_blind_error_rate"]              

def spreadsheetFromCSV(csvFile, summary = True):
    import csv
    fp = open(csvFile, "r")
    reader = csv.reader(fp)
    headers = reader.next()
    coercers = []
    for h in headers:
        if h in STRING_HEADERS:
            coercers.append(lambda x: x)
        elif h in FLOAT_HEADERS:
            coercers.append(float)
        elif h in INT_HEADERS:
            coercers.append(int)
        else:
            coercers.append(lambda x: x)
    ss = ScoreResultTable(columns = [LiteralScoreColumn(h) for h in headers])
    for row in reader:
        ss.addRow(**dict([(h, coercer(val)) for h, coercer, val in zip(headers, coercers, row)]))
    fp.close()
    if summary:
        i = 0
        found = False
        for c in ss.visibleColumns:
            if c.colKey == "file":
                found = True
                break
            i += 1
        if found:
            ss.rows = [r for r in ss.rows if r.cells[i].compute() == "<all>"]
            col = ss.visibleColumns[i]
            ss.visibleColumns.remove(col)
            try:
                ss.columns.remove(col)
            except ValueError:
                pass
            for r in ss.rows:
                r.cells[i:i+1] = []
    return ss

def findColumnIndex(table, cname):
    for i in range(len(table.visibleColumns)):
        if table.visibleColumns[i].colName == cname:
            return i
    return None

def getRows(table, restrs, cols):
    cols = [findColumnIndex(table, c) for c in cols]
    restrs = [(findColumnIndex(table, k), tst) for (k, tst) in restrs.items()]
    outRows = []
    for row in table.rows:
        keepIt = True
        for k, tst in restrs:
            v = row.cells[k].compute()
            if not tst(v):
                keepIt = False
                break
        if keepIt:
            outRows.append([row.cells[c].compute() for c in cols])
    return outRows

class LabelLevelScoreTestCase(CmdlinePluginContextTestCaseWithTeardown):

    def _mangleDocument(self, d2):
        # So now, I want to mangle the annotations a little bit.
        people = d2.atypeDict[d2.anameDict["PERSON"]]
        locations = d2.atypeDict[d2.anameDict["LOCATION"]]
        firstPerson = people[0]
        people[0:1] = []
        firstPerson.atype = d2.anameDict["LOCATION"]
        locations[0:0] = [firstPerson]

    def _checkScore(self, details):
        self._checkScoreCore(details, details.rows, 1, 1)

    def _checkScoreCore(self, details, rows, hypClashDiff, refClashDiff):
        refClashIndex = findColumnIndex(details, "refclash")
        hypClashIndex = findColumnIndex(details, "hypclash")        
        refTotalIndex = findColumnIndex(details, "reftotal")
        hypTotalIndex = findColumnIndex(details, "hyptotal")
        tagIndex = findColumnIndex(details, "tag")
        for row in rows:
            if row.cells[tagIndex].compute() == "LOCATION":
                self.assertEqual(row.cells[refClashIndex].compute(), 0)
                self.assertEqual(row.cells[hypClashIndex].compute(), hypClashDiff)
                self.assertEqual(row.cells[refTotalIndex].compute(), row.cells[hypTotalIndex].compute() - hypClashDiff)
            elif row.cells[tagIndex].compute() == "PERSON":
                self.assertEqual(row.cells[hypClashIndex].compute(), 0)
                self.assertEqual(row.cells[refClashIndex].compute(), refClashDiff)
                self.assertEqual(row.cells[refTotalIndex].compute(), row.cells[hypTotalIndex].compute() + refClashDiff)
    
    def testDefault(self):
        # Load a document.
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa2.txt.json")
        d = _jsonIO.readFromSource(docPath)
        d2 = _jsonIO.readFromSource(docPath)
        self._mangleDocument(d2)
        s = MAT.Score.Score(task = self.task)
        s.addDocumentPairlist([((docPath, d2), (docPath, d))])
        print s.formatResults(byToken = False, detail = False)
        # So what I expect is that the tag reftotal for LOCATION is
        # one less than the tag hyptotal for LOCATION, and one greater
        # for PERSON. And PERSON should have a refclash, and
        # LOCATION should have a hypclash.
        details = s.tagCounts
        self._checkScore(details)
    
    def testJSON(self):
        # Load a document.
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa2.txt.json")
        d2 = _jsonIO.readFromSource(docPath)
        self._mangleDocument(d2)
        d2Path = os.path.join(self.testContext["TMPDIR"], "voa2_mangled")
        _jsonIO.writeToTarget(d2, d2Path)
        s = MAT.Score.Score(task = self.task)
        s.addFilenamePairs([(d2Path, docPath)])
        print s.formatResults(byTag = False, detail = False)
        # So what I expect is that the tag reftotal for LOCATION is
        # one less than the tag hyptotal for LOCATION, and one greater
        # for PERSON. And PERSON should have a refclash, and
        # LOCATION should have a hypclash.
        details = s.tagCounts.extractGlobalSummary()
        self._checkScore(details)

    def testXML(self):
        # Load a document.
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa2.txt.json")
        d2 = _jsonIO.readFromSource(docPath)
        self._mangleDocument(d2)
        d2Path = os.path.join(self.testContext["TMPDIR"], "voa2_mangled")
        xmlIO = MAT.DocumentIO.getDocumentIO("xml-inline", task = self.task)
        xmlIO.writeToTarget(d2, d2Path)
        s = MAT.Score.Score(task = self.task)
        s.addFilenamePairs([(d2Path, docPath)], hypIO = xmlIO)
        print s.formatResults(byTag = False, detail = False)
        # So what I expect is that the tag reftotal for LOCATION is
        # one less than the tag hyptotal for LOCATION, and one greater
        # for PERSON. And PERSON should have a refclash, and
        # LOCATION should have a hypclash.
        details = s.tagCounts.extractGlobalSummary()
        self._checkScore(details)

    def testXMLCmdline(self):
        # Load a document.
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa2.txt.json")
        d2 = _jsonIO.readFromSource(docPath)
        self._mangleDocument(d2)
        d2Path = os.path.join(self.testContext["TMPDIR"], "voa2_mangled")
        xmlIO = MAT.DocumentIO.getDocumentIO("xml-inline", task = self.task)
        xmlIO.writeToTarget(d2, d2Path)
        outPath = os.path.join(self.testContext["TMPDIR"], "label_score_output")
        os.mkdir(outPath)
        self.runCmdblock(header = "Test XML",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATScore",
                                "--file",
                                d2Path,
                                "--ref_file",
                                docPath,
                                "--file_type",
                                "xml-inline",
                                "--task",
                                'Named Entity',
                                "--csv_formula_output",
                                "literal",
                                "--csv_output_dir",
                                outPath])
        details = spreadsheetFromCSV(os.path.join(outPath, "bytag_literal.csv"), summary = True)
        print details.format()
        self._checkScore(details)

    def testMultipleFiles(self):
        # I'm going to want to do test this with multiple files.
        pairs = []
        basenames = ["voa2.txt.json", "voa6.txt.json", "voa9.txt.json"]
        for doc in basenames:
            docPath =  os.path.join(self.sampleDir, "resources", "data", "json", doc)
            d = _jsonIO.readFromSource(docPath)
            self._mangleDocument(d)
            d2Path = os.path.join(self.testContext["TMPDIR"], doc + ".mangled")
            _jsonIO.writeToTarget(d, d2Path)
            pairs.append((d2Path, docPath))
        s = MAT.Score.Score(task = self.task)
        s.addFilenamePairs(pairs)
        print s.tagCounts.format()
        # Now, we can check all the scores.
        i = findColumnIndex(s.tagCounts, "file")
        for b in basenames:
            rows = [row for row in s.tagCounts.rows if row.cells[i].compute() == b]
            self._checkScoreCore(s.tagCounts, rows, 1, 1)
        rows = [row for row in s.tagCounts.rows if row.cells[i].compute() == "<all>"]
        self._checkScoreCore(s.tagCounts, rows, 3, 3)

# To test this, we have to introduce a special similarity profile.

class AttributeLevelScoreTestCase(CmdlinePluginContextTestCaseWithTeardown):

    def setUp(self):
        CmdlinePluginContextTestCaseWithTeardown.setUp(self, "ne_enamex", "Named Entity (ENAMEX)")
        return
        self.task.similarityProfiles = [{"strata": [["ENAMEX"]],
                                         "tag_profiles": [{"labels": ["ENAMEX"],
                                                           "dimensions": [{"name": "type", "weight": .1, "method": "label_equality"},
                                                                          {"name": "_span", "weight": .9}]}
                                                          ]}]
    def tearDown(self):
        CmdlinePluginContextTestCaseWithTeardown.tearDown(self)
        return
        self.task.similarityProfiles = None

    def _mangleDocument(self, d2):
        # So now, I want to mangle the annotations a little bit.
        # Find the first person annotation, and change it to location.
        enamexes = d2.atypeDict[d2.anameDict["ENAMEX"]]
        for annot in enamexes:
            if annot["type"] == "PERSON":
                annot["type"] = "LOCATION"
                break

    def _checkScore(self, details):
        refClashIndex = findColumnIndex(details, "refclash")
        hypClashIndex = findColumnIndex(details, "hypclash")        
        refTotalIndex = findColumnIndex(details, "reftotal")
        hypTotalIndex = findColumnIndex(details, "hyptotal")
        tagIndex = findColumnIndex(details, "tag")
        for row in details.rows:
            if row.cells[tagIndex].compute() == "LOCATION":
                self.assertEqual(row.cells[refClashIndex].compute(), 0)
                self.assertEqual(row.cells[hypClashIndex].compute(), 1)
                self.assertEqual(row.cells[refTotalIndex].compute(), row.cells[hypTotalIndex].compute() - 1)
            elif row.cells[tagIndex].compute() == "PERSON":
                self.assertEqual(row.cells[hypClashIndex].compute(), 0)
                self.assertEqual(row.cells[refClashIndex].compute(), 1)
                self.assertEqual(row.cells[refTotalIndex].compute(), row.cells[hypTotalIndex].compute() + 1)

    def testDefault(self):
        # Load a document.
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa2.txt.json")
        d = _jsonIO.readFromSource(docPath)
        d2 = _jsonIO.readFromSource(docPath)
        self._mangleDocument(d2)
        s = MAT.Score.Score(task = self.task)
        s.addDocumentPairlist([((docPath, d2), (docPath, d))])
        print s.formatResults(byTag = False, detail = False)
        # So what I expect is that the tag reftotal for LOCATION is
        # one less than the tag hyptotal for LOCATION, and one greater
        # for PERSON. And PERSON should have a refclash, and
        # LOCATION should have a hypclash.
        details = s.tagCounts.extractGlobalSummary()
        self._checkScore(details)

    def testJSON(self):
        # Load a document.
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa2.txt.json")
        d2 = _jsonIO.readFromSource(docPath)
        self._mangleDocument(d2)
        d2Path = os.path.join(self.testContext["TMPDIR"], "voa2_mangled")
        _jsonIO.writeToTarget(d2, d2Path)
        s = MAT.Score.Score(task = self.task)
        s.addFilenamePairs([(d2Path, docPath)])
        print s.formatResults(byTag = False, detail = False)
        # So what I expect is that the tag reftotal for LOCATION is
        # one less than the tag hyptotal for LOCATION, and one greater
        # for PERSON. And PERSON should have a refclash, and
        # LOCATION should have a hypclash.
        details = s.tagCounts.extractGlobalSummary()
        self._checkScore(details)

    def testXML(self):
        # Load a document.
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa2.txt.json")
        d2 = _jsonIO.readFromSource(docPath)
        self._mangleDocument(d2)
        d2Path = os.path.join(self.testContext["TMPDIR"], "voa2_mangled")
        xmlIO = MAT.DocumentIO.getDocumentIO("xml-inline", task = self.task)
        xmlIO.writeToTarget(d2, d2Path)
        s = MAT.Score.Score(task = self.task)
        s.addFilenamePairs([(d2Path, docPath)], hypIO = xmlIO)
        print s.formatResults(byTag = False, detail = False)
        # So what I expect is that the tag reftotal for LOCATION is
        # one less than the tag hyptotal for LOCATION, and one greater
        # for PERSON. And PERSON should have a refclash, and
        # LOCATION should have a hypclash.
        details = s.tagCounts.extractGlobalSummary()
        self._checkScore(details)

    def testXMLCmdline(self):
        # Load a document.
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa2.txt.json")
        d2 = _jsonIO.readFromSource(docPath)
        self._mangleDocument(d2)
        d2Path = os.path.join(self.testContext["TMPDIR"], "voa2_mangled")
        xmlIO = MAT.DocumentIO.getDocumentIO("xml-inline", task = self.task)
        xmlIO.writeToTarget(d2, d2Path)
        outPath = os.path.join(self.testContext["TMPDIR"], "attribute_score_output")
        os.mkdir(outPath)
        self.runCmdblock(header = "Test XML",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATScore",
                                "--file",
                                d2Path,
                                "--ref_file",
                                docPath,
                                "--file_type",
                                "xml-inline",
                                "--task",
                                'Named Entity (ENAMEX)',
                                "--csv_formula_output",
                                "literal",
                                "--csv_output_dir",
                                outPath])
        details = spreadsheetFromCSV(os.path.join(outPath, "bytag_literal.csv"), summary = True)
        print details.format()
        self._checkScore(details)

# At one point, the scorer was failing when there were no annotations
# in a document. It was also failing when there were no CSV computations,
# and it was reporting 0 as the total for the tokens.

class NoAnnotationsScoreTest(CmdlinePluginContextTestCaseWithTeardown):

    def runTest(self):
        # Load a document.
        docPath = os.path.join(self.sampleDir, "resources", "data", "raw", "voa2.txt")
        d2 = MAT.DocumentIO.getDocumentIO("raw").readFromSource(docPath)
        s = MAT.Score.Score(task = self.task)        
        s.addDocumentPairlist([((docPath, d2), (docPath, d2))])
        # Do it again.
        fmt = MAT.Score.ScoreFormat(csvFormulaOutput = ["literal"])
        s = MAT.Score.Score(task = self.task, format = fmt, detailResultTable = False)
        s.addDocumentPairlist([((docPath, d2), (docPath, d2))])
        s.formatResults()
        # Finally, check the total number of tokens.
        testTokIndex = findColumnIndex(s.tagCounts, "test toks")
        self.assertTrue(s.tagCounts.rows[-1].cells[testTokIndex].compute() == len(d2.getAnnotations(["token"])))    

# And the scorer was scoring things that aren't in the existing zones.

class OutsideZoneScoreTest(CmdlinePluginContextTestCaseWithTeardown):

    def runTest(self):
        # Load a document.
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa2.txt.json")
        d2 = MAT.DocumentIO.getDocumentIO("mat-json").readFromSource(docPath)
        # Score against itself normally.
        s = MAT.Score.Score(task = self.task)
        s.addDocumentPairlist([((docPath, d2), (docPath, d2))])
        rawMatch = 0
        matchColumn = s.tagCounts.getColumnIndex("match")
        tagColumn = s.tagCounts.getColumnIndex("tag")
        for row in s.tagCounts.rows:
            if row.cells[tagColumn].compute() == "<all>":
                rawMatch = row.cells[matchColumn].compute()
                break
        # rawMatch is set now. It had better be the number of
        # content annotations in the document.
        self.failUnless(rawMatch == len(d2.getAnnotations(self.task.getAnnotationTypesByCategory("content"))))
        # Now, let's mangle the document, so that its zones are of length
        # zero.
        for z in d2.getAnnotations(self.task.getAnnotationTypesByCategory("zone")):
            z.end = z.start
        # Now, let's run the scorer with and without the task. Without the
        # task, it should find the same number of matches. With the
        # task, it shouldn't find any.
        s = MAT.Score.Score(contentAnnotations = ["PERSON", "LOCATION", "ORGANIZATION"],
                            tokenAnnotations = ["lex"])
        s.addDocumentPairlist([((docPath, d2), (docPath, d2))])
        noTaskRawMatch = 0
        matchColumn = s.tagCounts.getColumnIndex("match")
        tagColumn = s.tagCounts.getColumnIndex("tag")
        for row in s.tagCounts.rows:
            if row.cells[tagColumn].compute() == "<all>":
                noTaskRawMatch = row.cells[matchColumn].compute()
                break
        self.failUnless(rawMatch == noTaskRawMatch)
        s = MAT.Score.Score(task = self.task)
        s.addDocumentPairlist([((docPath, d2), (docPath, d2))])
        taskRawMatch = 0
        matchColumn = s.tagCounts.getColumnIndex("match")
        tagColumn = s.tagCounts.getColumnIndex("tag")
        for row in s.tagCounts.rows:
            if row.cells[tagColumn].compute() == "<all>":
                taskRawMatch = row.cells[matchColumn].compute()
                break
        self.failUnless(taskRawMatch == 0)
        
class UnicodeTextTest(CmdlinePluginContextTestCaseWithTeardown):

    def runTest(self):
        # We want to build a unicode document and score it against itself, with
        # details. It should not break.
        
        # Use a random single character not in ASCII space.        
        s = u'\u6709'

        d = MAT.Document.AnnotatedDoc(signal = s)
        d.createAnnotation(0, 1, "PERSON")
        d.createAnnotation(0, 1, "zone", {"region_type": "body"})

        scorer = MAT.Score.Score(task = self.task)
        scorer.addDocumentPairlist([(("<doc>", d), ("<doc>", d))])

        outD = os.path.join(self.testContext["TMPDIR"], "scoreDir")
        os.mkdir(outD)
        scorer.writeCSV(outD)
        import shutil
        shutil.rmtree(outD)

# This isn't EXACTLY the right place for this, but let's check MATReport
# for the Unicode issue here too.

class UnicodeMATReportTest(CmdlinePluginContextTestCaseWithTeardown):

    def runTest(self):

        # Use a random single character not in ASCII space.        
        s = u'\u6709'

        d = MAT.Document.AnnotatedDoc(signal = s)
        d.createAnnotation(0, 1, "PERSON")
        d.createAnnotation(0, 1, "zone", {"region_type": "body"})

        outD = os.path.join(self.testContext["TMPDIR"], "unicode_outdir")
        os.mkdir(outD)
        outF = os.path.join(outD, "unicode_file")
        _jsonIO.writeToTarget(d, outF)
        self.runCmdblock(header = "Test unicode in MATReport",
                         cmd = ["%(MAT_PKG_HOME)s/bin/MATReport",
                                "--input_files",
                                outF,
                                "--output_dir",
                                outD,
                                "--csv",
                                "--txt",
                                "--task",
                                "Named Entity",
                                "--file_csv"])
        import shutil
        shutil.rmtree(outD)

class WhitespaceErrorTest(CmdlinePluginContextTestCaseWithTeardown):

    def _generateTestDoc(self, signal, tupList, tokenize = False):
        d = MAT.Document.AnnotatedDoc(signal = signal)
        for s, lab in tupList:
            sIndex = signal.find(s)
            rIndex = sIndex + len(s)
            d.createAnnotation(sIndex, rIndex, lab)
        if tokenize:
            import re
            for m in re.finditer("\S+", signal):
                d.createAnnotation(m.start(), m.end(), "lex")
        return d

    def test(self):
        signal = u"The future President  in our United States of America has announced his resignation."

        hypD = self._generateTestDoc(signal, [("President", "PERSON")], tokenize = True)
        refD = self._generateTestDoc(signal, [("President", "PERSON")], tokenize = True)
        s = MAT.Score.Score(task = self.task)
        s.addDocumentPairlist([(("<hyp>", hypD), ("<ref>", refD))])
        self.assertTrue(s.tokenCounts is not None)

        hypD = self._generateTestDoc(signal, [("President ", "PERSON")], tokenize = True)
        s = MAT.Score.Score(task = self.task)
        s.addDocumentPairlist([(("<hyp>", hypD), ("<ref>", refD))])
        self.assertTrue(s.tokenCounts is None)

# Gotta generate some test documents.

class PseudoTokAndCharTest(CmdlinePluginContextTestCaseWithTeardown):

    def _generateTestDoc(self, signal, tupList):
        d = MAT.Document.AnnotatedDoc(signal = signal)
        for s, lab in tupList:
            sIndex = signal.find(s)
            rIndex = sIndex + len(s)
            d.createAnnotation(sIndex, rIndex, lab)
        return d

    def _checkRow(self, tbl, tagName, fields):
        tagIndex = findColumnIndex(tbl, "tag")
        for row in tbl.rows:
            if row.cells[tagIndex].compute() == tagName:
                for k, v in fields.items():
                    self.assertEqual(row.cells[findColumnIndex(tbl, k)].compute(), v)

    def _checkMatrix(self, sparseMatrix, compMatrix):
        for hyp, refM in compMatrix.items():
            for ref, num in refM.items():
                self.assertEqual(sparseMatrix.get(hyp, {}).get(ref, 0), num)
    

    def testComplexOverlap(self):
        
        signal = u"The future President in our United States of America has announced his resignation."

        hypD = self._generateTestDoc(signal, [("President in our United State", "PERSON")])
        refD = self._generateTestDoc(signal, [(" future President in our Unit", "PERSON")])
        s = MAT.Score.Score(task = self.task, 
                            pseudoTokenResultTable = None, characterResultTable = None)
        s.addDocumentPairlist([(("<hyp>", hypD), ("<ref>", refD))])
        print s.formatResults(byPseudoToken = True, byCharacter = True, byTag = False, detail = False)
        charCounts = s.characterCounts
        tokCounts = s.pseudoTokenCounts
        self._checkRow(tokCounts, "<all>",
                       {"test pseudo-toks": 15, "match": 4, "refclash": 0,
                        "missing": 1, "hypclash": 0, "spurious": 2})
        self._checkRow(charCounts, "<all>",
                       {"test chars": len(signal), "match": len("President in our Unit"),
                        "refclash": 0, "missing": len(" future "),
                        "hypclash": 0, "spurious": len("ed State")})

    # This will align the first two elements in each, at least it should.
    def testTwoToOne(self):
        
        signal = u"The future President in our United States of America has announced his resignation."

        hypD = self._generateTestDoc(signal, [("President in our United States", "PERSON")])
        refD = self._generateTestDoc(signal, [("President in our", "PERSON"), ("United States", "PERSON")])
        
        s = MAT.Score.Score(task = self.task, 
                            pseudoTokenResultTable = None, characterResultTable = None)
        s.addDocumentPairlist([(("<hyp>", hypD), ("<ref>", refD))])
        print s.formatResults(byPseudoToken = True, byCharacter = True, byTag = False, detail = False)
        charCounts = s.characterCounts
        tokCounts = s.pseudoTokenCounts
        self._checkRow(tokCounts, "<all>",
                       {"test pseudo-toks": 13, "match": 5, "refclash": 0,
                        "missing": 0, "hypclash": 0, "spurious": 0})
        self._checkRow(charCounts, "<all>",
                       {"test chars": len(signal), "match": len("President in our") + len("United States"),
                        "refclash": 0, "missing": 0,
                        "hypclash": 0, "spurious": 1})

    def testTwoToOneLabelClash(self):
        
        signal = u"The future President in our United States of America has announced his resignation."

        hypD = self._generateTestDoc(signal, [("President in our United States", "PERSON")])
        refD = self._generateTestDoc(signal, [("President in our", "PERSON"), ("United States", "LOCATION")])
        
        s = MAT.Score.Score(task = self.task, 
                            pseudoTokenResultTable = None, characterResultTable = None)
        s.addDocumentPairlist([(("<hyp>", hypD), ("<ref>", refD))])
        print s.formatResults(byPseudoToken = True, byCharacter = True, byTag = False, detail = False)
        charCounts = s.characterCounts
        tokCounts = s.pseudoTokenCounts
        self._checkRow(tokCounts, "PERSON",
                       {"match": 3, "refclash":0,
                        "missing": 0, "hypclash": 2, "spurious": 0})
        self._checkRow(tokCounts, "LOCATION",
                       {"match": 0, "refclash": 2,
                        "missing": 0, "hypclash": 0, "spurious": 0})
        self._checkRow(tokCounts, "<all>",
                       {"test pseudo-toks": 13, "match": 3, "refclash": 2,
                        "missing": 0, "hypclash": 2, "spurious": 0})
        self._checkRow(charCounts, "PERSON",
                       {"match": len("President in our"), "refclash": 0,
                        "missing": 0, "hypclash": len("United States"), "spurious": 1})
        self._checkRow(charCounts, "LOCATION",
                       {"match": 0, "refclash": len("United States"),
                        "missing": 0, "hypclash": 0, "spurious": 0})
        self._checkRow(charCounts, "<all>",
                       {"test chars": len(signal), "match": len("President in our"), "refclash": len("United States"),
                        "missing": 0, "hypclash": len("United States"), "spurious": 1})

    # Before 2.0, the scorer couldn't deal with overlapping annotations
    # within a document. In 2.0, we've constructed a very complicated solution
    # to this issue.

    # Test 1: things with the same length should be paired. Favor matched labels.
    
    def testOverlappingInternal1(self):
        
        signal = u"The future President in our United States of America has announced his resignation."

        refD = self._generateTestDoc(signal, [("future President", "PERSON"), ("future President", "LOCATION")])
        hypD = self._generateTestDoc(signal, [("future President", "PERSON"), ("future President", "ORGANIZATION")])
        
        s = MAT.Score.Score(task = self.task, 
                            pseudoTokenResultTable = None, characterResultTable = None)
        s.addDocumentPairlist([(("<hyp>", hypD), ("<ref>", refD))])
        print s.formatResults(byPseudoToken = True, byCharacter = True, byTag = False, detail = False)
        charCounts = s.characterCounts
        tokCounts = s.pseudoTokenCounts
        self._checkRow(tokCounts, "PERSON",
                       {"match": 2, "refclash": 0,
                        "missing": 0, "hypclash": 0, "spurious": 0})
        self._checkRow(tokCounts, "LOCATION",
                       {"match": 0, "refclash": 2,
                        "missing": 0, "hypclash": 0, "spurious": 0})
        self._checkRow(tokCounts, "ORGANIZATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": 2, "spurious": 0})
        self._checkRow(tokCounts, "<all>",
                       {"test pseudo-toks": 13, "match": 2, "refclash": 2,
                        "missing": 0, "hypclash": 2, "spurious": 0})
        self._checkRow(charCounts, "PERSON",
                       {"match": len("future President"), "refclash": 0,
                        "missing": 0, "hypclash": 0, "spurious": 0})
        self._checkRow(charCounts, "LOCATION",
                       {"match": 0, "refclash": len("future President"),
                        "missing": 0, "hypclash": 0, "spurious": 0})
        self._checkRow(charCounts, "ORGANIZATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": len("future President"), "spurious": 0})
        self._checkRow(charCounts, "<all>",
                       {"test chars": len(signal), "match": len("future President"), "refclash": len("future President"),
                        "missing": 0, "hypclash": len("future President"), "spurious": 0})

    # Test 2: things with the same length should be paired. Unmatched labels can end up as
    # spurious and missing.

    def testOverlappingInternal2(self):
        
        signal = u"The future President in our United States of America has announced his resignation."

        refD = self._generateTestDoc(signal, [("future President", "PERSON"), ("future President", "LOCATION"),
                                              ("United States of America", "LOCATION")])
        hypD = self._generateTestDoc(signal, [("future President", "PERSON"),
                                              ("United States of America", "PERSON"),
                                              ("United States of America", "LOCATION")])
        
        s = MAT.Score.Score(task = self.task, 
                            pseudoTokenResultTable = None, characterResultTable = None)
        s.addDocumentPairlist([(("<hyp>", hypD), ("<ref>", refD))])
        print s.formatResults(byPseudoToken = True, byCharacter = True, byTag = False, detail = False)
        charCounts = s.characterCounts
        tokCounts = s.pseudoTokenCounts
        self._checkRow(tokCounts, "PERSON",
                       {"match": 2, "refclash": 0,
                        "missing": 0, "hypclash": 0, "spurious": 4})
        self._checkRow(tokCounts, "LOCATION",
                       {"match": 4, "refclash": 0,
                        "missing": 2, "hypclash": 0, "spurious": 0})
        self._checkRow(tokCounts, "<all>",
                       {"test pseudo-toks": 13, "match": 6, "refclash": 0,
                        "missing": 2, "hypclash": 0, "spurious": 4})
        self._checkRow(charCounts, "PERSON",
                       {"match": len("future President"), "refclash": 0,
                        "missing": 0, "hypclash": 0, "spurious": len("United States of America")})
        self._checkRow(charCounts, "LOCATION",
                       {"match": len("United States of America"), "refclash": 0,
                        "missing": len("future President"), "hypclash": 0, "spurious": 0})
        self._checkRow(charCounts, "<all>",
                       {"test chars": len(signal), "match": len("future President") + len("United States of America"),
                        "refclash": 0,
                        "missing": len("future President"), "hypclash": 0, "spurious": len("United States of America")})

    # Test 3: things that start but not end in the same place
    # should be paired first by label, and then by smallest length differential.
    # SAM 6/18/12: new default pairing algorithm strongly favors span matching first.

    def testOverlappingInternal3(self):
        
        signal = u"The future President in our United States of America has announced his resignation."

        refD = self._generateTestDoc(signal, [("President", "PERSON")])
        hypD = self._generateTestDoc(signal, [("President in", "LOCATION"),
                                              ("President in our United", "PERSON")])
        
        s = MAT.Score.Score(task = self.task, 
                            pseudoTokenResultTable = None, characterResultTable = None)
        s.addDocumentPairlist([(("<hyp>", hypD), ("<ref>", refD))])
        print s.formatResults(byPseudoToken = True, byCharacter = True, byTag = False, detail = False)
        charCounts = s.characterCounts
        tokCounts = s.pseudoTokenCounts
        self._checkRow(tokCounts, "PERSON",
                       {"match": 0, "refclash": 1,
                        "missing": 0, "hypclash": 0, "spurious": 4})
        self._checkRow(tokCounts, "LOCATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": 1, "spurious": 1})
        self._checkRow(tokCounts, "<all>",
                       {"test pseudo-toks": 13, "match": 0, "refclash": 1,
                        "missing": 0, "hypclash": 1, "spurious": 5})
        self._checkRow(charCounts, "PERSON",
                       {"match": 0, "refclash": len("President"),
                        "missing": 0, "hypclash": 0, "spurious": len("President in our United")})
        self._checkRow(charCounts, "LOCATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": len("President"), "spurious": len(" in")})
        self._checkRow(charCounts, "<all>",
                       {"test chars": len(signal), "match": 0, 
                        "refclash": len("President"),
                        "missing": 0, "hypclash": len("President"), "spurious": len(" in") + len("President in our United")})

    # Test 4: things that start but not end in the same place
    # should be paired first by label, and then by smallest length differential.

    def testOverlappingInternal4(self):
        
        signal = u"The future President in our United States of America has announced his resignation."

        refD = self._generateTestDoc(signal, [("President", "PERSON")])
        hypD = self._generateTestDoc(signal, [("President in", "LOCATION"),
                                              ("President in our United", "ORGANIZATION")])
        
        s = MAT.Score.Score(task = self.task, 
                            pseudoTokenResultTable = None, characterResultTable = None)
        s.addDocumentPairlist([(("<hyp>", hypD), ("<ref>", refD))])
        print s.formatResults(byPseudoToken = True, byCharacter = True, byTag = False, detail = False)
        charCounts = s.characterCounts
        tokCounts = s.pseudoTokenCounts
        self._checkRow(tokCounts, "PERSON",
                       {"match": 0, "refclash": 1,
                        "missing": 0, "hypclash": 0, "spurious": 0})
        self._checkRow(tokCounts, "LOCATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": 1, "spurious": 1})
        self._checkRow(tokCounts, "ORGANIZATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": 0, "spurious": 4})
        self._checkRow(tokCounts, "<all>",
                       {"test pseudo-toks": 13, "match": 0, "refclash": 1,
                        "missing": 0, "hypclash": 1, "spurious": 5})
        self._checkRow(charCounts, "PERSON",
                       {"match": 0, "refclash": len("President"),
                        "missing": 0, "hypclash": 0, "spurious": 0})
        self._checkRow(charCounts, "LOCATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": len("President"), "spurious": len(" in")})
        self._checkRow(charCounts, "ORGANIZATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": 0, "spurious": len("President in our United")})
        self._checkRow(charCounts, "<all>",
                       {"test chars": len(signal), "match": 0,
                        "refclash": len("President"),
                        "missing": 0, "hypclash": len("President"), "spurious": len(" in") + len("President in our United")})

    # Test 5: Same for end.

    def testOverlappingInternal5(self):
        
        signal = u"The future President in our United States of America has announced his resignation."

        refD = self._generateTestDoc(signal, [("President", "PERSON")])
        hypD = self._generateTestDoc(signal, [("future President", "LOCATION"),
                                              ("The future President", "ORGANIZATION")])
        
        s = MAT.Score.Score(task = self.task, 
                            pseudoTokenResultTable = None, characterResultTable = None,
                            computeConfusability = True)
        s.addDocumentPairlist([(("<hyp>", hypD), ("<ref>", refD))])
        print s.formatResults(byPseudoToken = True, byCharacter = True, byTag = False, detail = False)
        charCounts = s.characterCounts
        tokCounts = s.pseudoTokenCounts
        # Test the confusability table.
        confusability = s.confusabilityTable
        self.assertTrue(confusability is None)
        self._checkRow(tokCounts, "PERSON",
                       {"match": 0, "refclash": 1,
                        "missing": 0, "hypclash": 0, "spurious": 0})
        self._checkRow(tokCounts, "LOCATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": 1, "spurious": 1})
        self._checkRow(tokCounts, "ORGANIZATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": 0, "spurious": 3})
        self._checkRow(tokCounts, "<all>",
                       {"test pseudo-toks": 13, "match": 0, "refclash": 1,
                        "missing": 0, "hypclash": 1, "spurious": 4})
        self._checkRow(charCounts, "PERSON",
                       {"match": 0, "refclash": len("President"),
                        "missing": 0, "hypclash": 0, "spurious": 0})
        self._checkRow(charCounts, "LOCATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": len("President"), "spurious": len("future ")})
        self._checkRow(charCounts, "ORGANIZATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": 0, "spurious": len("The future President")})
        self._checkRow(charCounts, "<all>",
                       {"test chars": len(signal), "match": 0,
                        "refclash": len("President"),
                        "missing": 0, "hypclash": len("President"), "spurious": len("future ") + len("The future President")})

    # Test 6: and now, the horrible overlap case, which is very similar
    # to the start and end cases. First, label dominates overlap length.
    # But don't forget! Once we pair the spans, we get another shot at pairing
    # the remaining spurious and missing annotations. So "States" and "of" will
    # pair, as a tagclash.

    def testOverlappingInternal6(self):
        
        signal = u"The future President in our United States of America has announced his resignation."

        refD = self._generateTestDoc(signal, [("United States of", "LOCATION")])
        hypD = self._generateTestDoc(signal, [("States of America", "ORGANIZATION"),
                                              ("our United", "LOCATION")])
        
        s = MAT.Score.Score(task = self.task, 
                            pseudoTokenResultTable = None, characterResultTable = None)
        s.addDocumentPairlist([(("<hyp>", hypD), ("<ref>", refD))])
        print s.formatResults(byPseudoToken = True, byCharacter = True, byTag = False, detail = False)
        charCounts = s.characterCounts
        tokCounts = s.pseudoTokenCounts
        self._checkRow(tokCounts, "ORGANIZATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": 2, "spurious": 1})
        self._checkRow(tokCounts, "LOCATION",
                       {"match": 1, "refclash": 2,
                        "missing": 0, "hypclash": 0, "spurious": 1})
        self._checkRow(tokCounts, "<all>",
                       {"test pseudo-toks": 13, "match": 1, "refclash": 2,
                        "missing": 0, "hypclash": 2, "spurious": 2})
        self._checkRow(charCounts, "ORGANIZATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": len("States of"), "spurious": len(" America")})
        self._checkRow(charCounts, "LOCATION",
                       {"match": len("United"), "refclash": len("States of"),
                        "missing": 1, "hypclash": 0, "spurious": len("our ")})
        self._checkRow(charCounts, "<all>",
                       {"test chars": len(signal), "match": len("United"),
                        "refclash": len("States of"),
                        "missing": 1, "hypclash": len("States of"), "spurious": len("our ") + len(" America")})

    # Test 7: the same, but length dominates when no label matches.

    def testOverlappingInternal7(self):
        
        signal = u"The future President in our United States of America has announced his resignation."

        refD = self._generateTestDoc(signal, [("United States of", "LOCATION")])
        hypD = self._generateTestDoc(signal, [("States of America", "ORGANIZATION"),
                                              ("our United", "PERSON")])
        
        s = MAT.Score.Score(task = self.task, 
                            pseudoTokenResultTable = None, characterResultTable = None,
                            computeConfusability = True)
        s.addDocumentPairlist([(("<hyp>", hypD), ("<ref>", refD))])
        print s.formatResults(byPseudoToken = True, byCharacter = True, byTag = False, detail = False)
        charCounts = s.characterCounts
        tokCounts = s.pseudoTokenCounts
        self._checkRow(tokCounts, "PERSON",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": 1, "spurious": 1})
        self._checkRow(tokCounts, "LOCATION",
                       {"match": 0, "refclash": 3,
                        "missing": 0, "hypclash": 0, "spurious": 0})
        self._checkRow(tokCounts, "ORGANIZATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": 2, "spurious": 1})
        self._checkRow(tokCounts, "<all>",
                       {"test pseudo-toks": 13, "match": 0, "refclash": 3,
                        "missing": 0, "hypclash": 3, "spurious": 2})
        self._checkRow(charCounts, "PERSON",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": len("United"), "spurious": len("our ")})
        self._checkRow(charCounts, "LOCATION",
                       {"match": 0, "refclash": len("United") + len("States of"),
                        "missing": 1, "hypclash": 0, "spurious": 0})
        self._checkRow(charCounts, "ORGANIZATION",
                       {"match": 0, "refclash": 0,
                        "missing": 0, "hypclash": len("States of"), "spurious": len(" America")})
        self._checkRow(charCounts, "<all>",
                       {"test chars": len(signal), "match": 0,
                        "refclash": len("United") + len("States of"),
                        "missing": 1, "hypclash": len("United") + len("States of"),
                        "spurious": len("our ") + len(" America")})

        # Test the confusability table.
        c = s.confusabilityTable
        self.assertTrue(c is not None)
        # Hyp is major, ref is minor
        self._checkMatrix(c.matrix, {"PERSON":
                                     {None: 1, "PERSON": 0, "ORGANIZATION": 0, "LOCATION": 1},
                                     "ORGANIZATION":
                                     {None: 1, "PERSON": 0, "ORGANIZATION": 0, "LOCATION": 2},
                                     "LOCATION":
                                     {None: 0, "PERSON": 0, "ORGANIZATION": 0, "LOCATION": 0},
                                     None:
                                     {None: 8, "PERSON": 0, "ORGANIZATION": 0, "LOCATION": 0}
                                     })

# One thing I want to make sure of is that the numbers for tag-agnostic tagging and
# the numbers for equivalence classes are the same numbers. This should be true in
# Named Entity (ENAMEX), for which I've defined tag-agnostic
# similarity profiles. So run an experiment using the experiment engine, and then
# do some checking with the resulting tags.

import glob, shutil

class SimilarityProfileTest(PluginContextTestCase):

    def setUp(self):
        PluginContextTestCase.setUp(self, "ne_enamex", "Named Entity (ENAMEX)")

    def runTest(self):

        # I'm going to run a simple experiment, constructed from objects.
        expDir = os.path.join(self.testContext["TMPDIR"], "simprofile_ne_enamex")
        os.makedirs(expDir)
        patternDir = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne_enamex", "resources", "data", "json")
        from MAT.CarafeTrain import ExperimentEngine, PreparedCorpus, TrainingRun, TestRun
        e = ExperimentEngine(dir = expDir, task = self.task, computeConfidence = False,
                             corpora = [PreparedCorpus("test", partitions = [("train", 4), ("test", 1)],
                                                       filePats = ["*.json"], prefix = patternDir)],
                             models = [TrainingRun("test", trainingCorpora = [("test", "train")])],
                             runs = [TestRun("test", model = "test", testCorpora = [("test", "test")],
                                             engineOptions = {"steps": "zone,tokenize,tag", "workflow": "Demo"})])
        e.run()

        # Now, we compare the patternDir with the run hypothesis.
        pairList = [(x, os.path.join(patternDir, os.path.splitext(os.path.splitext(os.path.splitext(os.path.basename(x))[0])[0])[0])) \
                    for x in glob.glob(os.path.join(expDir, "runs", "test", "test", "hyp", "*.json"))]
        
        s1 = MAT.Score.Score(task = self.task, equivalenceClasses = {"ORGANIZATION": "ENAM", "PERSON": "ENAM", "LOCATION": "ENAM"},
                             showTagOutputMismatchDetails = True)
        s1.addFilenamePairs(pairList)
        
        s1Rows = getRows(s1.tagCounts, {"tag": lambda v: v == "ENAM"},
                         ["file","match","refclash","missing","refonly",
                          "reftotal","hypclash","spurious","hyponly","hyptotal"])
            
        s1Dir = os.path.join(self.testContext["TMPDIR"], "s1out")
        os.mkdir(s1Dir)
        s1.writeCSV(s1Dir)
        
        s2 = MAT.Score.Score(task = self.task, similarityProfile = "tag_agnostic", showTagOutputMismatchDetails = True)
        s2.addFilenamePairs(pairList)
        s2Rows = getRows(s2.tagCounts, {"tag": lambda v: v == "<all>"},
                         ["file","match","refclash","missing","refonly",
                          "reftotal","hypclash","spurious","hyponly","hyptotal"])

        s2Dir = os.path.join(self.testContext["TMPDIR"], "s2out")
        os.mkdir(s2Dir)
        s2.writeCSV(s2Dir)
        
        self.assertEqual(s1Rows, s2Rows)

        s3 = MAT.Score.Score(task = self.task, showTagOutputMismatchDetails = True)
        s3.addFilenamePairs(pairList)
        s3Rows = getRows(s3.tagCounts, {"tag": lambda v: v == "<all>"},
                         ["file","match","refclash","missing","refonly",
                          "reftotal","hypclash","spurious","hyponly","hyptotal"])

        self.assertNotEqual(s1Rows, s3Rows)
        
    def tearDown(self):
        PluginContextTestCase.tearDown(self)
        if not self.testContext.blockTeardown:
            shutil.rmtree(os.path.join(self.testContext["TMPDIR"], "simprofile_ne_enamex"))

# Actually, I need to have a lot more extensive testing of the pairer.

class PairTest(MAT.UnitTest.SampleTestCase):

    def _newInputs(self, name, xmlString, equivalenceClasses = None):

        t = self._taskFromXML(name, xmlString)
        # Nobody cares what the signal is.
        doc1 = self._newdoc(t)
        doc2 = self._newdoc(t)
        p = MAT.Pair.PairState(task = t, skipTokens = True, equivalenceClasses = equivalenceClasses)
        return t, doc1, doc2, p

    def _newdoc(self, t):
        # Nobody cares what the signal is.
        return MAT.Document.AnnotatedDoc(signal = 100 * u"abcde ", globalTypeRepository = t.getAnnotationTypeRepository())
    
    def _assess(self, doc1, doc2, p, assessmentList):
        p.addDocumentTuples([(("", doc1), ("", doc2))])
        simCache = p.simEngine.similarityCache
        self.assertEqual(set([(p[0], p[1]) for p in assessmentList]), set(simCache.keys()))
        # The problem is that these scores are floats, and the
        # floats aren't perfect. So what should be .6 may not be
        # EXACTLY .6. So we should multiply by a number that's
        # the size of the specificity I'm looking for, and round to int.
        for p0, p1, score, dimDict in assessmentList:
            totScore, dimScores, errSet = simCache[(p0, p1)]
            self.assertEqual(round(score * (10 ** 3)), round(totScore * (10 ** 3)))
            for k, v in dimDict.items():
                try:
                    dimScore = dimScores[k]
                except KeyError:
                    self.fail("no score for dimension " + k)
                self.assertEqual(round(v * (10 ** 3)), round(dimScore[0] * (10 ** 3)))

    def testSimplePairing(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
    </annotation_set_descriptor>
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="PERSON,LOCATION,ORGANIZATION">
      <dimension name="_label" weight=".2"/>
      <dimension name="_span" weight=".8"/>
    </tag_profile>
  </similarity_profile>""")
        a1 = doc1.createAnnotation(5, 10, "PERSON")
        a2 = doc2.createAnnotation(7, 11, "LOCATION")
        self._assess(doc1, doc2, p, [(a1, a2, .4, {"_label": 0.0, "_span": 0.5})])

    def testSimpleEnamexPairing(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='ENAMEX'/>
      <attribute of_annotation="ENAMEX" name="type">
        <choice effective_label="PERSON">PER</choice>
        <choice effective_label="LOCATION">LOC</choice>
        <choice effective_label="ORGANIZATION">ORG</choice>
      </attribute>
    </annotation_set_descriptor>
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="ENAMEX">
      <dimension name="_label" weight=".2" true_residue=".5"/>
      <dimension name="_span" weight=".8"/>
    </tag_profile>
  </similarity_profile>""")
        a1 = doc1.createAnnotation(5, 10, "ENAMEX", {"type": "PER"})
        a2 = doc2.createAnnotation(7, 11, "ENAMEX", {"type": "LOC"})
        self._assess(doc1, doc2, p, [(a1, a2, 0.5, {"_label": 0.5, "_span": 0.5})])
                
    def testEnamexPairingWithEQClass(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='ENAMEX'/>
      <attribute of_annotation="ENAMEX" name="type">
        <choice effective_label="PERSON">PER</choice>
        <choice effective_label="LOCATION">LOC</choice>
        <choice effective_label="ORGANIZATION">ORG</choice>
      </attribute>
    </annotation_set_descriptor>
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="ENAMEX">
      <dimension name="_label" weight=".2" true_residue=".5"/>
      <dimension name="_span" weight=".8"/>
    </tag_profile>
  </similarity_profile>""",
                                           equivalenceClasses = {"PERSON": "FOO", "LOCATION": "FOO"})
        a1 = doc1.createAnnotation(5, 10, "ENAMEX", {"type": "PER"})
        a2 = doc2.createAnnotation(7, 11, "ENAMEX", {"type": "LOC"})
        self._assess(doc1, doc2, p, [(a1, a2, 0.6, {"_label": 1.0, "_span": 0.5})])

    def testSimplePairingWithAttribute(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <attribute of_annotation="PERSON,ORGANIZATION,LOCATION" name="nomtype">
        <choice>NAM</choice>
        <choice>NOM</choice>
        <choice>PRO</choice>
      </attribute>
    </annotation_set_descriptor>
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="PERSON,LOCATION,ORGANIZATION">
      <dimension name="_label" weight=".2"/>
      <dimension name="_span" weight=".6"/>
      <dimension name="nomtype" weight=".2"/>
    </tag_profile>
  </similarity_profile>""")
        a1 = doc1.createAnnotation(5, 10, "PERSON", {"nomtype": "PRO"})
        a2 = doc2.createAnnotation(7, 11, "LOCATION", {"nomtype": "PRO"})
        self._assess(doc1, doc2, p, [(a1, a2, .5, {"_label": 0.0, "_span": 0.5, "nomtype": 1.0})])

    def testSimplePairingWithUncomparedAttribute(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <attribute of_annotation="PERSON,ORGANIZATION,LOCATION" name="nomtype">
        <choice>NAM</choice>
        <choice>NOM</choice>
        <choice>PRO</choice>
      </attribute>
    </annotation_set_descriptor>
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="PERSON,ORGANIZATION">
      <dimension name="_label" weight=".2"/>
      <dimension name="_span" weight=".6"/>
      <dimension name="nomtype" weight=".2"/>
    </tag_profile>
    <tag_profile true_labels="LOCATION">
      <dimension name="_label" weight=".2"/>
      <dimension name="_span" weight=".6"/>
      <dimension name="nomtype" weight=".2"/>
    </tag_profile>
  </similarity_profile>""")
        # This should trigger the nonpaired method map, and gain the dead weight,
        # even though the attribute matches.
        a1 = doc1.createAnnotation(5, 10, "PERSON", {"nomtype": "PRO"})
        a2 = doc2.createAnnotation(7, 11, "LOCATION", {"nomtype": "PRO"})
        self._assess(doc1, doc2, p, [(a1, a2, .3, {"_label": 0.0, "_span": 0.5})])

    def testSimplePairingWithSetAttribute(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <attribute of_annotation="PERSON,ORGANIZATION,LOCATION" name="nomtype"
                 aggregation="set">      
        <choice>NAM</choice>
        <choice>NOM</choice>
        <choice>PRO</choice>
      </attribute>
    </annotation_set_descriptor>
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="PERSON,LOCATION,ORGANIZATION">
      <dimension name="_label" weight=".2"/>
      <dimension name="_span" weight=".5"/>
      <dimension name="nomtype" weight=".3"/>
    </tag_profile>
  </similarity_profile>""")
        from MAT.Annotation import AttributeValueSet
        a1 = doc1.createAnnotation(5, 10, "PERSON", {"nomtype": AttributeValueSet(["PRO", "NOM"])})
        a2 = doc2.createAnnotation(7, 11, "LOCATION", {"nomtype": AttributeValueSet(["PRO", "NAM"])})
        self._assess(doc1, doc2, p, [(a1, a2, .35, {"_label": 0.0, "_span": 0.5, "nomtype": 1.0/3.0})])

    def testSimplePairingWithAttributeRemainder(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <attribute of_annotation="PERSON,ORGANIZATION,LOCATION" name="nomtype">
        <choice>NAM</choice>
        <choice>NOM</choice>
        <choice>PRO</choice>
      </attribute>
      <attribute of_annotation="PERSON,ORGANIZATION,LOCATION" name="digits"
                 aggregation="set" type="int"/>
    </annotation_set_descriptor>
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="PERSON,LOCATION,ORGANIZATION">
      <dimension name="_label" weight=".2"/>
      <dimension name="_span" weight=".2"/>
      <dimension name="_nonannotation_attribute_remainder" weight=".6"/>
    </tag_profile>
  </similarity_profile>""")
        from MAT.Annotation import AttributeValueSet
        a1 = doc1.createAnnotation(5, 10, "PERSON", {"nomtype": "PRO", "digits": AttributeValueSet([2, 3, 4])})
        a2 = doc2.createAnnotation(7, 11, "LOCATION", {"nomtype": "PRO", "digits": AttributeValueSet([1, 3, 4])})
        # So the logic is that each of the attributes is worth .5,
        # internally to the special dimension, and one matches,
        # and the other matches 1/2, which means that dimension should
        # be .75. So the total should be .45 + .1.
        self._assess(doc1, doc2, p,
                     [(a1, a2, .55, {"_label": 0.0, "_span": 0.5, "_nonannotation_attribute_remainder": .75})])

    # The default pairing algorithm uses .1 label, .9 span, .1 other nonannotation features,
    # .1 other annotation features.
    # The annotation features will weigh nothing here, because there aren't any.
    # That's dividing by 11. Sigh.
    def testDefaultPairingWithAttributeRemainder(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <attribute of_annotation="PERSON,ORGANIZATION,LOCATION" name="nomtype">
        <choice>NAM</choice>
        <choice>NOM</choice>
        <choice>PRO</choice>
      </attribute>
      <attribute of_annotation="PERSON,ORGANIZATION,LOCATION" name="digits"
                 aggregation="set" type="int"/>
    </annotation_set_descriptor>
  </annotation_set_descriptors>""")
        from MAT.Annotation import AttributeValueSet
        a1 = doc1.createAnnotation(5, 10, "PERSON", {"nomtype": "PRO", "digits": AttributeValueSet([2, 3, 4])})
        a2 = doc2.createAnnotation(7, 11, "LOCATION", {"nomtype": "NAM", "digits": AttributeValueSet([2, 3, 4])})
        # So the label doesn't match, but the span is half, and one of the
        # extra attributes matches, and the other doesn't.
        self._assess(doc1, doc2, p,
                     [(a1, a2, (0.45 + .05)/(1.1), {"_label": 0.0, "_span": 0.5, "_nonannotation_attribute_remainder": 0.5})])

    def testPartitionedPairingWithAttributeRemainder(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <attribute of_annotation="PERSON,ORGANIZATION,LOCATION" name="nomtype">
        <choice>NAM</choice>
        <choice>NOM</choice>
        <choice>PRO</choice>
      </attribute>
      <attribute of_annotation="PERSON,ORGANIZATION,LOCATION" name="digits"
                 aggregation="set" type="int"/>
    </annotation_set_descriptor>
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="PERSON,ORGANIZATION">
      <dimension name="_label" weight=".2"/>
      <dimension name="_span" weight=".2"/>
      <dimension name="nomtype" weight=".1"/>
      <dimension name="_nonannotation_attribute_remainder" weight=".5"/>
    </tag_profile>
    <tag_profile true_labels="LOCATION">
      <dimension name="_label" weight=".2"/>
      <dimension name="_span" weight=".2"/>
      <dimension name="_nonannotation_attribute_remainder" weight=".6"/>
    </tag_profile>
  </similarity_profile>""")
        # So here, we're matching across profiles, and a different set
        # of attributes is declared in each. When we look at it from
        # the PERSON's point of view, nomtype fails to match, because
        # declared attributes don't match across profiles, and
        # digits is the only stranded attribute, and it matches at .5,
        # and the span matches at .5. This gives a weight of .1 + .25.
        # When we look at it from the LOCATION's point of view,
        # the weights are as in the previous example, which is .75 * .6 + .1,
        # which gives us .55. The lower weight is .45, so that's what
        # we should get, along with its dimensions.
        # And the stray attributes shouldn't count at all, since they
        # aren't globally declared.
        from MAT.Annotation import AttributeValueSet
        a1 = doc1.createAnnotation(5, 10, "PERSON", {"nomtype": "PRO", "digits": AttributeValueSet([2, 3, 4]), "stray1": "foo"})
        a2 = doc2.createAnnotation(7, 11, "LOCATION", {"nomtype": "PRO", "digits": AttributeValueSet([1, 3, 4]), "stray1": "foo"})
        self._assess(doc1, doc2, p,
                     [(a1, a2, .35, {"_label": 0.0, "_span": 0.5,
                                     "_nonannotation_attribute_remainder": .5})])

    # OK, next complexity step. Let's compare something like
    # coref. This involves sets of annotation-valued attributes.

    def testSimpleCorefPairing(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <annotation label="COREF" span="no"/>
      <attribute of_annotation="COREF" name="mentions" type="annotation" aggregation="set">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>
    </annotation_set_descriptor>    
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="PERSON,LOCATION,ORGANIZATION">
      <dimension name="_label" weight=".2"/>
      <dimension name="_span" weight=".8"/>
    </tag_profile>
    <tag_profile true_labels="COREF">
      <dimension name="mentions" weight="1.0"/>
    </tag_profile>
  </similarity_profile>""")
        d1a = doc1.createAnnotation(5, 10, "PERSON")
        d1b = doc1.createAnnotation(20, 25, "PERSON")
        d2a = doc2.createAnnotation(7, 11, "LOCATION")
        d2b = doc2.createAnnotation(20, 30, "PERSON")
        from MAT.Annotation import AttributeValueSet
        d1c = doc1.createSpanlessAnnotation("COREF", {"mentions": AttributeValueSet([d1a, d1b])})
        d2c = doc2.createSpanlessAnnotation("COREF", {"mentions": AttributeValueSet([d2a, d2b])})
        # So the spans are easy. What about the mentions?
        # Well, the best path is going to pair d1a and d2a,
        # d1b and d2b. The longest set is 2, so the max score
        # is 2. The scores sum to 1, so the mentions will be worth
        # .5, and that's the final score.
        self._assess(doc1, doc2, p,
                     [(d1a, d2a, .4, {"_label": 0.0, "_span": 0.5}),
                      (d1b, d2b, .6, {"_label": 1.0, "_span": 0.5}),
                      (d1c, d2c, .5, {"mentions": 0.5})])

    # Next default: the _annotation_attribute_remainder. This
    # pairs attributes, no matter what their names are.

    def testAnnotationAttributeRemainderPairing(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <annotation label="COREF" span="no"/>
      <attribute of_annotation="COREF" name="mentions" type="annotation" aggregation="set">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>
      <attribute of_annotation="COREF" name="other_mentions" type="annotation" aggregation="set">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>
      <annotation label="EVENT" span="no"/>
      <attribute of_annotation="EVENT" name="arg1" type="annotation">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>
      <attribute of_annotation="EVENT" name="arg2" type="annotation">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>      
    </annotation_set_descriptor>    
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="PERSON,LOCATION,ORGANIZATION">
      <dimension name="_label" weight=".2"/>
      <dimension name="_span" weight=".8"/>
    </tag_profile>
    <tag_profile true_labels="COREF,EVENT">
      <dimension name="_annotation_attribute_remainder" weight="1.0"/>
    </tag_profile>
  </similarity_profile>""")
        d1a = doc1.createAnnotation(5, 10, "PERSON")
        d1b = doc1.createAnnotation(20, 25, "PERSON")
        d2a = doc2.createAnnotation(7, 11, "LOCATION")
        d2b = doc2.createAnnotation(20, 30, "PERSON")
        from MAT.Annotation import AttributeValueSet
        d1c = doc1.createSpanlessAnnotation("COREF", {"mentions": AttributeValueSet([d1a, d1b])})
        d2c = doc2.createSpanlessAnnotation("COREF", {"other_mentions": AttributeValueSet([d2a, d2b])})
        d1d = doc1.createSpanlessAnnotation("EVENT", {"arg1": d1a, "arg2": d1b})
        d2d = doc2.createSpanlessAnnotation("EVENT", {"arg1": d2a, "arg2": d2b})
        # So the spans are easy. What about the rest?
        # Well, the COREF attributes have to pair with each other, 
        # since they're the only set annotation attributes. 
        # Like above, the best path is going to pair d1a and d2a,
        # d1b and d2b. The longest set is 2, so the max score
        # is 2. The scores sum to 1, so the mentions will be worth
        # .5. But there are two attributes, no one, and only one
        # of them is filled in each. So we cut it in half.
        # The event arguments will pair
        # up - one similarity will be .6, the other will be .4,
        # and there are two arguments, and the result should be
        # .5 there too.
        self._assess(doc1, doc2, p,
                     [(d1a, d2a, .4, {"_label": 0.0, "_span": 0.5}),
                      (d1b, d2b, .6, {"_label": 1.0, "_span": 0.5}),
                      (d1c, d2c, .25, {"_annotation_attribute_remainder": 0.25}),
                      (d1d, d2d, .5, {"_annotation_attribute_remainder": 0.5}),
                      (d1c, d2d, 0, {"_annotation_attribute_remainder": 0.0}),
                      (d1d, d2c, 0, {"_annotation_attribute_remainder": 0.0})
                      ])

    def testAnnotationAttributeImpliedSpanPairing(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <annotation label="EVENT1" span="no"/>
      <annotation label="EVENT2" span="no"/>
      <attribute of_annotation="EVENT1,EVENT2" name="arg1" type="annotation">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>
      <attribute of_annotation="EVENT1,EVENT2" name="arg2" type="annotation">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>      
    </annotation_set_descriptor>    
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="PERSON,LOCATION,ORGANIZATION">
      <dimension name="_label" weight=".2"/>
      <dimension name="_span" weight=".8"/>
    </tag_profile>
    <tag_profile true_labels="EVENT1,EVENT2">
      <dimension name="_label" weight=".2"/>
      <dimension name="_annotation_attribute_remainder" weight=".8"/>
    </tag_profile>
  </similarity_profile>""")
        d1a = doc1.createAnnotation(5, 10, "PERSON")
        d1b = doc1.createAnnotation(20, 25, "PERSON")
        d2a = doc2.createAnnotation(7, 11, "LOCATION")
        d2b = doc2.createAnnotation(20, 30, "PERSON")
        d1d = doc1.createSpanlessAnnotation("EVENT1", {"arg1": d1a, "arg2": d1b})
        d2d = doc2.createSpanlessAnnotation("EVENT2", {"arg1": d2a, "arg2": d2b})
        # And now, a couple that don't overlap.
        d1e = doc1.createAnnotation(50, 56, "ORGANIZATION")
        d2e = doc2.createAnnotation(50, 56, "PERSON")
        d1f = doc1.createSpanlessAnnotation("EVENT1", {"arg1": d1e})
        d2f = doc2.createSpanlessAnnotation("EVENT1", {"arg1": d2e})
        # So the spans are easy. What about the events?
        # Well, there should be two pairs. That's the easy bit.
        # Then, the similarity contributed by each argument is its own
        # similarity, and then we take the sum of the possible ones, which
        # is 2 in all cases. In the first case,
        # the sum of the similarities is 1, and so the remainder is
        # .5, and that means the overall similarity is .4.
        # In the second case, there's only one argument filled, with .8 similarity, and
        # that means that the similarity of the remainder is .4. So .2 * .1 + *4 * .8
        # is .52.
        self._assess(doc1, doc2, p,
                     [(d1a, d2a, .4, {"_label": 0.0, "_span": 0.5}),
                      (d1b, d2b, .6, {"_label": 1.0, "_span": 0.5}),
                      (d1e, d2e, .8, {"_label": 0.0, "_span": 1.0}),
                      (d1d, d2d, .4, {"_label": 0.0, "_annotation_attribute_remainder": 0.5}),
                      (d1f, d2f, .52, {"_label": 1.0, "_annotation_attribute_remainder": 0.4})
                      ])

    # Multiattribute.
    def testAnnotationMultiAttributePairing(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <annotation label="EVENT1" span="no"/>
      <annotation label="EVENT2" span="no"/>
      <attribute of_annotation="EVENT1,EVENT2" name="arg1" type="annotation">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>
      <attribute of_annotation="EVENT1,EVENT2" name="arg2" type="annotation">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>      
    </annotation_set_descriptor>    
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="EVENT1,EVENT2">
      <dimension name="_label" weight=".2"/>
      <dimension name="arg1,arg2" method="_annotation_set_similarity" weight=".8"/>
    </tag_profile>
  </similarity_profile>""")
        d1a = doc1.createAnnotation(5, 10, "PERSON")
        d1b = doc1.createAnnotation(20, 25, "PERSON")
        d2a = doc2.createAnnotation(7, 11, "LOCATION")
        d2b = doc2.createAnnotation(20, 30, "PERSON")
        d1d = doc1.createSpanlessAnnotation("EVENT1", {"arg1": d1a, "arg2": d1b})
        d2d = doc2.createSpanlessAnnotation("EVENT2", {"arg1": d2b, "arg2": d2a})
        # And now, a couple that don't overlap.
        d1e = doc1.createAnnotation(50, 56, "ORGANIZATION")
        d2e = doc2.createAnnotation(50, 56, "PERSON")
        d1f = doc1.createSpanlessAnnotation("EVENT1", {"arg1": d1e})
        d2f = doc2.createSpanlessAnnotation("EVENT1", {"arg2": d2e})
        # This is like the case above, except for the weights and dimensions.
        # The default is:
        # for spanned, .1 label, .9 span, .1 nonannotation remainder, .1 annotation remainder.
        # For EVENT1 and EVENT2, the multiattribute should kick in.
        # There should be two pairs. That's the easy bit.
        # Then, the similarity contributed by each argument is its own
        # similarity, and then we take the sum of the possible ones, which
        # is 2 in all cases. In the first case,
        # the sum of the similarities is 1, and so arg1,arg2 is
        # .5.
        # label is 0, so the first one is .5 * .8 which is .4.
        # In the second case, there's only one argument filled, with .9 similarity.
        # Even though the arguments are different, we're treating
        # them as a set, and the sets are the same size, so the
        # similarity of arg1,arg2 should be .9. The label
        # matches in this case, so it's .2 + (.9 * .8)
        self._assess(doc1, doc2, p,
                     [(d1a, d2a, .45, {"_label": 0.0, "_span": 0.5}),
                      (d1b, d2b, .55, {"_label": 1.0, "_span": 0.5}),
                      (d1e, d2e, .9, {"_label": 0.0, "_span": 1.0}),
                      (d1d, d2d, .4, {"_label": 0.0, "arg1,arg2": 0.5}),
                      (d1f, d2f, .92, {"_label": 1.0, "arg1,arg2": 0.9})
                      ])

    # Attribute equivalences.
    def testAnnotationAttrEquivPairing(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <annotation label="EVENT1" span="no"/>
      <annotation label="EVENT2" span="no"/>
      <attribute of_annotation="EVENT1" name="arg1" type="annotation">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>
      <attribute of_annotation="EVENT2" name="arg2" type="annotation">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>      
    </annotation_set_descriptor>    
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="EVENT1,EVENT2">
      <attr_equivalences name="arg" attrs="arg1,arg2"/>
      <dimension name="_label" weight=".2"/>
      <dimension name="arg" weight=".8"/>
    </tag_profile>
  </similarity_profile>""")
        d1a = doc1.createAnnotation(5, 10, "PERSON")
        d1b = doc1.createAnnotation(20, 25, "PERSON")
        d2a = doc2.createAnnotation(7, 11, "LOCATION")
        d2b = doc2.createAnnotation(20, 30, "PERSON")
        d1d = doc1.createSpanlessAnnotation("EVENT1", {"arg1": d1b})
        d2d = doc2.createSpanlessAnnotation("EVENT2", {"arg2": d2b})
        # And now, a couple that don't overlap.
        d1e = doc1.createAnnotation(50, 56, "ORGANIZATION")
        d2e = doc2.createAnnotation(50, 56, "PERSON")
        d1f = doc1.createSpanlessAnnotation("EVENT1", {"arg1": d1e})
        d2f = doc2.createSpanlessAnnotation("EVENT2", {"arg2": d2e})
        # Span handled as default, again:
        # for spanned, .1 label, .9 span, .1 nonannotation remainder, .1 annotation remainder.
        # For EVENT1 and EVENT2, we have an attribute equivalence.
        # There should be two pairs. That's the easy bit.
        # In the first case, the similarity is the similarity of
        # the d1b, d2b pair, which is .55.
        # So we get (.8 * .55), which is .44
        # In the second case, the similarity of the args is .9, and
        # the label DOESN'T match here, so we have (.8 * .9).
        self._assess(doc1, doc2, p,
                     [(d1a, d2a, .45, {"_label": 0.0, "_span": 0.5}),
                      (d1b, d2b, .55, {"_label": 1.0, "_span": 0.5}),
                      (d1e, d2e, .9, {"_label": 0.0, "_span": 1.0}),
                      (d1d, d2d, .44, {"_label": 0.0, "arg": 0.55}),
                      (d1f, d2f, .72, {"_label": 0.0, "arg": 0.9})
                      ])

        
    # Finally, we test the defaults. 
    def testAnnotationAttributeDefaultPairing(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <annotation label="EVENT1" span="no"/>
      <annotation label="EVENT2" span="no"/>
      <attribute of_annotation="EVENT1,EVENT2" name="arg1" type="annotation">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>
      <attribute of_annotation="EVENT1,EVENT2" name="arg2" type="annotation">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>      
    </annotation_set_descriptor>    
  </annotation_set_descriptors>""")
        d1a = doc1.createAnnotation(5, 10, "PERSON")
        d1b = doc1.createAnnotation(20, 25, "PERSON")
        d2a = doc2.createAnnotation(7, 11, "LOCATION")
        d2b = doc2.createAnnotation(20, 30, "PERSON")
        d1d = doc1.createSpanlessAnnotation("EVENT1", {"arg1": d1a, "arg2": d1b})
        d2d = doc2.createSpanlessAnnotation("EVENT2", {"arg1": d2a, "arg2": d2b})
        # And now, a couple that don't overlap.
        d1e = doc1.createAnnotation(50, 56, "ORGANIZATION")
        d2e = doc2.createAnnotation(50, 56, "PERSON")
        d1f = doc1.createSpanlessAnnotation("EVENT1", {"arg1": d1e})
        d2f = doc2.createSpanlessAnnotation("EVENT1", {"arg1": d2e})
        # This is like the case above, except for the weights and dimensions.
        # The default is:
        # for spanned, .1 label, .9 span, .1 nonannotation remdinder, .1 annotation remainder.
        # for spanless, .2 label, .2 nonannotation remainder, .6 annotation remainder.
        # The spans are easy. What about the events?
        # Well, there should be two pairs. That's the easy bit.
        # Then, the similarity contributed by each argument is its own
        # similarity, and then we take the sum of the possible ones, which
        # is 2 in all cases. In the first case,
        # the sum of the similarities is 1, and so the remainder is
        # .5.
        # In the second case, there's only one argument filled, with .9 similarity, and
        # that means that the similarity of the remainder is .45.
        # Because there's no nonannotation remainder, it's basically .25 label,
        # .75 annotation remainder, so the first case is .375, and the second
        # case is .25 + (.75 * .45)
        self._assess(doc1, doc2, p,
                     [(d1a, d2a, .45, {"_label": 0.0, "_span": 0.5}),
                      (d1b, d2b, .55, {"_label": 1.0, "_span": 0.5}),
                      (d1e, d2e, .9, {"_label": 0.0, "_span": 1.0}),
                      (d1d, d2d, .375, {"_label": 0.0, "_annotation_attribute_remainder": 0.5}),
                      (d1f, d2f, .5875, {"_label": 1.0, "_annotation_attribute_remainder": 0.45})
                      ])

    def testSpanlessFiltering(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
      <annotation label="EVENT1" span="no"/>
      <annotation label="EVENT2" span="no"/>
      <attribute of_annotation="EVENT1,EVENT2" name="arg1" type="annotation">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>
      <attribute of_annotation="EVENT1,EVENT2" name="arg2" type="annotation">
        <label_restriction label="PERSON"/>
        <label_restriction label="LOCATION"/>
        <label_restriction label="ORGANIZATION"/>
      </attribute>      
    </annotation_set_descriptor>    
  </annotation_set_descriptors>""")
        d1a = doc1.createAnnotation(5, 10, "PERSON")
        d1b = doc1.createAnnotation(20, 25, "PERSON")
        d2a = doc2.createAnnotation(7, 11, "LOCATION")
        d2b = doc2.createAnnotation(20, 30, "PERSON")
        d1d = doc1.createSpanlessAnnotation("EVENT1", {"arg1": d1a, "arg2": d1b})
        d2d = doc2.createSpanlessAnnotation("EVENT2", {"arg1": d2a, "arg2": d2b})
        # And now, a couple that don't overlap.
        d1e = doc1.createAnnotation(50, 56, "ORGANIZATION")
        d2e = doc2.createAnnotation(50, 56, "PERSON")
        d1f = doc1.createSpanlessAnnotation("EVENT1", {"arg1": d1e})
        d2f = doc2.createSpanlessAnnotation("EVENT1", {"arg1": d2e})
       
        # This is a little different than the tests above. Here, I'm testing
        # to see whether the scorer will do the right thing with filtering
        # by region with spanless annotations, now that I've fixed that to
        # use the implied span. Since I already have this beautiful
        # setup, let's use it.

        # First, let's test collectDocumentStatistics.

        m = MAT.ModelBuilder.ModelBuilder(t, None)
        
        totalItems, ignore, totalByTag, ignore, ignore = m.collectDocumentStatistics(doc1, [(0, len(doc1.signal))])
        self.assertEqual(totalItems, 5)
        self.assertEqual(totalByTag, {'PERSON': 2, 'EVENT1': 2, 'ORGANIZATION': 1})
        # Now, if I give it a region which starts at 40, it should knock out
        # one of the relations and two of the NEs.
        totalItems, ignore, totalByTag, ignore, ignore = m.collectDocumentStatistics(doc1, [(40, len(doc1.signal))])
        self.assertEqual(totalItems, 2)
        self.assertEqual(totalByTag, {'EVENT1': 1, 'ORGANIZATION': 1})
        # Next, if I give it a region that includes one but not the other
        # of the arguments of the first EVENT1, it should knock out that event.
        totalItems, ignore, totalByTag, ignore, ignore = m.collectDocumentStatistics(doc1, [(0, 15)])
        self.assertEqual(totalItems, 1)
        self.assertEqual(totalByTag, {'PERSON': 1})
        # Finally, if I add the region for the second event, I should get the
        # combination.
        totalItems, ignore, totalByTag, ignore, ignore = m.collectDocumentStatistics(doc1, [(0, 15), (40, len(doc1.signal))])
        self.assertEqual(totalItems, 3)
        self.assertEqual(totalByTag, {'EVENT1': 1, 'ORGANIZATION': 1, 'PERSON': 1})
        
        # Now, we should do the same thing with the regions in the scorer,
        # using the segFilters. And actually, we should do it with
        # a bunch of documents, so we can make sure the list stuff works.

        docPairs = []
        for i in range(5):
            doc1 = self._newdoc(t)
            doc2 = self._newdoc(t)
            d1a = doc1.createAnnotation(5, 10, "PERSON")
            d1b = doc1.createAnnotation(20, 25, "PERSON")
            d2a = doc2.createAnnotation(7, 11, "LOCATION")
            d2b = doc2.createAnnotation(20, 30, "PERSON")
            d1d = doc1.createSpanlessAnnotation("EVENT1", {"arg1": d1a, "arg2": d1b})
            d2d = doc2.createSpanlessAnnotation("EVENT2", {"arg1": d2a, "arg2": d2b})
            # And now, a couple that don't overlap.
            d1e = doc1.createAnnotation(50, 56, "ORGANIZATION")
            d2e = doc2.createAnnotation(50, 56, "PERSON")
            d1f = doc1.createSpanlessAnnotation("EVENT1", {"arg1": d1e})
            d2f = doc2.createSpanlessAnnotation("EVENT1", {"arg1": d2e})
            docPairs.append((("", doc1), ("", doc2)))

        # OK, now we have a list of 5 pairs of identical docs.

        def useableSeg(seg):
            return seg.get("status") in ("human gold", "reconciled")

        # First, let's check 0 to 40 again. Let's set up some segments
        # for the whole test.
        
        for p1, p2 in docPairs:
            p1[1].createAnnotation(0, 15, "SEGMENT", {"status": "non-gold"})
            p1[1].createAnnotation(15, 40, "SEGMENT", {"status": "non-gold"})
            p1[1].createAnnotation(40, len(p1[1].signal), "SEGMENT", {"status": "human gold"})
            p2[1].createAnnotation(0, 15, "SEGMENT", {"status": "non-gold"})
            p2[1].createAnnotation(15, 40, "SEGMENT", {"status": "non-gold"})
            p2[1].createAnnotation(40, len(p2[1].signal), "SEGMENT", {"status": "human gold"})

        p = MAT.Pair.PairState(task = t, skipTokens = True)
        p.addDocumentTuples(docPairs, (useableSeg, useableSeg))
        # Let's see what's in the assessment list, shall we?
        # We should have five of everything - so I can't compare using set().
        l = [(p[0].atype.lab, p[1].atype.lab) for p in p.simEngine.similarityCache.keys()]
        l.sort()
        # From 40 to the end, we should have just e and f paired.
        self.assertEqual(([('EVENT1', 'EVENT1')] * 5) + ([('ORGANIZATION', 'PERSON')] * 5), l)

        # Now, just the first segment
        for p1, p2 in docPairs:
            p1Segs = p1[1].orderAnnotations(["SEGMENT"])
            p1Segs[0]["status"] = "human gold"
            p1Segs[2]["status"] = "non-gold"
            p2Segs = p2[1].orderAnnotations(["SEGMENT"])
            p2Segs[0]["status"] = "human gold"
            p2Segs[2]["status"] = "non-gold"

        # Do it again.
        p = MAT.Pair.PairState(task = t, skipTokens = True)
        p.addDocumentTuples(docPairs, (useableSeg, useableSeg))
        # Let's see what's in the assessment list, shall we?
        # We should have five of everything - so I can't compare using set().
        l = [(p[0].atype.lab, p[1].atype.lab) for p in p.simEngine.similarityCache.keys()]
        l.sort()
        # From 0 to 15, it should be just PERSON, LOCATION
        self.assertEqual(([('PERSON', 'LOCATION')] * 5), l)

        # Now, add the third back in.
        for p1, p2 in docPairs:
            p1Segs = p1[1].orderAnnotations(["SEGMENT"])
            p1Segs[2]["status"] = "human gold"
            p2Segs = p2[1].orderAnnotations(["SEGMENT"])
            p2Segs[2]["status"] = "human gold"
        
        # Do it again.
        p = MAT.Pair.PairState(task = t, skipTokens = True)
        p.addDocumentTuples(docPairs, (useableSeg, useableSeg))
        # Let's see what's in the assessment list, shall we?
        # We should have five of everything - so I can't compare using set().
        l = [(p[0].atype.lab, p[1].atype.lab) for p in p.simEngine.similarityCache.keys()]
        l.sort()
        # Should be a combination of the previous two.
        self.assertEqual(([('EVENT1', 'EVENT1')] * 5) + ([('ORGANIZATION', 'PERSON')] * 5) + ([('PERSON', 'LOCATION')] * 5), l)

    # Too much yummy infrastructure to put this anywhere else.
    
    def testLabelAgnosticScoring(self):
        pass

    # This is to tickle a very bad bug involving overlap
    # sets - originally, items which didn't overlap with
    # each other but were in the same comparison set because
    # of overlap transitivity were being illegitimately paired.
    
    def testBadNonoverlappingPair(self):
        t, doc1, doc2, p = self._newInputs("t", """
  <annotation_set_descriptors>
    <annotation_set_descriptor category="content" name="content">
      <annotation label='PERSON'/>
      <annotation label='LOCATION'/>
      <annotation label='ORGANIZATION'/>
    </annotation_set_descriptor>
  </annotation_set_descriptors>
  <similarity_profile>
    <tag_profile true_labels="PERSON,LOCATION,ORGANIZATION">
      <dimension name="_label" weight="1"/>
      <dimension name="_span" weight="1"/>
    </tag_profile>
  </similarity_profile>""")
        a1 = doc1.createAnnotation(5, 10, "PERSON")
        a2 = doc1.createAnnotation(15, 40, "LOCATION")
        a3 = doc1.createAnnotation(45, 105, "ORGANIZATION")
        b1 = doc2.createAnnotation(5, 55, "PERSON")
        b2 = doc2.createAnnotation(70, 85, "LOCATION")
        b3 = doc2.createAnnotation(90, 105, "ORGANIZATION")
        self._assess(doc1, doc2, p,
                     [(a1, b1, 0.55, {"_label": 1.0, "_span": 0.1}),
                      (a1, b2, 0, {}),
                      (a1, b3, 0, {}),
                      (a2, b1, 0.25, {"_label": 0, "_span": 0.5}),
                      (a2, b2, 0, {}),
                      (a2, b3, 0, {}),
                      (a3, b1, 0.05, {"_label": 0, "_span": 0.1}),
                      (a3, b2, 0.125, {"_label": 0, "_span": 0.25}),
                      (a3, b3, 0.625, {"_label": 1.0, "_span": 0.25})])
