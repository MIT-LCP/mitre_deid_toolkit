/* Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
file LICENSE for license terms. */

/* Adding a step specifically for HIPAA redaction. */

(function () {

  // Now, I have to update the configuration, because I can't
  // have multiple configurations with different names.
  // We're guaranteed that this will be loaded after
  // deidentification enhancements.

  MAT.TaskConfig.Deidentify.copySteps(MAT.CoreTask.cleanStepEnhancement);
}());
