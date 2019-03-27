# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# This is the core replacement engine. It uses a few external things:

# 1) lots of data it can read in. Sample names, streets, etc.

# 2) numToWords number speller.
# Courtesy of Paul Rubin, from
# http://mail.python.org/pipermail/python-list/2006-October/406901.html
#
# If you want to go the other way, check out
# http://pyparsing.wikispaces.com/space/showimage/wordsToNum.py
# We might ultimately need it.

# 3) the python-dateutil package, from http://labix.org/python-dateutil.
# Extensively modified parser.py to yield patterns as well as results.
# Version is 1.3. We'll put this directory in the resource directory
# for the engine.

#
# The strategy for how the replacement engine works is like this:
# There are some basic objects:
#
# patterns: things like name, place, etc. These categories have
# frequency distributions over their slots, particular slots that
# need to be filled, etc.
#
# replacers: the infrastructure that manages the cache around pattern
# replacement, etc. There's a replacer per pattern class.
#
# strategies: these are mappings from pattern classes to pairs of behavior:
# a digest function (which maps a replacer and a string to an instantiated pattern),
# and a replace function (which maps a replacer and an instantiated pattern to
# a string).
#
# an engine: the engine maps tags in a domain to pattern classes, and
# also has a strategy.

import random, sys, re, os, datetime
random.seed()

#
# numToWords
#

def numToWords(n, d=0):
    # spell arbitrary integer n, restricted to |n| < 10**66
    assert abs(n) < 10**66
    if n == 0: return 'zero'
    if n < 0:  return 'minus ' + numToWords(-n, d)

    bigtab = ('thousand', 'million', 'billion', 'trillion',
              'quadrillion', 'quintillion', 'sextillion', 'septillion',
              'octillion', 'nonillion', 'decillion', 'undecillion',
              'duodecillion', 'tredecillion', 'quattuordecillion',
              'quinquadecillion', 'sextemdecillion', 'septemdecillion',
              'octodecillion', 'novemdecillion', 'vigintillion')
    smalltab = ('', 'one', 'two', 'three', 'four',
                'five', 'six', 'seven', 'eight', 'nine',
                'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
                'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen')
    out = []
    def maybe(cond,s): return (cond and s) or ''

    a,n = divmod(n, 1000)
    if a:
        out.extend((numToWords(a,d+1), maybe(a % 1000, bigtab[d])))

    a,n = divmod(n, 100)
    out.append(maybe(a, '%s hundred'% numToWords(a)))

    a,b = divmod(n, 10)
    if a > 1:
        out.append(('twenty', 'thirty', 'forty', 'fifty', 'sixty',
                    'seventy', 'eighty', 'ninety')[a-2] +
                   maybe(b, '-' + smalltab[b]))
    else:
        out.append(smalltab[n])
    return (' '.join(filter(bool, out)))

# The version in Python 2.5 is improved, but we're not guaranteed of
# that.

def _urlparse(url):
    import urlparse
    o = urlparse.urlparse(url)
    if type(o) is type(()):
        scheme, netloc, path, params, query, frag = o
        if netloc.find(":") > -1:
            [hostname, port] = netloc.split(":", 1)
            port = int(port)
        else:
            port = None
            hostname = netloc
        return scheme, hostname, port, path, params, query, frag
    else:
        return o.scheme, o.hostname, o.port, o.path, o.params, o.query, o.fragment

#
# And now, the replacement engine itself. We owe an enormous debt of
# gratitude to Ozlem Uzuner, who lent us the scripts her team used to
# generate the synthesized data for the AMIA evaluation. Thos algorithms
# are a primary source of the algorithms here.
#

#
# Loading data
#

# Gradually moving to this:

# XML, UTF-8, schema:
# <entries cap_status="lower|upper|mixed" weighted="yes|no">
#   <!-- weight is only recognized if weighted="yes".
#        if weighted="yes", each entry must have a weight. -->
#   <entry weight="...">
#      <!-- main alternatives. May be more than one. Don't need to
#           be unique, although they typically will be. -->
#      <head>....</head> 
#      <!-- can be many of these. type is user-defined; you can ask for
#           an alternate of a particular type. -->
#      <alt type="...">...</alt>
#   </entry>
# </entries>

import xml.dom.minidom

class XMLResourceEntry:

    def __init__(self):
        self.heads = []
        self.alts = {}

class XMLResource:

    def __init__(self, path):
        self.capStatus = MIXED
        self.weighted = False
        self.distSet = None
        self.entries = []
        self.entryMap = {}
        self._parse(path)
        self._finish()

    def _parse(self, path):
        dom = xml.dom.minidom.parse(path)
        elt = dom.documentElement
        # Turns adjacent text nodes into single text nodes.
        elt.normalize()
        if elt.nodeName != "entries":
            raise IOError, ("root node of resource file %s must be 'entries'" % path)
        for k, v in elt.attributes.items():
            if k == "cap_status":
                if v == "upper":
                    self.capStatus = ALL_UPPER
                elif v == "lower":
                    self.capStatus = ALL_LOWER
                elif v != "mixed":
                    raise IOError, ("cap_status attribute must be upper, lower, or mixed in resource file %s" % path)
            elif k == "weighted":
                if v == "yes":
                    self.weighted = True
                elif v != "no":
                    raise IOError, ("weighted attribute must be yes or no in resource file %s" % path)
            else:
                raise IOError, ("only weighted and cap_status are supported attributes for entries in resource file %s" % path)
        if self.weighted:
            self.distSet = FloatDistributionSet()
        else:
            # Don't bother with a count distribution set. Just a random
            # selection will be fine.
            self.distSet = []
        for p in [n for n in elt.childNodes if n.nodeType == n.ELEMENT_NODE]:
            if p.nodeName != "entry":
                raise IOError, ("only permitted child node of entries is entry in resource file %s" % path)
            # This has to be hashable for the distSet.
            entry = XMLResourceEntry()
            self.entries.append(entry)
            weight = None
            for k, v in p.attributes.items():
                if k == "weight":
                    if self.weighted:
                        weight = float(v)
                    else:
                        raise IOError, ("weight attribute not permitted for entries in resource file %s" % path)
                else:
                    raise IOError, ("%s attribute not permitted for entries in resource file %s" % (k, path))
            if self.weighted:
                if weight is None:
                    raise IOError, ("weight attribute not specified for entry in weighted resource file %s" % path)
                else:
                    self.distSet.Add(entry, float(v))
            else:
                self.distSet.append(entry)
            for q in [n for n in p.childNodes if n.nodeType == n.ELEMENT_NODE]:
                if q.nodeName == "head":
                    if q.attributes.keys():
                        raise IOError, ("no attributes permitted for head in resource file %s" % path)
                    if len(q.childNodes) != 1:
                        raise IOError, ("head element must have a single text node child in resource file %s" % path)
                    if q.childNodes[0].nodeType != q.TEXT_NODE:
                        raise IOError, ("head element must have a single text node child in resource file %s" % path)
                    entry.heads.append(q.childNodes[0].nodeValue)
                elif q.nodeName == "alt":
                    if q.attributes.keys() != ["type"]:
                        raise IOError, ("only (required) attribute for alt is type in resource file %s" % path)
                    t = q.getAttribute("type")
                    if len(q.childNodes) != 1:
                        raise IOError, ("alt element must have a single text node child in resource file %s" % path)
                    if q.childNodes[0].nodeType != q.TEXT_NODE:
                        raise IOError, ("alt element must have a single text node child in resource file %s" % path)
                    s = q.childNodes[0].nodeValue
                    try:
                        entry.alts[t].append(s)
                    except KeyError:
                        entry.alts[t] = [s]
                else:
                    raise IOError, ("only head or alt child elements permitted for entry in resource file %s" % path)
            if len(entry.heads) == 0:
                raise IOError, ("no heads for entry in resource file %s" % path)

    def _finish(self):
        # Once we have the distribution set, we also want to create
        # a map from entries to where they are present. There may
        # be multiple entries. This will be an uppercase index.
        for e in self.entries:
            for h in e.heads:
                h = h.upper()
                try:
                    self.entryMap[h].append((None, e))
                except KeyError:
                    self.entryMap[h] = [(None, e)]
            for k, vList in e.alts.items():
                for v in vList:
                    v = v.upper()
                    try:
                        self.entryMap[v].append((k, e))
                    except KeyError:
                        self.entryMap[v] = [(k, e)]

        if self.weighted and self.distSet:
            self.distSet.Finish()

    # API.

    def lookUp(self, k):
        try:
            return self.entryMap[k.upper()]
        except KeyError:
            return []

    def choose(self, altType = None, noneVal = None):
        if self.weighted:
            c = self.distSet.WeightedChoice(noneVal = None)
        elif self.distSet:
            c = random.choice(self.distSet)
        else:
            c = None
        if c is None:
            return noneVal
        elif (altType is not None) and c.alts.has_key(altType):
            return random.choice(c.alts[altType])
        else:
            return random.choice(c.heads)            

class NameResource:

    def __init__(self, repository):
        self.maleFirstNameDist = None
        self.femaleFirstNameDist = None
        self.neutralFirstNameDist = None
        self.lastNameDist = None
        self.exclusivelyLastNameDist = None
        self.firstNameHash = None
        self.capitalizationHash = None
        self.repository = repository

    # Names. These are the US Census files. The first column
    # is the name, in caps, and the second column is the
    # percentage of the sample that has the name. For first names,
    # we'll load both male and female, and assume equal distribution
    # between them. We also have to normalize the values to 100,
    # since they don't appear to be normalized. Then, we need a list
    # of nicknames. In fact, the last name list gets rounded off
    # to 0.000 around 18K of 88K (boy, that's a long tail).

    # This requires another distribution set, one which
    # deals with floats directly.

    # The nickname file is comma-delimited, all caps. #
    # is the comment character.

    # In order to guide the capitalization of the name tokens,
    # I've borrowed capitalization_guide.txt. It has a huge pile
    # of mixed-case names which I use to assign proper capitalization
    # to the Census names.
    
    def loadNames(self):
        if self.lastNameDist is None:
            self.lastNameDist = FloatDistributionSet()
            self.exclusivelyLastNameDist = FloatDistributionSet()
            self.neutralFirstNameDist = FloatDistributionSet()
            self.femaleFirstNameDist = FloatDistributionSet()
            self.maleFirstNameDist = FloatDistributionSet()
            # Load the nicknames.
            nickDict = {}
            for line in self.repository.loadLines("nicknames.txt"):
                if line and line[0] == "#":
                    continue
                toks = line.strip().split(",")
                nickDict[toks[0]] = toks
            # We're going to distinguish between female and male now.
            # The Census lists have overlaps between male and female. I've
            # examined these and distilled them into a list of known
            # neutral names and curated it (there's some noise in the overlap). So
            # to determine gender, we'll first process the lists so 
            # that they each have only the uniquely female and male
            # names, and then load the neutral list as well. Then,
            # if the name is either uniquely in the male or female
            # list, pick that gender; otherwise, the gender is
            # unknown, and we have to pick from the common names.
            # We have to be careful with the nicknames, because there
            # are some names which are neutral but they're nicknames.
            # So we have to remove the neutral names from the
            # nickname dictionary. Actually, we have to remove the
            # nicknames which are in the list of common names, and we
            # have to ensure that any nicknames which overlap with one
            # of the name sets isn't a nickname for something in the
            # other name sets.

            # So first, we need to collect all those things which can
            # be interpreted as male, and all those things that can be
            # interpreted as female. And then, we have to partition
            # it into the names which are common, the names which are
            # exclusively male, and the names which are exclusively female.
            # And we have to include the nicknames in this.
            
            # This is a curated list of gender-neutral names, one per line.
            commonNames = set([line.strip() for line in self.repository.loadLines("dist.common.first")])
            femalePairs = [(toks[0], float(toks[1])) for toks in
                           [line.strip().split() for line in self.repository.loadLines("dist.female.first")]]
            malePairs = [(toks[0], float(toks[1])) for toks in
                         [line.strip().split() for line in self.repository.loadLines("dist.male.first")]]

            femaleNames = set([p[0] for p in femalePairs])
            for p, f in femalePairs:
                try:
                    femaleNames.update(nickDict[p])
                except KeyError:
                    pass
            maleNames = set([p[0] for p in malePairs])
            for p, f in malePairs:
                try:
                    maleNames.update(nickDict[p])
                except KeyError:
                    pass

            # OK, now we have all the names, including nicknames.
            bothNames = maleNames & femaleNames

            # Remove them from the nickname dictionary.
            for k, v in nickDict.items():
                nickDict[k] = list(set(v) - bothNames)
            
            # There should be multiple frequencies, which we need to add together.
            commonPairs = dict([p for p in femalePairs if p[0] in commonNames])
            for p in malePairs:
                if p[0] in commonNames:
                    try:
                        commonPairs[p[0]] += p[1]
                    except KeyError:
                        commonPairs[p[0]] = p[1]
            allFirstNames = set()
            for name, freq in femalePairs:
                if name not in bothNames:
                    if nickDict.has_key(name):
                        name = nickDict[name]
                    else:
                        name = [name]
                    allFirstNames.update(name)
                    # Store the name tuple and its frequency.
                    if freq > 0:
                        self.femaleFirstNameDist.Add(tuple(name), freq)
            for name, freq in malePairs:
                if name not in bothNames:
                    if nickDict.has_key(name):
                        name = nickDict[name]
                    else:
                        name = [name]
                    allFirstNames.update(name)
                    # Store the name tuple and its frequency.
                    if freq > 0:
                        self.maleFirstNameDist.Add(tuple(name), freq)
            for name, freq in commonPairs.items():
                allFirstNames.add(name)
                if freq > 0:
                    self.neutralFirstNameDist.Add((name,), freq)
            # We need to know if a name is exclusively a last name,
            # since we don't want it to be confused with a first name
            # when we're replacing single names. Most of the last names
            # in the US Census are exclusively last names.
            for line in self.repository.loadLines("dist.all.last"):
                toks = line.strip().split()
                name = toks[0]
                freq = float(toks[1])
                # Could be 0.
                if freq > 0:
                    self.lastNameDist.Add(name, freq)
                    if name not in allFirstNames:
                        self.exclusivelyLastNameDist.Add(name, freq)
            # Normalize to 100.
            self.neutralFirstNameDist.Finish()
            self.maleFirstNameDist.Finish()
            self.femaleFirstNameDist.Finish()
            self.lastNameDist.Finish()
            self.exclusivelyLastNameDist.Finish()

            d = {}
            # Finally, load the capitalization hash.
            for line in self.repository.loadLines("capitalization_guide.txt"):
                line = line.strip()
                if line[0] == "#":
                    continue
                key = line.upper()
                try:
                    d[key].add(line)
                except KeyError:
                    d[key] = set([line])
            self.capitalizationHash = dict([(k, list(v)) for k, v in d.items()])

    def getFirstNameHash(self):
        if self.firstNameHash is None:
            # This will overwrite, because nicknames
            # can map to multiple things, but it really doesn't matter.
            self.firstNameHash = {}
            self.loadNames()
            for dist, gender in ((self.maleFirstNameDist, "M"), (self.femaleFirstNameDist, "F"),
                                 (self.neutralFirstNameDist, "N")):
                for names in dist.items.keys():
                    for name in names:
                        self.firstNameHash[name] = (gender, dist, names)
        return self.firstNameHash

    def getFirstNameDist(self, gender):
        if gender == "M":
            return self.maleFirstNameDist
        elif gender == "F":
            return self.femaleFirstNameDist
        else:
            return self.neutralFirstNameDist

class Repository:

    def __init__(self, data_dirs, resourceReplacements = None):
        self.dataDirs = data_dirs
        self.countries = None
        self.areaCodes = None
        # For hospitals.
        self.hospitalPostSeqDist = None
        self.hospitals = None
        self.states = None
        self.streetPostfixes = None
        self.townTuples = None
        self.streetNames = None
        self.streetPostfixDist = None
        self.nameResource = None
        self.hostList = None
        self.pathSuffs = None
        self.datePatternDist = None
        self.resourceReplacements = resourceReplacements

    def loadNames(self):
        if self.nameResource is None:
            self.nameResource = NameResource(self)
            self.nameResource.loadNames()
        return self.nameResource

    def getFirstNameHash(self):
        if self.nameResource is None:
            self.nameResource = NameResource(self)
            self.nameResource.loadNames()
        return self.nameResource.getFirstNameHash()

    def _getPath(self, resourceFile):
        if (self.resourceReplacements is not None) and \
           (self.resourceReplacements.has_key(resourceFile)):
            resourceFile = self.resourceReplacements[resourceFile]
            if os.path.isabs(resourceFile):
                return resourceFile
        for d in self.dataDirs:
            p = os.path.join(d, resourceFile)
            if os.path.exists(p):
                return p
        return None

    def loadLines(self, resource_file, encoding = "ascii"):
        p = self._getPath(resource_file)
        if p is not None:
            if encoding == "ascii":
                fp = open(p, "r")
            else:
                import codecs
                fp = codecs.open(p, "r", encoding)
            lines = fp.readlines()
            fp.close()
            return lines
        else:
            raise IOError, ("couldn't find resource file %s" % resource_file)
    
    def loadXMLResource(self, resource_file):
        p = self._getPath(resource_file)
        if p is not None:
            return XMLResource(p)
        else:
            raise IOError, ("couldn't find resource file %s" % resource_file)

    def loadCountries(self):
        if self.countries is None:
            self.countries = self.loadXMLResource("countries.xml")
        return self.countries

    # Area codes. File format is one area code per line.
    # Comment line is #.

    def loadAreaCodes(self):
        if self.areaCodes is None:
            self.areaCodes = []
            lines = self.loadLines("area_codes.txt")
            for l in lines:
                if l[0] != "#":
                    self.areaCodes.append(l.strip())
        return self.areaCodes

    # Hospitals. File format is one per line. Comment
    # line is #. Terms are
    # capitalized. The tokens have a name followed by
    # a sequence of "type" words, e.g., "Hospital",
    # "Medical Center", etc. This list is taken from
    # Ozlem's original code.

    HOSP_POST_TOKENS = ["associates","service","services", "hospital","hospitals",
                        "center","centers","health","healthcare",
                        "clinic","clinics","network","networks",
                        "system","systems","care","healthcare",
                        "medical","memorial","rehabilitation","community",
                        "region","nursing","county","rehab",
                        "general","university","valley",
                        "and","of","home"]

    # SAM 10/26/11: Make sure that neither the post entry
    # or the hospital entry is length 0.
    
    def loadHospitals(self):
        if self.hospitals is None:
            posttokD = dict(map(lambda x: (x, 0), self.HOSP_POST_TOKENS))
            postStrD = CountDistributionSet()
            self.hospitals = LengthDistributionSet()
            lines = self.loadLines("hospitals.txt")
            for l in lines:
                if l and l[0] == "#":
                    continue
                nameToks = []
                postToks = []
                inPost = False
                for tok in l.strip().split():
                    if tok == "-":
                        break
                    elif inPost:
                        postToks.append(tok)
                    elif posttokD.has_key(tok.lower()):
                        postToks.append(tok)
                        inPost = True
                    else:
                        nameToks.append(tok)
                if nameToks:
                    self.hospitals.Add(nameToks)
                postStr = " ".join(postToks)
                if postStr:
                    postStrD.Add(postStr)
            self.hospitalPostSeqDist = postStrD
            postStrD.Finish(self.hospitals.totalAdded)
            self.hospitals.Finish()
        return self.hospitals, self.hospitalPostSeqDist

    # States. File format is comma-delimited: fullname,long abbrev,short abbrev
    # Comment character is #. Entries are capitalized. 
    def loadStates(self):
        if self.states is None:
            self.states = self.loadXMLResource("states.xml")
        return self.states

    # Street postfixes. File format is comma-delimited. Entries are
    # all caps. Comment character is #. Abbrevs don't end in a period.
    # The first token is the full name, the rest are abbrevs.

    def loadStreetPostfixes(self):
        if self.streetPostfixes is None:
            self.streetPostfixes = []
            for line in self.loadLines("street_suffs.txt"):
                if line and line[0] == "#":
                    continue
                toks = line.strip().split(",")
                self.streetPostfixes.append(toks)
        return self.streetPostfixes

    # Zips, towns, states. We can randomly select these, and they'll
    # probably be of equal weight. It also gives us a decent list of
    # towns. File format is zip:town:2-letter state abbr. # is
    # comment character.

    def loadZipsCitiesStates(self):
        if self.townTuples is None:
            self.townTuples = []
            states = self.loadStates()
            sDict = {}
            for stateEntry in states.entries:
                shortAbbr = stateEntry.alts["shortabbr"][0]
                sDict[shortAbbr] = stateEntry
            lines = self.loadLines("zipcodes")
            for line in lines:
                if line and line[0] == "#":
                    continue
                toks = line.strip().split(":")
                if len(toks) == 3:
                    if sDict.has_key(toks[-1]):
                        # city, state, zip
                        # So the town tuples now contain a state entry.
                        self.townTuples.append((toks[1], sDict[toks[2]], toks[0]))
        return self.townTuples

    # Street names. Comment character is #. One street name per line,
    # with full street postfix. All caps. So we can look up the final
    # token in the postfixes and strip it.

    def loadStreetNames(self):
        if self.streetNames is None:
            self.streetNames = []
            postFixes = self.loadStreetPostfixes()
            dist = CountDistributionSet()
            self.streetPostfixDist = dist
            dir = {}
            for p in postFixes:
                dir[p[0]] = p
            for line in self.loadLines("mass_roads.txt"):
                if line and line[0] == "#":
                    continue
                toks = line.strip().split()
                if dir.has_key(toks[-1]):
                    # The distribution is over entries in the
                    # postfix list.
                    dist.Add(tuple(dir[toks[-1]]))
                    toks[-1:] = []
                self.streetNames.append(" ".join(toks))
            dist.Finish()
        return self.streetNames, self.streetPostfixDist

    def loadURLs(self):        
        if self.hostList is None:
            import urlparse
            d = {}
            self.pathSuffs = []
            for line in self.loadLines("google_urls.txt"):
                if line and line[0] == "#":
                    continue
                try:
                    scheme, hostname, port, path, params, query, frag = _urlparse(line.strip())
                    d[hostname] = True
                    if path or query or frag:
                        self.pathSuffs.append(urlparse.urlunsplit(("", "", path, query, frag)))
                except "foo":
                    pass
            self.hostList = d.keys()
        return self.hostList, self.pathSuffs

    def loadDatePatterns(self):
        if self.datePatternDist is None:
            # Import here rather than earlier because we need
            # path information which may not be available at module load
            import dateutil.parser
            self.datePatternDist = FloatDistributionSet()
            for line in self.loadLines("date_patterns.txt"):
                if line and line[0] == "#":
                    continue
                # Format is weight|date sample
                toks = line.split("|", 1)
                if len(toks) == 2:
                    try:
                        fnum = float(toks[0])
                        dateSeed = dateutil.parser.digest(toks[1].strip())
                    except ValueError:
                        # Something failed to parse.
                        print >> sys.stderr, "Couldn't use date pattern line", line
                        continue
                    self.datePatternDist.Add(dateSeed, fnum)
            self.datePatternDist.Finish()
        return self.datePatternDist

    def loadRandomPhraseRepository(self, path):
        firstLine = True
        dist = None
        hasFloat = False
        for line in self.loadLines(path, encoding = "utf8"):
            # Discard lines which start with a comment ("#").
            if line and line[0] == "#":
                continue
            if not line.strip():
                continue
            toks = line.split(None, 1)
            # If the first real line starts with a float,
            # it's weighted, otherwise not.
            if firstLine:
                firstLine = False
                if len(toks) > 1:
                    try:
                        weight = float(toks[0])
                        entry = toks[1].strip()
                        hasFloat = True
                        dist = FloatDistributionSet()
                    except ValueError:
                        entry = line.strip()
                        dist = CountDistributionSet()
                else:
                    dist = CountDistributionSet()
            elif hasFloat:
                if len(toks) == 1:
                    # Error
                    raise PIIPatternReplacerError, ("entry in phrase repository %s should start with a weight but doesn't" % path)
                else:
                    try:
                        weight = float(toks[0])
                        entry = toks[1].strip()
                    except ValueError:
                        # Error
                        raise PIIPatternReplacerError, ("entry '%s' in phrase repository %s should start with a weight but doesn't" % (line.strip().encode('ascii', 'ignore'), path))
            else:
                entry = toks.strip()
            if hasFloat:
                dist.Add(entry, weight)
            else:
                dist.Add(entry)
        return dist

# A distribution set allows us to choose from a list
# of elements with weights.

class DistributionSetError(Exception):
    pass

class DistributionSet:
    def __init__(self):
        # items contains total numbers of items.
        self.items = {}
        self.cumFreqPairs = None
        self.overallFreq = 0.0
        self._finished = False
        self.totalAdded = 0

    # Specialize these two methods.
    
    def _Add(self, *args):
        raise DistributionSetError, "Not defined"

    def _ItemFreq(self, item, globalTotal):
        raise DistributionSetError, "Not defined"
    
    # Overall guts.
    
    def Add(self, *args):
        if self._finished:
            raise DistributionSetError, "can't add to a finished set"
        else:
            self._Add(*args)
            self.totalAdded += 1
        
    def Finish(self, globalTotal = None):
        if not self._finished:
            if globalTotal is None:
                globalTotal = self.totalAdded
            # globalTotal is the total number of possible items
            # out of which these items were chosen.
            globalTotal = float(globalTotal)
            self.cumFreqPairs = []
            self.overallFreq = 0.0
            for k, v in self.items.items():
                localFreq = self._ItemFreq(v, globalTotal)
                self.overallFreq += localFreq
                self.cumFreqPairs.append((k, self.overallFreq))
            self._finished = True
            
    def WeightedChoice(self, noneVal = ""):
        # If it hasn't been finished, finish it. This is
        # a bit risky.
        self.Finish()
        # The idea is that we generate a frequency and then
        # return a choice based on it. The idea is that all the
        # choices are ratios against the global total, and
        # a cumulative frequency has been assigned to each item
        # in the list. When the frequency exceeds the random
        # fraction generated, you've found your choice. This
        # algorithm is taken from Ozlem's code, and is less
        # random than it could be; a better "random" way would
        # be to call random.shuffle() on the list of candidates
        # and sum as we go along. But that would be unbelievably
        # expensive. So let's just do a binary search and
        # be done with it.
        if len(self.cumFreqPairs) == 0:
            return noneVal
        # If I just get a random number between 0 and 1, it may
        # be larger than the overall frequency, which is stupid.
        # So use random.uniform() instead. Actually, I don't even
        # need to generate the floats - I should do a random.uniform()
        # OR random.randint() depending on what kind of distribution set
        # it is.
        r = random.uniform(0, self.overallFreq)
        # This will never happen now.
        # if r > self.overallFreq:
        #    return noneVal
        # Do a binary search.
        minI = 0
        maxI = len(self.cumFreqPairs) - 1
        # Gotta be between the element and its predecessor.
        while True:
            if maxI == minI:
                return self.cumFreqPairs[maxI][0]
            candMax = ((maxI - minI)/2) + minI
            if r < self.cumFreqPairs[candMax][1]:
                maxI = candMax
            else:
                minI = candMax + 1
        return noneVal

class CountDistributionSet(DistributionSet):
    def _Add(self, item):
        if self.items.has_key(item):
            self.items[item] += 1
        else:
            self.items[item] = 1

    def _ItemFreq(self, item, globalTotal):
        return float(item) / globalTotal

    # Remove is a special method available for count distributions.

    def Remove(self, item):
        if self.items.has_key(item):
            self.totalAdded -= self.items[item]
            del self.items[item]
            if self._finished:
                self._finished = False
                self.Finish()

    def Finish(self, *args, **kw):
        DistributionSet.Finish(self, *args, **kw)

# We need to normalize to the global total, and
# then, because we're using random() for the weighted
# choice, it's gotta be normalized to 1.

class FloatDistributionSet(DistributionSet):
    def __init__(self):
        DistributionSet.__init__(self)
        self.totalPct = 0.0
    def _Add(self, item, flnum):
        if self.items.has_key(item):
            self.items[item] += float(flnum)
        else:
            self.items[item] = float(flnum)
        self.totalPct += float(flnum)
    def _ItemFreq(self, item, globalTotal):
        # Normalize to the total.
        return float(item) / self.totalPct
    def fromFrequencyPairs(self, *pairs):
        # This takes a list of pairs (choice, freq) and
        # generates a distribution set from it.
        for item, flnum in pairs:
            self.Add(item, flnum)
        self.Finish()
        return self

class LengthDistributionSet(DistributionSet):
    def _Add(self, item):
        if self.items.has_key(len(item)):
            self.items[len(item)].append(item)
        else:
            self.items[len(item)] = [item]            
    def _ItemFreq(self, item, globalTotal):
        # The frequency is the number of items collected
        # divided by the total
        return float(len(item)) / globalTotal
    def WeightedChoice(self, noneVal = ""):
        v = DistributionSet.WeightedChoice(self, noneVal = None)
        # k is a number of tokens, or None
        if v is None:
            return noneVal
        else:
            # Get all the possible choices for that length, and
            # randomly select one.
            return random.choice(self.items[v]) 

#
# Utilities
#

#
# Toplevel classes
#

# We separate the analysis of the incoming element from the
# resynthesis of the data.

class PIIPatternReplacerError(Exception):
    pass

# Pattern source can be one of four places: external distribution,
# corpus distribution, self.

# NOTE: the only one we use anymore is PS_SELF. I don't even
# know that the other two still work.

PS_EXT_DIST, PS_CORP_DIST, PS_SELF = range(3)

class PIIPatternReplacer:

    def __init__(self, engine, cat_class, label,
                 use_cache = False, flush_cache_at_doc_boundary = True,                 
                 pattern_source = PS_SELF, use_seed_cache = False,
                 cache_is_case_sensitive = True):
        self.engine = engine
        self.catClass = cat_class
        self.label = label
        self.useCache(use_cache)
        self.cacheIsCaseSensitive = cache_is_case_sensitive
        self.useSeedCache(use_seed_cache)
        if (pattern_source == PS_CORP_DIST) and \
           not (self.engine.digestionStrategy.canGenerateCorpDist(label) and \
                self.catClass.canGenerateCorpDist):
            pattern_source = PS_SELF            
        self.patternSource = pattern_source
        self.repository = engine.repository
        self.flushAtDocBoundary = flush_cache_at_doc_boundary
        self.patternDist = None

    def useCache(self, useIt):
        self._useCache = useIt and self.engine.digestionStrategy.canCache(self.catClass.__ctype__)
        if self._useCache:
            self.cache = {}
        else:
            self.cache = None

    def useSeedCache(self, useIt):
        self._useSeedCache = useIt and self.engine.digestionStrategy.canCache(self.catClass.__ctype__)
        if self._useSeedCache:
            self.seedCache = {}
        else:
            self.seedCache = None

    # Maybe use the seed cache, maybe not.

    # WARNING: getReplacementSeed must be paired with setReplacementCacheKeys
    # to do any good. It's used to store sets of seeds which are variants which
    # should map to the same thing (or the same thing, with output variations).
    # Names are the primary example of this: first name, last name, first + last
    # should all map to the same output seed.
    # The only classes in any of the tasks which I can see that use this are names
    # and hospitals (abbreviation vs. no).
    # But the clear replacement strategy also calls it for phone, date, location.
    # It's harmless, so I've left it there.

    # Note that here, we really need to be careful. It can't be the case that
    # if two names share a last name,  or share a first name, they end up
    # with the same seed. Check the clear replacement strategy for more details.

    def getReplacementSeed(self, pattern, meth):
        if not self._useSeedCache:
            return meth()
        keys = pattern.getReplacementCacheKeys()
        for k in keys:
            if self.seedCache.has_key(k):
                return self.seedCache[k]
        # Didn't find any entries (or there aren't any keys)
        seed = meth()
        for k in pattern.getReplacementCacheKeysForStorage():
            self.seedCache[k] = seed
        return seed

    def Digest(self, seed):
        # By default, we just build an instance of the class we hold.
        res = self.catClass(self, seed = seed)
        self.engine.digestionStrategy.Digest(res, seed)
        if self.patternSource is PS_CORP_DIST:
            if self.patternDist is None:
                self.patternDist = self.getPatternDist()
            pat = res.toPatternSequence()
            self.patternDist.Add(pat)
        return res

    # Implement if PS_CORP_DIST is your type.
    
    def getPatternDist(self):        
        raise PIIPatternReplacerError, "unimplemented"

    def EndDocumentForReplacement(self):
        # Don't flush the digest index; it needs to
        # store the whole corpus, potentially, so we don't
        # do any extra work.
        if self.flushAtDocBoundary:
            if self._useCache:
                self.cache = {}
            if self._useSeedCache:
                self.seedCache = {}

    def EndDocumentForDigestion(self):
        pass

    def EndDigestion(self):
        if self.patternDist is not None and \
           self.patternSource is PS_CORP_DIST:
            self.patternDist.Finish()

    # By default, the cache maps strings to strings. But
    # it ought to be possible to give multiple keys to the cache,
    # and structures instead of strings. The structures would
    # be instances of the same category, which may be
    # postprocessed using various patterns, etc. If we were
    # to cache addresses, the same thing would happen.

    # So, actually, replacing happens in two steps: first, we
    # we produce candidate bits for the replacement, and second,
    # we impose patterns and frequencies on the output.

    # If the cache is not case sensitive, the capitalization
    # patterns of the input have to be matched when you return
    # the result.

    # Ugh. The replacement was not whitespace-insensitive. And
    # once you make it whitespace-insensitive, you recognize that
    # the newlines that I was originally adding only to the
    # locally generated replacer actually have to be added to
    # whatever comes down the pike,  including whatever comes
    # out of the cache.

    def Replace(self, pattern, **kw):
        res = None
        cacheUsed = False
        if self._useCache and pattern.input is not None:
            res = self._cacheReplace(pattern)
        if res is None:
            res = self._coreReplace(pattern, **kw)
            if self._useCache and pattern.input is not None:
                self._cacheAdd(pattern, res)
        res = self._addReplacementNewline(pattern, res)
        return res
            
    def _cacheReplace(self, pattern):
        trueInput = " ".join(pattern.input.split())
        if self.cacheIsCaseSensitive:
            if self.cache.has_key(trueInput):
                return self.cache[trueInput]
        else:
            input = trueInput.lower()
            if self.cache.has_key(input):
                s = self.cache[input]
                # Match the case properties.
                if input == trueInput:
                    return s.lower()
                elif trueInput == trueInput.upper():
                    return s.upper()
                else:
                    return s
        return None

    def _cacheAdd(self, pattern, res):
        trueInput = " ".join(pattern.input.split())
        if self.cacheIsCaseSensitive:
            self.cache[trueInput] = res
        else:
            self.cache[trueInput.lower()] = res

    def _coreReplace(self, pattern, freqOverrides = None, **kw):
        # You ALWAYS have a pattern. The only question is, do you
        # use it directly for replacement, or do you generate one
        # from the corpus? 
        if self.patternSource in [PS_EXT_DIST, PS_CORP_DIST]:
            pat = self.patternDist.WeightedChoice(noneVal = None)
            pattern = pattern.__class__(pattern.replacer, pattern.input).fromPatternSequence(pat)
        pattern.finish(overrideDict = freqOverrides)
        return self.engine.renderingStrategy.Replace(pattern, **kw)

    def _addReplacementNewline(self, pattern, repl):
        # Sometimes the seed has a newline in it, and it would be ideal
        # to try to preserve that. Make it work on all platforms, so
        # once we check the number of newlines, make sure that the
        # result searches for an optional preceding \r.
        input = pattern.input or ""
        newlineDiff = input.count("\n") - repl.count("\n")
        if newlineDiff > 0:
            # Capture all the runs of newline followed by whitespace.
            seedIter = re.finditer("\r?\n[ \t]*", input)
            # This is all the whitespace sequences. We want to
            # use the ones which don't contain any newlines.
            # What if we run out of places to put the newlines?
            # Just bail, I guess. Have one optional place at the
            # end.
            replIter = re.finditer("\s+", repl)
            replSlist = []
            replIdx = 0
            for m in seedIter:
                s = m.group()
                try:
                    replM = replIter.next()
                    while replM.group().find("\n") > -1:
                        # Don't put a newline where there already is one.
                        replM = replIter.next()
                    # Collect the relevant strings, move the
                    # replIdex, decrement the newlineDiff.
                    replSlist.append(repl[replIdx:replM.start()])
                    replSlist.append(s)
                    replIdx = replM.end()
                    newlineDiff -= 1
                except StopIteration:
                    # One last at the end.
                    replSlist.append(repl[replIdx:])
                    replIdx = len(repl)
                    replSlist.append(s)
                    break
                if newlineDiff == 0:
                    break
            # Final bit.
            replSlist.append(repl[replIdx:])
            repl = "".join(replSlist)
        return repl            

    # A couple utilities.
    
    def _convertToInitials(self, toks):
        return "".join(map(lambda x: x[0].upper(),
                           filter(lambda x: x.lower() not in ['and', 'of', "or", "the"],
                                  toks)))

    def _Capitalize(self, s):
        toks = s.split()
        finalToks = []
        first = True
        for t in s.split():
            t = t.lower()
            if first:
                finalToks.append(t[0].upper() + t[1:])
                first = False
            elif t in ['and', 'of', 'or', 'the']:
                finalToks.append(t)
            else:
                finalToks.append(t[0].upper() + t[1:])
        return " ".join(finalToks)

# A pattern is a set of features. The pattern might be
# intended to be indexible, which would require the category
# to process the pattern a little further. The pattern is initialized
# from frequencies.

class PIIPattern:

    # The pattern desc is a dictionary of pattern attributes.
    # If the key value is a dictionary as well,
    # the eligible attributes are:
    # "default_freq": the default frequency for the attribute, when
    # no decision has been made about the attribute during digestion (only
    # works for truth-valued attributes)
    # "path": the dependency context in which to make a decision about
    # whether to populate according to the default frequency. Every element
    # in the context must be already set.
    __pattern_desc__ = None

    # The replacer is the class which controls
    # the digestion and rendering for this pattern.
    
    __replacer__ = PIIPatternReplacer

    # The ctype is the hook into the digestion and
    # rendering strategies.
    
    __ctype__ = "NULL"
    
    def __init__(self, replacer, seed = None):
        self.patternDesc = {}
        self.replacer = replacer        
        self.repository = self.replacer.repository
        self.replacementCacheKeys = []
        # Used for the replacer cache, and for
        # newline comparison.
        self.input = seed
        self.freqDict = {}
        if self.__pattern_desc__ is not None:
            self._digestPatternDesc(self.__pattern_desc__)
        self._keyOrder = None

    def _digestPatternDesc(self, pDesc):
        self._keyOrder = None
        for k, v in pDesc.items():
            # Initialize the attribute
            setattr(self, k, None)
            if v is not None:
                for k1, v1 in v.items():
                    if k1 == "default_freq":
                        self.freqDict[k] = v1
                    elif k1 == "path":
                        for p in v1:
                            if not self.__pattern_desc__.has_key(p):
                                raise PIIPatternReplacerError, ("pattern desc for %s refers to unknown attribute %s in path" % (self, p))
                    else:
                        raise PIIPatternReplacerError, ("unknown key %s in pattern freq value for %s" % (k1, self))
            self.patternDesc[k] = v

    def _ensureKeyOrder(self):
        # We need to examine the keys without path contexts before
        # we examine the keys with it.
        if self._keyOrder is None:
            self._keyOrder = []
            allKeys = set(self.patternDesc.keys())
            while allKeys:
                toRemove = set()
                for k in allKeys:
                    v = self.patternDesc[k]
                    if (v is None) or (not v.get("path")) or (set(v["path"]) <= set(self._keyOrder)):
                        # All keys are accounted for.
                        toRemove.add(k)
                        self._keyOrder.append(k)
                if not toRemove:
                    # We couldn't reduce the number of keys, and
                    # we still have keys.
                    raise PIIPatternReplacerError, ("circularity in key order for %s" % self)
                allKeys -= toRemove

    # The frequency elements clearly only work for
    # truth values. If you want to randomly generate other
    # dimensions of the pattern, then you have to subclass this.

    def _fromFreqs(self, overrideDict = None):
        # the freqDict is constructed from the __pattern_desc__.
        if self.freqDict and overrideDict:
            d = overrideDict.copy()
            for k, v in self.freqDict.items():
                if not d.has_key(k):
                    d[k] = v
        else:
            d = self.freqDict or overrideDict or {}
        # Well, it turns out that if nothing's set,
        # we need to evaluate the elements from the top
        # down; we need to make a decision about the
        # things in the path before we make a decision about the path.
        self._ensureKeyOrder()
        # Only update the known keys. But only if
        # they're not already set.
        for k in self._keyOrder:
            v = self.patternDesc[k]
            if not d.has_key(k):
                # We have no frequency for this attribute. Skip it.
                continue
            if hasattr(self, k) and getattr(self, k) is not None:
                # We have a frequency for this attribute, but it has a non-None value. Skip it.
                continue
            factor = 1
            # If there's a path, multiply all the factors together.
            if (v is not None) and v.has_key("path"):
                for fkey in v["path"]:
                    if not (hasattr(self, fkey) and getattr(self, fkey)):
                        # If there's no non-False value for this attribute, barf.
                        factor = -1
                        break
                    if d.has_key(fkey):
                        factor = factor * d[fkey]
            if factor == -1:
                continue
            if factor == 0:
                setattr(self, k, False)
            elif random.random() < ( d[k] / factor ):
                setattr(self, k, True)
            else:
                setattr(self, k, False)

    def finish(self, overrideDict = None):
        
        # Flushes out the pattern with random values.
        # Subclass this if there are non-frequency-governed
        # slots in the pattern which need to be fleshed out.
        
        self._fromFreqs(overrideDict)

    # The toPatternSequence method supports indexing pattern distributions.
    # fromPatternSequence goes the other way.
    
    def toPatternSequence(self):
        return ()

    def fromPatternSequence(self, seq):
        return None

    # This must be true for a pattern in order to use PS_CORP_DIST
    canGenerateCorpDist = False

    # The replacement happens in two steps. First, we get the
    # replacement seed, perhaps from the cache. Any generated
    # replacement seed is stored under all the keys returned by
    # replacementKeys. By default, the only key is the seed itself.
    # By default, the new replacement seed is the original.

    def getReplacementCacheKeys(self):
        # If the CACHE isn't enabled, you should never
        # return replacement cache keys.
        if self.replacer._useCache:
            return self.replacementCacheKeys
        else:
            return []

    def getReplacementCacheKeysForStorage(self):
        return self.getReplacementCacheKeys()

    def setReplacementCacheKeys(self, keys):
        self.replacementCacheKeys = keys
        # Better make sure it's using the cache -
        # otherwise, what's the point of cacheing?
        self.replacer.useSeedCache(True)

    @classmethod
    def newReplacer(cls, engine, label, **kw):
        return cls.__replacer__(engine, cls, label, **kw)

# Phone pattern. This is general.

class PIIPhoneReplacer(PIIPatternReplacer):

    def __init__(self, *args, **kw):
        kw["use_cache"] = True
        return PIIPatternReplacer.__init__(self, *args, **kw)        

class PIIPhonePattern(PIIPattern):

    __replacer__ = PIIPhoneReplacer

    # Phone number. AREA_CODE_FREQ of the time, include the area code.
    # Two different formats: use (area code) AC_PAREN_FREQ of the time.

    # ac_paren_ws is chosen in the context of ac_paren, which
    # is in the context of area_code.

    __pattern_desc__ = {
        "area_code": {"default_freq": .3},
        "ac_paren": {"default_freq": .5,
                     "path": ["area_code"]},
        "ac_paren_ws": {"default_freq": .1,
                        "path": ["area_code", "ac_paren"]},
        "preS": None, "postS": None
        }
    
    __ctype__ = "PHONE"

    # Finish the pattern.
    
    def finish(self, overrideDict = None):
        PIIPattern.finish(self, overrideDict)
        if self.preS is None:
            self.preS = ""
        if self.postS is None:
            self.postS = ""

# Nothing particularly special here.

class PIISSNPattern(PIIPattern):

    __ctype__ = "SSN"

# Nothing particularly special here, either.

class PIIOtherReplacer(PIIPatternReplacer):

    # Let's enhance OTHER with the ability to give it a phrase repository
    # for generation. We'd also look at respecting case, and respecting
    # initials (if it's all caps and no spaces, let's guess initials).
    # These things will be managed in ClearReplacementStrategy.

    def __init__(self, engine, cat_class, label,
                 phraseRepository = None, mimicCase = False, mimicInitials = False,
                 **kw):
        PIIPatternReplacer.__init__(self, engine, cat_class, label, **kw)
        self.phraseRepository = phraseRepository
        self._resource = None
        self.mimicCase = mimicCase
        self.mimicInitials = mimicInitials

    def getReplacementResource(self):
        if self.phraseRepository is None:
            return None
        if not self._resource:
            self._resource = self.repository.loadXMLResource(self.phraseRepository)
        return self._resource

class PIIOtherPattern(PIIPattern):

    # No default frequencies here.
    __pattern_desc__ = {"cap_status": None, "is_initials": None}

    __ctype__ = "OTHER"

    __replacer__ = PIIOtherReplacer

    def finish(self, **kw):
        PIIPattern.finish(self, **kw)
        if self.cap_status is None:
            self.cap_status = MIXED
        self.is_initials = self.is_initials is True

# URL replacer. Should be general.

class PIIURLPattern(PIIPattern):

    # Protocol will be seeded from the incoming pattern,
    # or we'll use HTTP. I'll keep variables to indicate
    # whether to have a port, whether to have a path after the host.

    __pattern_desc__ = {
        "port": {"default_freq": .05},
        "path_tail": {"default_freq": .8}
        }

    __ctype__ = "URL"

# No point digesting this.

class PIIIPAddressPattern(PIIPattern):

    __ctype__ = "IPADDRESS"

# Not even going to try to parse this one.

class PIIEmailPattern(PIIPattern):

    __pattern_desc__ = {"name": None}

    __ctype__ = "EMAIL"

    # We won't finish the pattern. The name can be 
    # created randomly if there's nothing to base it on.
    
# ID replacer. Currently general, should be specialized for AMIA.

class PIIIDReplacer(PIIPatternReplacer):

    def __init__(self, *args, **kw):
        # ID pattern always uses the cache.
        kw["use_cache"] = True
        return PIIPatternReplacer.__init__(self, *args, **kw)    

class PIIIDPattern(PIIPattern):

    __replacer__ = PIIIDReplacer

    __pattern_desc__ = {"prefix": None, "template": None}
    __ctype__ = "ID"
    defaultPrefix = "ID"
    
    def finish(self, overrideDict = None):
        PIIPattern.finish(self, overrideDict)
        if self.prefix is None:
            self.prefix = self.defaultPrefix
    
def _IDReplace(seed):
    import string
    # If we do have a seed, replace each uppercase character
    # with another one, same for lowercase and digits.
    chars = []
    for c in seed:
        if c in string.uppercase:
            chars.append(random.choice(string.uppercase))
        elif c in string.lowercase:
            chars.append(random.choice(string.lowercase))
        elif c in string.digits:
            chars.append(random.choice(string.digits))
        else:
            chars.append(c)
    return "".join(chars)

# Hospital replacer. For AMIA, requires specializing the replacer, because we
# want to ensure that we use the category as the pattern.

class PIIHospitalReplacer(PIIPatternReplacer):

    def __init__(self, *args, **kw):
        # Hospital pattern always uses the cache.
        kw["use_cache"] = True
        return PIIPatternReplacer.__init__(self, *args, **kw)    

# The seed could be initials, or
# a full name. Always cache a full name as the replacement. If it's initials,
# then return initials; if it's a full name, generate a replacement, and
# then cache mapping from the initials as well. (At least, when we're doing clear replacement.)

class PIIHospitalPattern(PIIPattern):

    # Hospitals. Pick a random element from
    # the list of hospitals, and a weighted random extension.

    __replacer__ = PIIHospitalReplacer

    __pattern_desc__ = {
        "initials": {"default_freq": .2}
        }
    
    __ctype__ = "HOSPITAL"
    
# Age replacer. Never cache ages.

class PIIAgeReplacer(PIIPatternReplacer):

    def __init__(self, *args, **kw):
        # Age pattern never uses the cache.
        kw["use_cache"] = False
        return PIIPatternReplacer.__init__(self, *args, **kw)

class PIIAgePattern(PIIPattern):
    
    # Ages. Pretty straighforward using the seed. Never cache ages.

    __pattern_desc__ = {
        "spell": {"default_freq": .1},
        "preS": None, "postS": None, "ageLb": None, "ageUb": None
        }
    __replacer__ = PIIAgeReplacer

    __ctype__ = "AGE"

    def finish(self, overrideDict = None):
        PIIPattern.finish(self, overrideDict)
        if self.preS is None:
            self.preS = ""
        if self.postS is None:
            self.postS = ""
        if self.ageLb is None and self.ageUb is None:
            self.ageLb = self.ageUb = random.randint(1, 120)
        elif self.ageLb is None:
            self.ageLb = random.randint(1, 120)
        elif self.ageUb is None:
            self.ageUb = random.randint(1, 120)
            

# Date replacer.

# The idea is that we parse the dates in each document, choose a
# random date shift which allows the dates to stay within the same
# year, if possible (because of how AMIA marks its dates, but
# one can imagine other reasons for doing this, like making the
# deidentified data useful for year-by-year analysis), and then
# applying that date shift to each incoming date during replacement.

# Actually, if there's more than one kind of date, they ALL
# need to be offset by the same offset in the document. There's a
# bug here where if there are different dates, it might use a
# different offset for each. So the first date replacer that's
# found should compute the offsets.

class PIIDateReplacer(PIIPatternReplacer):

    def __init__(self, engine, cat_class, label, **kw):
        PIIPatternReplacer.__init__(self, engine, cat_class, label, **kw)
        self.docDates = []

    def Digest(self, seed):
        res = PIIPatternReplacer.Digest(self, seed)
        self.docDates.append(res)
        return res

    def EndDocumentForDigestion(self):
        replacers = [(k, v) for k, v in self.engine._replacers.items() if isinstance(v, PIIDateReplacer)]
        replacers.sort(key = lambda x: x[0])
        # Do this exactly once. So let's do it only if this is the first
        # item in the sorted list.
        if replacers[0][1] is self:
            docDates = []
            for k, v in replacers:
                docDates += v.docDates
                v.docDates = []
            # Determine a date shift.
            # The datetime objects are in the dt attribute of each of the entities.
            # Figure out the time delta between each date and the beginning or
            # end of the same year.
            if docDates:
                startDelta = 366
                endDelta = 366
                for d in docDates:
                    # There might not be a dateObj.
                    if not d.dateObj:
                        continue
                    try:
                        sdelta = d.dateObj.dt - datetime.datetime(d.dateObj.dt.year, 1, 1)
                        if sdelta.days < startDelta:
                            startDelta = sdelta.days
                    except TypeError:
                        pass
                    try:
                        edelta = datetime.datetime(d.dateObj.dt.year, 12, 31) - d.dateObj.dt
                        if edelta.days < endDelta:
                            endDelta = edelta.days
                    except TypeError:
                        pass
                # OK, now we have deltas on each end. If the end delta 
                # has reasonable room, shift after.
                if endDelta > 15:
                    deltaDays = random.randint(5, endDelta)
                elif startDelta > 15:
                    deltaDays = - random.randint(5, startDelta)
                else:
                    # Just pick something.
                    deltaDays = random.randint(5, 45)
                for d in docDates:
                    if d.dateObj:
                        # Only assign a delta to the things that have dateObjs.
                        d.deltaDay = deltaDays
                self.engine.dateDelta = deltaDays

class PIIDatePattern(PIIPattern):

    __replacer__ = PIIDateReplacer
    
    # These are the data names from the date parser. No
    # frequencies yet, and besides, that wouldn't help
    # because these aren't frequency-assignable. The
    # tok_seq is the pattern of what occurred.

    __pattern_desc__ = {"tok_seq": None, "deltaDay": None, "dateObj": None}
    
    __ctype__ = "DATE"
    
    def _fillPattern(self, dateObj):
        # Import here rather than earlier because we need
        # path information which may not be available at module load
        import dateutil.parser
        # The pattern is derived from the sequence.
        self.tok_seq = []
        for t in dateObj.pseq.ordered_toks():
            features = t.features
            if t.__class__ in [dateutil.parser._ptoken, dateutil.parser._ptok_literal]:
                features = [t.literal] + features
            self.tok_seq.append((t.__tname__,) + tuple(features))

    def finish(self, overrideDict = None):
        PIIPattern.finish(self, overrideDict)
        # This is going to be a tough one. How am I going to generate dates?
        # I haven't the faintest idea how to choose frequencies for the
        # possible patterns. Grrrr.
        # Just borrowed patterns from the dateutil test suite, and made up
        # frequencies.
        # If the pattern has no token sequence, grab a seed.
        if self.tok_seq is None:
            dateDist = self.repository.loadDatePatterns()
            d = dateDist.WeightedChoice(None)
            self._fillPattern(d)

# Location replacer.

class PIILocationReplacer(PIIPatternReplacer):

    # The location replacer collects statistics across the documents about
    # the address patterns which are used, and uses that info during
    # rendering.

    def __init__(self, engine, cat_class, label, **kw):
        kw["pattern_source"] = PS_CORP_DIST
        PIIPatternReplacer.__init__(self, engine, cat_class, label, **kw)
        self.postfixHash = None
        self.streetNumSeeds = []
    
    # Give the address pattern dist to the repository too.

    def getPatternDist(self):
        dist = CountDistributionSet()
        self.repository.addressPatternDist = dist
        return dist

    def getPostfixHash(self):
        if self.postfixHash is None:
            self.postfixHash = {}
            postfixes = self.repository.loadStreetPostfixes()
            for postfix in postfixes:
                fullName = postfix[0]
                abbrs = postfix[1:]
                # Get the full range: period/no period for abbr,
                # comma/no comma for all.
                fullName = fullName.lower()
                self.postfixHash[fullName] = postfix
                self.postfixHash[fullName + ","] = postfix
                for abbr in abbrs:
                    abbr = abbr.lower()                    
                    self.postfixHash[abbr] = postfix
                    self.postfixHash[abbr + "."] = postfix
                    self.postfixHash[abbr + ","] = postfix
                    self.postfixHash[abbr + ".,"] = postfix
        return self.postfixHash                    

# Locations. There's nothing special in AMIA.

class PIILocationPattern(PIIPattern):

    __replacer__ = PIILocationReplacer
    
    # Locations. The repository may or may not have a frequency
    # distribution of location patterns. If it doesn't use the
    # default frequencies to construct a location.

    __pattern_desc__ = {
        "city": {"default_freq": .8},
        "city_comma": {
         "path": ["city"],
         "default_freq": .75},
        "state": {"default_freq": .7},
        "state_comma": {
         "path": ["state"],
         "default_freq": .9},
        "zip": {"default_freq": .4},
        "street_num_seed": None,
        "state_type": None,
        "street": {"default_freq": .6},
        "street_comma": {
         "path": ["street"],
         "default_freq": .7},
        "street_num": {
         "default_freq": .95,
         "path": ["street"]},
        "street_postfix": {
         "path": ["street"],
         "default_freq": 1.0},
        "street_postfix_abbr": {
         "path": ["street", "street_postfix"],
         "default_freq": .75},
        "abbr_has_period": {
         "path": ["street", "street_postfix", "street_postfix_abbr"],
         "default_freq": .95}
        }
        
    __ctype__ = "LOCATION"

    # Locations are special, since I'm going to use subportions of
    # the location pattern to digest and render streets, cities, etc.
    # separately. In these cases, you'll have two different behaviors:
    # one where only a subset of the phrases should be recognized,
    # and one where a subset of the phrases MUST be generated. In previous
    # versions, I relied on the frequencies above to do that, but
    # that turns out to be problematic, because in some cases (e.g.,
    # states), the lookup will fail, and you won't even recognize
    # the state, even though you were looking for it. And that will
    # persist into the rendering. So I have to be able to specify
    # which toplevel elements ("city", "state", "street", "zip")
    # can be recognized, and separately, which must be generated
    # (these will usually be the same, but I don't want to confuse them).
    
    recognizeOnly = mustGenerate = None

    def finish(self, overrideDict = None):
        # Let's impose this right here, before the frequency stuff
        # applies.
        if self.mustGenerate is not None:
            for p in self.mustGenerate:
                if p == "street": self.street = True
                elif p == "city": self.city = True
                elif p == "state":
                    self.state = True
                    # If there's no state, but we must generate one, we had
                    # better set the state type, because we really only want
                    # the full name.
                    self.state_type = self.STATE_KEY_ORDER.index(None)
                elif p == "zip": self.zip = True
        PIIPattern.finish(self, overrideDict)
        if self.street_num_seed is None and \
           self.replacer.streetNumSeeds:
            self.street_num_seed = random.choice(self.replacer.streetNumSeeds)

    STATE_KEY_ORDER = [None, 'longabbr', 'longabbrnodot', 'shortabbr']

# And then there are some specific location categories, which
# deal only with particular slices of the location. They should
# be able to use the location digesters and renderers.

class PIIStreetAddressPattern(PIILocationPattern):

    __ctype__ = "LOCATION"

    recognizeOnly = mustGenerate = ["street"]
    
class PIICityPattern(PIILocationPattern):

    __ctype__ = "LOCATION"
    
    recognizeOnly = mustGenerate = ["city"]
    

class PIIZipCodePattern(PIILocationPattern):

    __ctype__ = "LOCATION"
    
    recognizeOnly = mustGenerate = ["zip"]

class PIIStatePattern(PIILocationPattern):

    recognizeOnly = mustGenerate = ["state"]

# Countries, on the other hand, are separate.

class PIICountryPattern(PIIPattern):

    __ctype__ = "COUNTRY"

# Person replacement, also other.

ALL_UPPER, ALL_LOWER, MIXED = range(3)

class PIIPersonReplacer(PIIPatternReplacer):

    # The location replacer collects statistics across the documents about
    # the address patterns which are used, and uses that info during
    # rendering.

    def __init__(self, engine, cat_class, label, use_cache = True, **kw):
        PIIPatternReplacer.__init__(self, engine, cat_class, label, use_cache = True, **kw)
        # By default,  use the seed cache.
        self.capDist = FloatDistributionSet().fromFrequencyPairs((ALL_UPPER, .1), (ALL_LOWER, .05), (MIXED, .85))
        self.genderDist = FloatDistributionSet().fromFrequencyPairs(("M", .45), ("F", .45), ("N", .1))            
        self.midNameDist = FloatDistributionSet().fromFrequencyPairs((0, .8), (1, .15), (2, .05))
        self.isMidInitDist = FloatDistributionSet().fromFrequencyPairs((True, .7), (False, .3))

    def _Capitalize(self, ntoks):
        nameResource = self.repository.loadNames()
        return " ".join([(random.choice(nameResource.capitalizationHash.get(p, [False])) or \
                          PIIPatternReplacer._Capitalize(self, p))
                         for p in ntoks])

# This cache is pretty interesting. It's the full name, without
# any abbreviation. The lookup is flexible - there are multiple keys
# which can map to the same individual. And the replacement is
# structured, not just a string. This forced me to retool the
# cacheing and how the cache keys and values are stored, and
# actually addressed the mess that the hospital was in.

class PIIPersonPattern(PIIPattern):

    __pattern_desc__ = {
        "one_name": {"default_freq": .05},
        "one_name_is_known_first_name": {
         "default_freq": .1,
         "path": ["one_name"]},
        "last_is_first": {"default_freq": .2},
        "cap_status": None,
        "mid_initials": None, "name_ext": None, "gender": None
        }

    __replacer__ = PIIPersonReplacer

    __ctype__ = "PERSON"

    def finish(self, overrideDict = None):
        PIIPattern.finish(self, overrideDict)
        # Check cap_status, mid_initials, name_ext, gender.
        if self.cap_status is None:
            self.cap_status = self.replacer.capDist.WeightedChoice(noneVal = MIXED)
        if self.name_ext is None:
            # Don't worry about it right now.
            self.name_ext = ""
        if self.mid_initials is None:
            numNames = self.replacer.midNameDist.WeightedChoice(noneVal = 0)
            isInit = self.replacer.isMidInitDist.WeightedChoice(noneVal = True)
            self.mid_initials = numNames * [isInit]
        if self.gender is None:
            # I'm pretty sure that if I don't get a gender, I'd better
            # use the neutral one.
            self.gender = "N" # self.replacer.genderDist.WeightedChoice(noneVal = "N")

    def getReplacementCacheKeys(self):
        # When we retrieve the keys for PERSON, for looking up
        # seeds in the cache, we want to make sure that things that share
        # a single name token (see the clear replacement strategy)
        # don't end up accidently being the same pattern if their
        # other names differ.
        # The cache will be a list of tuples, and we want to
        # look up only the longest element of the key. 
        tupleKeys = PIIPattern.getReplacementCacheKeys(self)
        # Some of the keys are strings and some are tuples.
        if tupleKeys:
            maxTupleLen = max([len(k) for k in tupleKeys])
            return [k for k in tupleKeys if len(k) == maxTupleLen]
        else:
            return []

    # We want to use them all when we store, just not when we look up.
    
    def getReplacementCacheKeysForStorage(self):
        return PIIPattern.getReplacementCacheKeys(self)

# Strategies. I'm making these "new-style" classes
# because, somewhere down in the DEIDStyle section, I need to
# know the method resolution order.

class DigestionStrategy(object):

    def __init__(self, engine):
        self.engine = engine
        self.repository = engine.repository

    def canCache(self, ctype):
        return False

    def canGenerateCorpDist(self, ctype):
        return self.canCache(ctype)

    def Digest(self, pat, seed):
        mName = pat.__ctype__ + "Digest"
        if hasattr(self, mName):
            getattr(self, mName)(pat, seed)

    # The digestion strategy is responsible for finding those
    # things that have already been marked up. This is used
    # when we take raw output of a digestion process and
    # resynthesize.
    
    def FindReplacedElements(self, s, tagList):
        return []

class RenderingStrategy(object):

    def __init__(self, engine):
        self.engine = engine
        self.repository = engine.repository
    
    def Replace(self, pattern, **kw):
        mName = pattern.__ctype__ + "Replace"
        if hasattr(self, mName):
            return getattr(self, mName)(pattern, **kw)
        else:
            return ""

    def getReplacementSeed(self, pattern, meth):
        return pattern.replacer.getReplacementSeed(pattern, meth)

# Main engine.

DOC_CACHE_SCOPE, BATCH_CACHE_SCOPE, NO_CACHE_SCOPE = range(3)

class PIIReplacementEngine:

    # Used to reference the engine. Names don't have
    # to be globally unique. It's a class variable
    #  because we want to access the names before the
    # classes are instantiated.
    
    __rname__ = ""

    # Replacement table: a hash from label to a tuple which is
    # is (PIIPattern, keywords). This is the default
    # way of getting a replacer. The newReplacer() method will
    # be called on the category, with the engine, the label,
    # and the keywords.

    # The cmdlineKw is passed in from the command line, so the values
    # will all be (possibly clumsy) strings. I've added the kw because
    # children of the replacement engine might want to customize
    # specially. cache_scope, cache_case_insensitivity, resource_file_repl
    # are all from that.

    def __init__(self, resource_dirs, categories,
                 cache_scope = None, cache_case_insensitivity = None,
                 resource_file_repl = None, replacement_map_file = None,
                 replacement_map = None, **cmdlineKw):
        self.categories = categories
        self.resourceDirs = resource_dirs

        if type(replacement_map) is not type({}):
            if replacement_map_file:
                if not replacement_map:
                    import codecs
                    fp = codecs.open(replacement_map_file, "r", "utf-8")
                    replacement_map = fp.read()
                    fp.close()
                else:
                    print >> sys.stderr, "Ignoring replacement_map_file in favor of replacement_map"                    

        if type(replacement_map) in (str, unicode):
            # It's JSON.
            from MAT import json
            replacement_map = json.loads(replacement_map)

        self.replacementMap = replacement_map

        # resourceReplacementString is file=repl;file=repl

        resourceReplacements = {}
        if resource_file_repl is not None:
            pairs = resource_file_repl.split(";")
            for pair in pairs:
                toks = pair.split("=", 1)
                if len(toks) != 2:
                    raise Error.MATError("nominate", "bad resource_file_repl pair '%s'" % pair)
                resourceReplacements[toks[0]] = toks[1]
        
        self.repository = Repository(resource_dirs, resourceReplacements)
        self.digestionStrategy = self.createDigestionStrategy()
        self.renderingStrategy = self.createRenderingStrategy()
        # Use the date stuff.
        for p in resource_dirs:
            dateutilPath = os.path.join(p, "python-dateutil-1.3")
            if os.path.isdir(dateutilPath):
                sys.path.insert(0, dateutilPath)
                break
        self._replacers = {}

        # The cache_scope argument suggests scopes for the various
        # ctypes. It's of the form label,scope;label,scope...

        # The cache_case_insensitivity argument is just label;label...

        if cache_scope:
            pairs = cache_scope.split(";")
            for pair in pairs:
                toks = pair.split(",", 1)
                if len(toks) != 2:
                    raise Error.MATError("nominate", "bad cache scope pair '%s'" % pair)
                if toks[1] == "doc":
                    scope = DOC_CACHE_SCOPE
                elif toks[1] == "batch":
                    scope = BATCH_CACHE_SCOPE
                elif toks[1] == "none":
                    scope = NO_CACHE_SCOPE
                else:
                    raise Error.MATError("nominate", "bad cache scope '%s'" % toks[1])
                self.setCacheScope(toks[0], scope)

        if cache_case_insensitivity:
            labels = cache_case_insensitivity.split(";")
            for label in labels:
                self.setCacheCaseInsensitive(label)

    def getReplacer(self, label):
        try:
            return self._replacers[label]
        except KeyError:
            r = self.createReplacer(label)
            self._replacers[label] = r
            return r

    def setCacheScope(self, label, scope):
        # Depends on whether the replacer is already
        # created or not. Let's invent it if it
        # isn't.
        replacer = self.getReplacer(label)
        if scope == NO_CACHE_SCOPE:
            replacer.useCache(False)
        elif scope in [DOC_CACHE_SCOPE, BATCH_CACHE_SCOPE]:
            replacer.useCache(True)
            if scope == BATCH_CACHE_SCOPE:
                replacer.flushAtDocBoundary = False

    def setCacheCaseInsensitive(self, label):
        replacer = self.getReplacer(label)
        replacer.cacheIsCaseSensitive = False

    def createReplacer(self, label):
        # By default, look through the replacement list,
        # and find an entry.
        if self.categories.has_key(label):
            cls, kw = self.categories[label]
            return cls.newReplacer(self, label, **kw)
        else:
            raise PIIPatternReplacerError, "label unknown"

    def Digest(self, label, seed):
        return self.getReplacer(label).Digest(seed)

    def EndDocumentForDigestion(self):
        for v in self._replacers.values():
            v.EndDocumentForDigestion()

    def EndDigestion(self):
        for v in self._replacers.values():
            v.EndDigestion()

    def EndDocumentForReplacement(self):
        for v in self._replacers.values():
            v.EndDocumentForReplacement()

    def Replace(self, label, pattern, **kw):
        return self.getReplacer(label).Replace(pattern, **kw)

    def FindReplacedElements(self, s):
        # This method does the inverse, in the cases
        # where it's possible: it returns tuples
        # (start, end, label) for all the replacements
        # it's made in the given string.
        # Ask the digestion strategy.
        return self.digestionStrategy.FindReplacedElements(s, self.categories.keys())

    def createDigestionStrategy(self):
        raise PIIPatternReplacerError, "unimplemented"
    
    def createRenderingStrategy(self):
        raise PIIPatternReplacerError, "unimplemented"

    # replacementTuples are label, start, end, replacement
    # preservationTuples are label, start, end
    
    def Transform(self, signal, prologue, replacementTuples, preservationTuples):
        stringList = []
        finalIndex = None
        curStartIndex = 0
        if prologue is not None:
            stringList.append(prologue)
            curStartIndex += len(prologue)
        replacementTuples = replacementTuples or []
        preservationTuples = preservationTuples or []
        tuples = replacementTuples + [p + (None,) for p in preservationTuples]
        tuples.sort(key = lambda x: x[1])
        finalTuples = []
        
        for lab, start, end, replacement in tuples:        
            if finalIndex is None:
                stringList.append(signal[:start])
                curStartIndex += start
            else:
                stringList.append(signal[finalIndex:start])
                curStartIndex = curStartIndex + (start - finalIndex)

            if replacement is None:
                replacement = signal[start:end]
            stringList.append(replacement)
            endIndex = curStartIndex + len(replacement)
            finalTuples.append((lab, curStartIndex, endIndex))
            finalIndex = end
            curStartIndex = endIndex
        if finalIndex is None:
            output = signal
        else:
            stringList.append(signal[finalIndex:])
            output = "".join(stringList)
        return output, finalTuples

# The classes below are implemented separately, to support standalone engines,
# including the ability to call these engines from Java via Jython.

class StandaloneReplacementEngineError(Exception):
    pass

class StandaloneReplacementEngineEvent:

    def __init__(self, standaloneEngine, signal, prologue = None):
        self.standaloneEngine = standaloneEngine
        self.replacementTuples = []
        self.preservationTuples = []
        self.signal = signal
        self.prologue = prologue

    def addTuple(self, lab, start, end):
        if lab in self.standaloneEngine.labelsToConvert:
            self.replacementTuples.append((lab, start, end))
        elif lab in self.standaloneEngine.labelsToPreserve:
            self.preservationTuples.append((lab, start, end))

    # This can't be used if any of the replacers are PS_CORP_DIST.

    def convert(self, rName):
        self.replacedSignal = self.replacedTuples = None
        signal = self.signal
        rEngine = self.standaloneEngine.getReplacementEngine(rName)
        # replacementTuples and preservationTuples are label, start, end.
        rDict = {}
        for lab in set([t[0] for t in self.replacementTuples]):
            r = rEngine.getReplacer(lab)
            rDict[lab] = r
            if r.patternSource == PS_CORP_DIST:
                raise StandaloneReplacementEngineError, ("can't do document-by-document conversion because label '%s' uses a corpus-based distribution for replacement" % lab)
        tuplesToProcess = [(lab, start, end, rDict[lab]) for lab, start, end in self.replacementTuples]
        digestions = [(lab, start, end, r, r.Digest(signal[start:end])) for lab, start, end, r in tuplesToProcess]
        rEngine.EndDocumentForDigestion()
        nominations = [(lab, start, end, r.Replace(p)) for lab, start, end, r, p in digestions]
        rEngine.EndDocumentForReplacement()
        self.replacedSignal, self.replacedTuples = rEngine.Transform(signal, self.prologue, nominations, self.preservationTuples)

    def getReplacedSignal(self):
        return self.replacedSignal

    def getReplacedTuples(self):
        return self.replacedTuples

class StandaloneReplacementEngine:

    # These initializations should both be set in a subclass,
    # so that the don't have to be passed by Java.
    
    def __init__(self, replacerDir = None, categories = None, labelsToPreserve = None):
        self.replacerDir = replacerDir or {}
        self.categories = categories or {}
        self.labelsToPreserve = set(labelsToPreserve or [])
        self.labelsToConvert = set(self.categories.keys())
        for lab in list(self.labelsToPreserve):
            if lab in self.labelsToConvert:
                self.labelsToPreserve.discard(lab)
        self.definedReplacers = {}
        self.resourceDirs = []

    def getReplaceableLabels(self):
        return self.categories.keys()

    def addResourceDir(self, dir):
        self.resourceDirs.append(dir)

    # Jython overrides this.
    
    evtClass = StandaloneReplacementEngineEvent
    
    def newEvent(self, signal, prologue = None):
        return self.evtClass(self, signal, prologue)

    def getReplacementEngine(self, rName):
        try:
            return self.definedReplacers[rName]
        except KeyError:
            try:
                r = self.replacerDir[rName](self.resourceDirs, self.categories)
                self.definedReplacers[rName] = r
                return r
            except KeyError:
                raise StandaloneReplacementEngineError, str(e)
