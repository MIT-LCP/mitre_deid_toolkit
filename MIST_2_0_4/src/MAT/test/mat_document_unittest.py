# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# Load a document.

from mat_unittest_resources import PluginContextTestCase, \
     TestDocument, ReconciliationTestDocument, TestError

import MAT.DocumentIO, MAT.ToolChain, MAT.Document, MAT.Annotation
import os

_jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')

class DocumentTestCase(PluginContextTestCase):

    def runTest(self):
        # Load a document.
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")
        doc = _jsonIO.readFromSource(docPath)

# And now, the next thing we try is unwind.

class StepUndoneTestCase(PluginContextTestCase):

    def testUndoTag(self):
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")
        doc = _jsonIO.readFromSource(docPath)

        # OK, let's rewind and then go forward.

        impl = self.task.getTaskImplementation("Demo", [])
        
        e = MAT.ToolChain.MATEngine(impl, "Demo")

        outPairs = e.RunDataPairs([("<doc>", doc)], undoThrough = "tag")

        # There should be no content annotations.

        for tag in self.task.getAnnotationTypesByCategory("content"):
            self.failIf(doc.anameDict.has_key(tag) and \
                        doc.atypeDict.has_key(doc.anameDict[tag]))

    def testUndoBoth(self):
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")
        doc = _jsonIO.readFromSource(docPath)

        # OK, let's rewind and then go forward.

        impl = self.task.getTaskImplementation("Demo", [])
        
        e = MAT.ToolChain.MATEngine(impl, "Demo")

        outPairs = e.RunDataPairs([("<doc>", doc)], undoThrough = "zone")

        # Unwinding should eliminate all the categories.

        self.failUnless(doc.getAnnotations(atypes = ["zone", "token", "content"]) == [])

    def testRedoZone(self):
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")
        doc = _jsonIO.readFromSource(docPath)

        # OK, let's rewind and then go forward.

        impl = self.task.getTaskImplementation("Demo", [])
        
        e = MAT.ToolChain.MATEngine(impl, "Demo")

        outPairs = e.RunDataPairs([("<doc>", doc)], undoThrough = "zone", steps = ["zone"])
        
        # There should be no content annotations or token annotations.

        for tag in self.task.getAnnotationTypesByCategory("content") + self.task.getAnnotationTypesByCategory("token"):
            self.failIf(doc.anameDict.has_key(tag) and \
                        doc.atypeDict.has_key(doc.anameDict[tag]))

        # But there should be other annotations. But only zone.
        
        for tag in self.task.getAnnotationTypesByCategory("zone"):
            self.failUnless(doc.anameDict.has_key(tag) and \
                            doc.atypeDict.has_key(doc.anameDict[tag]) and \
                            len(doc.atypeDict[doc.anameDict[tag]]) > 0)

# And now, the single task default. This only works on the command line,
# not in the engine call itself, which is a problem.

# The PluginContextTestCase has only one task associated with it. So
# we should try creating the engine without a task.

class EngineDefaultTestCase(PluginContextTestCase):

    def testTaskDefault(self):
        MAT.ToolChain.MATEngine(workflow = "Demo", pluginDir = self.pDict)
        self.pDict["Duplicate"] = self.task
        try:
            MAT.ToolChain.MATEngine(workflow = "Demo", pluginDir = self.pDict)
            self.fail("multiple tasks should have caused failure")
        except MAT.ToolChain.ShortUsageConfigurationError, (e, msg):
            self.failUnless(msg == "task not specified")
        del self.pDict["Duplicate"]

    def testWorkflowDefault(self):
        try:
            MAT.ToolChain.MATEngine(pluginDir = self.pDict)
            self.fail("multiple workflows should have caused failure")
        except MAT.ToolChain.ConfigurationError, (e, msg):
            self.failUnless(msg == "workflow must be specified")
        # Remove all the workflows but one.
        wDict = self.task.getWorkflows()
        for key in wDict.keys():
            if key != "Demo":
                del wDict[key]
        MAT.ToolChain.MATEngine(pluginDir = self.pDict)
        # Remove the last one.
        del wDict["Demo"]
        try:
            MAT.ToolChain.MATEngine(pluginDir = self.pDict)
            self.fail("missing workflows should have caused failure")
        except MAT.ToolChain.ConfigurationError, (e, msg):
            self.failUnless(msg == "workflow must be specified")
        
# What about situations where the annotations have attributes in
# different orders? Note that we also want to test to make sure
# the right thing happens when we add an attribute where the
# list is shorter than the attrs, which is legal.

# This test is a little different now, because we no longer
# have global annotation types, for threading reasons. 

DOC_SAMPLE_1 = u'{"signal": "I like France.", "metadata": {}, "asets": [{"type": "ENAMEX", "attrs": ["TYPE_conf", "ENAMEX_conf", "TYPE"], "annots": [[7, 13, "1.00", "11.79", "LOCATION"]]}]}'
DOC_SAMPLE_2 = u'{"signal": "I like France.", "metadata": {}, "asets": [{"type": "ENAMEX", "attrs": ["TYPE", "FRAZZ", "BZZT"], "annots": [[7, 13, "ORGANIZATION", "BOOF"]]}]}'

class AttributeOrderTestCase(MAT.UnitTest.MATTestCase):

    def runTest(self):
        # Read the first document first. That establishes TYPE
        # at index 2. Then read the second document, and
        # try to get the type.
        d1 = _jsonIO.readFromUnicodeString(DOC_SAMPLE_1)
        d2 = _jsonIO.readFromUnicodeString(DOC_SAMPLE_2)
        annots = d2.getAnnotations()
        self.assertEqual(len(annots), 1)
        self.assertEqual(annots[0]["TYPE"], "ORGANIZATION")
        try:
            self.assertTrue(annots[0]["TYPE_conf"] is None)
            self.fail("should have been an error")
        except KeyError:
            pass
        self.assertEqual(annots[0]["FRAZZ"], "BOOF")
        d1Annots = d1.getAnnotations()
        self.assertEqual(len(d1Annots), 1)
        self.assertEqual(d1Annots[0]["TYPE"], "LOCATION")
        # This will yield a key error, which may be the wrong thing.
        try:
            self.assertEqual(d1Annots[0]["FRAZZ"], None)
            self.fail("should have been an error")
        except KeyError:
            pass
        try:
            self.assertEqual(annots[0]["BZZT"], None)
            self.fail("should have been an error")
        except KeyError:
            pass

# Next, let's see if we can import a document and infer its steps done.

class StepsDoneInferenceTest(PluginContextTestCase):

    def testJSON(self):

        import codecs
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")
        doc = _jsonIO.readFromSource(docPath)

        # These documents have already been processed.

        curPhasesDone = set(doc.metadata["phasesDone"])
        self.assertTrue(len(curPhasesDone) > 0)
        del doc.metadata["phasesDone"]

        newDoc = _jsonIO.readFromUnicodeString(_jsonIO.writeToUnicodeString(doc), taskSeed = self.task)

        self.assertEqual(set(newDoc.metadata["phasesDone"]), curPhasesDone)

    def testJSONWithWorkflow(self):

        import codecs
        docPath = os.path.join(self.sampleDir, "resources", "data", "json", "voa1.txt.json")
        doc = _jsonIO.readFromSource(docPath)

        # These documents have already been processed.

        curPhasesDone = set(doc.metadata["phasesDone"])
        self.assertTrue(len(curPhasesDone) > 0)
        del doc.metadata["phasesDone"]

        newDoc = _jsonIO.readFromUnicodeString(_jsonIO.writeToUnicodeString(doc), taskSeed = self.task)

        self.assertEqual(set(newDoc.metadata["phasesDone"]), curPhasesDone)

# Now, it's time to worry about IDs and spanless annotations.

class AnnotationIDTest(PluginContextTestCase):

    def testID(self):

        doc = MAT.Document.AnnotatedDoc(signal = u"This is a test document.")
        newAnnot = doc.createAnnotation(0, 4, "NOUN")
        id = newAnnot.getID()
        self.assertEqual(newAnnot, doc.getAnnotationByID(id))
        # Remove it.
        doc.removeAnnotation(newAnnot)
        self.assertEqual(None, doc.getAnnotationByID(id))

    def testManyIDs(self):
        doc = MAT.Document.AnnotatedDoc(signal = u"This is a test document.")
        a1 = doc.createAnnotation(0, 4, "NOUN")        
        a2 = doc.createAnnotation(5, 7, "VERB")
        id1 = a1.getID()
        id2 = a2.getID()
        # Remove it.
        doc.removeAnnotations(["NOUN"])
        self.assertEqual(None, doc.getAnnotationByID(id1))
        self.assertEqual(a2, doc.getAnnotationByID(id2))
        # No reusing IDs.
        a3 = doc.createAnnotation(0, 4, "NOUN")        
        id3 = a3.getID()
        self.assertTrue(id1 != id3)
        doc.removeAnnotations(["VERB"])
        self.assertEqual(None, doc.getAnnotationByID(id2))
        # Now, remove them all.
        doc.removeAnnotations()
        # NOW there's reuse.
        a4 = doc.createAnnotation(0, 4, "NOUN")        
        id4 = a4.getID()
        self.assertEqual(id1, id4)

    def testIDSerialization(self):
        doc = MAT.Document.AnnotatedDoc(signal = u"This is a test document.")
        a1 = doc.createAnnotation(0, 4, "NOUN")
        a1["number"] = "plural"
        id1 = a1.getID()
        a2 = doc.createAnnotation(5, 7, "VERB")
        a2["number"] = "singular"

        # Now, check the dictionary.
        d = _jsonIO.renderJSONObj(doc)
        self.assertEqual([t for t in d["asets"] if t["type"] == "NOUN"][0]["hasID"], True)
        self.assertEqual([t for t in d["asets"] if t["type"] == "VERB"][0]["hasID"], False)
        # The noun should have annots of length 4, the verbs of length 3.
        self.assertEqual(len([t for t in d["asets"] if t["type"] == "NOUN"][0]["annots"][0]), 4)
        self.assertEqual(len([t for t in d["asets"] if t["type"] == "VERB"][0]["annots"][0]), 3)

        # Now, check the actual serialization.

        newDoc = _jsonIO.readFromUnicodeString(_jsonIO.writeToUnicodeString(doc))
        # Make sure the ID is preserved.
        self.assertEqual(newDoc.getAnnotations(["NOUN"])[0].id, id1)
        self.assertEqual(newDoc.getAnnotations(["VERB"])[0].id, None)
        self.assertEqual(newDoc.getAnnotationByID(id1), newDoc.getAnnotations(["NOUN"])[0])
        # Make sure the features are decoded correctly.
        self.assertEqual(newDoc.getAnnotations(["NOUN"])[0].get("number"), "plural")
        self.assertEqual(newDoc.getAnnotations(["VERB"])[0].get("number"), "singular")

    def testVersion1SerializationDefaults(self):
        # Let's create a document, render the dictionary, surgically
        # alter it, and then dump it and read it back.
        doc = MAT.Document.AnnotatedDoc(signal = u"This is a test document.")
        a1 = doc.createAnnotation(0, 4, "NOUN")
        a1["number"] = "plural"
        a2 = doc.createAnnotation(5, 7, "VERB")
        a2["number"] = "singular"
        
        d = _jsonIO.renderJSONObj(doc)
        d["version"] = 1
        for aset in d["asets"]:
            if aset.has_key("hasSpan"):
                del aset["hasSpan"]
            if aset.has_key("hasID"):
                del aset["hasID"]
            aset["attrs"] = [adict["name"] for adict in aset["attrs"]]
        from MAT import json
        doc2 = _jsonIO.readFromUnicodeString(json.dumps(d, ensure_ascii = False))
        for atype in doc2.atypeDict.keys():
            self.assertTrue(atype.hasSpan)
            self.assertFalse("annotation" in [a._typename_ for a in atype.attr_list])
            self.assertFalse(atype.hasAnnotationValuedAttributes)

    def testBadAnnotationValuedIDs(self):
        doc = MAT.Document.AnnotatedDoc(signal = u"This is a test document.")
        a1 = doc.createAnnotation(0, 4, "NOUN")
        a2 = doc.createAnnotation(5, 7, "VERB")
        a2["number"] = "singular"
        # We didn't declare this attribute as annotation-valued, but
        # it will be automatically declared.
        a2["subject"] = a1
        # Now, if we try to reset it, it won't work.
        try:
            a2["subject"] = "mysubj"
            self.fail("attribute setting should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("of attribute 'subject' must be a annotation") > -1)
        a2.atype.ensureAttribute("subj", aType = "annotation")
        try:
            a2["subj"] = "noun"
            self.fail("attribute setting should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("of attribute 'subj' must be a annotation") > -1)
        try:
            a2["number"] = a1
            self.fail("attribute setting should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("of attribute 'number' must be a string") > -1)        

    def testAnnotationValuedIDs(self):
        doc = MAT.Document.AnnotatedDoc(signal = u"This is a test document.")
        a1 = doc.createAnnotation(0, 4, "NOUN")
        a2 = doc.createAnnotation(5, 7, "VERB")
        a2["number"] = "singular"
        a2.atype.ensureAttribute("subj", aType = "annotation")
        a2["subj"] = a1
        self.assertTrue(a1.id is not None)
        id = a1.id

        # Serialize, deserialize.
        newDoc = _jsonIO.readFromUnicodeString(_jsonIO.writeToUnicodeString(doc))
        # Make sure the ID is preserved.
        self.assertEqual(newDoc.getAnnotations(["NOUN"])[0].id, id)
        self.assertEqual(newDoc.getAnnotations(["VERB"])[0].id, None)
        self.assertEqual(newDoc.getAnnotations(["VERB"])[0].attrs, ["singular", newDoc.getAnnotations(["NOUN"])[0]])

    def testXMLSerialization(self):
        doc = MAT.Document.AnnotatedDoc(signal = u"This is a test document.")
        a1 = doc.createAnnotation(0, 4, "PERSON")
        a2 = doc.createAnnotation(5, 7, "ORGANIZATION")
        a2["number"] = "singular"
        a2.atype.ensureAttribute("subj", aType = "annotation")
        a2["subj"] = a1
        id = a1.id
        self.assertTrue(id is not None)
        
        _xmlIO = MAT.DocumentIO.getDocumentIO('xml-inline', task = self.task)
        # Serialize, deserialize.
        s = _xmlIO.writeToUnicodeString(doc)
        # print s
        newDoc = _xmlIO.readFromUnicodeString(s)
        # Make sure the ID is preserved.
        self.assertEqual(newDoc.getAnnotations(["PERSON"])[0].id, id)
        self.assertEqual(newDoc.getAnnotations(["ORGANIZATION"])[0].id, None)
        self.assertEqual(newDoc.getAnnotations(["ORGANIZATION"])[0].attrs, ["singular", newDoc.getAnnotations(["PERSON"])[0]])

    def testAnnotationDeletion(self):
        doc = MAT.Document.AnnotatedDoc(signal = u"This is a test document.")
        a1 = doc.createAnnotation(0, 4, "NOUN")
        a2 = doc.createAnnotation(5, 7, "VERB")
        a2["number"] = "singular"
        a2.atype.ensureAttribute("subj", aType = "annotation")
        a2["subj"] = a1
        # You shouldn't be able to delete an annotation that someone
        # points to.
        try:
            doc.removeAnnotationGroup([a1])
            self.fail("annotation removal should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("can't be pointed at by annotations outside the group") > -1)
        # But you SHOULD be able to delete an annotation that points
        # to it.
        doc.removeAnnotationGroup([a2])
        # And there should be no trace of a2 pointing to anything.
        doc.removeAnnotationGroup([a1])
        # Ugh. Overwriting also has to work. But what if you have two references
        # to the same annot, but you only overwrite one? AAAARGH. Fixed that.

        # Rebuild it.
        a1 = doc.createAnnotation(0, 4, "NOUN")
        a2 = doc.createAnnotation(5, 7, "VERB")
        a2["number"] = "singular"
        a2["subj"] = a1
        a3 = doc.createAnnotation(15, 23, "NOUN")
        a2.atype.ensureAttribute("obj", aType = "annotation")
        a2["obj"] = a3
        a2.atype.ensureAttribute("dobj", aType = "annotation")
        a2["dobj"] = a1
        
        # Now, if I overwrite the subject, I should fail to be
        # able to remove a1, because it's pointing to multiple
        # things.
        a2["subj"] = a3
        try:
            doc.removeAnnotation(a1)
            self.fail("annotation removal should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("can't be pointed at by annotations outside the group") > -1)
        # Now, I set dobj to None. If I've done the bookkeeping
        # correctly, this should now allow me to delete a1, but I think
        # there's a bug I need to fix which will cause this to fail.
        a2["dobj"] = None
        doc.removeAnnotation(a1)

        # But not a3.
        
        try:
            doc.removeAnnotation(a3)
            self.fail("annotation removal should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("can't be pointed at by annotations outside the group") > -1)

        # Now, let's make them point to each other.
        a3.atype.ensureAttribute("subj_of", aType = "annotation")
        a3["subj_of"] = a2

        # So now, we can't remove a2 either.
        try:
            doc.removeAnnotation(a2)
            self.fail("annotation removal should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("can't be pointed at by annotations outside the group") > -1)

        # But you should be able to remove the two of them together.
        doc.removeAnnotationGroup([a2, a3])

    def testAnnotationAttributeSetDelete(self):
        # Now the rubber meets the road. This is the case I'm worried about.
        doc = MAT.Document.AnnotatedDoc(signal = u"This is a test document.")
        a1 = doc.createAnnotation(0, 4, "NOUN")
        a2 = doc.createAnnotation(5, 7, "VERB")
        a2["number"] = "singular"
        a2.atype.ensureAttribute("subj", aType = "annotation", aggregation = "set")
        a2["subj"] = MAT.Annotation.AttributeValueSet([a1])
        # You shouldn't be able to delete an annotation that someone
        # points to.
        try:
            doc.removeAnnotationGroup([a1])
            self.fail("annotation removal should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("can't be pointed at by annotations outside the group") > -1)
        # But you SHOULD be able to delete an annotation that points
        # to it.
        doc.removeAnnotationGroup([a2])
        # And there should be no trace of a2 pointing to anything.
        doc.removeAnnotationGroup([a1])
        # Ugh. Overwriting also has to work. But what if you have two references
        # to the same annot, but you only overwrite one? AAAARGH. Fixed that.

        # Rebuild it.
        a1 = doc.createAnnotation(0, 4, "NOUN")
        a2 = doc.createAnnotation(5, 7, "VERB")
        a2["number"] = "singular"
        a2["subj"] = MAT.Annotation.AttributeValueSet([a1])

        a3 = doc.createAnnotation(15, 23, "NOUN")

        a2.atype.ensureAttribute("obj", aType = "annotation")
        a2["obj"] = a3

        a2.atype.ensureAttribute("dobj", aType = "annotation")
        a2["dobj"] = a1
        
        # Now, if I remove the subject, I should fail to be
        # able to remove a1, because it's pointing to multiple
        # things.
        a2["subj"].remove(a1)
        try:
            doc.removeAnnotation(a1)
            self.fail("annotation removal should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("can't be pointed at by annotations outside the group") > -1)
        # Now, I set dobj to None. If I've done the bookkeeping
        # correctly, this should now allow me to delete a1, but I think
        # there's a bug I need to fix which will cause this to fail.
        a2["dobj"] = None

        doc.removeAnnotation(a1)

        # Add it back. This is a sort of possible error. Let's raise an error if
        # an annotation value isn't in the document. Or maybe I need to rethink this
        # whole thing of needing to add the annotation.
        
        doc._addAnnotation(a1)

        a2["subj"].add(a1)
        
        # Now, let's make them point to each other.
        a1.atype.ensureAttribute("subj_of", aType = "annotation")
        a1["subj_of"] = a2

        # So now, we can't remove a2 either.
        try:
            doc.removeAnnotation(a2)
            self.fail("annotation removal should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("can't be pointed at by annotations outside the group") > -1)

        # But you should be able to remove the two of them together.
        doc.removeAnnotationGroup([a2, a1])

class AttributeTypeTest(PluginContextTestCase):

    def setUp(self):
        doc = self.doc = MAT.Document.AnnotatedDoc(signal = u"This is a test document")
        self.fType = doc.findAnnotationType("AttrTest")
        a1 = doc.createAnnotation(0, 4, "AttrTest")
        
        self.POSSIBLE_TEST_VALUES = {
            "string": ["abc", u"def"],
            "int": [5, 5L],
            "float": [6.7],
            "annotation": [a1],
            "boolean": [True]
            }

    # Boy, this is going to be tedious. I need to test each and
    # every one of the types.

    def _testExtendedAttributeType(self, t, badEnsures, setTriples):
        doc = self.doc
        fType = self.fType
        a1 = doc.createAnnotation(0, 4, fType)        
        for kv in badEnsures:
            attrName = t + "_" + "_".join(kv.keys())
            try:
                fType.ensureAttribute(attrName, aType = t, aggregation = None, **kv)
                self.fail("attr ensure should have failed")
            except MAT.Annotation.AnnotationError, e:
                pass
        goodValHash = {}
        for setTriple in setTriples:
            if len(setTriple) == 4:
                goodKv, goodVals, badVals, attrName = setTriple
            else:
                goodKv, goodVals, badVals = setTriple
                attrName = t + "_" + "_".join(goodKv.keys())
            fType.ensureAttribute(attrName, aType = t, aggregation = None, **goodKv)
            for v in goodVals:
                a1[attrName] = v
                goodValHash[attrName] = v
            for v in badVals:
                try:
                    a1[attrName] = v
                    self.fail("attr set should have failed")
                except MAT.Annotation.AnnotationError, e:
                    self.assertTrue(str(e).find("must be a") > -1)
        # Now, make sure that you can render it to JSON, and back, and that
        # the resulting values are what they should be. (Well, if the type is
        # annotation, don't do it).
        id = a1.getID()
        jsonIO =  MAT.DocumentIO.getDocumentIO('mat-json')
        s = jsonIO.writeToUnicodeString(doc)
        d2 = jsonIO.readFromUnicodeString(s)
        if t != "annotation":
            a2 = d2.getAnnotationByID(id)
            for k, v in goodValHash.items():
                self.assertEqual(v, a2[k])            

    def testStringAttribute(self):
        self._testAttributeType("string")
        self._testExtendedAttributeType(
            "string", [{"choices": ["a", 5]}],
            [({"choices": ["a", "bcd", "e"]}, ["a"], ["b"])
             # , ({"regexes":  ["^a.*a$", "b"]}, ["acbf"], ["acf"]),
             # ({"regexes": ["^a.*a$", "b"], "choices": ["d", "efq"]}, ["efq", "qbq"], ["acf"])
             ])

    def testIntAttribute(self):
        self._testAttributeType("int")
        self._testExtendedAttributeType(
            "int", [{"choices": [5, 6, "b"]}, {"minval": True}, {"maxval": u"7"},
                    {"choices": [5, 6], "minval": 5}],
            [({"choices": [5, 6, 7L]}, [5, 7], [8], "choices1"),
             ({"minval": 10.5}, [11], [9.5]),
             ({"maxval": 20}, [15], [22]),
             ({"choices": [2, 6]}, [6], [4, 7], "choices2"),
             ({"minval": 5, "maxval": 10}, [5, 8, 6], [17, 4])])

    def testFloatAttribute(self):
        self._testAttributeType("float")
        self._testExtendedAttributeType(
            "float", [{"minval": True}, {"maxval": u"7"}],
            [({"minval": 10.5}, [11.1], [9.5, 11]),
             ({"maxval": 20}, [15.6], [22, 15]),
             ({"minval": 5, "maxval": 10}, [6.3], [17, 4, 10.01])])
        # There's one oddity about a float attribute - you need to
        # make sure that ints in a float attribute are decoded properly
        # from JSON.
        a = self.doc.createAnnotation(5, 10, "floatIntTest")
        a.atype.ensureAttribute("floatAttr", "float")
        a.atype.ensureAttribute("floatSetAttr", "float", aggregation = "set")
        a["floatAttr"] = 6.0
        a["floatSetAttr"] = MAT.Annotation.AttributeValueSet([7.0])
        jsonIO = MAT.DocumentIO.getDocumentIO('mat-json')
        d = jsonIO.renderJSONObj(self.doc)
        for aEntry in d["asets"]:
            if aEntry["type"] == "floatIntTest":
                annot = aEntry["annots"][0]
                # First attr is a float, second is a list of a float.
                annot[2] = 6
                annot[3] = [7]
                break
        d2 = MAT.Document.AnnotatedDoc()
        jsonIO._deserializeFromJSON(d, d2)
        a2 = d2.getAnnotations(["floatIntTest"])[0]
        self.assertEqual(type(a2["floatAttr"]), float)
        self.assertEqual(a2["floatAttr"], a["floatAttr"])
        self.assertEqual(a2["floatSetAttr"], a["floatSetAttr"])        

    def testBooleanAttribute(self):
        self._testAttributeType("boolean")

    def testAnnotationAttribute(self):
        self._testAttributeType("annotation")
        # Ugh.
        doc = self.doc
        fType = doc.findAnnotationType("Lab1")
        fType.ensureAttribute("a1")
        fType.ensureAttribute("a2")
        fType = doc.findAnnotationType("Lab2")
        fType.ensureAttribute("a1")
        fType.ensureAttribute("a2")
        a1 = doc.createAnnotation(0, 4, "Lab1", {"a1": "a", "a2": "a"})
        a2 = doc.createAnnotation(0, 4, "Lab2", {"a1": "b", "a2": "b"})
        a3 = doc.createAnnotation(0, 4, "Lab3")
        a4 = doc.createAnnotation(0, 4, "Lab1", {"a1": "b", "a2": "b"})
        a5 = doc.createAnnotation(0, 4, "Lab2", {"a1": "a", "a2": "a"})
        self._testExtendedAttributeType(
            "annotation", [{"label_restrictions": "Lab1"}],
            [({"label_restrictions": ["Lab1"]}, [a1], [a2, a3], "labr1"),
             ({"label_restrictions": set(["Lab1", "Lab2"])}, [a1, a2], [a3], "labr2"),
             ({"label_restrictions": [("Lab1", {"a1": "a"}), ("Lab2", {"a2": "b"})]}, [a1, a2], [a4, a5], "labr3"),
             ({"label_restrictions": ["Lab1", ("Lab2", {"a2": "b"})]}, [a1, a2, a4], [a5], "labr4")])
        
    def _testAttributeType(self, k):
        doc = self.doc
        fType = self.fType
        
        kAttr = k+"Attr"
        kVals = self.POSSIBLE_TEST_VALUES[k]
        fType.ensureAttribute(kAttr, aType = k)
        doc.createAnnotation(0, 4, "AttrTest", {kAttr: None})
        for kv in kVals:
            doc.createAnnotation(0, 4, "AttrTest", {kAttr: kv})
        allVals = [list(), set()]
        for otherk, othervals in self.POSSIBLE_TEST_VALUES.items():
            if otherk != k:
                allVals += othervals
        for x in allVals:
            try:
                doc.createAnnotation(0, 4, "AttrTest", {kAttr: x})
                self.fail("annotation creation should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("must be a") > -1)
            a2 = doc.createAnnotation(0, 4, "AttrTest")
            try:
                a2[kAttr] = x
                self.fail("attribute set should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("must be a") > -1)
        self._testListAttribute(k, allVals)
        self._testSetAttribute(k, allVals)        

    def _testListAttribute(self, k, allVals):
        doc = self.doc
        fType = self.fType
        
        kAttr = k+"ListAttr"
        kVals = self.POSSIBLE_TEST_VALUES[k]
        fType.ensureAttribute(kAttr, aType = k, aggregation = "list")
        doc.createAnnotation(0, 4, "AttrTest", {kAttr: None})
        doc.createAnnotation(0, 4, "AttrTest", {kAttr: MAT.Annotation.AttributeValueList(kVals)})
        allVals = [list(), set()]
        for otherk, othervals in self.POSSIBLE_TEST_VALUES.items():
            if otherk != k:
                allVals += othervals
        for x in allVals:
            try:
                doc.createAnnotation(0, 4, "AttrTest", {kAttr: MAT.Annotation.AttributeValueList([x])})
                self.fail("annotation creation should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("must be a") > -1)
            a2 = doc.createAnnotation(0, 4, "AttrTest")
            try:
                a2[kAttr] = MAT.Annotation.AttributeValueList([x])
                self.fail("attribute set should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("must be a") > -1)
            a2[kAttr] = MAT.Annotation.AttributeValueList()
            try:
                a2[kAttr].append(x)
                self.fail("attribute add should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("must be a") > -1)
            try:
                a2[kAttr] += [x]
                self.fail("attribute add should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("must be a") > -1)
            # This should be OK until we try to set it.
            b = MAT.Annotation.AttributeValueList(kVals + [x])
            try:
                a2[kAttr] = b
                self.fail("attribute add should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("must be a") > -1)
        try:
            doc.createAnnotation(0, 4, "AttrTest", {kAttr: MAT.Annotation.AttributeValueSet()})
            self.fail("annotation creation should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("must be a") > -1)
        

    def _testSetAttribute(self, k, allVals):
        doc = self.doc
        fType = self.fType
        
        kAttr = k+"SetAttr"
        kVals = self.POSSIBLE_TEST_VALUES[k]
        fType.ensureAttribute(kAttr, aType = k, aggregation = "set")
        doc.createAnnotation(0, 4, "AttrTest", {kAttr: None})
        a1avset = MAT.Annotation.AttributeValueSet(kVals)
        a1 = doc.createAnnotation(0, 4, "AttrTest", {kAttr: a1avset})
        # Ensure there's an ID.
        a1.getID()
        
        # Java tests serialization/deserialization of set values, so I'll
        # test it too.
        u = _jsonIO.writeToUnicodeString(doc)
        newDoc = _jsonIO.readFromUnicodeString(u)
        avset = newDoc.getAnnotationByID(a1.getID()).get(kAttr)
        if k != "annotation":
            # Don't check this when it's annotation.
            self.assertTrue(avset == a1avset)
        
        # If I try to put a list or a set in the AttributeValueSet, it tells
        # me that it's an unhashable value.
        allVals = []
        for otherk, othervals in self.POSSIBLE_TEST_VALUES.items():
            if otherk != k:
                allVals += othervals
        for x in allVals:
            try:
                doc.createAnnotation(0, 4, "AttrTest", {kAttr: MAT.Annotation.AttributeValueSet([x])})
                self.fail("annotation creation should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("must be a") > -1)
            a2 = doc.createAnnotation(0, 4, "AttrTest")
            try:
                a2[kAttr] = MAT.Annotation.AttributeValueSet([x])
                self.fail("attribute set should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("must be a") > -1)
            a2[kAttr] = MAT.Annotation.AttributeValueSet()
            try:
                a2[kAttr].add(x)
                self.fail("attribute add should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("must be a") > -1)
            try:
                a2[kAttr].update([x])
                self.fail("attribute add should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("must be a") > -1)
            # This should be OK until we try to set it.
            b = MAT.Annotation.AttributeValueSet(kVals + [x])
            try:
                a2[kAttr] = b
                self.fail("attribute add should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("must be a") > -1)
        try:
            doc.createAnnotation(0, 4, "AttrTest", {kAttr: MAT.Annotation.AttributeValueList()})
            self.fail("annotation creation should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("must be a") > -1)

    def _testDefault(self, atype, attrName1, attrName2, attrType, dflt,
                     dfltTxtSpanPermitted, dfltPermitted):
        # Create a attribute whose default is text span
        if dfltTxtSpanPermitted:
            atype.ensureAttribute(attrName1, aType = attrType, aggregation = None, default_is_text_span = True)
        else:
            try:
                atype.ensureAttribute(attrName1, aType = attrType, aggregation = None, default_is_text_span = True)
                self.fail("attr creation with default_is_text_span should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("not permitted") > -1)

        if dfltPermitted:
            # Create an attribute whose default is "attr2-default"
            atype.ensureAttribute(attrName2, aType = attrType, aggregation = None, default = dflt)
        else:
            try:
                atype.ensureAttribute(attrName2, aType = attrType, aggregation = None, default = dflt)
                self.fail("attr creation with default should have failed")
            except MAT.Annotation.AnnotationError, e:
                self.assertTrue(str(e).find("not permitted") > -1)
        
        # Try to create an attribute with both a default and default is text span
        try:
            atype.ensureAttribute(attrName1+"-bad", aType = attrType, aggregation = None,
                                  default = dflt, default_is_text_span = True)
            self.fail("attr creation with both default types should have failed")
        except MAT.Annotation.AnnotationError, e:
            pass

        # Try to create an aggregated attribute with a default 
        try:
            atype.ensureAttribute(attrName1+"-bad", aType = attrType, aggregation = "list",
                                  default = dflt)
            self.fail("attr creation for aggregation with default should have failed")
        except MAT.Annotation.AnnotationError, e:
            pass        
        
    def testDefaults(self):
        # 350 can be a string, int or float
        doc = MAT.Document.AnnotatedDoc(signal = u"350 is a really nice number")
        atype = doc.findAnnotationType("TEST")
        # test STRING attribute defaults
        # Create a STRING attribute whose default is text span
        self._testDefault(atype, "attr1", "attr2", "string", "attr2-default", True, True)
        
        # Create a couple more attributes to create "gaps" between the 
        # default-valued attributes that will need to be filled with nulls when 
        # creating new annotations
        atype.ensureAttribute("attr3")
        atype.ensureAttribute("attr4")
        # ***************** test INT attribute defaults **************************
        self._testDefault(atype, "attr5", "attr6", "int", 3, True, True)
        
        # ****************** test FLOAT attribute defaults ***********************
        self._testDefault(atype, "attr7", "attr8", "float", 3.14, True, True)

        # ****************** test BOOLEAN attribute defaults ***********************
        self._testDefault(atype, "attr9-fail", "attr9", "boolean", True, False, True)

        # ****************** test ANNOTATION attribute defaults ***********************
        a_def = doc.createAnnotation(5, 7, "VERB")

        self._testDefault(atype, "attr-bad10", "attr-bad11", "annotation", a_def, False, False)

        # test in spanless annotation
        atype2 = doc.findAnnotationType("TEST2", hasSpan = False)
        try:
            atype2.ensureAttribute("attr-bad14", default_is_text_span = True)
            self.fail("attr creation for text span default on spanless annotation should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("can't use text span as default") > -1)

        # Create an annotation and check that all the default values are set correctly
        a = doc.createAnnotation(0, 3, atype);
        self.assertTrue(a.get("attr1") == "350")
        self.assertTrue(a.get("attr2") == "attr2-default")
        self.assertTrue(a.get("attr3") == None)
        self.assertTrue(a.get("attr4") == None)
        self.assertTrue(a.get("attr5") == 350)
        self.assertTrue(a.get("attr6") == 3)
        self.assertTrue(a.get("attr7") == 350.0)
        self.assertTrue(a.get("attr8") == 3.14)
        self.assertTrue(a.get("attr9"))

        # Now test validating types when using text span
        doc2 = MAT.Document.AnnotatedDoc(signal = u"Here is an integer: 45 and a float 32.1")
        atypeA = doc2.findAnnotationType("TESTA")
        atypeB = doc2.findAnnotationType("TESTB")
        atypeC = doc2.findAnnotationType("TESTC")
        atypeA.ensureAttribute("string_attr", default_is_text_span = True)
        atypeB.ensureAttribute("int_attr", aType = "int", default_is_text_span = True)
        atypeC.ensureAttribute("float_attr", aType = "float", default_is_text_span = True)

        # good creates
        annotA1 = doc2.createAnnotation(0, 4, atypeA)   # string "Here"
        self.assertEqual(annotA1.get("string_attr"), "Here")
        annotB2 = doc2.createAnnotation(20, 22, atypeB) #  int 45
        self.assertEqual(annotB2.get("int_attr"), 45)
        annotC3 = doc2.createAnnotation(35, 39, atypeC) # float 32.1
        self.assertEqual(annotC3.get("float_attr"), 32.1)

        # other creates (some ok, some not)
        annotB1 = doc2.createAnnotation(0, 4, atypeB) # int "Here" is not ok
        self.assertEqual(annotB1.get("int_attr"), None)

        annotC1 = doc2.createAnnotation(0, 4, atypeC) # float "Here" is not ok
        self.assertEqual(annotC1.get("float_attr"), None)

        annotA2 = doc2.createAnnotation(20, 22, atypeA) # string 45 is ok
        self.assertEqual(annotA2.get("string_attr"), "45")
        annotC2 = doc2.createAnnotation(20, 22, atypeC) # float 45 is ok
        self.assertEqual(annotC2.get("float_attr"), 45.0)
        annotA3 = doc2.createAnnotation(35, 39, atypeA) # String 32.1 is ok
        self.assertEqual(annotA3.get("string_attr"), "32.1")

        annotB3 = doc2.createAnnotation(35, 39, atypeB) # int 32.1 is not ok
        self.assertEqual(annotB3.get("int_attr"), None)

        # check is if it's a valid int or float but may not meet the other requirements
        # non-matching choices
        atypeD = doc2.findAnnotationType("TESTD")
        atypeD.ensureAttribute("fail-choices", aType = "int",
                               default_is_text_span = True,
                               choices = [5, 6, 20])
        annotFC = doc2.createAnnotation(20, 22, atypeD) # int 45 is not among the choices
        self.assertEqual(annotFC.get("fail-choices"), None)

        # minval too large
        atypeE = doc2.findAnnotationType("TESTE");
        atypeE.ensureAttribute("fail-minval", aType = "int", default_is_text_span = True,
                               minval = 66)
        annotFM = doc2.createAnnotation(20, 22, atypeE) # int 45 is not greater than minval (66)
        self.assertEqual(annotFM.get("fail-minval"), None)

        # this time put a minval and maxval that surround the text span value
        atypeF = doc2.findAnnotationType("TESTF");
        atypeF.ensureAttribute("ok-minmax", aType = "int", default_is_text_span = True,
                               minval = 11, maxval = 50)        
        annotOMM = doc2.createAnnotation(20, 22, atypeF) # int 45 is ok here
        self.assertEqual(annotOMM.get("ok-minmax"), 45)
        
        # now try a float attribute with restrictions that permit 32.1 and 45
        atypeG = doc2.findAnnotationType("TESTG");
        atypeG.ensureAttribute("ok-minmax", aType = "float", default_is_text_span = True,
                               minval = 12.5, maxval = 63.3)
        annotOMM1 = doc2.createAnnotation(35, 39, atypeG) # float 32.1 is ok here
        self.assertEqual(annotOMM1.get("ok-minmax"), 32.1)
        annotOMM2 = doc2.createAnnotation(20, 22, atypeG) # float 45 is ok here
        self.assertEqual(annotOMM2.get("ok-minmax"), 45.0)
        
        # finally try a float with restrictions that permit 45 but not 32.1
        atypeH = doc2.findAnnotationType("TESTH")
        atypeH.ensureAttribute("float-minval", aType = "float", default_is_text_span = True,
                               minval = 32.5)

        annotFM1 = doc2.createAnnotation(35, 39, atypeH) # float 32.1 is not ok here
        self.assertEqual(annotFM1.get("float-minval"), None)
        annotFM2 = doc2.createAnnotation(20, 22, atypeH) # float 45 is ok here
        self.assertEqual(annotFM2.get("float-minval"), 45.0)
                
class SpanlessAnnotationTest(PluginContextTestCase):

    def _createSpanlessDoc(self):
        doc = MAT.Document.AnnotatedDoc(signal = u"This is a test document.")
        a1 = doc.createAnnotation(0, 4, "NOUN")
        a2 = doc.createAnnotation(5, 7, "VERB")
        a2["number"] = "singular"
        a3 = doc.createAnnotation(15, 23, "NOUN")
        fType = doc.findAnnotationType("FRAME", hasSpan = False)
        fType.ensureAttribute("subj", aType = "annotation")
        fType.ensureAttribute("verb", aType = "annotation")
        fType.ensureAttribute("obj", aType = "annotation")
        a4 = doc.createSpanlessAnnotation("FRAME")
        a4["subj"] = a1
        a4["verb"] = a2
        a4["obj"] = a3
        a4["telic"] = "no"
        return doc

    def testSpanlessRendering(self):
        d = self._createSpanlessDoc()
        _jsonIO.writeToUnicodeString(d)

    def testBasicSpanless(self):
        d = self._createSpanlessDoc()
        # Shouldn't be able to delete only partial set.
        try:
            d.removeAnnotationGroup(d.getAnnotations(["VERB"]))
            self.fail("annotation removal should have failed")
        except MAT.Annotation.AnnotationError, e:
            self.assertTrue(str(e).find("can't be pointed at by annotations outside the group") > -1)
        # But yes to the frame.
        d.removeAnnotationGroup(d.getAnnotations(["FRAME"]))
        # And then, yes to the verb.
        d.removeAnnotationGroup(d.getAnnotations(["VERB"]))

    def testJSONSerialization(self):
        doc = self._createSpanlessDoc()
        newDoc = _jsonIO.readFromUnicodeString(_jsonIO.writeToUnicodeString(doc))
        self.assertTrue(newDoc.findAnnotationType("FRAME", create = False).hasSpan == False)
        self.assertEqual([a.id for a in newDoc.orderAnnotations(["NOUN", "VERB"])],
                         [a.id for a in doc.orderAnnotations(["NOUN", "VERB"])])
        self.assertTrue(newDoc.findAnnotationType("NOUN").hasSpan)
        self.assertTrue(newDoc.findAnnotationType("VERB").hasSpan)
        self.assertEqual(set(newDoc.getAnnotations(["NOUN", "VERB"])),
                         set(newDoc.getAnnotations(spannedOnly = True)))
        self.assertEqual(set(newDoc.getAnnotations(["FRAME"])),
                         set(newDoc.getAnnotations(spanlessOnly = True)))
        self.assertEqual(doc.getAnnotations(["FRAME"])[0]["subj"].id,
                         newDoc.getAnnotations(["FRAME"])[0]["subj"].id)
        self.assertEqual(doc.getAnnotations(["FRAME"])[0]["obj"].id,
                         newDoc.getAnnotations(["FRAME"])[0]["obj"].id)
        self.assertEqual(doc.getAnnotations(["FRAME"])[0]["verb"].id,
                         newDoc.getAnnotations(["FRAME"])[0]["verb"].id)
        self.assertEqual(newDoc.getAnnotations(["FRAME"])[0]["telic"], "no")                         

    def testXMLSerialization(self):
        # For this, I'm going to have to modify the task's
        # annotation type repository.
        # Get the repository, to ensure that the descriptors are cached.
        self.task.getAnnotationTypeRepository()
        # Remove the repository.
        self.task._annotationTypeRepository = None
        # Augment the cached descriptors.
        self.task._cachedAnnotationSetDescriptors.append({"category": "content",
                                                          "name": "content",
                                                          "annotations":
                                                          [{"label": "FRAME", "span": False},
                                                           {"label": "NOUN"},
                                                           {"label": "VERB"}]})
        doc = self._createSpanlessDoc()
        _xmlIO = MAT.DocumentIO.getDocumentIO('xml-inline', task = self.task)
        s = _xmlIO.writeToUnicodeString(doc)
        # print s
        newDoc = _xmlIO.readFromUnicodeString(s)
        self.assertTrue(newDoc.findAnnotationType("FRAME", create = False).hasSpan == False)
        self.assertEqual([a.id for a in newDoc.orderAnnotations(["NOUN", "VERB"])],
                         [a.id for a in doc.orderAnnotations(["NOUN", "VERB"])])
        self.assertTrue(newDoc.findAnnotationType("NOUN").hasSpan)
        self.assertTrue(newDoc.findAnnotationType("VERB").hasSpan)
        self.assertEqual(set(newDoc.getAnnotations(["NOUN", "VERB"])),
                         set(newDoc.getAnnotations(spannedOnly = True)))
        self.assertEqual(set(newDoc.getAnnotations(["FRAME"])),
                         set(newDoc.getAnnotations(spanlessOnly = True)))
        self.assertEqual(doc.getAnnotations(["FRAME"])[0]["subj"].id,
                         newDoc.getAnnotations(["FRAME"])[0]["subj"].id)
        self.assertEqual(doc.getAnnotations(["FRAME"])[0]["obj"].id,
                         newDoc.getAnnotations(["FRAME"])[0]["obj"].id)
        self.assertEqual(doc.getAnnotations(["FRAME"])[0]["verb"].id,
                         newDoc.getAnnotations(["FRAME"])[0]["verb"].id)
        self.assertEqual(newDoc.getAnnotations(["FRAME"])[0]["telic"], "no")

    def testDocumentCopy(self):
        doc = self._createSpanlessDoc()
        newDoc = doc.copy()
        self.assertTrue(newDoc.findAnnotationType("FRAME", create = False).hasSpan == False)
        self.assertEqual([a.id for a in newDoc.orderAnnotations(["NOUN", "VERB"])],
                         [a.id for a in doc.orderAnnotations(["NOUN", "VERB"])])
        self.assertTrue(newDoc.findAnnotationType("NOUN").hasSpan)
        self.assertTrue(newDoc.findAnnotationType("VERB").hasSpan)
        self.assertEqual(set(newDoc.getAnnotations(["NOUN", "VERB"])),
                         set(newDoc.getAnnotations(spannedOnly = True)))
        self.assertEqual(set(newDoc.getAnnotations(["FRAME"])),
                         set(newDoc.getAnnotations(spanlessOnly = True)))
        self.assertEqual(doc.getAnnotations(["FRAME"])[0]["subj"].id,
                         newDoc.getAnnotations(["FRAME"])[0]["subj"].id)
        self.assertEqual(doc.getAnnotations(["FRAME"])[0]["obj"].id,
                         newDoc.getAnnotations(["FRAME"])[0]["obj"].id)
        self.assertEqual(doc.getAnnotations(["FRAME"])[0]["verb"].id,
                         newDoc.getAnnotations(["FRAME"])[0]["verb"].id)
        self.assertEqual(newDoc.getAnnotations(["FRAME"])[0]["telic"], "no")

#
# Testing the reconciliation documents.
#


# This is a fragment from voa6.txt.

REC_TEXT = u"""The World Health Organization has urged the ministers to enact
legislation to enforce smoke-free environments in indoor public places
including offices, restaurants and bars. 

India will shortly enact such legislation. Indian Health Minister
Anmubani Ramadoss says starting October 2, it will become illegal to
smoke in all public places in the country. 

"Although it is fantastic to be in a youthful country, we need to
protect this very valuable resource from the harmful effects of
tobacco," Ramadoss said.    

But putting laws in place is not enough. The World Health Organization
says strict enforcement is equally important. It also wants countries
to enforce a ban on all forms of tobacco advertising."""

class ReconciliationTestCase(PluginContextTestCase):

    def setUp(self):
        PluginContextTestCase.setUp(self, subdir = "ne_enamex", name = "Named Entity (ENAMEX)")
        
    START = 0
    END = 1

    def _checkSegmentBoundaries(self, recDoc, segBoundaryList):
        curSegStart = 0
        recSegs = recDoc.orderAnnotations(["SEGMENT"])
        print "Check segment boundaries", [(a.start, a.end, a["status"]) for a in recSegs], segBoundaryList
        self.failUnlessEqual(len(recSegs), len(segBoundaryList))
        for seg, (word, nth, whichEnd, status) in zip(recSegs, segBoundaryList):
            self.failUnless(seg.start == curSegStart, "seg start %d != %d" % (seg.start, curSegStart))
            tok = recDoc._getToken(word, nth)
            if whichEnd == self.START:
                segEnd = tok.start
            else:
                segEnd = tok.end
            self.failUnless(seg.end == segEnd, "seg start %d != %d" % (seg.end, segEnd))
            curSegStart = segEnd
            self.failUnless(seg["status"] == status, "seg status %s != %s" % (seg["status"], status))

    def _setUpDocs(self):
        doc1 = TestDocument(signal = REC_TEXT)
        doc2 = TestDocument(signal = REC_TEXT)
        # Zone.
        e = MAT.ToolChain.MATEngine(taskObj = self.task, workflow = "Demo")
        e.RunDataPairs([("<doc1>", doc1), ("<doc2>", doc2)], ["zone"])
        # Now, let's create some overlapping segments.
        doc1.addSegmentBoundaryAfter(self.task, "said.", 0)
        doc2.addSegmentBoundaryAfter(self.task, "bars.", 0)
        # Now, let's "annotate" the overlapping region, and
        # mark the relevant segments gold.
        doc1.addAnnotationAt(self.task, "India", 0, 1, "ENAMEX", {"type": "LOCATION"})
        doc1.addAnnotationAt(self.task, "Minister", 0, 3, "ENAMEX", {"type": "PERSON"})
        doc2.addAnnotationAt(self.task, "Anmubani", 0, 2, "ENAMEX", {"type": "ORGANIZATION"})
        doc2.addAnnotationAt(self.task, "Ramadoss", 1, 1, "ENAMEX", {"type": "PERSON"})        
        doc1.updateSegment(self.task, "Minister", 0, [("status", "human gold"), ("annotator", "person_a")])
        doc2.updateSegment(self.task, "Minister", 0, [("status", "human gold"), ("annotator", "person_b")])
        # OK, here's what I expect.
        # up to "bars.": ignore during reconciliation
        # up to "India": reconciled
        # on "India": human gold
        # up to "Minister": reconciled
        # up to "Ramadoss": human gold
        # up to "Ramadoss" 2: reconciled
        # on "Ramadoss" 2: human gold
        # up to "said.": reconciled
        # to the end: ignore during reconciliation.        
        recDoc = ReconciliationTestDocument.generateReconciliationDocument(self.task, [doc1, doc2])
        self.doc1 = doc1
        self.doc2 = doc2
        self.recDoc = recDoc
        
    def testReconciliationCreate(self):
        # Let's set up 2 docs and a reconciliation doc.
        self._setUpDocs()
        START = self.START
        END = self.END
        self._checkSegmentBoundaries(self.recDoc, 
                                     [("bars.", 0, END, "ignore during reconciliation"),
                                      ("India", 0, START, "reconciled"),
                                      ("India", 0, END, "human gold"),
                                      ("Minister", 0, START, "reconciled"),
                                      ("Ramadoss", 0, END, "human gold"),
                                      ("Ramadoss", 1, START, "reconciled"),
                                      ("Ramadoss", 1, END, "human gold"),
                                      ("said.", 0, END, "reconciled"),
                                      ("advertising.", 0, END, "ignore during reconciliation")])
        # Because they have no annotations in common, there should be
        # exactly the number of annotations in the recdoc as combined in
        # the two input docs.
        self.failUnless(len(self.recDoc.getAnnotations(self.task.getAnnotationTypesByCategory('content'))) ==
                        len(self.doc1.getAnnotations(self.task.getAnnotationTypesByCategory('content'))) +
                        len(self.doc2.getAnnotations(self.task.getAnnotationTypesByCategory('content'))))
        # self._printDoc(self.recDoc)
        

    def _chooseVote(self, recDoc, word, nth, annotator):
        tok, seg = recDoc._findSegmentIncludingEndOf(word, nth, canEqual = True)
        for v in recDoc._votesForSegments().get(seg, []):
            if v["annotator"].find(annotator) > -1:
                v["chosen"] = "yes"
                seg["status"] = "reconciled"
                break

    def _addAndChooseIgnoreVote(self, recDoc, word, nth):
        tok, seg = recDoc._findSegmentIncludingEndOf(word, nth, canEqual = True)
        v = recDoc._addVote(seg, "ignore", None, self.task)
        v["chosen"] = "yes"
        seg["status"] = "reconciled"
        
    def testReconciliationExitChooseVote(self):
        # Let's set up 2 docs and a reconciliation doc.
        self._setUpDocs()
        # Let's have the first human gold be chosen for the doc1 vote, then exit.
        self._chooseVote(self.recDoc, "India", 0, "person_a")
        print "CHOSE VOTE"
        _jsonIO = MAT.DocumentIO.getDocumentIO("mat-json", task = self.task)
        _jsonIO.writeToTarget(self.recDoc, "-")
        self.recDoc.updateSourceDocuments(self.task, [self.doc1, self.doc2])
        # So what we expect is that around "India", there will be
        # reconciled, but otherwise, as before.
        START = self.START
        END = self.END
        self._checkSegmentBoundaries(self.doc1,
                                     [("bars.", 0, END, "human gold"),
                                      ("Minister", 0, START, "reconciled"),
                                      ("Ramadoss", 0, END, "human gold"),
                                      ("Ramadoss", 1, START, "reconciled"),
                                      ("Ramadoss", 1, END, "human gold"),
                                      ("said.", 0, END, "reconciled"),
                                      ("advertising.", 0, END, "non-gold")])
        self._checkSegmentBoundaries(self.doc2,
                                     [("bars.", 0, END, "non-gold"),
                                      ("Minister", 0, START, "reconciled"),
                                      ("Ramadoss", 0, END, "human gold"),
                                      ("Ramadoss", 1, START, "reconciled"),
                                      ("Ramadoss", 1, END, "human gold"),
                                      ("said.", 0, END, "reconciled"),
                                      ("advertising.", 0, END, "human gold")])

    def testReconciliationExitVoteToIgnore(self):
        # Let's set up 2 docs and a reconciliation doc.
        self._setUpDocs()
        self._addAndChooseIgnoreVote(self.recDoc, "India", 0)
        self._printDoc(self.recDoc, self.task)
        self.recDoc.updateSourceDocuments(self.task, [self.doc1, self.doc2])
    
        # So what we expect is that around "India", there will be
        # ignore, but otherwise, as before.
        START = self.START
        END = self.END
        self._checkSegmentBoundaries(self.doc1,
                                     [("bars.", 0, END, "human gold"),
                                      ("India", 0, START, "reconciled"),
                                      ("India", 0, END, "ignore"),
                                      ("Minister", 0, START, "reconciled"),
                                      ("Ramadoss", 0, END, "human gold"),
                                      ("Ramadoss", 1, START, "reconciled"),
                                      ("Ramadoss", 1, END, "human gold"),
                                      ("said.", 0, END, "reconciled"),
                                      ("advertising.", 0, END, "non-gold")])
        self._checkSegmentBoundaries(self.doc2,
                                     [("bars.", 0, END, "non-gold"),
                                      ("India", 0, START, "reconciled"),
                                      ("India", 0, END, "ignore"),
                                      ("Minister", 0, START, "reconciled"),
                                      ("Ramadoss", 0, END, "human gold"),
                                      ("Ramadoss", 1, START, "reconciled"),
                                      ("Ramadoss", 1, END, "human gold"),
                                      ("said.", 0, END, "reconciled"),
                                      ("advertising.", 0, END, "human gold")])

    def testReconciliationAlreadyReconciled(self):
        doc1 = TestDocument(signal = REC_TEXT)
        doc2 = TestDocument(signal = REC_TEXT)
        # Zone.
        e = MAT.ToolChain.MATEngine(taskObj = self.task, workflow = "Demo")
        e.RunDataPairs([("<doc1>", doc1), ("<doc2>", doc2)], ["zone"])
        # Now, let's create some overlapping segments.
        doc1.addSegmentBoundaryAfter(self.task, "said.", 0)
        doc1.addSegmentBoundaryAfter(self.task, "enough.", 0)        
        doc2.addSegmentBoundaryAfter(self.task, "bars.", 0)
        doc2.addSegmentBoundaryAfter(self.task, "enough.", 0)
        # Now, let's "annotate" the overlapping region, and
        # mark the relevant segments gold.
        doc1.addAnnotationAt(self.task, "India", 0, 1, "ENAMEX", {"type": "LOCATION"})
        doc1.addAnnotationAt(self.task, "Minister", 0, 3, "ENAMEX", {"type": "PERSON"})
        doc2.addAnnotationAt(self.task, "Anmubani", 0, 2, "ENAMEX", {"type": "ORGANIZATION"})
        doc2.addAnnotationAt(self.task, "Ramadoss", 1, 1, "ENAMEX", {"type": "PERSON"})
        doc1.addAnnotationAt(self.task, "World", 1, 3, "ENAMEX", {"type": "ORGANIZATION"})
        doc2.addAnnotationAt(self.task, "World", 1, 3, "ENAMEX", {"type": "ORGANIZATION"})
        doc1.updateSegment(self.task, "Minister", 0, [("status", "human gold"), ("annotator", "person_a")])
        doc2.updateSegment(self.task, "Minister", 0, [("status", "human gold"), ("annotator", "person_b")])
        doc1.updateSegment(self.task, "Organization", 1, [("status", "reconciled"), ("annotator", "person_a")])
        doc2.updateSegment(self.task, "Organization", 1, [("status", "reconciled"), ("annotator", "person_b")])
        # OK, here's what I expect.
        # up to "bars.": ignore during reconciliation
        # up to "India": reconciled
        # on "India": human gold
        # up to "Minister": reconciled
        # up to "Ramadoss": human gold
        # up to "Ramadoss" 2: reconciled
        # on "Ramadoss" 2: human gold
        # up to "said.": reconciled
        # up to "enough.": ignore during reconciliation
        # up to the end: reconciled
        recDoc = ReconciliationTestDocument.generateReconciliationDocument(self.task, [doc1, doc2])

        # OK. Let's test it.
        START = self.START
        END = self.END
        self._checkSegmentBoundaries(recDoc, 
                                     [("bars.", 0, END, "ignore during reconciliation"),
                                      ("India", 0, START, "reconciled"),
                                      ("India", 0, END, "human gold"),
                                      ("Minister", 0, START, "reconciled"),
                                      ("Ramadoss", 0, END, "human gold"),
                                      ("Ramadoss", 1, START, "reconciled"),
                                      ("Ramadoss", 1, END, "human gold"),
                                      ("said.", 0, END, "reconciled"),
                                      ("enough.", 0, END, "ignore during reconciliation"),
                                      ("advertising.", 0, END, "reconciled")])

class AttributeChoiceTestCase(PluginContextTestCase):

    def _dumpATR(self, atr):

        # I thought I could do this by asking the task to do it, but
        # since most of them are errors, I can't.

        atypes = {}
        toplevelATR = {"allAnnotationsKnown": False, "types": atypes}
        for k in atr.get("annotations", []):
            atypes[k["label"]] = {"type": k["label"], "hasSpan": True, "allAttributesKnown": False, "attrs": []}
        effectiveLabelMap = {}
        labelRestrs = []
        for k in atr.get("attributes", []):
            attr = {"name": k["name"], "type": k.get("type", "string"),
                    "aggregation": k.get("aggregation")}
            if k.get("default"):
                attr["default"] = k["default"]
            if k.get("default_is_text_span"):
                attr["default_is_text_span"] = True
            for a in ["choices", "minval", "maxval"]:
                if k.get(a):
                    attr[a] = k[a]
            if k.get("label_restrictions"):
                # These need to be unpacked. So they have to wait until
                # I've gotten through all the effective labels.
                labelRestrs.append((k["label_restrictions"], attr))
            eLabels = None
            if k.get("effective_labels"):
                eLabels = dict([(eName, {"attr": k["name"], "val": val})
                                for (val, eName) in k["effective_labels"].items()])
                for val, eName in k["effective_labels"].items():
                    effectiveLabelMap[eName] = (k["name"], val, k["of_annotations"])
            for v in k["of_annotations"]:
                atype = atypes[v]
                atype["attrs"].append(attr)
                if eLabels:
                    atype["effective_labels"] = eLabels

        if labelRestrs:
            # Unpack them.
            for restrs, attrObj in labelRestrs:
                finalRestrs = []
                for restr in restrs:
                    if type(restr) in (str, unicode):
                        symbl = restr
                        kvs = None
                    else:
                        symbl, kvs = restr
                    # Now, see if they're effective labels.
                    if effectiveLabelMap.has_key(symbl):
                        attr, val, eAnnotations = effectiveLabelMap[symbl]
                        # eAnnotations had better have only one...
                        eAnnotation = eAnnotations[0]                    
                        symbl = eAnnotation
                        if kvs is None:
                            kvs = {}
                        kvs[attr] = val
                    if kvs is None:
                        finalRestrs.append(symbl)
                    else:
                        finalRestrs.append([symbl, [[k, v] for (k, v) in kvs.items()]])
                attrObj["label_restrictions"] = finalRestrs                
                    
        toplevelATR = MAT.PluginMgr.PluginTaskDescriptor.simplifyJSONDisplayAnnotationRepository(toplevelATR, removeNoncontentAnnotations = True, removeRedundantInfo = True)
        import json
        print json.dumps(toplevelATR, sort_keys = True, indent = 2)
        
    # A bunch of tests for effective labels.

    def _digestATR(self, desc):
        atr = MAT.Annotation.GlobalAnnotationTypeRepository()
        # self._dumpATR(desc)
        atr.fromJSONDescriptorList([desc])
        return atr

    def testBadEffectiveLabel(self):

        # The attribute must be a string or int.
        try:
            self._digestATR(
                    {"name": "content",
                     "annotations": [{"label": "Mention"}],
                     "attributes": [{"name": "type", "type": "float", "of_annotations": ["Mention"],
                                     "effective_labels": {2.5: "PER"}}]})
            self.fail("Should have failed.")
        except Exception, e:
            self.failUnless(str(e).find("unexpected keyword") > -1)

        # Must be a singleton.
        try:
            self._digestATR(
                    {"name": "content",
                     "annotations": [{"label": "Mention"}],
                     "attributes": [{"name": "type", "aggregation": "set",
                                     "type": "string",
                                     "of_annotations": ["Mention"],
                                     "choices": ["PER"],
                                     "effective_labels": {"PER": "PerMention"}}]})
            self.fail("Should have failed.")
        except Exception, e:
            self.failUnless(str(e).find("non-singleton") > -1)

        # Must have choices.
        try:
            self._digestATR(
                    {"name": "content",
                     "annotations": [{"label": "Mention"}],
                     "attributes": [{"name": "type", "type": "string", "of_annotations": ["Mention"],
                                     "effective_labels": {"PER": "PerMention"}}]})
            self.fail("Should have failed.")
        except Exception, e:
            self.failUnless(str(e).find("without choices") > -1)
        
        # This one doesn't have enough labels.
        try:
            self._digestATR(
                {"name": "content",
                 "annotations": [{"label": "Mention"}],
                 "attributes": [{"name": "type", "type": "string",
                                 "of_annotations": ["Mention"],
                                 "choices": ["PER", "ORG"],
                                 "effective_labels": {"ORG": "OrgMention"}}]})
            self.fail("Should have failed.")
        except Exception, e:
            self.failUnless(str(e).find("some, but not all") > -1)

        
        # This one has too many effective label attributes.
        try:
            self._digestATR(
                {"name": "content",
                 "annotations": [{"label": "Mention"}],
                 "attributes": [{"name": "type", "type": "string",
                                 "of_annotations": ["Mention"],
                                 "choices": ["ORG"],
                                 "effective_labels": {"ORG": "OrgMention"}},
                                {"name": "type2", "type": "string",
                                 "of_annotations": ["Mention"],
                                 "choices": ["ORG"],
                                 "effective_labels": {"ORG": "OrgMention"}}]})
            self.fail("Should have failed.")
        except Exception, e:
            self.failUnless(str(e).find("already has effective label attribute") > -1)
        

        # This one works.
        self._digestATR(
                {"name": "content",
                 "annotations": [{"label": "Mention"}],
                 "attributes": [{"name": "type", "type": "string",
                                 "of_annotations": ["Mention"],
                                 "choices": ["PER", "ORG"],
                                 "effective_labels": {"PER": "PerMention", "ORG": "OrgMention"}}]})
        
        # Bad attr value.
        try:
            self._digestATR(
                    {"name": "content",
                     "annotations": [{"label": "Mention"}],
                     "attributes": [{"name": "type", "type": "string",
                                     "of_annotations": ["Mention"],
                                     "choices": ["PER", "ORG"],
                                     "effective_labels": {"PER": "PerMention", "LOC": "LocMention"}}]})
            self.fail("Should have failed.")
        except Exception, e:
            self.failUnless(str(e).find("unknown attribute values") > -1)
        
    # Now, tests to see if the complex annotation restrictions 
    # are also only about attributes with choices. This should
    # include effective labels.

    def testComplexAnnotationRestrictions(self):

        # First, here's a kosher one.

        atr = self._digestATR(
                {"name": "content",
                 "annotations": [{"label": "Mention"}, {"label": "Relation"},
                                 {"label": "Filler"}],
                 "attributes": [{"name": "type", "type": "string",
                                 "of_annotations": ["Mention"],
                                 "choices": ["PER", "ORG", "LOC"],
                                 "effective_labels": {"PER": "PerMention", "ORG": "OrgMention", "LOC": "LocMention"}},
                                {"name": "nomtype", "type": "string",
                                 "of_annotations": ["Filler"],
                                 "choices": ["PRO", "NOM", "NAM"]},
                                {"name": "RelationArg1", "type": "annotation",
                                 "of_annotations": ["Relation"],
                                 "label_restrictions": ["PerMention"]},
                                {"name": "RelationArg2", "type": "annotation",
                                 "of_annotations": ["Relation"],
                                 "label_restrictions": [("Filler", {"nomtype": "PRO"})]}
                                ]})

        # This one should fail because its label restriction isn't
        # on an attribute with choices.
        try:
            self._digestATR(
                    {"name": "content",
                     "annotations": [{"label": "Mention"}, {"label": "Relation"},
                                     {"label": "Filler"}],
                     "attributes": [{"name": "type", "type": "string",
                                     "of_annotations": ["Mention"],
                                     "choices": ["PER", "ORG", "LOC"],
                                     "effective_labels": {"PER": "PerMention", "ORG": "OrgMention", "LOC": "LocMention"}},
                                    {"name": "nomtype", "type": "string",
                                     "of_annotations": ["Filler"],
                                     "choices": ["PRO", "NOM", "NAM"]},
                                    {"name": "comment", "type": "string",
                                     "of_annotations": ["Filler"]},
                                    {"name": "RelationArg1", "type": "annotation",
                                     "of_annotations": ["Relation"],
                                     "label_restrictions": ["PerMention"]},
                                    {"name": "RelationArg2", "type": "annotation",
                                     "of_annotations": ["Relation"],
                                     "label_restrictions": [("Filler", {"comment": "PRO"})]}
                                    ]})
            self.fail("Should have failed.")
        except Exception, e:
            self.failUnless(str(e).find("has no choices") > -1)

        # This one should fail because its label restriction isn't
        # on a string or int attribute.

        try:
            self._digestATR(
                    {"name": "content",
                     "annotations": [{"label": "Mention"}, {"label": "Relation"},
                                     {"label": "Filler"}],
                     "attributes": [{"name": "type", "type": "string",
                                     "of_annotations": ["Mention"],
                                     "choices": ["PER", "ORG", "LOC"],
                                     "effective_labels": {"PER": "PerMention", "ORG": "OrgMention", "LOC": "LocMention"}},
                                    {"name": "nomtype", "type": "string",
                                     "of_annotations": ["Filler"],
                                     "choices": ["PRO", "NOM", "NAM"]},
                                    {"name": "comment", "type": "float",
                                     "of_annotations": ["Filler"]},
                                    {"name": "RelationArg1", "type": "annotation",
                                     "of_annotations": ["Relation"],
                                     "label_restrictions": ["PerMention"]},
                                    {"name": "RelationArg2", "type": "annotation",
                                     "of_annotations": ["Relation"],
                                     "label_restrictions": [("Filler", {"comment": 5.6})]}
                                    ]})
            self.fail("Should have failed.")
        except Exception, e:
            self.failUnless(str(e).find("non-string, non-int") > -1)

    # And now, tests to ensure that when we try to change an annotation
    # whose choice values collide with something that points to it,
    # bad things happend.

    def testBadValueSets(self):
        # First, here's a kosher one.
        atr = self._digestATR(
                {"name": "content",
                 "annotations": [{"label": "Relation"},
                                 {"label": "Event"},
                                 {"label": "Filler"},
                                 {"label": "OtherFiller"}],
                 "attributes": [{"name": "nomtype", "type": "string",
                                 "of_annotations": ["Filler"],
                                 "choices": ["PRO", "NOM", "NAM"]},
                                {"name": "otherchoice", "type": "int",
                                 "of_annotations": ["Filler"],
                                 "choices": [10, 20, 30]},
                                {"name": "RelationArg", "type": "annotation",
                                 "of_annotations": ["Relation"],
                                 "label_restrictions":
                                     [("Filler", {"nomtype": "PRO"}),
                                      ("Filler", {"nomtype": "NAM", "otherchoice": 10}),
                                      ("Filler", {"otherchoice": 30})]
                                 },
                                {"name": "EventArg", "type": "annotation",
                                 "of_annotations": ["Event"],
                                 "label_restrictions":
                                     [("Filler", {"nomtype": "PRO", "otherchoice": 20}),
                                      "OtherFiller",
                                      ("Filler", {"nomtype": "NAM"})]
                                 }
                                ]
                 })

        # First, let's create a document, and then some
        # annotations.

        doc = MAT.Document.AnnotatedDoc(signal = u"This is a test document.",
                                        globalTypeRepository = atr)
        r = doc.createAnnotation(0, 5, "Relation")
        e = doc.createAnnotation(5, 10, "Event")
        f = doc.createAnnotation(10, 15, "Filler")
        # It's got no attributes, so it shouldn't fill.
        try:
            r["RelationArg"] = f
            self.fail("Should have failed.")
        except Exception, err:
            self.failUnless(str(err).find("meet the other requirements") > -1)

        # These two features should allow it to satisfy both arguments.
        f["nomtype"] = "PRO"
        f["otherchoice"] = 20
        r["RelationArg"] = f
        e["EventArg"] = f
        
        # Now, try to change the two attrs.
        try:
            f["nomtype"] = "NAM"
            self.fail("Should have failed.")
        except Exception, err:
            self.failUnless(str(err).find("inconsistent with the attribute restrictions") > -1)
        

        # Now, detach from the relation and try again.
        r["RelationArg"] = None
        f["nomtype"] = "NAM"
        f["otherchoice"] = 30
        r["RelationArg"] = f

        # Changing it to 10 will work.
        f["otherchoice"] = 10
        # But 20 shouldn't.
        try:
            f["otherchoice"] = 20
            self.fail("Should have failed.")
        except Exception, err:
            self.failUnless(str(err).find("inconsistent with the attribute restrictions") > -1)

    def testComplexAnnotationValuedAttribute(self):
        # The problem here is that if you have an complex or effective label restriction
        # on an annotation-valued attribute, and you try to deserialize it, you'll get
        # an error if you haven't been very careful about how to deserialize the
        # attributes.
        t = self._taskFromXML("t", """<annotation_set_descriptors>
  <annotation_set_descriptor name='content' category='content'>
    <annotation label='ENAMEX'/>
    <attribute of_annotation="ENAMEX" name="type">
      <choice>PER</choice>
      <choice>LOC</choice>
      <choice>ORG</choice>      
    </attribute>
    <annotation label="FILLER"/>
    <attribute of_annotation='ENAMEX' name='annot_attr' type="annotation">
      <label_restriction label="FILLER"/>
    </attribute>
    <annotation label="EVENT"/>
    <attribute of_annotation="EVENT" name="enamex" type="annotation">
     <label_restriction label="ENAMEX">
       <attributes type="PER"/>
     </label_restriction>
   </attribute>
 </annotation_set_descriptor>
</annotation_set_descriptors>""")
        d = t.newDocument(u"a" * 1000)
        # Create an annotation which has an annotation attribute filler which itself has
        # an annotation attribute filler. Make sure the parent restriction
        # includes an attribute. And you also have to make sure that the
        # EVENT annotations are deserialized BEFORE the ENAMEX annotations.
        # In the Python implementation, the only way to do that is to
        # make sure that the list of asets in JSON has the EVENT entry first.
        d.createAnnotation(20, 30, "EVENT", {"enamex": d.createAnnotation(50, 60, "ENAMEX", {"type": "PER", "annot_attr": d.createAnnotation(5, 10, "FILLER")})})
        # Serialize and deserialize.
        _jsonIO = MAT.DocumentIO.getDocumentIO("mat-json", task = t)
        s = _jsonIO.writeToUnicodeString(d)
        from MAT import json
        j = json.loads(s)
        j[u'asets'] = [a for a in j[u'asets'] if a[u'type'] == "EVENT"] + [a for a in j[u'asets'] if a[u'type'] != "EVENT"]
        s = json.dumps(j, ensure_ascii = False)
        _jsonIO.readFromUnicodeString(s)
        
    
