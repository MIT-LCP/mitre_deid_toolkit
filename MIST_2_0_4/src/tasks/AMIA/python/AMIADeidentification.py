# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import Deidentification
from Deidentification import DeidTaskDescriptor
from MAT.PluginMgr import ZoneStep, PluginStep
from AMIAReplacementEngine import AMIA_CATEGORIES

#
# AMIA documents
#

class AMIADeidTaskDescriptor(DeidTaskDescriptor):

    categories = AMIA_CATEGORIES

    # Each element should have a Zone, Tag and Redact method.
    # Each method is called for side effect on the annotation set.

class AMIAZoneStep(ZoneStep):
        
    import re

    TXT_RE = re.compile("<TXT>(.*)</TXT>", re.I | re.S)

    def do(self, annotSet, **kw):
        # There's <DOC> and <TXT>, and
        # everything in between the <TXT> is fair game.
        m = self.TXT_RE.search(annotSet.signal)
        if m is not None:
            self.addZones(annotSet, [(m.start(1), m.end(1),  "body")], **kw)
        else:
            self.addZones(annotSet, [(0, len(annotSet.signal), "body")], **kw)
        
        return annotSet

# Undocumented utility for expanding the documentation in-line.

class DocEnhancer(Deidentification.DocEnhancer):

    def process(self):
        self.addSubtaskDetail("doc/AMIA_data.html", "AMIA")
