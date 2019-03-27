# AMIA tests. The test docs might be elsewhere, in protected space.

import MAT
import MAT.UnitTest

import sys, re
NOT_WINDOWS = (sys.platform != "win32")


class StepDetectionTest(MAT.UnitTest.MATTestCase):

    def runTest(self):

        # Let's see if the steps buried in workflows with proxy steps
        # are properly detected. Tokenize, e.g.

        task = MAT.PluginMgr.LoadPlugins().getTask("AMIA Deidentification")

        d = MAT.Document.AnnotatedDoc(signal = u"I like peas.")
        d.createAnnotation(0, 1, "lex")

        jsonIO = MAT.DocumentIO.getDocumentIO("mat-json", task = task)
        s = jsonIO.writeToUnicodeString(d)
        newD = jsonIO.readFromUnicodeString(s)

        self.assertEqual(newD.metadata.get("phasesDone"), ["tokenize"])

class TaggerTest(MAT.UnitTest.CmdlinesTestCase):

    cmdBlock = {"header": "Test the tagger.",
                "cmds": [["%(MAT_PKG_HOME)s/bin/MATEngine",
                          "--task", "AMIA Deidentification",
                          "--workflow", "Demo",
                          "--tagger_local", "--tagger_model", '%(AMIA_CARAFE_MODEL)s',
                          "--input_file", "%(AMIA_TEST_DOCS)s/111_modified.amia.xml",
                          "--input_file_type", "raw",
                          "--steps", "zone,tag,nominate,transform",
                          "--replacer", 'clear -> [ ]',
                          "--output_file", "%(TMPDIR)s/amia.tmp.txt",
                          "--output_file_type", "raw"],
                         {"availability": NOT_WINDOWS, "cmd": ["cat", "%(TMPDIR)s/amia.tmp.txt"]},
                         {"availability": NOT_WINDOWS, "cmd": ["echo"]}]}

class BracketReplaceAndResynthesisTest(MAT.UnitTest.CmdlinesTestCase):

    cmdBlock = {"header": "Test the replacers (bracket)",
                "cmds": [["%(MAT_PKG_HOME)s/bin/MATEngine",
                          "--input_file", "%(AMIA_TEST_DOCS)s/111_modified.amia.xml.json",
                          "--task", "AMIA Deidentification",
                          "--workflow", "Demo",
                          "--input_file_type", "mat-json",
                          "--steps", "nominate,transform",
                          "--replacer", 'clear -> [ ]',
                          "--output_file", "%(TMPDIR)s/amia.tmp.txt",
                          "--output_file_type", "raw"],
                         {"availability": NOT_WINDOWS, "cmd": ["cat", "%(TMPDIR)s/amia.tmp.txt"]},
                         {"availability": NOT_WINDOWS, "cmd": ["echo"]},
                         ["%(MAT_PKG_HOME)s/bin/MATEngine",
                          "--input_file", "%(TMPDIR)s/amia.tmp.txt",
                          "--task", "AMIA Deidentification",
                          "--workflow", "Resynthesize",
                          "--input_file_type", "raw",
                          "--steps", "tag,nominate,transform",
                          "--replacer", '[ ] -> clear',
                          "--output_file", "-",
                          "--output_file_type", "raw"]]}

class CharReplacementTest(MAT.UnitTest.CmdlinesTestCase):

    cmdBlock = {"header": "Char repl.",
                "cmds": [["%(MAT_PKG_HOME)s/bin/MATEngine",
                          "--input_file", "%(AMIA_TEST_DOCS)s/111_modified.amia.xml.json",
                          "--task", "AMIA Deidentification",
                          "--workflow", "Demo",
                          "--input_file_type", "mat-json",
                          "--steps", "nominate,transform",
                          "--replacer", 'clear -> char repl',
                          "--output_file", "%(TMPDIR)s/amia.tmp.txt",
                          "--output_file_type", "raw"],
                         {"availability": NOT_WINDOWS, "cmd": ["cat", "%(TMPDIR)s/amia.tmp.txt"]},
                         {"availability": NOT_WINDOWS, "cmd": ["echo"]}]}

class ClearReplacementTest(MAT.UnitTest.CmdlinesTestCase):

    cmdBlock = {"header": "Clear.",
                "cmd": ["%(MAT_PKG_HOME)s/bin/MATEngine",
                        "--input_file", "%(AMIA_TEST_DOCS)s/111_modified.amia.xml.json",
                        "--task", "AMIA Deidentification",
                        "--workflow", "Demo",
                        "--input_file_type", "mat-json",
                        "--steps", "nominate,transform",
                        "--replacer", 'clear -> clear',
                        "--output_file", "-",
                        "--output_file_type", "raw"]}

class ModelBuildTest(MAT.UnitTest.CmdlinesTestCase):

    cmdBlock = {"header": "Model build.",
                "cmd": ["%(MAT_PKG_HOME)s/bin/MATModelBuilder",
                        "--task", "AMIA Deidentification",
                        "--input_files", "%(AMIA_TEST_DOCS)s/111_modified.amia.xml.json",
                        "--model_file", "%(TMPDIR)s/model_file"]}

# And now, lots of tests to  test the replacement.

import glob, os, MAT

class ReplacementTest(MAT.UnitTest.MATTestCase):

    def testSimpleReplacement(self):

        # What we want to do is get all the fillers from the gold
        # AMIA corpus, and run them through the replacer.

        amiaCorpora = [s.strip() for s in self.testContext["AMIA_JSON_CORPORA"].split(",")]
        
        # Read in all the files in the corpora, and collect the unique inputs.

        _jsonIO = MAT.DocumentIO.getDocumentIO("mat-json")
        task = MAT.PluginMgr.LoadPlugins().getTask("AMIA Deidentification")
        labels = task.getAnnotationTypesByCategory("content")

        dList = []

        i = 0
        for c in amiaCorpora:
            for p in glob.glob(os.path.join(c, "*")):
                if os.path.isfile(p):
                    if i % 100 == 0:
                        print i, "...",
                    i += 1
                    try:
                        d = _jsonIO.readFromSource(p)        
                    except:
                        continue
                    dList.append([(task.getEffectiveAnnotationLabel(a), d.signal[a.start:a.end])
                                  for a in d.orderAnnotations(labels)])
        
        print
        # OK, we've collected all the replacer inputs.

        r = task.instantiateReplacer("clear -> clear")

        # You can't interleave digests and replaces. No digest can follow
        # a replace, because of possible issues with corpus distributions.        

        collectedPats = []
        
        for pairs in dList:
            collectedPats.append([(lab, s, r.Digest(lab, s)) for lab, s in pairs])
            r.EndDocumentForDigestion()

        # Need to reset this - ugh.
        del task._instantiatedReplacerCache["clear -> clear"]
        otherR = task.instantiateReplacer("clear -> clear")

        for tuples in collectedPats:
            for lab, s, pat in tuples:
                # We need to know, for later comparison, whether the pattern
                # already has a replacement seed.
                alreadySeen = False
                if pat.replacer._useSeedCache:
                    # Don't use any() here - it evaluates the entire list comprehension argument.
                    for k in pat.getReplacementCacheKeys():
                       if pat.replacer.seedCache.has_key(k):
                           alreadySeen = True
                           break
                repl = r.Replace(lab, pat)
                # First, trivially, make sure the replacement is non-empty.
                self.assertFalse(s and (not repl), "replacement for '%s' with label %s is empty" % (s, lab))
                # What else should I test? Well, for pairs in particular classes (dates, names, locations),
                # the output should be digestible, always.
                otherPat = otherR.Digest(lab, repl)
                # Hm. This will sometimes fail if, e.g., there's an input DATE which
                # is just 10, and it's parsed as a day, and the offset that's chosen causes
                # this replacement to be 31, and that's not a date in the current month.
                # Actually, this needs to be a bit more general. Once I know that it's a date
                # which has a day and no month, I need to evaluate the replacement and 
                # see whether it's got contiguous digits which are greater than 28.
                if (pat.__ctype__ == "DATE") and (pat.dateObj is not None) and (pat.dateObj.res.day is not None) and \
                   (pat.dateObj.res.month is None):
                    # Look at the repl.
                    m = re.search("\d+", repl)
                    if m and (int(m.group()) > 28):
                        # Just skip it, in this case, since any error that's generated
                        # is spurious.
                        continue
                self.assertFalse(hasattr(otherPat, "seed_unparseable") and otherPat.seed_unparseable,
                                 "replacement for %s '%s' ('%s') is not parseable" % (lab, s, repl))
                # If it's a person, date or location, we probably want to ensure that there's some similarity
                # between the input and output patterns.
                # We have to do this only for the first time a pattern is seen,
                # for instance because of how the names are processed when there's one name.
                if (not alreadySeen) and (pat.__ctype__ in ("DATE", "LOCATION", "PERSON")):
                    if pat.__ctype__ == "DATE":
                        # Actually, I have to postprocess the tok_seqs, because
                        # the literal components may differ (e.g., th vs. nd for
                        # ordinal, if I convert from November 15th to November 22).
                        # Actually, all the features are a potential problem: e.g.,
                        # 2digit is only specified if there's a leading 0, and
                        # longname and shortname for the month is ambiguous if the
                        # month is May. 
                        patDict = {'tok_seq': [p[0] for p in pat.tok_seq]}
                        otherPatDict = {'tok_seq': [p[0] for p in otherPat.tok_seq]}
                    else:
                        if pat.__ctype__ == "LOCATION":
                            continue
                            attrs = ["street_num", "street",
                                     "street_postfix", "street_comma",
                                     "street_postfix_abbr", "abbr_has_period",
                                     "city", "city_comma",
                                     "state", "state_comma",
                                     "zip", "state_type"]
                        else:
                            # Digesting a PERSON filler will choose the
                            # gender based on the first name, no matter whether
                            # one_name is true or not. If one_name is true,
                            # it's the LAST name that's used from the seed, which
                            # may end up having a different gender when it's
                            # later interpreted as a first name. So what's the right
                            # thing to do? We should probably try to figure out
                            # if the seed name is a known first name or not. If it
                            # is, generate another first name; otherwise, generate
                            # a last name. Actually, that doesn't solve the problem;
                            # if the last name that's generated can also be a first
                            # name, then we can create an unintentional confusion.
                            # Ugh.
                            attrs = ["one_name", "last_is_first", "cap_status", "one_name_is_known_first_name",
                                     "mid_initials", "name_ext", "gender"]
                        patDict = dict([(attr, getattr(pat, attr, "**ERROR**")) for attr in attrs])
                        otherPatDict = dict([(attr, getattr(otherPat, attr, "**ERROR**")) for attr in attrs])
                    self.assertEqual(patDict, otherPatDict,
                                     "attribute dictionaries don't match: %s '%s' '%s' %s %s" % \
                                     (pat.__ctype__, s, repl, patDict, otherPatDict))
            r.EndDocumentForReplacement()

class SuppressionTest(MAT.UnitTest.MATTestCase):
    def testSuppressedLabels(self):

        # Here, we test to see what happens when dont_transform or dont_nominate is specified.
        # In general, you should have the same number of annotations in the output,
        # whether or not they were suppressed or not.

        amiaCorpora = [s.strip() for s in self.testContext["AMIA_JSON_CORPORA"].split(",")]

        # Transform all the files in the corpus.

        _jsonIO = MAT.DocumentIO.getDocumentIO("mat-json")
        task = MAT.PluginMgr.LoadPlugins().getTask("AMIA Deidentification")
        contentLabels = task.getAnnotationTypesByCategory("content")

        dList = []

        i = 0
        for c in amiaCorpora:
            for p in glob.glob(os.path.join(c, "*")):
                if os.path.isfile(p):
                    if i % 100 == 0:
                        print i, "...",
                    i += 1
                    try:
                        d = _jsonIO.readFromSource(p)        
                    except:
                        continue
                    dList.append((p, d))

        import random
        # Make sure there's at least one of each.
        labels = set(contentLabels)
        labelsToKeep = set([random.choice(list(labels))])
        labels -= labelsToKeep
        labelsNotToNominate = set([random.choice(list(labels))])
        labels -= labelsNotToNominate
        labelsNotToTransform = set([random.choice(list(labels))])
        labels -= labelsNotToTransform
        for label in labels:
            whatToDo = random.choice([0, 1, 2])
            if whatToDo == 0:
                labelsToKeep.add(label)
            elif whatToDo == 1:
                labelsNotToNominate.add(label)
            else:
                labelsNotToTransform.add(label)

        # Now, nominate and transform.

        outputDList = MAT.ToolChain.MATEngine(taskObj = task, workflow = "Demo").RunDataPairs(dList, ["nominate", "transform"], replacer = "clear -> clear", dont_nominate = ",".join(labelsNotToNominate), dont_transform = ",".join(labelsNotToTransform))

        # Now, let's test it to see if there are the same number of
        # annotations in each document.

        print labelsToKeep, labelsNotToNominate, labelsNotToTransform
        for (inF, inD), (outF, outD) in zip(dList, outputDList):
            # Get the content annotations, and make sure that there are
            # the same counts of each.
            for c in contentLabels:
                self.assertEqual(len(inD.getAnnotations([c])), len(outD.getAnnotations([c])))

class CoreferenceTest(MAT.UnitTest.MATTestCase):

    # We have to ensure that various patterns do and don't corefer.
    # The other problem is that we really don't have any idea how to
    # deal with name alternatives. So I can't actually feed these to
    # MATEngine - I should invoke the replacement engine directly.
    
    def testCoreference(self):
        task = MAT.PluginMgr.LoadPlugins().getTask("AMIA Deidentification")
        r = task.instantiateReplacer("clear -> clear")
        self._checkCoreference(r, "Sidney Pye", "Pye", True)
        self._checkCoreference(r, "Pye", "Sidney Pye", False)
        self._checkCoreference(r, "John A. Morero", "John Morero", True)
        self._checkCoreference(r, "Mary Burton", "Mary Phillips", False)
        self._checkCoreference(r, "John Burton", "Mary Burton", False)
        # It doesn't know John uniquely as a first name.
        self._checkCoreference(r, "John Burton", "John", True)
        # Cynthia, on the other hand...
        self._checkCoreference(r, "Cynthia Burton", "Cynthia", True)
        self._checkCoreference(r, "Burton", "Cynthia Burton", False)
        self._checkCoreference(r, "Cynthia Burton", "Cindy", True)
        self._checkCoreference(r, "Cindy", "Cynthia Burton", False)

    def _checkCoreference(self, rEngine, ann1, ann2, corefCheck):
        p1 = rEngine.Digest("PATIENT", ann1)
        p2 = rEngine.Digest("PATIENT", ann2)
        rEngine.EndDocumentForDigestion()
        # Ignore the replacements. The issue is how many seed cache
        # elements are CREATED. It's possible that the first will be
        # overwritten with the second, so I need to check at each point.
        seen = []
        rEngine.Replace("PATIENT", p1)
        for v in p1.replacer.seedCache.values():
            if v not in seen:
                seen.append(v)
        rEngine.Replace("PATIENT", p2)
        for v in p1.replacer.seedCache.values():
            if v not in seen:
                seen.append(v)
        if corefCheck:
            self.assertEqual(len(seen), 1)
        else:
            self.assertEqual(len(seen), 2)
        rEngine.EndDocumentForReplacement()
