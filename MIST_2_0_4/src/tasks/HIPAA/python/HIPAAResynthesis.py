# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

#
# Resynthesis
#

from DEIDStyleReplacementEngine import *
from ClearReplacementStrategy import *
from ReplacementEngine import *
from ReplacementEngine import _IDReplace
import random

class HInitialsPattern(PIIPattern):
    __ctype__ = "INITIALS"

class HClearRenderingStrategy(ClearRenderingStrategy):

    def INITIALSReplace(self, pattern, **kw):
        return _IDReplace("A" * random.randint(2, 3))
    
H_CATEGORIES = {"NAME": (PIIPersonPattern, {}),
                "INITIALS": (HInitialsPattern, {}),
                "LOCATION": (PIILocationPattern, {}),
                "DATE": (PIIDatePattern, {}),
                "AGE": (PIIAgePattern, {}),
                "PHONE": (PIIPhonePattern, {}),
                "EMAIL": (PIIEmailPattern, {}),
                "SSN": (PIISSNPattern, {}),
                "IDNUM": (PIIIDPattern, {}),
                "URL": (PIIURLPattern, {}),
                "IPADDRESS": (PIIIPAddressPattern, {}),
                "HOSPITAL": (PIIHospitalPattern, {}),
                "OTHER": (PIIOtherPattern, {})
                }

class HIPAADEIDStyleResynthesisEngine(DEIDStyleResynthesisEngine):

    deidPattern = "\*\*(%s)(\<([^>]+)\>)?"

    def createRenderingStrategy(self):
        return HClearRenderingStrategy(self)

# And now, bracket resynthesis.

from BracketReplacementEngine import *

class HIPAABracketResynthesisEngine(BracketResynthesisEngine):

    def createRenderingStrategy(self):
        return HClearRenderingStrategy(self)

#
# Deidentification
#

# Most of the tags I don't know what to do with can be replaced
# pretty straighforwardly.

from ReplacementEngine import *

class HIPAAClearReplacementEngine(ClearReplacementEngine):

    def createRenderingStrategy(self):
        return HClearRenderingStrategy(self)

class HIPAADEIDStyleReplacementEngine(DEIDStyleReplacementEngine):

    bracketPair = ("<", ">")
