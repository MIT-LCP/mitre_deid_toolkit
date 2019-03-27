# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# This file implements the digestion and rendering strategies for
# clear text. I was going to put it in the same file as the replacement
# engine, but I realized it would be easier to switch between buffers
# than to switch between places in the same buffer when putting these
# things together.

import re, random, string, datetime, os

from ReplacementEngine import DigestionStrategy, RenderingStrategy, \
     _urlparse, _IDReplace, PIIReplacementEngine, \
     ALL_UPPER, ALL_LOWER, MIXED, PS_SELF, numToWords

class ClearDigestionStrategy(DigestionStrategy):

    def canCache(self, ctype):
        return True

    # Analyze the phone number.
    
    # The seed is the input. The input may or may not
    # match any of the known patterns, and if it does,
    # it may have stuff
    # leading or trailing (whitespace, punctuation), which
    # we should preserve if we can.

    PHONE_PATS = [(re.compile("\((\d{3})\)\s*(\d{3})-(\d{4})"), True, False, True),
                  (re.compile("\(\s+(\d{3})\s+\)\s*(\d{3})-(\d{4})"), True, True, True),
                  (re.compile("(\d{3})-(\d{3})-(\d{4})"), False, False, True),
                  # Added something that will match nothing in the beginning,
                  # to make sure that everything has the same number of matches.
                  (re.compile("(.*?)(\d{3})-(\d{4})"), False, False, True)]

    def PHONEDigest(self, pat, seed):
        for p, hasParens, hasParenWS, hasAreaCode in self.PHONE_PATS:
            m = p.search(seed)
            if m is not None:
                pat.preS = seed[:m.start()]
                pat.postS = seed[m.end():]
                # Create the pattern as we go along.
                pat.area_code = hasAreaCode
                pat.ac_paren = hasParens
                pat.ac_paren_ws = hasParenWS
                areaCode, exchange, numbr = m.groups()
                if not hasAreaCode:
                    areaCode = None
                pat.parse = {"exchange": exchange, "areaCode": areaCode, "number": numbr}
                return
        pat.seed_unparseable = True

    def URLDigest(self, pat, seed):
        try:
            scheme, hostname, port, path, params, query, frag = _urlparse(seed)
            if port is not None:
                pat.port = True
            if path:
                pat.path_tail = True
        except:
            pat.seed_unparseable = True

    def EMAILDigest(self, pat, seed):

        try:
            pat.name = re.match("^(.*)@", seed).group(1)
        except:
            pat.seed_unparseable = True

    def IDDigest(self, pat, seed):
        pat.template = seed

    def AGEDigest(self, pat, seed):

        # The age is a digit, somewhere in the string. Get a new
        # age, and replace the digit. If the year is spelled out,
        # we're hosed. Just hallucinate a number and format it.
        
        m = re.search("\d+", seed)
        if m is not None:
            ageSeed = int(m.group())
            pat.ageLb = pat.ageUb = ageSeed
            pat.preS = seed[:m.start()]
            pat.postS = seed[m.end():]

    def DATEDigest(self, pat, seed):

        # sys.path was augmented when the replacement engine was created.
        # Import here rather than earlier because we need
        # path information which may not be available at module load
        import dateutil.parser
        try:
            pat.dateObj = dateutil.parser.digest(seed)
            pat.deltaDay = 0
            pat._fillPattern(pat.dateObj)
        except (ValueError, IndexError, AssertionError):
            # This used to be ValueError, but all sorts of other
            # errors can arise when bad parsing happens.
            # print "Couldn't digest " + seed        
            # In the deidentified AMIA data, some of the dates are
            # holiday names. I'm pretty sure that's never going to
            # happen in real data.
            pat.seed_unparseable = True
    
    ZCPAT = re.compile("^[0-9]{5}(-[0-9]{4})?$")

    # The location digester gets used in a number of circumstances,
    # when its frequencies have been updated to rule out particular
    # options.

    def LOCATIONDigest(self, pat, seed):

        pat.parse = {"streetNum": None,
                     "addressToks": [],
                     "cityToks": [],
                     "state": None,
                     "zipCode": None}

        pat.state_type = -1
        
        toks = seed.split()

        # We need to make a toplevel decision about every one of the
        # toplevel features: zip, state, city, street.

        recognizeZip = recognizeState = recognizeCity = recognizeStreet = True
        
        # If the last element is a zip code, the zip code is present.
        if pat.recognizeOnly is not None:
            if "zip" not in pat.recognizeOnly:
                recognizeZip = False
            if "state" not in pat.recognizeOnly:
                recognizeState = False
            if "city" not in pat.recognizeOnly:
                recognizeCity = False
            if "street" not in pat.recognizeOnly:
                recognizeStreet = False
        
        if recognizeZip and toks and self.ZCPAT.match(toks[-1]):
            pat.zip = True
            pat.parse["zipCode"] = toks[-1]
            toks[-1:] = []
        else:
            pat.zip = False

        pat.state = False
        if recognizeState:
            # Peel off the state, if possible. It might be as many as three tokens.
            states = self.repository.loadStates()
            for i in range(1, 4):
                if len(toks) >= i:
                    # There might be commas somewhere in the token list.
                    possibleState = " ".join(toks[-i:])
                    possibleStateNoCommas = possibleState.replace(",", "")
                    eList = states.lookUp(possibleStateNoCommas)
                    if eList:
                        # Pick the first way of matching.
                        how, e = eList[0]
                        pat.state = True
                        pat.parse["state"] = possibleStateNoCommas
                        try:
                            pat.state_type = pat.STATE_KEY_ORDER.index(how)
                        except ValueError:
                            pat.state_type = -1
                        if possibleStateNoCommas != possibleState:
                            pat.state_comma = True
                        toks[-1:] = []
                        break

            # Now we've gotten the state and the zip.
            # There may have been a comma standalone between state and city.

            if recognizeCity:
                if toks and toks[-1] == ",":
                    pat.city_comma = True
                    toks[-1:] = []
                elif toks and toks[-1][-1] == ",":
                    pat.city_comma = True
                    toks[-1] = toks[-1][:-1].strip()                
        
        # Next, we separate the street from the city by looking for
        # the street postfix. There may be a comma in here, too,
        # between the street postfix and the city.

        addressToks = []

        pat.city = False
        
        if recognizeCity:

            cityToks = toks     

            # Here's a perverse case. Let's say the address
            # BEGINS with something that looks like a street postfix.
            # The punch line is that if recognizeStreet is true,
            # we want to look for the postfix, but ONLY with tokens
            # 1 through n; starting at token 0 gives you this perverse
            # case.
            
            if recognizeStreet:
                phash = pat.replacer.getPostfixHash()
                i = 1
                while i < len(cityToks):
                    cand = cityToks[i]
                    lowerCand = cand.lower()
            
                    if phash.has_key(lowerCand):
                        streetPostfix = phash[lowerCand]
                        pat.street_postfix = True
                        if cand[-1] == ",":
                            cand = cand[:-1]
                            pat.street_comma = True
                        if cand[-1] == ".":
                            pat.street_postfix_abbr = True
                            pat.abbr_has_period = True
                        elif cand.lower() != streetPostfix[0]:
                            pat.street_postfix_abbr = True
                        addressToks = cityToks[:i]
                        cityToks = cityToks[i + 1:]
                        if cityToks and cityToks[0] == ",":
                            # There may be a standalone comma,
                            cityToks[0:1] = []
                        break
                    i += 1

            pat.city = len(cityToks) > 0
            pat.parse["cityToks"] = cityToks[:]

        else:

            addressToks = toks

        # Finally, look for a street number.

        pat.street = False
        if recognizeStreet:

            if addressToks:
                # Looking for a number of some sort. 
                for c in addressToks[0]:
                    if c in string.digits:
                        streetNum = addressToks[0]
                        pat.parse["streetNum"] = streetNum
                        pat.street_num = True
                        addressToks[0:1] = []
                        pat.replacer.streetNumSeeds.append(streetNum)
                        break

            pat.street = len(addressToks) > 0
            pat.parse["addressToks"] = addressToks[:]

    def COUNTRYDigest(self, pat, seed):
        pass

    EXTPAT = re.compile("\s*((,\s*III)|(,\s*JR[.]?)|(\s+III))$")
    INITPAT = re.compile("^[A-Z][.]?$")
    ANY_WHITESPACE = re.compile("\s")
    
    def PERSONDigest(self, pat, seed):
        pat.name_ext = ""
        if seed.upper() == seed:
            pat.cap_status = ALL_UPPER
        elif seed.lower() == seed:
            pat.cap_status = ALL_LOWER
        else:
            pat.cap_status = MIXED
        firstName, lastName, middleNames = self._PERSONAnalyze(pat, seed)
        # Try to figure out the gender.
        upFirstName = firstName.upper()
        gender = "N"
        oneNameIsKnown = False
        h = self.repository.getFirstNameHash()
        try:
            gender, ignore, firstNameAlts = self.repository.getFirstNameHash()[upFirstName]
            oneNameIsKnown = True
        except KeyError:
            firstNameAlts = [firstName]
            gender = "N"
        pat.gender = gender
        if pat.one_name:
            pat.one_name_is_known_first_name = oneNameIsKnown
        
        pat.parse = {"firstName": firstName, "lastName": lastName, "middleNames": middleNames}

        # Check the middle initials.

        pat.mid_initials = []
        for m in middleNames:
            if self.INITPAT.match(m) is not None:
                pat.mid_initials.append(True)
            else:
                pat.mid_initials.append(False)

        # Finally, set the replacement keys.
        
        # Any of the following can invoke the cache. Don't
        # forget case insensitivity. But it's pretty important
        # to ensure that if there are two names which share
        # a first or last name, but not both, you don't
        # accidently get the same name back. See PERSONReplace
        # below. The algorithm probably has to be that we look
        # up the longest entry. So if you say Bob E. Cox, Bob Cox
        # will refer, but if you say Bob Cox, Bob E. Cox won't.

        mTuple = tuple(middleNames)        
        allKeys = [(lastName.upper(),)]
        for firstName in firstNameAlts:
            allKeys.append((firstName.upper(),))
            if not pat.one_name:
                allKeys = allKeys + [(firstName.upper(), lastName.upper()),
                                     (firstName.upper(),) + mTuple + (lastName.upper(),)]
        pat.setReplacementCacheKeys(allKeys)

    # I need this in other places.
    
    def _PERSONAnalyze(self, pat, seed):

        m = self.EXTPAT.search(seed)
        if m is not None:
            name = seed[:m.start()]
            pat.name_ext = m.group().strip()
        else:
            name = seed
        lastName = None
        firstName = None
        middleNames = []
        # Default is not to invert. Only invert
        # if you find a reason to. Ditto one name.
        pat.last_is_first = False
        pat.one_name = False
        if (',' in name) and name[name.find(",")+1:].strip():
            # Last name, first name. If there's
            # a weird tagging problem, you have
            # to check to make sure that the comma
            # isn't at the end.
            pat.last_is_first = True
            toks = name.split(",", 1)
            lastName = toks[0].strip()
            firstNameToks = toks[1].strip().split()
            firstName = firstNameToks[0]
            middleNames = firstNameToks[1:]
        else:
            m = self.ANY_WHITESPACE.search(name)
            if (m is not None) and name[m.end():].strip():
                toks = name.split()
                firstName = toks[0]
                lastName = toks[-1]
                middleNames = toks[1:-1]
            else:
                pat.one_name = True
                firstName = lastName = name
                middleNames = []

        return firstName, lastName, middleNames

    # No digestion for:
    # PIISSNCategory
    # PIIIPAddressCategory
    # PIIHospitalCategory
    # But we'll have them anyway, for the purposes of inheritance.

    def HOSPITALDigest(self, pat, seed):
        pat.parse = {"hospTokens": seed.split()}
        pat.initials = self._isInitials(seed)        
        # Set the replacement keys, so that the initials and its seed point here.
        if pat.initials:
            pat.setReplacementCacheKeys([seed])
        else:
            pat.setReplacementCacheKeys([seed, pat.replacer._convertToInitials(seed.split())])

    def _isInitials(self, seed):
        return len(seed) <= 3 or \
               (len(seed) <= 5 and (seed.upper() == seed))

    def SSNDigest(self, pat, seed):
        pass

    def IPADDRESSDigest(self, pat, seed):
        pass

    # Other replacement. Pattern is checked for case and
    # initials.

    def OTHERDigest(self, pat, seed):
        if seed.upper() == seed:
            pat.cap_status = ALL_UPPER
            if len(seed.split()) == 1:
                # No whitespace, all caps.
                pat.is_initials = True
        elif seed.lower() == seed:
            pat.cap_status = ALL_LOWER
        else:
            pat.cap_status = MIXED

class ClearRenderingStrategy(RenderingStrategy):

    # First, we attempt to cache a replacement seed
    # somewhere, or something. In some cases, we end up
    # altering the pattern. I suppose we should cache the
    # replacement seed on the pattern. In any case, we have
    # to ensure that this is always, always called.

    def Replace(self, pattern, filename = None, **kw):
        map = self.engine.replacementMap
        if map is not None:
            mapEntry = map.get(os.path.basename(filename))
            if mapEntry is not None:
                labelEntry = mapEntry.get(pattern.replacer.label)
                if labelEntry is not None:
                    # SOMETIMES, Unicode keys aren't handled correctly.
                    # If I pass the string from the CGI script, it seems not
                    # to be happy. But it's digested as JSON no matter what.
                    # So I don't get it.
                    self._possiblyUpdatePattern(pattern, **dict([(u.encode('ascii'), v) for (u, v) in labelEntry.items()]))
        return RenderingStrategy.Replace(self, pattern, **kw)

    def _possiblyUpdatePattern(self, pattern, caseSensitive = False, rules = None):
        # Rules should be a list of lists, where each sublist is a
        # 2-element list where the first element is the antecedent and
        # the second is the consequent. The antecedent might be hierarchically
        # organized. The consequent will have keys for seed and for pattern.
        if rules is not None:
            for rule in rules:
                if len(rule) != 2:
                    print >> sys.stderr, ("Bad replacement rule %s" % str(rule))
                [antecedent, consequent] = rule
                d = pattern.__dict__
                if self._antecedentMatches(antecedent, d, caseSensitive):
                    # See the note about Unicode above.
                    self._applyConsequent(pattern, **dict([(u.encode('ascii'), v) for (u, v) in consequent.items()]))

    def _antecedentMatches(self, antecedent, d, caseSensitive):
        for k, rV in antecedent.items():
            if not d.has_key(k):
                return False
            aV = d[k]
            if type(rV) is dict:
                if type(aV) is not dict:
                    return False
                elif not self._antecedentMatches(rV, aV, caseSensitive):
                    return False
            elif (not caseSensitive) and (type(aV) in (str, unicode)) and \
                 (type(rV) in (str, unicode)) and (aV.lower() == rV.lower()):
                pass
            elif aV != rV:
                return False
        return True

    def _applyConsequent(self, p, seed = None, pattern = None):
        if pattern is not None:
            for k, v in pattern.items():
                setattr(p, k, v)
        if seed is not None:
            if hasattr(p, "seed"):
                p.seed.update(seed)
            else:
                setattr(p, "seed", seed.copy())            

    # Phone.

    def _PHONEReplacementSeed(self, pattern):
        # Pick the phone number. First digit can't be 0 or 1.
        # Pick the number. Format it as four digits.
        seed = {"exchange": random.randint(200, 999),
                "areaCode": None,
                "number": random.randint(0, 9999)}
        if hasattr(pattern, "seed"):
            seed.update(pattern.seed)
        return seed

    # Only get it if it's needed.
    def _getRSAreaCode(self, seed):
        if seed["areaCode"] is None:
            areaCodeList = self.repository.loadAreaCodes()
            seed["areaCode"] = random.choice(areaCodeList)
        return seed["areaCode"]

    def PHONEReplace(self, pattern, **kw):
        # WARNING: getReplacementSeed must be paired with setReplacementCacheKeys
        # to do any good. It's used to store sets of seeds which are variants which
        # should map to the same thing (or the same thing, with output variations).
        # Names are the primary example of this: first name, last name, first + last
        # should all map to the same output seed.
        # Phone numbers don't use setReplacementCacheKeys anywhere that I can
        # see, currently. But it's harmless, so I'm leaving it in.
        replSeed = self.getReplacementSeed(pattern, lambda: self._PHONEReplacementSeed(pattern))
        if pattern.area_code:
            # Do it.
            ac = self._getRSAreaCode(replSeed)
            if pattern.ac_paren:
                if pattern.ac_paren_ws:
                    acStr = "( "+ac+" ) "
                else:
                    acStr = "("+ac+") "
            else:
                acStr = ac+"-"
        else:
            acStr = ""
        repl = "%s%d-%04d" % (acStr, replSeed["exchange"], replSeed["number"])

        # The postS may have an extension in it, which must be masked.
        # We mask it by replacing the numerals in the postS.

        chars = []
        for c in pattern.postS:
            if c in string.digits:
                chars.append(random.choice(string.digits))
            else:
                chars.append(c)
    
        return "%s%s%s" % (pattern.preS, repl, "".join(chars))

    # Social security numbers. Pattern is ignored (has no content anyway).
    
    def SSNReplace(self, pattern, **kw):
        return "".join([str(random.choice(string.digits)) for i in range(3)]) + \
               "-" + \
               "".join([str(random.choice(string.digits)) for i in range(2)]) + \
               "-" + \
               "".join([str(random.choice(string.digits)) for i in range(4)])

    # Other replacement. Pattern is ignored, obviously.
    # The replacerDist is marked for its capitalization status.

    def OTHERReplace(self, pattern, **kw):
        replacerDist = pattern.replacer.getReplacementResource()
        if replacerDist is None:
            return "<<OTHERPII>>"
        else:
            v = replacerDist.choose()
            if pattern.is_initials and pattern.replacer.mimicInitials:
                # replacer distribution is case sensitive. Find the elements which
                # are upper.
                import string
                v = "".join([c[0] for c in v.split() if c[0] in string.uppercase])
            elif pattern.replacer.mimicCase:
                if pattern.cap_status == ALL_UPPER:
                    v = v.upper()
                elif pattern.cap_status == ALL_LOWER:
                    v = v.lower()
                elif replacerDist.capStatus != MIXED:
                    # Make it mixed. Crude, yes.
                    dontCapitalize = set(["of", "the", "a"])
                    v = " ".join([((t in dontCapitalize) and t) or (t[0].upper() + t[1:]) for t in v.lower().split()])
                    
            return v

    # URLs. Pattern is ignored.
    
    def URLReplace(self, pattern, **kw):
        import urlparse
        hostList, pathSuffs = self.repository.loadURLs()
        if pattern.port:
            pSuff = ":" + str(random.randint(80, 36000))
        else:
            pSuff = ""
        if pattern.path_tail:
            # Pick some random element, and digest it.
            scheme, hostname, port, path, params, query, frag = _urlparse(random.choice(pathSuffs))
            path, query, frag = path, query, frag
        else:
            path, query, frag = None, None, None
        return urlparse.urlunsplit(("http", random.choice(hostList) + pSuff,
                                    path or "", query or "", frag or ""))

    # IP addresses. Pattern is ignored.
    
    def IPADDRESSReplace(self, pattern, **kw):
        # No seed.
        return "%d.%d.%d.%d" % tuple([random.randint(0, 255) for i in range(4)])

    # Email addresses. Pattern is ignored.

    def EMAILReplace(self, pattern, **kw):
        hostList, pathSuffs = self.repository.loadURLs()
        host = random.choice(hostList)
        # Trim the www.
        if re.match("^www\.", host):
            host = host[4:]
        # So the email will either be a first initial plus
        # last name, a first.last, or a first name + some random digit.
        # I'm not sure what else to do here.
        # Actually, I should be able to mirror the email name
        # using IDReplace (below) if the seed is there.
        if pattern.name is None:
            nameResource = self.repository.loadNames()
            mDist = nameResource.maleFirstNameDist
            fDist = nameResource.femaleFirstNameDist
            nDist = nameResource.neutralFirstNameDist
            lastNameDist = nameResource.lastNameDist
            firstNameDist = random.choice([mDist, fDist, nDist])
            firstName = random.choice(firstNameDist.WeightedChoice(None))
            lastName = lastNameDist.WeightedChoice(None)
            choice = random.randint(0, 2)
            if choice == 0:
                name = firstName.lower()[0] + lastName.lower()
            elif choice == 1:
                name = firstName.lower() + "." + lastName.lower()
            else:
                name = firstName.lower() + str(random.randint(0, 9999))
        else:
            name = _IDReplace(pattern.name)
        return name + "@" + host
    
    # IDs. Pretty straighforward. No replacement seed, default
    # replacement keys. But the ID category can have a default prefix.

    def IDReplace(self, pattern, **kw):
        if hasattr(pattern, "seed") and pattern.seed.has_key("id"):
            return pattern.seed["id"]
        # If we have nothing to go by, well, we have nothing to go by. 
        elif pattern.template is None:
            return pattern.prefix + str(random.randint(10000, 99999))
        else:
            return _IDReplace(pattern.template)

    # Hospitals.

    def _HOSPITALReplacementSeed(self, pattern):
        if hasattr(pattern, "seed"):
            return pattern.seed
        else:
            hospitals, postDist = self.repository.loadHospitals()
            hosp = hospitals.WeightedChoice([])
            postToks = postDist.WeightedChoice()
            # In case we subclass.
            return {"hospTokens": hosp + postToks.split()}

    def HOSPITALReplace(self, pattern, **kw):
        replSeed = self.getReplacementSeed(pattern, lambda: self._HOSPITALReplacementSeed(pattern))
        nameToks = replSeed["hospTokens"]
        if pattern.initials:
            # Convert to initials.
            return pattern.replacer._convertToInitials(nameToks)
        else:
            return " ".join(nameToks)
    
    def AGEReplace(self, pattern, granularity = 10, **kw):
        # First pass: determine an appropriate age within the lower
        # and upper bounds. If the bound is narrower than the
        # granularity, increase the bound.
        source_age_ub = pattern.ageUb
        source_age_lb = pattern.ageLb
        margin = (source_age_ub - source_age_lb) - granularity
        if margin < 0:
            needToAdd = -margin
            subtractFromLower = needToAdd/2
            addToHigher = needToAdd - subtractFromLower
            source_age_ub += addToHigher
            source_age_lb -= subtractFromLower
        # If source_age_lb is < 1, move both of them up.
        if source_age_lb < 1:
            source_age_ub += (1 - source_age_lb)
            source_age_lb += (1 - source_age_lb)
        rSet = set(range(source_age_lb, source_age_ub))
        rSet.add(source_age_ub)
        if pattern.ageUb == pattern.ageLb:
            rSet.discard(pattern.ageUb)
        newAge = random.choice(list(rSet))
        if pattern.spell:
            # every so often, spell the number
            repl = numToWords(newAge)
        else:
            repl = str(newAge)
        return pattern.preS + repl + pattern.postS

    # Dates.
    
    # We're definitely using the existing date and its shift as the basis.
    # Or not. The problem, of course, is when we're trying to reconstitute
    # from something like [DATE].

    def _DATEReplacementSeed(self, pattern):
        if hasattr(pattern, "seed"):
            return pattern.seed
        else:
            return {"date": datetime.date.today() - datetime.timedelta(random.randint(0, 365))}
    
    def DATEReplace(self, pattern, **kw):
        # Import here rather than earlier because we need
        # path information which may not be available at module load
        import dateutil.parser

        # As the seed, we're either going to use the date we
        # digested in the pattern, and shift it, or we're going
        # to get a seed.

        if (pattern.dateObj is not None) and (pattern.deltaDay is not None):
            date = pattern.dateObj.dt + datetime.timedelta(pattern.deltaDay)
        else:
            # WARNING: getReplacementSeed must be paired with setReplacementCacheKeys
            # to do any good. It's used to store sets of seeds which are variants which
            # should map to the same thing (or the same thing, with output variations).
            # Names are the primary example of this: first name, last name, first + last
            # should all map to the same output seed.
            # Dates don't use setReplacementCacheKeys anywhere that I can
            # see, currently. But it's harmless, so I'm leaving it in.
            replSeed = self.getReplacementSeed(pattern, lambda: self._DATEReplacementSeed(pattern))
            date = replSeed["date"]
        
        # Now, we generate the pattern. Hm. What do we do about
        # whether we show all of the date, or not the year? That's the
        # AMIA problem. It's actually even worse, because we
        # don't know, in the AMIA case, what the assumption about the
        # date format is. That'll be fun. 
        sList = []
        # We need to discard some of the tokens surrounding the year.
        # After the year isn't good enough, because you'll get things like
        # 5-16-/2003. But even if I figure out which tokens around the year
        # have to be removed, I'll still not be able to tell what the
        # external format assumptions are. So how much of this should
        # I worry about? I really need to get year-free dates. Perhaps
        # I should just add a local resource file of year-free date patterns
        # for AMIA?
        for p in pattern.tok_seq:
            if p[0] == "yr":
                if "2digit" in p[1:]:
                    sList.append("%02d" % (date.year % 100,))
                else:
                    sList.append(str(date.year))
            elif p[0] == "mo":
                if "2digit" in p[1:]:
                    sList.append("%02d" % date.month)
                elif "shortname" in p[1:]:
                    sList.append(dateutil.parser.parserinfo.MONTHS[date.month - 1][0])
                elif "longname" in p[1:]:
                    sList.append(dateutil.parser.parserinfo.MONTHS[date.month - 1][1])
                else:
                    sList.append(str(date.month))
            elif p[0] == "day":
                if "2digit" in p[1:]:
                    sList.append("%02d" % date.day)
                else:
                    sList.append(str(date.day))
            elif p[0] == "wkday":
                if "shortname" in p[1:]:
                    sList.append(dateutil.parser.parserinfo.WEEKDAYS[date.weekday()][0])
                else:
                    sList.append(dateutil.parser.parserinfo.WEEKDAYS[date.weekday()][1])
            elif p[0] == "hr":
                if "12hr" in p[1:]:
                    if date.hour == 0:
                        sList.append("12")
                    else:
                        sList.append(str(date.hour % 12))
                elif "2digit" in p[1:]:
                    sList.append("%02d" % date.hour)
                else:
                    sList.append(str(date.hour))
            elif p[0] == "min":
                sList.append("%02d" % date.minute)
            elif p[0] == "sec":
                sList.append("%02d" % date.second)
            elif p[0] == "msec":
                sList.append("%06d" % date.microsecond)
            elif p[0] in ["tz", "tz_off", "tz_offmin"]:
                # Punt on this for the moment.
                pass
            elif 'ordinal' in p[2:]:
                # This is a literal, but an ordinal. It's for the day.
                if date.day in [1, 21, 31]:
                    sList.append("st")
                elif date.day in [2, 22]:
                    sList.append("nd")
                elif date.day in [3, 23]:
                    sList.append("rd")
                else:
                    sList.append("th")
            else:
                # Literals and unknowns left.
                sList.append(p[1])
                
        return "".join(sList)

    # Locations.

    # It ought to be possible to cache the locations, although we don't yet.
    # Build a random location. Probably need to make sure that
    # the slots are filled dynamically.

    def _LOCATIONReplacementSeed(self, pattern):
        seed = {"streetNum": None,
                "addressToks": [],
                "streetPostfix": None,
                "cityToks": [],
                "state": None,
                "zipCode": None}
        if hasattr(pattern, "seed"):
            seed.update(pattern.seed)
        return seed

    # Dynamic fillers.

    def _populateRSStreet(self, pattern, seed):
        streetNames, streetPostfixDist = self.repository.loadStreetNames()
        seed["addressToks"] = [pattern.replacer._Capitalize(random.choice(streetNames))]
        seed["streetPostfix"] = streetPostfixDist.WeightedChoice(noneVal = None)
        
    def _getRSAddress(self, pattern, seed):
        if not seed["addressToks"]:
            self._populateRSStreet(pattern, seed)
        return seed["addressToks"]

    def _getRSStreetPostfix(self, pattern, seed):
        if seed["streetPostfix"] is None:
            self._populateRSStreet(pattern, seed)
        return seed["streetPostfix"]

    def _populateRSPlace(self, seed):
        tuples = self.repository.loadZipsCitiesStates()
        # The state component is an XMLResourceEntry, with
        # possible alts of longabbr, longabbrnodot, shortabbr
        city, seed["state"], seed["zipCode"] = random.choice(tuples)
        seed["cityToks"] = city.split()

    def _getRSZip(self, seed):
        if seed["zipCode"] is None:
            self._populateRSPlace(seed)
        return seed["zipCode"]

    def _getRSCity(self, seed):
        if not seed["cityToks"]:
            self._populateRSPlace(seed)
        return seed["cityToks"]

    def _getRSState(self, seed):
        if seed["state"] is None:            
            self._populateRSPlace(seed)
        return seed["state"]

    def _getRSStreetNum(self, seed, numSeed = None):
        if seed["streetNum"] is None:
            if numSeed is not None:
                seed["streetNum"] = _IDReplace(numSeed)
                # We have to be sure that we don't end up with a
                # leading 0.
                if seed["streetNum"] and (seed["streetNum"][0] == "0"):
                    seed["streetNum"] = str(random.randint(1,9)) + seed["streetNum"][1:]
            else:
                # Hell, just pick some number.
                seed["streetNum"] = str(random.randint(1, 10000))
        return seed["streetNum"]

    def LOCATIONReplace(self, pattern, street_num_seed = None, state_type = -1, **kw):
        # Now, we synthesize.
        if street_num_seed:
            pattern.street_num_seed = street_num_seed
        if state_type > -1:
            pattern.state_type = state_type
        addrToks = []
        # WARNING: getReplacementSeed must be paired with setReplacementCacheKeys
        # to do any good. It's used to store sets of seeds which are variants which
        # should map to the same thing (or the same thing, with output variations).
        # Names are the primary example of this: first name, last name, first + last
        # should all map to the same output seed.
        # Locations don't use setReplacementCacheKeys anywhere that I can
        # see, currently. But it's harmless, so I'm leaving it in.
        replSeed = self.getReplacementSeed(pattern, lambda: self._LOCATIONReplacementSeed(pattern))
                
        if pattern.street:
            if pattern.street_num:
                addrToks.append(self._getRSStreetNum(replSeed, pattern.street_num_seed))
            # Choose a street. Not about to worry about matching
            # capitalization or selecting it randomly.
            addrToks = addrToks + self._getRSAddress(pattern, replSeed)
            # Choose a postfix.
            if pattern.street_postfix:
                pfList = self._getRSStreetPostfix(pattern, replSeed)
                if pfList is not None:
                    # Randomly choose an abbreviation. Unless, of course, there
                    # are no abbreviations.
                    if pattern.street_postfix_abbr and len(pfList) > 1:
                        addrToks.append(pattern.replacer._Capitalize(random.choice(pfList[1:])))
                        if pattern.abbr_has_period:
                            addrToks[-1] = addrToks[-1] + "."
                    else:
                        addrToks.append(pattern.replacer._Capitalize(pfList[0]))
        
        # The city is already capitalized in the zipcode data we have.

        if pattern.city or pattern.state or pattern.zip:
            # Add a trailing comma.
            if pattern.street and pattern.street_comma:
                addrToks[-1] = addrToks[-1] + ","
            if pattern.city:
                addrToks = addrToks + self._getRSCity(replSeed)
            if pattern.state or pattern.zip:
                if pattern.city and pattern.city_comma:
                    addrToks[-1] = addrToks[-1] + ","
                if pattern.state:
                    state = self._getRSState(replSeed)
                    # States are already capitalized.
                    if pattern.state_type < 0:
                        # There are four possible states for the state name.
                        # Note that not all the elements will be present for
                        # the chosen state. 0 is always safe.
                        pattern.state_type = random.randint(0, 3)
                    how = pattern.STATE_KEY_ORDER[pattern.state_type]
                    if (how is not None) and (state.alts.get(how) is None):
                        pattern.state_type = pattern.STATE_KEY_ORDER.index(None)
                        how = None
                    if how is None:
                        addrToks.append(random.choice(state.heads))
                    else:
                        addrToks.append(random.choice(state.alts.get(how)))
                if pattern.zip:
                    if pattern.state and pattern.state_comma:
                        addrToks[-1] = addrToks[-1] + ","
                    addrToks.append(self._getRSZip(replSeed))

        return " ".join(addrToks)

    def COUNTRYReplace(self, pattern, **kw):
        countries = self.repository.loadCountries()
        return countries.choose()

    # People.

    def _PERSONReplacementSeed(self, pattern):
        # We need a first and a last name. We MIGHT need
        # middle names. And we need to know if there's
        # a gender. If there's no gender in the pattern,
        # pick randomly.
        nameResource = self.repository.loadNames()
        if hasattr(pattern, "gender"):
            # I think it will always have one, but I'm not sure.
            gender = pattern.gender
        else:
            # I think if I don't have a gender, I'd better use N.
            gender = "N" # pattern.replacer.genderDist.WeightedChoice(noneVal = "N")
        firstNameDist = nameResource.getFirstNameDist(gender)
        if pattern.one_name and (not pattern.one_name_is_known_first_name):
            # In this case, when we're preparing a seed based on a single token,
            # last names must be EXCLUSIVELY last names.
            lastName = nameResource.exclusivelyLastNameDist.WeightedChoice(None)
        else:
            lastName = nameResource.lastNameDist.WeightedChoice(None)
        seed = {"firstNameAlts": firstNameDist.WeightedChoice(None),
                "middleNames": None,
                "gender": gender,
                "lastName": lastName}
        if hasattr(pattern, "seed"):
            seed.update(pattern.seed)
        return seed
    
    def _getRSMiddleNames(self, seed, numNames):
        if seed["middleNames"] is None:
            seed["middleNames"] = []
        if len(seed["middleNames"]) < numNames:
            nameResource = self.repository.loadNames()
            firstNameDist = nameResource.getFirstNameDist(seed.get("gender", "N"))
            while len(seed["middleNames"]) < numNames:
                firstNameSeq = firstNameDist.WeightedChoice(None)
                # No nicknames in middle names.
                seed["middleNames"].append(firstNameSeq[0])
        # Only return the requested number of names.
        return seed["middleNames"][:numNames]

    # We use the replacement seeds here. But we have to be VERY careful.
    # It can't be the case that two names which share a first or last
    # name end up with the same seed. I think that what we should do is
    # look up ONLY the keys with the fewest nulls. We also have to deal with
    # the case where there are middle initials which clash.

    def PERSONReplace(self, pattern, **kw):

        replSeed = self.getReplacementSeed(pattern, lambda: self._PERSONReplacementSeed(pattern))

        # So if we have a one-token name, we've recorded whether it's a
        # known first name or not. At least in the US Census lists,
        # almost all the male first names, and a quarter of the female
        # first names, are also in the last name list; and in those cases
        # the name would probably be more recognizable as a first name
        # than a last name anyway. So if the name is a known first name,
        # we use the firstName as the replSeed. Otherwise, we use the last name.

        if pattern.one_name:
            if pattern.one_name_is_known_first_name:
                ntoks = [random.choice(replSeed["firstNameAlts"])]
            else:
                ntoks = [replSeed["lastName"]]

        else:
            ntoks = []
            # Randomly choose from the first name.
            firstName = random.choice(replSeed["firstNameAlts"])
            midInitList = pattern.mid_initials
            midNames = self._getRSMiddleNames(replSeed, len(midInitList))
            finalMids = []
            for i in range(len(midNames)):
                midName = midNames[i]
                isInitial = midInitList[i]
                if isInitial:
                    finalMids.append(midName[0]+".")
                else:
                    finalMids.append(midName)
            lastName = replSeed["lastName"]
            if pattern.last_is_first:
                ntoks = [lastName + ","] + [firstName] + finalMids
            else:
                ntoks = [firstName] + finalMids + [lastName]

        if pattern.name_ext:
            ntoks.append(pattern.name_ext)
            
        if pattern.cap_status == ALL_UPPER:
            n = " ".join(ntoks).upper()
        elif pattern.cap_status == ALL_LOWER:
            n = " ".join(ntoks).lower()
        else:
            # The name replacer has a special capitalization routine.
            n = pattern.replacer._Capitalize(ntoks)

        return n 

class ClearReplacementEngine(PIIReplacementEngine):

    __rname__ = "clear -> clear"

    def createDigestionStrategy(self):
        return ClearDigestionStrategy(self)

    def createRenderingStrategy(self):
        return ClearRenderingStrategy(self)
