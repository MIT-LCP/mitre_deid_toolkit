# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# This file is loaded in a context which provides access to
# the MAT_distutils module.

# This file can contain two functions:

# distribute(taskDir, manifestDict, bundleDir, **kw)
#   taskDir: the directory on disk, OUTSIDE THE BUNDLE, which contains
#     the task which is being included in the bundle
#   manifestDict: a MATManifest object, as defined in <MAT_home>/build/MAT_distutils.py
#   bundleDir: the root of the bundle being built
#   kw: whatever features may have been passed in from build_tarball.

# install(taskDir, buildSettings, platform, bundleDir)
#   taskDir: the directory in the bundle which contains this task
#   buildSettings: a dictionary of build settings, containing the 
#     values that will be saved to MAT_config.settings, as well as
#     possible values for "GNU make", "GCC" (depending on the platform)
#   platform: the value of THIS_PLATFORM in install.py
#   bundleDir: the root of the bundle

import sys, os

def distribute(taskDir, manifestDict, bundleDir, include_model = False):
    # Let's look for the "installation_support" module in the
    # deidentification core, which needs to be distributed with this module.
    sys.path.insert(0, os.path.join(bundleDir, "src", "tasks", "core"))
    import installation_support
    
    # What we need is to make sure we have all the
    # Carafe models and lexicons.
    if include_model:
        installation_support.saveCarafeResources(taskDir, bundleDir)

def install(taskDir, buildSettings, platform, bundleDir):
    # Let's look for the "installation_support" module in the
    # deidentification core, which needs to be distributed with this module.
    sys.path.insert(0, os.path.join(bundleDir, "src", "tasks", "core"))
    import installation_support
    
    # During install, we might need to change the task.xml file.
    installation_support.buildDeidentificationAppAndModifySettings(taskDir, buildSettings, bundleDir)
