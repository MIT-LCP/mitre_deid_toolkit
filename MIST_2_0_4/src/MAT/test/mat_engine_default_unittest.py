# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import MAT
import os, sys

# I need to test the defaults behavior. How do I do that without
# building a task? Ugh.

class TestTaskTestCase(MAT.UnitTest.SampleTestCase):

    instantiable = False

    # No teardown needed.

    def setUp(self):
        MAT.UnitTest.SampleTestCase.setUp(self)
        self.sampleDir = os.path.join(self.testContext["MAT_PKG_HOME"], "test", "resources", "test_task")
        self.pDict = MAT.PluginMgr.LoadPlugins(self.sampleDir)
        self.task = self.pDict.getTask("Test task")

# So here's what's supposed to happen with defaults. The command line
# should override the task.

class EngineDefaultTestCase(TestTaskTestCase):

    def testEngineDefault(self):
        e = MAT.ToolChain.MATEngine(self.task, "Probe")
        r = {}
        # I was using /dev/null, but that's
        # different on Windows.
        if sys.platform == "win32":
            nullFile = "nul"
        else:
            nullFile = "/dev/null"
        e.Run(input_file = nullFile, input_file_type = "raw", steps = "probe",
              probe_result = r)
        self.assertEqual(r, {'probe_b_list': ['b_val_1'],
                             'probe_e_list': None,
                             'probe_a': 'probe_value_a',
                             'probe_c': True,
                             'probe_d': None,
                             'probe_f': False,
                             'probe_g': None})
        r = {}
        e.Run(input_file = nullFile, input_file_type = "raw", steps = "probe",
              probe_a = 'probe_value_b',
              probe_result = r)
        self.assertEqual(r, {'probe_b_list': ['b_val_1'],
                             'probe_e_list': None,
                             'probe_a': 'probe_value_b',
                             'probe_c': True,
                             'probe_d': None,
                             'probe_f': False,
                             'probe_g': None})

    def testEngineEnhancement(self):
        e = MAT.ToolChain.MATEngine(self.task, "Probe")
        kw = e.aggregatorExtract(MAT.Operation.XMLOpArgumentAggregator({"steps": "probe",
                                                                        "output_file_type": "xml-inline",
                                                                        "signal_is_xml": "yes"}))
        self.assertEqual(kw, {"steps": "probe",
                              "output_file_type": "xml-inline",
                              "signal_is_xml": True})

# Here's the really, really detailed examination.

class ArgParsingTestCase(TestTaskTestCase):

    def testCmdline(self):
        parser = MAT.Operation.OptionParser()
        aggregator = MAT.Operation.CmdlineOpArgumentAggregator(parser)
        self.task.addOptions(aggregator)
        opts, args = parser.parse_args([])
        self.assertEqual(aggregator.convertToKW(opts, reportDefaults = True),
                         {'probe_b_list': [],
                          'probe_e_list': [],
                          'probe_a': None,
                          'probe_c': False,
                          'probe_d': None,
                          'probe_f': False,
                          'probe_g': None})
        self.assertEqual(aggregator.convertToKW(opts), {})
        opts, args = parser.parse_args(["--probe_b", "b_list_1", "--probe_f"])
        self.assertEqual(aggregator.convertToKW(opts),
                         {'probe_b_list': ["b_list_1"],
                          'probe_f': True})

    def testEnhance(self):
        parser = MAT.Operation.OptionParser()
        aggregator = MAT.Operation.CmdlineOpArgumentAggregator(parser)
        self.task.addOptions(aggregator)
        opts, args = parser.parse_args([])
        aggregator.storeValues(opts)
        self.assertEqual(self.task.getStep("Probe", "probe").enhanceAndValidate(aggregator, probe_a = 'c', probe_c = True),
                         {'probe_a': 'c', 'probe_c': True})
        # But the values weren't modified.
        self.assertEqual(opts.probe_c, False)
        self.assertEqual(opts.probe_a, None)
        parser = MAT.Operation.OptionParser()
        aggregator = MAT.Operation.CmdlineOpArgumentAggregator(parser)
        self.task.addOptions(aggregator)
        opts, args = parser.parse_args(["--probe_b", "b_list_1", "--probe_a", "b"])
        aggregator.storeValues(opts)
        self.assertEqual(self.task.getStep("Probe", "probe").enhanceAndValidate(aggregator, probe_a = 'c', probe_c = True),
                         {'probe_a': 'b', 'probe_c': True, 'probe_b_list': ['b_list_1']})

    def testPureOptionEnhance(self):
        poTask = self.pDict.getTask("Pure option test task")
        parser = MAT.Operation.OptionParser()
        aggregator = MAT.Operation.CmdlineOpArgumentAggregator(parser)
        poTask.addOptions(aggregator)
        opts, args = parser.parse_args([])
        aggregator.storeValues(opts)
        try:
            poTask.getStep("Probe", "probe").enhanceAndValidate(aggregator, probe_a = 5, probe_c = True)
            self.fail("should have hit an error")
        except MAT.Operation.OperationError, e:
            self.assertTrue(str(e).find("must be a string") > -1)
        parser = MAT.Operation.OptionParser()
        aggregator = MAT.Operation.CmdlineOpArgumentAggregator(parser)
        poTask.addOptions(aggregator)
        opts, args = parser.parse_args([])
        aggregator.storeValues(opts)
        self.assertEqual(poTask.getStep("Probe", "probe").enhanceAndValidate(aggregator, probe_a = 'c',
                                                                             probe_c = True, probe_f = True),
                         {'probe_a': 'c', 'probe_c': True, 'probe_f': True})
        # But the values weren't modified.
        self.assertEqual(opts.probe_c, False)
        self.assertEqual(opts.probe_f, None)
        self.assertEqual(opts.probe_a, None)
        parser = MAT.Operation.OptionParser()
        aggregator = MAT.Operation.CmdlineOpArgumentAggregator(parser)
        poTask.addOptions(aggregator)
        opts, args = parser.parse_args(["--probe_b", "b_list_1", "--probe_a", "b"])
        aggregator.storeValues(opts)
        self.assertEqual(poTask.getStep("Probe", "probe").enhanceAndValidate(aggregator, probe_a = 5, probe_c = True),
                         {'probe_a': 'b', 'probe_c': True, 'probe_b_list': ['b_list_1']})

    def testPureOptionEnhanceXML(self):
        poTask = self.pDict.getTask("Pure option test task")
        # And finally, I want to show that probe_f, which is a store_true with NO DEFAULT,
        # becomes the appropriate boolean when the arguments are XML.
        step = poTask.getStep("Probe", "probe")
        xmlWDefaults = step.enhanceAndExtract(MAT.Operation.XMLOpArgumentAggregator(step.runSettings),
                                              reportDefaults = True)
        self.assertEqual(xmlWDefaults, {'probe_b_list': ['b_val_1'],
                                        'probe_e_list': [],
                                        'probe_a': 'probe_value_a',
                                        'probe_c': True,
                                        'probe_d': None,
                                        'probe_f': False,
                                        'probe_g': None})

    def testXMLAttrs(self):
        step = self.task.getStep("Probe", "probe")
        xmlWDefaults = step.enhanceAndExtract(MAT.Operation.XMLOpArgumentAggregator(step.runSettings), reportDefaults = True)
        xmlWODefaults = step.enhanceAndExtract(MAT.Operation.XMLOpArgumentAggregator(step.runSettings))
        self.assertEqual(xmlWDefaults, {'probe_b_list': ['b_val_1'],
                                        'probe_e_list': [],
                                        'probe_a': 'probe_value_a',
                                        'probe_c': True,
                                        'probe_d': None,
                                        'probe_f': False,
                                        'probe_g': None})
        self.assertEqual(xmlWODefaults, {'probe_b_list': ['b_val_1'],
                                         'probe_c': True,
                                         'probe_a': 'probe_value_a'})
        
    def testXMLEnhance(self):
        step = self.task.getStep("Probe", "probe")
        xmlWDefaults = step.enhanceAndExtract(MAT.Operation.XMLOpArgumentAggregator(step.runSettings), reportDefaults = True, probe_a = 5, probe_f = True)
        xmlWODefaults = step.enhanceAndExtract(MAT.Operation.XMLOpArgumentAggregator(step.runSettings), probe_a = 5, probe_f = True)
        self.assertEqual(xmlWDefaults, {'probe_b_list': ['b_val_1'],
                                        'probe_e_list': [],
                                        'probe_a': 'probe_value_a',
                                        'probe_c': True,
                                        'probe_d': None,
                                        'probe_f': True,
                                        'probe_g': None})
        self.assertEqual(xmlWODefaults, {'probe_b_list': ['b_val_1'],
                                         'probe_c': True,
                                         'probe_f': True,
                                         'probe_a': 'probe_value_a'})

    def testProgressiveWithDefaults(self):
        step = self.task.getStep("Probe", "probe")
        aggr = MAT.Operation.XMLOpArgumentAggregator(step.runSettings)
        xmlWDefaults = step.enhanceAndExtract(aggr, reportDefaults = True, probe_g = "xml-inline")
        self.assertTrue(aggr.parser.get_option("--xml_input_is_overlay"))
        self.assertEqual(xmlWDefaults, {'probe_b_list': ['b_val_1'],
                                        'probe_e_list': [],
                                        'probe_a': 'probe_value_a',
                                        'probe_c': True,
                                        'probe_d': None,
                                        'probe_f': False,
                                        'probe_g': 'xml-inline',
                                        'xml_input_is_overlay': False,
                                        'xml_output_exclude_metadata': False,
                                        'xml_translate_all': False,
                                        'xml_output_tag_exclusions': None,
                                        'signal_is_xml': False})

    def testProgressiveWithoutDefaults(self):
        step = self.task.getStep("Probe", "probe")
        aggr = MAT.Operation.XMLOpArgumentAggregator(step.runSettings)
        xmlWODefaults = step.enhanceAndExtract(aggr, probe_g = "xml-inline")
        self.assertTrue(aggr.parser.get_option("--xml_input_is_overlay"))
        self.assertEqual(xmlWODefaults, {'probe_b_list': ['b_val_1'],
                                         'probe_c': True,
                                         'probe_g': 'xml-inline',
                                         'probe_a': 'probe_value_a'})    

    # OK, even more sophisticated. Use the defaults to mention something in the nondefaults,
    # and override.

    def testProgressiveInteraction(self):
        step = self.task.getStep("Probe", "probe")        
        aggr = MAT.Operation.XMLOpArgumentAggregator({"probe_a": "probe_value_w",
                                                      "probe_c": "yes",
                                                      "probe_b": "b_val_2",
                                                      "signal_is_xml": "yes"})
        xmlWDefaults = step.enhanceAndExtract(aggr, reportDefaults = True)
        # Shouldn't have any of the xml keys.
        self.assertEqual(xmlWDefaults, {'probe_b_list': ['b_val_2'],
                                        'probe_e_list': [],
                                        'probe_a': 'probe_value_w',
                                        'probe_c': True,
                                        'probe_d': None,
                                        'probe_f': False,
                                        'probe_g': None})
        aggr = MAT.Operation.XMLOpArgumentAggregator({"probe_a": "probe_value_w",
                                                      "probe_c": "yes",
                                                      "probe_b": "b_val_2",
                                                      "signal_is_xml": "yes"})
        xmlWDefaults = step.enhanceAndExtract(aggr, reportDefaults = True, probe_g = "xml-inline")
        self.assertEqual(xmlWDefaults, {'probe_b_list': ['b_val_2'],
                                        'probe_e_list': [],
                                        'probe_a': 'probe_value_w',
                                        'probe_c': True,
                                        'probe_d': None,
                                        'probe_f': False,
                                        'probe_g': 'xml-inline',
                                        'xml_input_is_overlay': False,
                                        'xml_output_exclude_metadata': False,
                                        'xml_translate_all': False,
                                        'xml_output_tag_exclusions': None,
                                        'signal_is_xml': True})
