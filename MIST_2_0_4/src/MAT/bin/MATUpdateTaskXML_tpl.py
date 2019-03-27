#!MF_PYTHONBIN

# Copyright (C) 2012 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import os, sys, glob, shutil

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

MAT_PKG_HOME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The point of this script is to update 1.3 task.xml files to 2.0. We do
# this by performing surgery on the XMLNode element digested from the 1.3 template.
# This means you need a 1.3 MAT directory.

import MAT

#
# Guts
#

from MAT.XMLNode import XMLNode, XMLNodeDescFromFile, XMLNodeFromFile

class ConversionError(Exception):
    pass

def convertTaskXML(xmlIn, libDir):
    
    # This is the OLD template, parsed with the NEW parser.
    d = XMLNodeDescFromFile(os.path.join(libDir, "task_template.xml"))
    xmlNode = XMLNodeFromFile(xmlIn, {"task": d, "tasks": {"nType": d["nType"], "label": "tasks", "obligMultipleChildren": [d]}})

    # Now, do the surgery.

    if xmlNode.label == "tasks":
        for t in xmlNode.children["task"]:
            convertTask(t)
    else:
        convertTask(xmlNode)

    return xmlNode

def convertTask(xmlNode):

    # Change 1: the tagging_step attribute on "step" in step_implementations is gone.
    
    if xmlNode.children["step_implementations"]:
        for step in xmlNode.children["step_implementations"].children["step"]:
            if step.attrs.has_key("tagging_step"):
                del step.attrs["tagging_step"]
    
    # Change 2: the workspace autotag operation now only has the final step.
    # And the operation named tagprep is now import.

    if xmlNode.children["workspace"]:
        for op in xmlNode.children["workspace"].children["operation"]:
            if op.attrs["name"] == "tagprep":
                op.attrs["name"] = "import"
            elif op.attrs["name"] == "autotag":
                settings = op.children["settings"]
                if settings and settings.attrs.get("steps"):
                    settings.attrs["steps"] = settings.attrs["steps"].split(",")[-1]

    # Change 3: <web_customizations> doesn't support default_tag_window_position
    # and default_tag_window_size attributes.

    if xmlNode.children["web_customization"]:
        if op.attrs.has_key("default_tag_window_position"):
            del op.attrs["default_tag_window_position"]
        if op.attrs.has_key("default_tag_window_size"):
            del op.attrs["default_tag_window_size"]        

    # Change 4: the tags become <annotation_set_descriptors> and <annotation_display>.
    # Here's what we start with:
    #  <tags inherit_structure="optional" inherit_content="optional">
    #    <tag _xmlnode_count="*" name="obligatory" category="obligatory"    
    #         distinguishing_attributes_for_equality="optional"> -- added after 1.3
    #      <ui _xmlnode_count="?" css="obligatory" accelerator="optional"/>
    #      <attr_set _xmlnode_count="*" name="obligatory">
    #        <attr _xmlnode_count="+" name="obligatory" value="obligatory"/>
    #        <ui _xmlnode_count="?" css="obligatory" accelerator="optional"/>
    #      </attr_set>
    #    </tag>
    #    <tag_group name="obligatory" _xmlnode_count="*" children="obligatory">
    #      <ui _xmlnode_count="?" css="obligatory"/>
    #    </tag_group>
    # </tags>

    if xmlNode.children["tags"]:
        tags = xmlNode.children["tags"]
        annotationSetDescriptors = XMLNode(label = "annotation_set_descriptors",
                                           initialAttrs = {"all_annotations_known": "no"})
        # Leave the new ones all open, for consistency with the past.
        inherits = []
        if tags.attrs.get("inherit_structure") == "yes":
            inherits = ["category:zone", "category:token"]
        if tags.attrs.get("inherit_content") == "yes":
            inherits.append("category:content")
        if inherits:
            annotationSetDescriptors.attrs["inherit"] = ",".join(inherits)

        # Replace tags with the new node. We'll insert the display node
        # immediately after it if we have it.
        _replaceNode(xmlNode, tags, annotationSetDescriptors, inherit_comments = True)

        descriptorHash = {}
        annotationDisplay = None

        # Look through the tag children.
        for tag in tags.children["tag"][:]:
            _replaceNode(tags, tag, None)
            # Change the name of the tag.
            if tag.attrs["category"] not in ("token", "zone", "content"):
                raise ConversionError, ("category of tag %s isn't token, zone, or content" % tag.attrs["name"])
            try:
                desc = descriptorHash[tag.attrs["category"]]
            except KeyError:
                desc = XMLNode(label = "annotation_set_descriptor",
                               initialAttrs = {"category": tag.attrs["category"], "name": tag.attrs["category"]})
                descriptorHash[tag.attrs["category"]] = desc
                _insert(annotationSetDescriptors, None, desc)
            del tag.attrs["category"]
            eqAttrs = []
            if tag.attrs.get("distinguishing_attributes_for_equality"):
                eqAttrs = [s.strip() for s in tag.attrs["distinguishing_attributes_for_equality"].split(",")]
            tag.attrs["label"] = tag.attrs["name"]
            tag.label = "annotation"
            del tag.attrs["name"]
            _insert(desc, None, tag, as_list = True)
            # Kill its children. Attributes are listed separately, and
            # so is UI stuff. If there's UI on the attributes, infer an effective label.
            children = tag.children
            tag.orderedChildren = []
            tag.children = {}
            attrs = {}
            if children["ui"]:
                if annotationDisplay is None:
                    annotationDisplay = XMLNode(label = "annotation_display")
                    _insert(xmlNode, annotationSetDescriptors, annotationDisplay, before = False)
                _insert(annotationDisplay, None,
                        XMLNode(label = "label",
                                initialAttrs = {"name": tag.attrs["label"],
                                                "css": children["ui"].attrs["css"],
                                                "accelerator": children["ui"].attrs.get("accelerator")}),
                        as_list = True)
            for attrSet in children["attr_set"]:
                # If there's more than one attr pair, barf.
                if attrSet.children["ui"] and (len(attrSet.children["attr"]) != 1):
                    raise ConversionError, ("attr set for tag %s has other than one attr pair - can't convert to effective label" % tag.attrs["label"])
                for attrNode in attrSet.children["attr"]:
                    try:
                        attr = attrs[attrNode.attrs["name"]]
                    except KeyError:
                        attr = XMLNode(label = "attribute", initialAttrs = {"name": attrNode.attrs["name"],
                                                                            "of_annotation": tag.attrs["label"]})
                        if attrNode.attrs["name"] in eqAttrs:
                            attr.attrs["distinguishing_attribute_for_equality"] = "yes"
                        attrs[attrNode.attrs["name"]] = attr
                        _insert(desc, None, attr, as_list = True)
                    # And add the choice.
                    if attrSet.children["ui"]:
                        _insert(attr, None, XMLNode(label = "choice", initialAttrs = {"effective_label":
                                                                                      attrSet.attrs["name"]},
                                                    initialText = attrNode.attrs["value"]), as_list = True)
                    else:
                        _insert(attr, None, XMLNode(label = "choice", initialText = attrNode.attrs["value"]), as_list = True)
                # And if there's a UI, generate an effective label.
                if attrSet.children["ui"]:
                    if annotationDisplay is None:
                        annotationDisplay = XMLNode(label = "annotation_display")
                        _insert(xmlNode, annotationSetDescriptors, annotationDisplay, before = False)
                    _insert(annotationDisplay, None,
                            XMLNode(label = "label",
                                    initialAttrs = {"name": attrSet.attrs["name"],
                                                    "css": attrSet.children["ui"].attrs["css"],
                                                    "accelerator": attrSet.children["ui"].attrs.get("accelerator")}),
                            as_list = True)

        for group in tags.children["tag_group"][:]:
            _replaceNode(tags, group, None)
            group.label = "label_group"
            if annotationDisplay is None:
                annotationDisplay = XMLNode(label = "annotation_display")
                _insert(xmlNode, annotationSetDescriptors, annotationDisplay, before = False)
            _insert(annotationDisplay, None, group, as_list = True)
            if group.children["ui"]:
                group.attrs["css"] = group.children["ui"].attrs["css"]
                group.children = {}
                group.orderedChildren = []

def _replaceNode(oldNodeParent, oldNode, newNode, inherit_comments = False):
    pos = oldNodeParent.orderedChildren.index(oldNode)
    if newNode:
        oldNodeParent.orderedChildren[pos] = newNode
        oldNodeParent.children[newNode.label] = newNode
    oldNodeChildren = oldNodeParent.children[oldNode.label]
    if oldNodeChildren == oldNode:
        # It's a singleton.
        del oldNodeParent.children[oldNode.label]
    else:
        oldNodeChildren.remove(oldNode)
    if inherit_comments and newNode:
        newNode.precedingComments = oldNode.precedingComments
        oldNode.precedingComments = []
        newNode.followingComments = oldNode.followingComments
        oldNode.followingComments = []

def _insert(parentNode, refChild, newChild, as_list = False, before = True):
    if refChild is None:
        if before:
            parentNode.orderedChildren.append(newChild)
        else:
            parentNode.orderedChildren[0:0] = [newChild]
    else:
        pos = parentNode.orderedChildren.index(refChild)
        if not before:
            pos += 1
        parentNode.orderedChildren[pos:pos] = [newChild]
    if as_list:
        try:
            parentNode.children[newChild.label].append(newChild)
        except KeyError:
            parentNode.children[newChild.label] = [newChild]
    else:
        parentNode.children[newChild.label] = newChild


#
# Toplevel
#

from MAT.Operation import OptionParser, OptionGroup

parser = OptionParser(usage = """Usage: %prog [options] mat_1_3_root task_xml [outdir]

mat_1_3_root: a 1.3 final MAT root directory, typically src/MAT in the 1.3 distribution
task_xml: the task.xml file to update. The original file will be written to task.xml.1_3, and the new
  file, no matter what this name is, is task.xml. This way, you can repeatedly update the
  1.3 task.xml file if you need to
outdir: the directory to save the task.xml files to. Optional. By default, this will be the same
  directory you started with.""")

parser.add_option("--print_to_stdout", action = "store_true",
                  help = "if present, print to stdout instead of task.xml, and don't copy the original")
parser.add_option("--cheat_on_1_3_requirement", action = "store_true",
                  help = "don't require that the mat_1_3_root actually be 1.3, but permit early versions of 2.0")
options, args = parser.parse_args()

if len(args) not in (2, 3):
    parser.print_help()
    sys.exit(1)

[MAT_1_3_ROOT, TASK_XML] = args[:2]
MAT_1_3_ROOT = os.path.realpath(os.path.abspath(MAT_1_3_ROOT))
PRINT_TO_STDOUT = options.print_to_stdout

TASK_XML = os.path.realpath(os.path.abspath(TASK_XML))
if len(args) == 3:
    OUTDIR = args[2]
else:
    OUTDIR = os.path.dirname(TASK_XML)
vFile = os.path.join(MAT_1_3_ROOT, "etc", "VERSION")
libDir = os.path.join(MAT_1_3_ROOT, "lib", "mat", "python", "MAT")
if (not os.path.isfile(vFile)) or (not os.path.isdir(libDir)):
    print >> sys.stderr, "%s does not appear to be a MAT root directory." % MAT_1_3_ROOT
    sys.exit(1)
fp = open(vFile, "r")
ver = fp.read()
fp.close()
if not ver.startswith("1.3"):
    if options.cheat_on_1_3_requirement:
        if not ver.startswith("2.0"):
            print >> sys.stderr, "%s does not appear to be a MAT 1.3 or MAT 2.0 root directory." % MAT_1_3_ROOT
            sys.exit(1)
    else:
        print >> sys.stderr, "%s does not appear to be a MAT 1.3 root directory." % MAT_1_3_ROOT
        sys.exit(1)

xmlName = os.path.basename(TASK_XML)
if (not PRINT_TO_STDOUT) and (xmlName != "task.xml.1_3"):
    import shutil
    shutil.copyfile(TASK_XML, os.path.join(OUTDIR, "task.xml.1_3"))

try:
    xmlNode = convertTaskXML(TASK_XML, libDir)
except ConversionError, e:
    print >> sys.stderr, "Error:", str(e)
    sys.exit(1)
    
if PRINT_TO_STDOUT:
    xmlNode._print()
else:
    newFile = os.path.join(OUTDIR, "task.xml")
    # Finally, write it out.
    fp = open(newFile, "w")
    xmlNode._print(fp = fp)
    fp.close()
sys.exit(0)
