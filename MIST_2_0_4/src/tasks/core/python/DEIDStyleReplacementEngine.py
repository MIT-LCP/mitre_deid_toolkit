# The DE-ID format, or versions of it, is commonly used in medical
# deidentification. This core facility takes care of the central capabilities.
# Most DE-ID tags are like this:
#
# **EMAIL
#
# But some of them have additional content, like this:
#
# **DATE<5/7/09>
#
# Sometimes they're square brackets instead of angle brackets.
# There are also default forms for the content.

import re, random

from ReplacementEngine import *
from ReplacementEngine import _IDReplace
from ClearReplacementStrategy import *

#
# Rendering
#

import string

# This is complicated. It inherits some of its rendering behavior
# from the clear replacement strategy - and needs to override some
# of its methods, for person replacement - but otherwise, it's
# its own thing.

class DEIDStyleRenderingStrategy(ClearRenderingStrategy):

    def __init__(self, engine):
        ClearRenderingStrategy.__init__(self, engine)
        self.lBracket, self.rBracket = engine.bracketPair
        self.P_NAME_INDEX = 0
        self.P_INIT_INDEX = 0

    def Replace(self, pattern, **kw):
        mName = pattern.__ctype__ + "Replace"
        doIt = False
        if hasattr(self, mName):
            # This is ugly. I need to inherit some behavior
            # from the ClearRenderingStrategy, but ONLY
            # some of it. If the class the method is defined
            # on isn't a child of THIS ROOT CLASS, then
            # we need to punt. But the only way to find that out
            # is to have a "new-style" class and search the
            # __mro__ list. So I've made the parents new-style
            # classes.
            # I can't simply pick the methods that are defined
            # here to let through, since children of this class
            # might also define something.
            for c in self.__class__.__mro__:
                # It's gotta be in a local dictionary. hasattr()
                # handles inheritance. If we pass DEIDStyleRenderingStrategy
                # in the list, and we haven't found the entry,
                # then we punt.
                if c.__dict__.has_key(mName):
                    doIt = True
                    break
                if c is DEIDStyleRenderingStrategy:
                    break
        if doIt:
            return getattr(self, mName)(pattern, **kw)            
        else:
            return "**" + pattern.replacer.label

    def _wrap(self, pattern, content):
        return "**" + pattern.replacer.label + self.lBracket + content + self.rBracket

    # People.

    def _nextName(self):
        s = string.uppercase[self.P_NAME_INDEX] * 3
        self.P_NAME_INDEX = (self.P_NAME_INDEX + 1) % 26
        return s

    def _nextInit(self):
        s = string.uppercase[self.P_INIT_INDEX]
        self.P_INIT_INDEX = (self.P_INIT_INDEX + 1) % 26
        return s

    def _PERSONReplacementSeed(self, pattern):
        # We need a first and a last name. We MIGHT need
        # middle names.
        return {"firstNameAlts": [self._nextName()],
                "middleNames": None,
                "lastName": self._nextName()}

    def _getRSMiddleNames(self, seed, numNames):
        if seed["middleNames"] is None:
            seed["middleNames"] = []
        while len(seed["middleNames"]) < numNames:
            seed["middleNames"].append(self._nextName())
        return seed["middleNames"][:numNames]

    def PERSONReplace(self, pattern, **kw):
        # Hm. What do we do here? Exactly what we
        # do otherwise. We just need to make sure that
        # the pattern is marked for all upper. And
        # the user has to use the DEIDPersonCategory.
        pattern.cap_status = ALL_UPPER
        return self._wrap(pattern, ClearRenderingStrategy.PERSONReplace(self, pattern, **kw))

    def AGEReplace(self, pattern, **kw):
        # Presuming that we have some coherent age.
        # If the upper bound and lower bound are not the
        # same, then we have to pick some seed.
        ageSeed = None
        if pattern.ageUb == pattern.ageLb:
            ageSeed = pattern.ageUb
        elif int(pattern.ageUb) / 10 == int(pattern.ageLb) / 10:
            # They're in the same decade.
            ageSeed = pattern.ageLb
        else:
            ageSeed = random.randint(pattern.ageUb, pattern.ageLb)
        if ageSeed < 13:
            return self._wrap(pattern, "birth-12")
        elif ageSeed < 20:
            return self._wrap(pattern, "in teens")
        elif ageSeed > 89:
            return self._wrap(pattern, "90+")
        else:
            return self._wrap(pattern, "in %d0s" % (int(ageSeed) / 10))

    def DATEReplace(self, pattern, **kw):
        return self._wrap(pattern, ClearRenderingStrategy.DATEReplace(self, pattern, **kw))

class DEIDStyleReplacementEngine(PIIReplacementEngine):

    __rname__ = "clear -> DE-ID"

    bracketPair = ("", "")

    def createDigestionStrategy(self):
        return ClearDigestionStrategy(self)

    def createRenderingStrategy(self):
        return DEIDStyleRenderingStrategy(self)

#
# Digestion
#

# We may have to do some date digestion, using the clear
# digester.

class DEIDStyleDigestionStrategy(DigestionStrategy):
    
    def __init__(self, engine):        
        DigestionStrategy.__init__(self, engine)
        self.deidPattern = engine.deidPattern
        tags = engine.categories.keys()
        self.patDict = {}
        self.replPat = re.compile(self.deidPattern % "|".join(tags))
        for tag in tags:
            self.patDict[tag] = re.compile(("^" + self.deidPattern + "$") % tag)
        self.dateDigester = None

    def canCache(self, ctype):
        return ctype in ["PERSON", "DATE", "AGE"]

    def FindReplacedElements(self, s, tags):
        return [(m.start(), m.end(), m.group(1)) for m in self.replPat.finditer(s)]

    # We can get something out of names, ages, and dates.
    
    # The name looks like this:
    # **NAME<VVV>, **NAME<WWW Q. XXX>
    # **NAME<SSS RRR QQQ PPP>

    # Most of this is identical to PIIPersonCategory.Digest.
    # Once we digest, the replacement should be identical to the parent,
    # since we're working off the pattern.

    INITPAT = re.compile("^[A-Z][.]?$")
    
    def PERSONDigest(self, pat, seed):
        p = self.patDict[pat.replacer.label]
        m = p.match(seed)
        name = m.group(3)
        pat.cap_status = MIXED
        # There will be no name extension.
        pat.name_ext = ""
        # Default is not to invert. Only invert
        # if you find a reason to. Ditto one name.
        pat.last_is_first = False
        pat.one_name = False
        toks = name.split()
        if len(toks) == 1:
            pat.one_name = True
            middleNames = []
            firstName = lastName = toks[0]
        else:
            firstName = toks[0]
            lastName = toks[-1]
            middleNames = toks[1:-1]
        firstNameAlts = [firstName]
        pat.mid_initials = []
        for m in middleNames:
            if self.INITPAT.match(m) is not None:
                pat.mid_initials.append(True)
            else:
                pat.mid_initials.append(False)
        
        # Finally, set the replacement keys.
        
        # Any of the following can invoke the cache. Don't
        # forget case insensitivity.

        allKeys = [(None, lastName.upper())]
        for firstName in firstNameAlts:
            allKeys = allKeys + [(firstName.upper(), lastName.upper()),
                                 (firstName.upper(), None)]
        pat.setReplacementCacheKeys(allKeys)

    # Possibilities: **AGE<in 30s> **AGE<birth-12> **AGE<in teens> **AGE<90+>

    AGE_RE = re.compile("^in\s+(.*)s$")
    
    def AGEDigest(self, pat, seed):
        p = self.patDict[pat.replacer.label]
        m = p.match(seed)
        if m is not None:
            age = m.group(3)
            if age == "birth-12":
                pat.ageLb = 0
                pat.ageUb = 12
            elif age == "in teens":
                pat.ageLb = 13
                pat.ageUb = 19
            elif age == "90+":
                pat.ageLb = 90
                pat.ageUb = 120
            else:
                m = self.AGE_RE.match(age)
                if m:
                    pat.ageLb = int(m.group(1))
                    pat.ageUb = pat.ageLb + 9
        pat.spell = False

    def DATEDigest(self, pat, seed):
        p = self.patDict[pat.replacer.label]
        m = p.match(seed)
        if m is not None:
            seed = m.group(3)
        if self.dateDigester is None:
            self.dateDigester = ClearDigestionStrategy(self.engine)
        self.dateDigester.DATEDigest(pat, seed)
    
class DEIDStyleResynthesisEngine(PIIReplacementEngine):

    __rname__ = "DE-ID -> clear"
    
    deidPattern = None

    def createDigestionStrategy(self):
        return DEIDStyleDigestionStrategy(self)

    def createRenderingStrategy(self):
        return ClearRenderingStrategy(self)
