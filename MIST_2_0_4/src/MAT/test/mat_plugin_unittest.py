# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import MAT, os

# Here, we test to make sure the plugin structure is correct.

class PluginStructureTestCase(MAT.UnitTest.SampleTestCase):
    
    def runTest(self):

        path = os.path.join(self.testContext["MAT_PKG_HOME"], "sample", "ne")
        p = MAT.PluginMgr.LoadPlugins(path)
        self.assertEqual(len(p.values()), 2)        
        self.assertEqual(set([p.getTask("Named Entity"), p.getTask("Enhanced Named Entity")]),
                         set(p.values()))
