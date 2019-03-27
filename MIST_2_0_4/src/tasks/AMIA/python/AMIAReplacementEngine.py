# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# Specializing the replacement engine for AMIA.

from ReplacementEngine import *
from ReplacementEngine import _IDReplace
from ClearReplacementStrategy import *

# The seed could be initials, or a room number, or
# a full name. Always cache a full name as the replacement. If it's initials,
# then return initials; if it's a full name, generate a replacement, and
# then cache mapping from the initials as well. 

class AMIAPIIHospitalPattern(PIIHospitalPattern):

    def __init__(self, *args, **kw):
        PIIHospitalPattern.__init__(self, *args, **kw)
        self._digestPatternDesc({"isRoomNumber": None})

    def finish(self, overrideDict = None):
        PIIHospitalPattern.finish(self, overrideDict)
        if self.isRoomNumber is None:
            self.isRoomNumber = False
    
# In AMIA, the doctor differs from the person in two ways. First, it
# might be a sequence of lowercase letters, in which case it's
# the initials of a doctor; the original code replaces this without
# cacheing it. In the second case, it's a record of a doctor plus
# the medical transcriber, e.g., vf / mcg, in which case the
# doctor is replaced, but the TRANSCRIPTION NAME mapping is cached. I'm
# not sure why there's this distinction. I need a second cache, then,
# because I need to read in, and get out, the transcriber, but generate
# the doctor randomly. Grrr.

class AMIADoctorReplacer(PIIPersonReplacer):

    def __init__(self, engine, *args, **kw):
        PIIPersonReplacer.__init__(self, engine, *args, **kw)
        # For some reason, the original doctor stuff doesn't
        # flush the transcriber at the document boundaries.
        self.transcriptionCache = PIIPatternReplacer(engine, PIIIDPattern, self.label,
                                                     use_cache = True,
                                                     pattern_source = PS_SELF,
                                                     flush_cache_at_doc_boundary = False)

    # Make sure all the recursion happens.

    def EndDocumentForReplacement(self):
        PIIPersonReplacer.EndDocumentForReplacement(self)
        self.transcriptionCache.EndDocumentForReplacement()

    def EndDocumentForDigestion(self):
        PIIPersonReplacer.EndDocumentForDigestion(self)
        self.transcriptionCache.EndDocumentForDigestion()

    def EndDigestion(self):
        PIIPersonReplacer.EndDigestion(self)
        self.transcriptionCache.EndDigestion()

# The doctor category requires the doctor replacer above. Its secret is
# to use the transcription cache for the second dimension of the
# transcriber.

class AMIAPIIDoctorPattern(PIIPersonPattern):

    __replacer__ = AMIADoctorReplacer

    __ctype__ = "DOCTOR"

    def __init__(self, *args, **kw):
        PIIPersonPattern.__init__(self, *args, **kw)
        self._digestPatternDesc({"isDoctorInitials": None, "transcriberToks": None})

    def finish(self, overrideDict = None):
        PIIPersonPattern.finish(self, overrideDict)
        if self.isDoctorInitials is None:
            self.isDoctorInitials = False
    
# Corresponding strategies.

class AMIAClearDigestionStrategy(ClearDigestionStrategy):

    # Hospitals.
    
    # The notion of room number and abbreviation as AMIA knows it.

    def HOSPITALDigest(self, pat, seed):
        ClearDigestionStrategy.HOSPITALDigest(self, pat, seed)
        pat.isRoomNumber = self._isRoomNumber(seed)
        # If it's a room number, clear the replacement keys.
        if pat.isRoomNumber:
            pat.setReplacementCacheKeys([])
    
    SOMEDIGIT = re.compile("[0-9]")    

    def _isRoomNumber(self, seed):
        toks = seed.split("-")
        return len(toks) == 2 and self.SOMEDIGIT.search(toks[0]) and self.SOMEDIGIT.search(toks[1])

    # Doctors.
    
    LC_INITS = re.compile("^[a-z]{1,3}$")
    
    def DOCTORDigest(self, pat, seed):
        if self.LC_INITS.match(seed):
            pat.isDoctorInitials = True
        elif seed.lower() == seed and '/' in seed:
            toks = seed.split("/", 1)
            pat.transcriberToks = (toks[0].strip(), toks[1].strip())
        else:
            self.PERSONDigest(pat, seed)
    

class AMIAClearRenderingStrategy(ClearRenderingStrategy):

    def HOSPITALReplace(self, pattern, **kw):
        if pattern.isRoomNumber:
            return _IDReplace(pattern.input)
        else:
            return ClearRenderingStrategy.HOSPITALReplace(self, pattern, **kw)
    
    def DOCTORReplace(self, pattern, **kw):
        if pattern.isDoctorInitials:
            return _IDReplace(pattern.input)
        elif pattern.transcriberToks is not None:
            # Note I have to tell the category that it should use the pattern, because
            # the category isn't created by the replacer.
            return _IDReplace(pattern.transcriberToks[0]) + " / " + \
                   pattern.replacer.transcriptionCache.Replace(PIIIDPattern(pattern.replacer,
                                                                            pattern.transcriberToks[1]))
        else:
            return self.PERSONReplace(pattern, **kw)

# Main engine.

AMIA_CATEGORIES = {"PHONE": (PIIPhonePattern, {}),
                   "ID": (PIIIDPattern, {}),
                   "HOSPITAL": (AMIAPIIHospitalPattern, {}),
                   "LOCATION": (PIILocationPattern, {}),
                   "AGE": (PIIAgePattern, {}),
                   "DATE": (PIIDatePattern, {}),
                   "PATIENT": (PIIPersonPattern, {}),
                   "DOCTOR": (AMIAPIIDoctorPattern, {})}

class AMIAPIIReplacementEngine(ClearReplacementEngine):

    def createDigestionStrategy(self):
        return AMIAClearDigestionStrategy(self)

    def createRenderingStrategy(self):
        return AMIAClearRenderingStrategy(self)

# DE-ID.

from DEIDStyleReplacementEngine import *

class AMIADEIDStyleRenderingStrategy(DEIDStyleRenderingStrategy):

    DOCTORReplace = DEIDStyleRenderingStrategy.PERSONReplace
    PATIENTReplace = DEIDStyleRenderingStrategy.PERSONReplace

class AMIADEIDReplacementEngine(DEIDStyleReplacementEngine):

    bracketPair = ("[", "]")

    def createRenderingStrategy(self):
        return AMIADEIDStyleRenderingStrategy(self)

    def createDigestionStrategy(self):
        return AMIAClearDigestionStrategy(self)

class AMIADEIDStyleDigestionStrategy(DEIDStyleDigestionStrategy):

    def canCache(self, ctype):
        return ctype in ["PATIENT", "DOCTOR"] or \
               DEIDStyleDigestionStrategy.canCache(self, ctype)

    DOCTORDigest = DEIDStyleDigestionStrategy.PERSONDigest
    PATIENTDigest = DEIDStyleDigestionStrategy.PERSONDigest

class AMIADEIDResynthesisEngine(DEIDStyleResynthesisEngine):

    deidPattern = "\*\*(%s)(\[([^]]+)\])?"

    def createRenderingStrategy(self):
        return AMIAClearRenderingStrategy(self)

    def createDigestionStrategy(self):
        return AMIADEIDStyleDigestionStrategy(self)

# Standalone engine, as an example.

class AMIAStandaloneReplacementEngine(StandaloneReplacementEngine):

    def __init__(self):
        import BracketReplacementEngine, CharacterReplacementEngine
        StandaloneReplacementEngine.__init__(self, 
                                             dict([(c.__rname__, c) for c in [AMIAPIIReplacementEngine,
                                                                              AMIADEIDReplacementEngine,
                                                                              AMIADEIDResynthesisEngine,
                                                                              BracketReplacementEngine.BracketReplacementEngine,
                                                                              BracketReplacementEngine.BracketResynthesisEngine,
                                                                              CharacterReplacementEngine.CharacterReplacementEngine]]),
                                             AMIA_CATEGORIES)
