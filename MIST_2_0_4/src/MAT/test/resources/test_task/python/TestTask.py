# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# Test task.

import MAT.PluginMgr
from MAT.Operation import OpArgument, Option
import MAT

class ProbeStep(MAT.PluginMgr.PluginStep):

    def addFileType(option, optstring, value, parser):
        try:
            ftype = MAT.DocumentIO.getInputDocumentIOClass(value)
            ftype.addOptions(parser.aggregator, values = parser.values)
        except KeyError:
            pass

    argList = [OpArgument("probe_a", hasArg = True),
               OpArgument("probe_b", hasArg = True, action = "append", dest = "probe_b_list"),
               OpArgument("probe_c"),
               OpArgument("probe_d", hasArg = True),
               OpArgument("probe_e", hasArg = True, action = "append", dest = "probe_e_list"),
               OpArgument("probe_f"),
               OpArgument("probe_g", hasArg = True,
                          side_effect_callback = addFileType)]

    def undo(self):
        pass

    def do(self, annotSet, probe_result = None, probe_a = None, probe_c = False,
           probe_b_list = None, probe_d = None, probe_e_list = None, probe_f = False,
           probe_g = None, **kw):
        if probe_result is not None:
            probe_result["probe_a"] = probe_a
            probe_result["probe_b_list"] = probe_b_list
            probe_result["probe_c"] = probe_c
            probe_result["probe_d"] = probe_d
            probe_result["probe_e_list"] = probe_e_list
            probe_result["probe_f"] = probe_f
            probe_result["probe_g"] = probe_g
        return annotSet

class PureOptionProbeStep(ProbeStep):

    def addFileType(option, optstring, value, parser):
        try:
            ftype = MAT.DocumentIO.getInputDocumentIOClass(value)
            ftype.addOptions(parser.aggregator, values = parser.values)
        except KeyError:
            pass

    argList = [Option("--probe_a", type="string"),
               Option("--probe_b", type="string", action = "append", dest = "probe_b_list"),
               # NO DEFAULT.
               Option("--probe_c", type="boolean"),
               Option("--probe_d", type="string"),
               Option("--probe_e", type="string", action = "append", dest = "probe_e_list"),
               Option("--probe_f", action="store_true"),
               Option("--probe_g", type="string",
                      side_effect_callback = addFileType)]
