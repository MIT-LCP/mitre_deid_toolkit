# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from ReplacementEngine import *
from ClearReplacementStrategy import *

# First, the strategies.

class BracketDigestionStrategy(DigestionStrategy):

    # Override the digestion for everything.
    
    def Digest(self, *args, **kw):
        pass

    # Searches for the things that the rendering strategy produced.

    def FindReplacedElements(self, s, tags):
        PAT = re.compile("\[(" + "|".join(tags) + ")\]")
        return [(m.start(), m.end(), m.group(1)) for m in PAT.finditer(s)]

class BracketRenderingStrategy(RenderingStrategy):

    # Override the rendering for everything.

    def Replace(self, pattern, **kw):
        return "[" + pattern.replacer.label + "]"

# Now, the engines.
    
class BracketReplacementEngine(PIIReplacementEngine):

    __rname__ = "clear -> [ ]"

    def createDigestionStrategy(self):
        return ClearDigestionStrategy(self)

    def createRenderingStrategy(self):
        return BracketRenderingStrategy(self)

class BracketResynthesisEngine(PIIReplacementEngine):

    __rname__ =  "[ ] -> clear"

    def createDigestionStrategy(self):
        return BracketDigestionStrategy(self)

    def createRenderingStrategy(self):
        return ClearRenderingStrategy(self)
