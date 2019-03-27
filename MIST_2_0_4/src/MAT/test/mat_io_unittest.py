# Copyright (C) 2010 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# I have to test some of the properties of the readers and
# writers. At the moment, what's at stake is the ability of the
# XML reader/writer to process \r correctly.

from mat_unittest_resources import PluginContextTestCase
import MAT.DocumentIO
import os

class XMLCRTestCase(PluginContextTestCase):

    def testCRPreservation(self):
        # Start with an XML document.
        docPath = os.path.join(self.sampleDir, "resources", "data", "xml_simple", "voa1.xml")
        # Modify the document so that it starts with an XML declaration, and
        # ends with a comment. Then, replace \n with \r\n and convert it to Unicode.
        fp = open(docPath, "r")
        s = fp.read()
        fp.close()
        s = """<?xml version="1.0" standalone="no" ?>
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN"
  "http://www.w3.org/TR/REC-html40/loose.dtd">
""" + s + """
<!-- This is a trailing comment. -->
"""
        s = s.replace("\n", "\r\n").decode('ascii')
        xmlIO = MAT.DocumentIO.getDocumentIO('xml-inline', task = self.task,
                                             xml_input_is_overlay = True,
                                             xml_output_exclude_metadata = True)
        # At this point, the XML reader should have converted \r into the
        # appropriate XML entity ONLY WITHIN THE TOPLEVEL TAG.
        d = xmlIO.readFromUnicodeString(s)
        resS = xmlIO.writeToUnicodeString(d)
        self.assertEqual(s, resS)

class XMLToplevelNodeTestCase(PluginContextTestCase):

    def test(self):
        # So we need a toplevel node in XML output, if you have no other
        # toplevel node. 
        xmlIO = MAT.DocumentIO.getDocumentIO('xml-inline', task = self.task)
        d = xmlIO.readFromUnicodeString(u"<t>Test this.</t>")
        resS = xmlIO.writeToUnicodeString(d)
        self.assertTrue(resS.startswith("<__top>"))
        # But not if the signal is XML.
        xmlIO = MAT.DocumentIO.getDocumentIO('xml-inline', task = self.task,
                                             xml_input_is_overlay = True)
        d = xmlIO.readFromUnicodeString(u"<t>Test this.</t>")
        resS = xmlIO.writeToUnicodeString(d)
        self.assertTrue(resS.startswith("<t>"))
        # But yes if there already is one and you're printing metadata.
        xmlIO = MAT.DocumentIO.getDocumentIO('xml-inline', task = self.task)
        d = xmlIO.readFromUnicodeString(u"<PERSON>Test this.</PERSON>")
        resS = xmlIO.writeToUnicodeString(d)
        self.assertTrue(resS.startswith("<__top>"))
        # But no if you're NOT printing metadata.
        xmlIO = MAT.DocumentIO.getDocumentIO('xml-inline', task = self.task,
                                             xml_output_exclude_metadata = True)
        d = xmlIO.readFromUnicodeString(u"<PERSON>Test this.</PERSON>")
        resS = xmlIO.writeToUnicodeString(d)
        self.assertTrue(resS.startswith("<PERSON>Test"))
        # But yes again if that's not a toplevel tag.
        xmlIO = MAT.DocumentIO.getDocumentIO('xml-inline', task = self.task,
                                             xml_output_exclude_metadata = True)
        d = xmlIO.readFromUnicodeString(u"<t><PERSON>Test this</PERSON>.</t>")
        resS = xmlIO.writeToUnicodeString(d)
        self.assertTrue(resS.startswith("<__top>"))
        d = xmlIO.readFromUnicodeString(u"<t> <PERSON>Test this.</PERSON></t>")
        resS = xmlIO.writeToUnicodeString(d)
        self.assertTrue(resS.startswith("<__top>"))

class XMLTranslateAllTestCase(PluginContextTestCase):

    def test(self):
        # The problem here is that if you have an complex or effective label restriction
        # on an annotation-valued attribute, and you try to deserialize it, you'll get
        # an error if you haven't been very careful about how to deserialize the
        # attributes.
        t = self._taskFromXML("t", """<annotation_set_descriptors>
  <annotation_set_descriptor name='content' category='content'>
    <annotation label='PERSON'/>
    <attribute of_annotation="PERSON" name="val" type="int"/>
 </annotation_set_descriptor>
</annotation_set_descriptors>""")
        xmlIO = MAT.DocumentIO.getDocumentIO('xml-inline', task = t,
                                             xml_translate_all = True)
        d = xmlIO.readFromUnicodeString(u"<FOOBAR val='5'><PERSON val='6'>John</PERSON> left.</FOOBAR>")
        # Make sure they both have attribute values, and that the PERSON
        # value is of the right type.
        foobarAnnots = d.getAnnotations(["FOOBAR"])
        self.assertEqual(len(foobarAnnots), 1)
        self.assertEqual(foobarAnnots[0].get("val"), "5")
        personAnnots = d.getAnnotations(["PERSON"])
        self.assertEqual(len(personAnnots), 1)
        self.assertEqual(personAnnots[0].get("val"), 6)


class FakeXMLInlineTestCase(PluginContextTestCase):

    def testFakeXML(self):
        DOC = u'I left <PERSON>John <FOO/><LASTNAME cap="yes">Gray</LASTNAME></PERSON><FOO/> at home.'
        xmlIO = MAT.DocumentIO.getDocumentIO('fake-xml-inline')
        d = xmlIO.readFromUnicodeString(DOC)
        self.assertEqual(set([(a.start, a.end) for a in d.getAnnotations(["FOO"])]), set([(12, 12), (16, 16)]))
        self.assertEqual(d.signal, "I left John Gray at home.")
        self.assertEqual(set([(a.start, a.end) for a in d.getAnnotations(["LASTNAME"])]), set([(12, 16)]))
        self.assertEqual(d.getAnnotations(["LASTNAME"])[0]["cap"], "yes")
        self.assertEqual(set([(a.start, a.end) for a in d.getAnnotations(["PERSON"])]), set([(7, 16)]))
