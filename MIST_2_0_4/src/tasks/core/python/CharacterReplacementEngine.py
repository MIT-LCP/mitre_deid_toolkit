# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from ReplacementEngine import *
from ReplacementEngine import _IDReplace
from ClearReplacementStrategy import *

# First, the rendering strategy.

class CharacterReplacementRenderingStrategy(RenderingStrategy):

    # Override the rendering for everything.

    def Replace(self, pattern, **kw):
        return _IDReplace(pattern.input)

# Now the engine.
        
class CharacterReplacementEngine(PIIReplacementEngine):

    __rname__ = "clear -> char repl"

    def createDigestionStrategy(self):
        return ClearDigestionStrategy(self)

    def createRenderingStrategy(self):
        return CharacterReplacementRenderingStrategy(self)
