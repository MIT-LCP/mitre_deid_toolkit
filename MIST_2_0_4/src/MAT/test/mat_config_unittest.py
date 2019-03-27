# Copyright (C) 2013 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from mat_unittest_resources import PluginContextTestCase
import MAT
import os, shutil

class MATPkgHomeTestCase(PluginContextTestCase):

    def test(self):
        # See if the environment messes up MAT_PKG_HOME.
        self.assertEqual(os.path.abspath(os.path.dirname(os.path.dirname(__file__))),
                         os.path.abspath(MAT.Config.MATConfig["MAT_PKG_HOME"]))
        os.environ["MAT_PKG_HOME"] = "/tmp/foobar"
        self.assertEqual(os.path.abspath(os.path.dirname(os.path.dirname(__file__))),
                         os.path.abspath(MAT.Config.MATConfig["MAT_PKG_HOME"]))
        
