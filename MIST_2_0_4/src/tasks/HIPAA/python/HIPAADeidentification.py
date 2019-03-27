# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import Deidentification
from Deidentification import DeidTaskDescriptor
from MAT.PluginMgr import CleanStep
from HIPAAResynthesis import H_CATEGORIES

class HIPAADeidTaskDescriptor(DeidTaskDescriptor):

    categories = H_CATEGORIES

class HIPAACleanStep(CleanStep):
    
    # This assumes that what comes in is latin1, basically.
    # 00A0 is non-breaking space, but 92 is marked as private
    # use in Unicode.

    def do(self, annotSet, **kw):
        return self.truncateToUnixAscii(annotSet)

# Undocumented utility for expanding the documentation in-line.

class DocEnhancer(Deidentification.DocEnhancer):

    def process(self):
        self.addSubtaskDetail("doc/HIPAA.html", "HIPAA")
