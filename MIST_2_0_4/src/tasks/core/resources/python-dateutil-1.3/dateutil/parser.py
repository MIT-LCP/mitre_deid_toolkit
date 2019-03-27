# -*- coding:iso-8859-1 -*-
"""
Copyright (c) 2003-2007  Gustavo Niemeyer <gustavo@niemeyer.net>

This module offers extensions to the standard python 2.3+
datetime module.
"""
__author__ = "Gustavo Niemeyer <gustavo@niemeyer.net>"
__license__ = "PSF License"

import datetime
import string
import time
import sys
import os

try:
    from cStringIO import StringIO
except ImportError:
    from StringIO import StringIO

import relativedelta
import tz


__all__ = ["parse", "parserinfo"]


# Some pointers:
#
# http://www.cl.cam.ac.uk/~mgk25/iso-time.html
# http://www.iso.ch/iso/en/prods-services/popstds/datesandtime.html
# http://www.w3.org/TR/NOTE-datetime
# http://ringmaster.arc.nasa.gov/tools/time_formats.html
# http://search.cpan.org/author/MUIR/Time-modules-2003.0211/lib/Time/ParseDate.pm
# http://stein.cshl.org/jade/distrib/docs/java.text.SimpleDateFormat.html


class _timelex(object):

    def __init__(self, instream):
        if isinstance(instream, basestring):
            instream = StringIO(instream)
        self.instream = instream
        self.wordchars = ('abcdfeghijklmnopqrstuvwxyz'
                          'ABCDEFGHIJKLMNOPQRSTUVWXYZ_'
                          'ßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ'
                          'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ')
        self.numchars = '0123456789'
        self.whitespace = ' \t\r\n'
        self.charstack = []
        self.tokenstack = []
        self.eof = False

    def get_token(self):
        if self.tokenstack:
            return self.tokenstack.pop(0)
        seenletters = False
        token = None
        state = None
        wordchars = self.wordchars
        numchars = self.numchars
        whitespace = self.whitespace
        while not self.eof:
            if self.charstack:
                nextchar = self.charstack.pop(0)
            else:
                nextchar = self.instream.read(1)
                while nextchar == '\x00':
                    nextchar = self.instream.read(1)
            if not nextchar:
                self.eof = True
                break
            elif not state:
                token = nextchar
                if nextchar in wordchars:
                    state = 'a'
                elif nextchar in numchars:
                    state = '0'
                elif nextchar in whitespace:
                    token = ' '
                    break # emit token
                else:
                    break # emit token
            elif state == 'a':
                seenletters = True
                if nextchar in wordchars:
                    token += nextchar
                elif nextchar == '.':
                    token += nextchar
                    state = 'a.'
                else:
                    self.charstack.append(nextchar)
                    break # emit token
            elif state == '0':
                if nextchar in numchars:
                    token += nextchar
                elif nextchar == '.':
                    token += nextchar
                    state = '0.'
                else:
                    self.charstack.append(nextchar)
                    break # emit token
            elif state == 'a.':
                seenletters = True
                if nextchar == '.' or nextchar in wordchars:
                    token += nextchar
                elif nextchar in numchars and token[-1] == '.':
                    token += nextchar
                    state = '0.'
                else:
                    self.charstack.append(nextchar)
                    break # emit token
            elif state == '0.':
                if nextchar == '.' or nextchar in numchars:
                    token += nextchar
                elif nextchar in wordchars and token[-1] == '.':
                    token += nextchar
                    state = 'a.'
                else:
                    self.charstack.append(nextchar)
                    break # emit token
        if (state in ('a.', '0.') and
            (seenletters or token.count('.') > 1 or token[-1] == '.')):
            l = token.split('.')
            token = l[0]
            for tok in l[1:]:
                self.tokenstack.append('.')
                if tok:
                    self.tokenstack.append(tok)
        return token

    def __iter__(self):
        return self

    def next(self):
        token = self.get_token()
        if token is None:
            raise StopIteration
        return token

    def split(cls, s):
        return list(cls(s))
    split = classmethod(split)


class _resultbase(object):

    def __init__(self):
        for attr in self.__slots__:
            setattr(self, attr, None)

    def _repr(self, classname):
        l = []
        for attr in self.__slots__:
            value = getattr(self, attr)
            if value is not None:
                l.append("%s=%s" % (attr, `value`))
        return "%s(%s)" % (classname, ", ".join(l))

    def __repr__(self):
        return self._repr(self.__class__.__name__)


# Not about to wrestle with the _resultbase. The idea is that
# the _parse method will return a sequence of tokens which
# will be converted into a _result object, and then to a datetime
# object. The sequence will be in order, and contain all the
# relevant structural information about what was found.

class _ptoken:

    __tname__ = "unk"
    __features__ = []

    def __init__(self, literal, value = None, 
                 pos = 0, features = None, dt_obj = None):
        self.literal = literal
        self.dt_obj = dt_obj
        if value is None:
            value = self.digest_value(literal)
        self.set_value(value)
        self.pos = pos
        if features is not None:
            self.features = features[:]
        else:
            self.features = []

    def __repr__(self):
        if self.features:
            fStr = " " + ",".join(self.features)
        else:
            fStr = ""
        return "<%s '%s'%s>" % (self.__tname__, self.literal, fStr)

    def digest_value(self, v):
        return None

    def set_value(self, value):
        self.value = value
        if self.dt_obj is not None:
            self.set_dt(value)

    def set_dt(self, val):
        pass

class _ptok_year(_ptoken):

    __tname__ = "yr"
    __features__ = ["2digit", "4digit"]

    def digest_value(self, v):
        return int(v)

    def set_dt(self, val):
        self.dt_obj.year = val

class _ptok_month(_ptoken):

    __tname__ = "mo"
    __features__ = ["2digit", "shortname", "longname"]

    def digest_value(self, v):
        return int(v)

    def set_dt(self, val):
        self.dt_obj.month = val

class _ptok_day(_ptoken):
    
    __tname__ = "day"
    __features__ = ["2digit"]

    def digest_value(self, v):
        return int(v)

    def set_dt(self, val):
        self.dt_obj.day = val

class _ptok_wkday(_ptoken):

    __tname__ = "wkday"
    __features__ = ["shortname", "longname"]

    def digest_value(self, v):
        return int(v)

    def set_dt(self, val):
        self.dt_obj.weekday = val

class _ptok_hour(_ptoken):

    __tname__ = "hr"
    __features__ = ["12hr", "2digit"]

    def digest_value(self, v):
        return int(v)

    def set_dt(self, val):
        self.dt_obj.hour = val

class _ptok_minute(_ptoken):

    __tname__ = "min"

    def digest_value(self, v):
        return int(v)

    def set_dt(self, val):
        self.dt_obj.minute = val

class _ptok_second(_ptoken):

    __tname__ = "sec"

    def digest_value(self, v):
        return int(v)

    def set_dt(self, val):
        self.dt_obj.second = val

class _ptok_msecond(_ptoken):

    __tname__ = "msec"

    def digest_value(self, v):
        return int(v)

    def set_dt(self, val):
        self.dt_obj.microsecond = val

class _ptok_timezone(_ptoken):

    __tname__ = "tz"

    def digest_value(self, v):
        return v

    def set_dt(self, val):
        self.dt_obj.tzname = val

class _ptok_tzoffset(_ptoken):

    __tname__ = "tz_off"

    def digest_value(self, v):
        return v

    def set_dt(self, val):
        self.dt_obj.tzoffset = val

class _ptok_tzoffset_minutes(_ptoken):

    __tname__ = "tz_offmin"

    def digest_value(self, v):
        return v

class _ptok_literal(_ptoken):

    __tname__ = "lit"
    __features__ = ["ordinal"]
    

class _ptok_sequence:

    def __init__(self, toks, dt_obj = None):
        self.toks = toks
        self.starts = []
        i = 0
        for t in self.toks:
            self.starts.append(i)
            i += len(t)
        self.tok_objs = {}
        self.dt_obj = dt_obj
        self.type_dict = {}

    def add(self, i, literal, value = None, offset = 0,
            ptype = _ptoken, features = None):
        pos = self.starts[i] + offset
        t = ptype(literal, value, pos, features, self.dt_obj)
        self.tok_objs[pos] = t
        self.type_dict[ptype] = t
        return t

    def value(self, ptype):
        try:
            return self.type_dict[ptype].value
        except KeyError:
            return None

    def update_value(self, ptype, val):
        try:
            self.type_dict[ptype].set_value(val)
        except KeyError:
            pass

    def update_feature(self, ptype, f):
        try:
            self.type_dict[ptype].features.append(f)
        except KeyError:
            pass

    def update_ymd_type(self, tok, ptype):
        if tok.__class__ == ptype:
            return
        self.type_dict[tok.__class__] = None
        # Set the type.
        newTok = ptype(tok.literal, tok.value, tok.pos, tok.features[:], self.dt_obj)
        self.tok_objs[tok.pos] = newTok
        self.type_dict[ptype] = newTok
        if ptype is _ptok_year:
            if len(newTok.literal) == 2:
                newTok.features.append("2digit")
            else:
                newTok.features.append("4digit")                
        elif newTok.literal[0] == "0":
            # If the lead digit is 0, then we need to
            # be two digits.
            newTok.features.append("2digit")
        

    def add_float(self, i, literal, dot_index, t1, t2, v1, v2, offset = 0, f1 = None, f2 = None):
        self.add(i, literal[:dot_index], ptype = t1, value = v1,
                 offset = offset, features = f1)
        self.add(i, '.', ptype = _ptok_literal, offset = offset + dot_index)
        self.add(i, literal[dot_index + 1:], ptype = t2, value = v2,
                 offset = offset + dot_index + 1, features = f2)

    def ordered_toks(self):
        keys = self.tok_objs.keys()
        keys.sort()
        return [ self.tok_objs[k] for k in keys ]

    def __repr__(self):
        return "<seq" + "".join(map(lambda x: " " + repr(x), self.ordered_toks())) + ">"

# Rewritten extensively to manage data more transparently,
# and incorporate parser features. Make sure you don't break
# custom parserinfo.

class parserinfo(object):

    # m from a.m/p.m, t from ISO T separator
    JUMP = [" ", ".", ",", ";", "-", "/", "'",
            "at", "on", "and", "ad", "m", "t", "of",
            "st", "nd", "rd", "th"] 

    WEEKDAYS = [("Mon", "Monday"),
                ("Tue", "Tuesday"),
                ("Wed", "Wednesday"),
                ("Thu", "Thursday"),
                ("Fri", "Friday"),
                ("Sat", "Saturday"),
                ("Sun", "Sunday")]
    MONTHS   = [("Jan", "January"),
                ("Feb", "February"),
                ("Mar", "March"),
                ("Apr", "April"),
                ("May", "May"),
                ("Jun", "June"),
                ("Jul", "July"),
                ("Aug", "August"),
                ("Sep", "September"),
                ("Oct", "October"),
                ("Nov", "November"),
                ("Dec", "December")]
    HMS = [("h", "hour", "hours"),
           ("m", "minute", "minutes"),
           ("s", "second", "seconds")]
    AMPM = [("am", "a"),
            ("pm", "p")]
    UTCZONE = ["UTC", "GMT", "Z"]
    PERTAIN = ["of"]
    TZOFFSET = {}

    JUMP_T, WEEKDAY_T, MONTH_T = range(3)
    
    FEATURE_TABLE = {tuple([(x, JUMP_T) for x in ("st", "nd", "rd", "th")]): "ordinal",
                     tuple([(x[1].lower(), WEEKDAY_T) for x in WEEKDAYS]): "longname",
                     tuple([(x[1].lower(), MONTH_T) for x in MONTHS]): "longname",
                     tuple([(x[0].lower(), WEEKDAY_T) for x in WEEKDAYS]): "shortname",
                     tuple([(x[0].lower(), MONTH_T) for x in MONTHS]): "shortname"}

    def __init__(self, dayfirst=False, yearfirst=False):
        self._jump = self._convert(self.JUMP)
        self._weekdays = self._convert(self.WEEKDAYS)
        self._months = self._convert(self.MONTHS)
        self._hms = self._convert(self.HMS)
        self._ampm = self._convert(self.AMPM)
        self._utczone = self._convert(self.UTCZONE)
        self._pertain = self._convert(self.PERTAIN)
        self._ftable = {}
        for key, val in self.FEATURE_TABLE.items():
            for k in key:
                self._ftable[k] = val

        self.dayfirst = dayfirst
        self.yearfirst = yearfirst

        self._year = time.localtime().tm_year
        self._century = self._year//100*100

    def _convert(self, lst):
        dct = {}
        for i in range(len(lst)):
            v = lst[i]
            if isinstance(v, tuple):
                for v in v:
                    dct[v.lower()] = i
            else:
                dct[v.lower()] = i
        return dct

    def features(self, val, ftype):
        try:
            return [self._ftable[(val.lower(), ftype)]]
        except KeyError:
            return None

    def jump(self, name):
        return name.lower() in self._jump

    def weekday(self, name):
        if len(name) >= 3:
            try:
                return self._weekdays[name.lower()]
            except KeyError:
                pass
        return None

    def month(self, name):
        if len(name) >= 3:
            try:
                return self._months[name.lower()]+1
            except KeyError:
                pass
        return None

    def hms(self, name):
        try:
            return self._hms[name.lower()]
        except KeyError:
            return None

    def ampm(self, name):
        try:
            return self._ampm[name.lower()]
        except KeyError:
            return None

    def pertain(self, name):
        return name.lower() in self._pertain

    def utczone(self, name):
        return name.lower() in self._utczone

    def tzoffset(self, name):
        if name in self._utczone:
            return 0
        return self.TZOFFSET.get(name)

    def convertyear(self, year):
        if year < 100:
            year += self._century
            if abs(year-self._year) >= 50:
                if year < self._year:
                    year += 100
                else:
                    year -= 100
        return year

    def validate(self, res):
        # move to info
        if res.year is not None:
            res.year = self.convertyear(res.year)
        if res.tzoffset == 0 and not res.tzname or res.tzname == 'Z':
            res.tzname = "UTC"
            res.tzoffset = 0
        elif res.tzoffset != 0 and res.tzname and self.utczone(res.tzname):
            res.tzoffset = 0
        return True

class parser(object):

    def __init__(self, info=None):
        self.info = info or parserinfo()

    class _result(_resultbase):
        __slots__ = ["year", "month", "day", "weekday",
                     "hour", "minute", "second", "microsecond",
                     "tzname", "tzoffset"]

    class _parseresult(_result):
        
        __slots__ = [ "pseq", "res", "dt"]

    def digest(self, timestr, default=None,
               ignoretz=False, tzinfos=None,
               **kwargs):
        if not default:
            default = datetime.datetime.now().replace(hour=0, minute=0,
                                                      second=0, microsecond=0)
        seq = self._tokenize(timestr, **kwargs)
        if seq is None:
            raise ValueError, "unknown string format"
        repl = {}
        res = seq.dt_obj
        for attr in ["year", "month", "day", "hour",
                     "minute", "second", "microsecond"]:
            value = getattr(res, attr)
            if value is not None:
                repl[attr] = value
        ret = default.replace(**repl)
        if res.weekday is not None and not res.day:
            ret = ret+relativedelta.relativedelta(weekday=res.weekday)
        if not ignoretz:
            if callable(tzinfos) or tzinfos and res.tzname in tzinfos:
                if callable(tzinfos):
                    tzdata = tzinfos(res.tzname, res.tzoffset)
                else:
                    tzdata = tzinfos.get(res.tzname)
                if isinstance(tzdata, datetime.tzinfo):
                    tzinfo = tzdata
                elif isinstance(tzdata, basestring):
                    tzinfo = tz.tzstr(tzdata)
                elif isinstance(tzdata, int):
                    tzinfo = tz.tzoffset(res.tzname, tzdata)
                else:
                    raise ValueError, "offset must be tzinfo subclass, " \
                                      "tz string, or int offset"
                ret = ret.replace(tzinfo=tzinfo)
            elif res.tzname and res.tzname in time.tzname:
                ret = ret.replace(tzinfo=tz.tzlocal())
            elif res.tzoffset == 0:
                ret = ret.replace(tzinfo=tz.tzutc())
            elif res.tzoffset:
                ret = ret.replace(tzinfo=tz.tzoffset(res.tzname, res.tzoffset))
        p = self._parseresult()
        p.pseq = seq
        p.res = res
        p.dt = ret
        return p

    def parse(self, timestr, default=None,
              ignoretz=False, tzinfos=None,
              **kwargs):
        p = self.digest(timestr, default, ignoretz, tzinfos, **kwargs)
        return p.dt

    def _parse(self, timestr, dayfirst=None, yearfirst=None, fuzzy=False):
        seq = self._tokenize(timestr, dayfirst, yearfirst, fuzzy)
        if seq is not None:
            return seq.dt_obj
        else:
            return None

    def _tokenize(self, timestr, dayfirst=None, yearfirst=None, fuzzy=False):
        info = self.info
        if dayfirst is None:
            dayfirst = info.dayfirst
        if yearfirst is None:
            yearfirst = info.yearfirst
        res = self._result()
        tz_signal_flipped = False
        l = _timelex.split(timestr)
        ptoks = _ptok_sequence(l, res)
        # try:
        if True:

            # year/month/day list
            ymd = []

            # Index of the month string in ymd
            mstridx = -1

            len_l = len(l)

            i = 0
            while i < len_l:

                # Check if it's a number
                try:
                    value = float(l[i])
                except ValueError:
                    value = None
                if value is not None:
                    # Token is a number
                    len_li = len(l[i])
                    val_i = i
                    i += 1
                    if (len(ymd) == 3 and len_li in (2, 4)
                        and (i >= len_l or (l[i] != ':' and
                                            info.hms(l[i]) is None))):
                        # 19990101T23[59]
                        s = l[val_i]
                        ptoks.add(val_i, s[:2], ptype = _ptok_hour, features = ["2digit"])
                        if len_li == 4:
                            ptoks.add(val_i, s[2:], ptype = _ptok_minute, offset = 2)
                    elif len_li == 6 or (len_li > 6 and l[i-1].find('.') == 6):
                        # YYMMDD or HHMMSS[.ss]
                        s = l[val_i]
                        if not ymd and l[i-1].find('.') == -1:
                            ymd.append(ptoks.add(val_i, s[:2], value = info.convertyear(int(s[:2])),
                                                 features = ["2digit"]))
                            ymd.append(ptoks.add(val_i, s[2:4], value = int(s[2:4]), offset = 2,
                                                 features = ["2digit"]))
                            ymd.append(ptoks.add(val_i, s[4:], value = int(s[4:]), offset = 4,
                                                 features = ["2digit"]))
                        else:
                            # 19990101T235959[.59]
                            ptoks.add(val_i, s[:2], ptype = _ptok_hour, features = ["2digit"])
                            ptoks.add(val_i, s[2:4], ptype = _ptok_minute, offset = 2)
                            secStr = s[4:]
                            value = float(secStr)
                            sec, msec = _parsems(value)
                            ptoks.add_float(val_i, secStr, secStr.find('.'),
                                            _ptok_second, _ptok_msecond, sec, msec,
                                            offset = 4)
                    elif len_li == 8:
                        # YYYYMMDD
                        s = l[val_i]
                        ymd.append(ptoks.add(val_i, s[:4], value = int(s[:4]),
                                             features = ["4digit"]))
                        ymd.append(ptoks.add(val_i, s[4:6], value = int(s[4:6]), offset = 4,
                                             features = ["2digit"]))
                        ymd.append(ptoks.add(val_i, s[6:], value = int(s[6:]), offset = 6,
                                             features = ["2digit"]))
                    elif len_li in (12, 14):
                        # YYYYMMDDhhmm[ss]
                        s = l[val_i]
                        ymd.append(ptoks.add(val_i, s[:4], value = int(s[:4])))
                        ymd.append(ptoks.add(val_i, s[4:6], value = int(s[4:6]), offset = 4))
                        ymd.append(ptoks.add(val_i, s[6:8], value = int(s[6:8]), offset = 6))
                        ptoks.add(val_i, s[8:10], ptype = _ptok_hour, offset = 8,
                                  features = ["2digit"])
                        ptoks.add(val_i, s[10:12], ptype = _ptok_minute, offset = 10)
                        if len_li == 14:
                            ptoks.add(val_i, s[12:], value = int(s[12:]),
                                      ptype = _ptok_second, offset = 12)
                    elif ((i < len_l and info.hms(l[i]) is not None) or
                          (i+1 < len_l and l[i] == ' ' and
                           info.hms(l[i+1]) is not None)):
                        # HH[ ]h or MM[ ]m or SS[.ss][ ]s
                        if l[i] == ' ':
                            ptoks.add(i, l[i], ptype = _ptok_literal)
                            i += 1
                        idx = info.hms(l[i])
                        ptoks.add(i, l[i], ptype = _ptok_literal)
                        while True:
                            if idx == 0:
                                if value%1:
                                    ptoks.add_float(val_i, l[val_i], l[val_i].find('.'),
                                                    _ptok_hour, _ptok_minute,
                                                    int(value), int(60*(value%1)),
                                                    f1 = ["2digit"])
                                else:
                                    ptoks.add(val_i, l[val_i], ptype = _ptok_hour, features = ["2digit"])
                            elif idx == 1:
                                if value%1:
                                    ptoks.add_float(val_i, l[val_i], l[val_i].find('.'),
                                                    _ptok_minute, _ptok_second,
                                                    int(value), int(60*(value%1)))
                                else:
                                    ptoks.add(val_i, l[val_i], ptype = _ptok_minute)
                            elif idx == 2:
                                sec, msec = _parsems(value)                                
                                dotIdx = l[val_i].find('.')
                                if dotIdx > -1:
                                    ptoks.add_float(val_i, l[val_i], dotIdx,
                                                    _ptok_second, _ptok_msecond, sec, msec)
                                else:
                                    ptoks.add(val_i, l[val_i], ptype = _ptok_second, value = sec)
                            i += 1
                            if i >= len_l or idx == 2:
                                break
                            # 12h00
                            try:
                                value = float(l[i])
                                val_i = i
                            except ValueError:
                                break
                            else:
                                i += 1
                                idx += 1
                                if i < len_l:
                                    newidx = info.hms(l[i])
                                    if newidx is not None:
                                        ptoks.add(i, l[i], ptype = _ptok_literal)
                                        idx = newidx
                    elif i+1 < len_l and l[i] == ':':
                        # HH:MM[:SS[.ss]]
                        ptoks.add(val_i, l[val_i], ptype = _ptok_hour, features = ["2digit"])
                        ptoks.add(i, l[i], ptype = _ptok_literal)
                        i += 1
                        value = float(l[i])
                        val_i = i
                        if value%1:
                            ptoks.add_float(val_i, l[val_i], l[val_i].find('.'),
                                            _ptok_minute, _ptok_second,
                                            int(value), int(60*(value%1)))
                        else:
                            ptoks.add(val_i, l[val_i], ptype = _ptok_minute)
                        i += 1
                        if i < len_l and l[i] == ':':
                            ptoks.add(i, l[i], ptype = _ptok_literal)
                            value = float(l[i+1])
                            sec, msec = _parsems(value)
                            dotIdx = l[i+1].find('.')
                            if dotIdx > -1:
                                ptoks.add_float(i+1, l[i+1], dotIdx,
                                                _ptok_second, _ptok_msecond, sec, msec)
                            else:
                                ptoks.add(i+1, l[i+1], ptype = _ptok_second, value = sec)
                            i += 2
                    elif i < len_l and l[i] in ('-', '/', '.'):
                        sep = l[i]
                        ptoks.add(i, l[i], ptype = _ptok_literal)
                        ymd.append(ptoks.add(val_i, l[val_i], value = int(value)))
                        i += 1
                        if i < len_l and not info.jump(l[i]):
                            try:
                                # 01-01[-01]
                                v = int(l[i])
                                ymd.append(ptoks.add(i, l[i], value = v))
                            except ValueError:
                                # 01-Jan[-01]
                                value = info.month(l[i])
                                if value is not None:
                                    ymd.append(ptoks.add(i, l[i], value = value,
                                                         features = info.features(l[i], info.MONTH_T)))
                                    assert mstridx == -1
                                    mstridx = len(ymd)-1
                                else:
                                    return None
                            i += 1
                            if i < len_l and l[i] == sep:
                                # We have three members
                                ptoks.add(i, l[i], ptype = _ptok_literal)
                                i += 1
                                value = info.month(l[i])
                                if value is not None:
                                    ymd.append(ptoks.add(i, l[i], value = value,
                                                         features = info.features(l[i], info.MONTH_T)))
                                    mstridx = len(ymd)-1
                                    assert mstridx == -1
                                else:
                                    ymd.append(ptoks.add(i, l[i], value = int(l[i])))
                                i += 1
                    elif i >= len_l or info.jump(l[i]):
                        if i+1 < len_l and info.ampm(l[i+1]) is not None:
                            ptoks.add(i, l[i], ptype = _ptok_literal,
                                      features = info.features(l[i], info.JUMP_T))
                            # 12 am
                            hr = int(value)
                            # SAM: we don't care about the interpreted values
                            # for the pattern, so we add the token, THEN
                            # update the object.
                            ptoks.add(val_i, l[val_i], value = hr,
                                      ptype = _ptok_hour, features = ["12hr"])
                            if hr < 12 and info.ampm(l[i+1]) == 1:
                                hr += 12
                            elif hr == 12 and info.ampm(l[i+1]) == 0:
                                hr = 0
                            res.hour = hr
                            i += 1
                            ptoks.add(i, l[i], ptype = _ptok_literal)
                        else:
                            # Year, month or day
                            if i < len_l and info.jump(l[i]):
                                ptoks.add(i, l[i], ptype = _ptok_literal,
                                          features = info.features(l[i], info.JUMP_T))
                            ymd.append(ptoks.add(val_i, l[val_i], value = int(value)))
                        i += 1
                    elif info.ampm(l[i]) is not None:
                        # 12am
                        hr = int(value)
                        ptoks.add(val_i, l[val_i], value = hr,
                                  ptype = _ptok_hour, features = ["12hr"])
                        if hr < 12 and info.ampm(l[i]) == 1:
                            hr += 12
                        elif hr == 12 and info.ampm(l[i]) == 0:
                            hr = 0
                        res.hour = hr
                        ptoks.add(i, l[i], ptype = _ptok_literal)
                        i += 1
                    elif not fuzzy:
                        return None
                    else:
                        ptoks.add(i, l[i], ptype = _ptoken)
                        i += 1
                    continue

                # Check weekday
                value = info.weekday(l[i])
                if value is not None:
                    ptoks.add(i, l[i], ptype = _ptok_wkday, value = value,
                              features = info.features(l[i], info.WEEKDAY_T))
                    i += 1
                    continue

                # Check month name
                value = info.month(l[i])
                if value is not None:
                    ymd.append(ptoks.add(i, l[i], value = value,
                                         features = info.features(l[i], info.MONTH_T)))
                    assert mstridx == -1
                    mstridx = len(ymd)-1
                    i += 1
                    if i < len_l:
                        if l[i] in ('-', '/'):
                            # Jan-01[-99]
                            sep = l[i]
                            ptoks.add(i, l[i], ptype = _ptok_literal)
                            i += 1
                            ymd.append(ptoks.add(i, l[i], value = int(l[i])))
                            i += 1
                            if i < len_l and l[i] == sep:
                                # Jan-01-99
                                ptoks.add(i, l[i], ptype = _ptok_literal)
                                i += 1
                                ymd.append(ptoks.add(i, l[i], value = int(l[i])))
                                i += 1
                        elif (i+3 < len_l and l[i] == l[i+2] == ' '
                              and info.pertain(l[i+1])):
                            # Jan of 01
                            # In this case, 01 is clearly year
                            try:
                                value = int(l[i+3])
                            except ValueError:
                                # Wrong guess
                                ptoks.add(i+3, l[i+3], ptype = _ptoken)
                            else:
                                # Convert it here to become unambiguous
                                ymd.append(ptoks.add(i+3, l[i+3], value = info.convertyear(value)))
                            ptoks.add(i, l[i], ptype = _ptok_literal)
                            ptoks.add(i+1, l[i+1], ptype = _ptok_literal)
                            ptoks.add(i+2, l[i+2], ptype = _ptok_literal)
                            i += 4
                    continue

                # Check am/pm
                value = info.ampm(l[i])
                if value is not None:
                    # Note that we only care about updating
                    # the value on the object, and the feature on the token.
                    if value == 1 and res.hour is not None and res.hour < 12:
                        res.hour += 12
                        ptoks.update_feature(_ptok_hour, "12hr")
                    elif value == 0 and res.hour == 12:
                        res.hour = 0
                        ptoks.update_feature(_ptok_hour, "12hr")
                    ptoks.add(i, l[i], ptype = _ptok_literal)                    
                    i += 1
                    continue

                # Check for a timezone name
                if (res.hour is not None and len(l[i]) <= 5 and
                    res.tzname is None and res.tzoffset is None and
                    not [x for x in l[i] if x not in string.ascii_uppercase]):
                    ptoks.add(i, l[i], ptype = _ptok_timezone)
                    res.tzoffset = info.tzoffset(res.tzname)
                    i += 1

                    # SAM: Note that the following updates happen
                    # directly on the result object, because I'm only interested
                    # in the LITERAL pattern, not the interpreted one, and
                    # this is on the interpretation. Note that the
                    # test that gets us in here is also done on the
                    # result object.

                    # Check for something like GMT+3, or BRST+3. Notice
                    # that it doesn't mean "I am 3 hours after GMT", but
                    # "my time +3 is GMT". If found, we reverse the
                    # logic so that timezone parsing code will get it
                    # right.
                    if i < len_l and l[i] in ('+', '-'):
                        l[i] = ('+', '-')[l[i] == '+']
                        # But since we're modifying the sequence of tokens,
                        # we need to track that this was flipped in order to
                        # do the right thing when we see it later.
                        tz_signal_flipped = True
                        res.tzoffset = None
                        if info.utczone(res.tzname):
                            # With something like GMT+3, the timezone
                            # is *not* GMT.
                            res.tzname = None

                    continue

                # Check for a numbered timezone
                if res.hour is not None and l[i] in ('+', '-'):
                    signal = (-1,1)[l[i] == '+']
                    true_tok = l[i]
                    if tz_signal_flipped:
                        true_tok = ('+', '-')[l[i] == '+']
                    ptoks.add(i, true_tok, ptype = _ptok_literal)
                    i += 1
                    len_li = len(l[i])
                    if len_li == 4:
                        # -0300
                        tzo = int(l[i][:2])*3600+int(l[i][2:])*60
                        ptoks.add(i, l[i], ptype = _ptok_tzoffset, value = tzo)
                    elif i+1 < len_l and l[i+1] == ':':
                        # -03:00
                        tzo = int(l[i])*3600+int(l[i+2])*60
                        ptoks.add(i, l[i], ptype = _ptok_tzoffset, value = tzo)
                        ptoks.add(i + 1, l[i + 1], ptype = _ptok_literal)
                        ptoks.add(i + 2, l[i + 2], ptype = _ptok_tzoffset_minutes)
                        i += 3
                    elif len_li <= 2:
                        # -[0]3
                        tzo = int(l[i][:2])*3600
                        ptoks.add(i, l[i], ptype = _ptok_tzoffset, value = tzo)
                    else:
                        return None
                    i += 1
                    res.tzoffset *= signal

                    # Look for a timezone name between parenthesis
                    if (i+3 < len_l and
                        info.jump(l[i]) and l[i+1] == '(' and l[i+3] == ')' and
                        3 <= len(l[i+2]) <= 5 and
                        not [x for x in l[i+2]
                                if x not in string.ascii_uppercase]):
                        # -0300 (BRST)
                        ptoks.add(i, l[i], ptype = _ptok_literal,
                                  features = info.features(l[i], info.JUMP_T))
                        ptoks.add(i+1, l[i+1], ptype = _ptok_literal)
                        ptoks.add(i+2, l[i+2], ptype = _ptok_timezone)
                        ptoks.add(i+3, l[i+3], ptype = _ptok_literal)
                        i += 4
                    continue

                # Check jumps
                if not (info.jump(l[i]) or fuzzy):
                    return None
                elif info.jump(l[i]):
                    ptoks.add(i, l[i], ptype = _ptok_literal,
                              features = info.features(l[i], info.JUMP_T))
                i += 1

            # Process year/month/day
            len_ymd = len(ymd)
            if len_ymd > 3:
                # More than three members!?
                return None
            elif len_ymd == 1 or (mstridx != -1 and len_ymd == 2):
                # One member, or two members with a month string
                if mstridx != -1:
                    ptoks.update_ymd_type(ymd[mstridx], _ptok_month)
                    del ymd[mstridx]
                if len_ymd > 1 or mstridx == -1:
                    if ymd[0].value > 31:
                        ptoks.update_ymd_type(ymd[0], _ptok_year)
                    else:
                        ptoks.update_ymd_type(ymd[0], _ptok_day)
            elif len_ymd == 2:
                # Two members with numbers
                if ymd[0].value > 31:
                    # 99-01
                    ptoks.update_ymd_type(ymd[0], _ptok_year)
                    ptoks.update_ymd_type(ymd[1], _ptok_month)
                elif ymd[1].value > 31:
                    # 01-99
                    ptoks.update_ymd_type(ymd[0], _ptok_month)
                    ptoks.update_ymd_type(ymd[1], _ptok_year)
                elif dayfirst and ymd[1].value <= 12:
                    # 13-01
                    ptoks.update_ymd_type(ymd[0], _ptok_day)
                    ptoks.update_ymd_type(ymd[1], _ptok_month)
                else:
                    # 01-13
                    ptoks.update_ymd_type(ymd[0], _ptok_month)
                    ptoks.update_ymd_type(ymd[1], _ptok_day)
            if len_ymd == 3:
                # Three members
                if mstridx == 0:
                    ptoks.update_ymd_type(ymd[0], _ptok_month)
                    ptoks.update_ymd_type(ymd[1], _ptok_day)
                    ptoks.update_ymd_type(ymd[2], _ptok_year)
                elif mstridx == 1:
                    if ymd[0].value > 31 or (yearfirst and ymd[2].value <= 31):
                        # 99-Jan-01
                        ptoks.update_ymd_type(ymd[0], _ptok_year)
                        ptoks.update_ymd_type(ymd[1], _ptok_month)
                        ptoks.update_ymd_type(ymd[2], _ptok_day)
                    else:
                        # 01-Jan-01
                        # Give precendence to day-first, since
                        # two-digit years is usually hand-written.
                        ptoks.update_ymd_type(ymd[0], _ptok_day)
                        ptoks.update_ymd_type(ymd[1], _ptok_month)
                        ptoks.update_ymd_type(ymd[2], _ptok_year)
                elif mstridx == 2:
                    # WTF!?
                    if ymd[1].value > 31:
                        # 01-99-Jan
                        ptoks.update_ymd_type(ymd[0], _ptok_day)
                        ptoks.update_ymd_type(ymd[1], _ptok_year)
                        ptoks.update_ymd_type(ymd[2], _ptok_month)
                    else:
                        # 99-01-Jan
                        ptoks.update_ymd_type(ymd[0], _ptok_year)
                        ptoks.update_ymd_type(ymd[1], _ptok_day)
                        ptoks.update_ymd_type(ymd[2], _ptok_month)
                else:
                    if ymd[0].value > 31 or \
                       (yearfirst and ymd[1].value <= 12 and ymd[2].value <= 31):
                        # 99-01-01
                        ptoks.update_ymd_type(ymd[0], _ptok_year)
                        ptoks.update_ymd_type(ymd[1], _ptok_month)
                        ptoks.update_ymd_type(ymd[2], _ptok_day)
                    elif ymd[0].value > 12 or (dayfirst and ymd[1].value <= 12):
                        # 13-01-01
                        ptoks.update_ymd_type(ymd[0], _ptok_day)
                        ptoks.update_ymd_type(ymd[1], _ptok_month)
                        ptoks.update_ymd_type(ymd[2], _ptok_year)
                    else:
                        # 01-13-01
                        ptoks.update_ymd_type(ymd[0], _ptok_month)
                        ptoks.update_ymd_type(ymd[1], _ptok_day)
                        ptoks.update_ymd_type(ymd[2], _ptok_year)

        # except (IndexError, ValueError, AssertionError):
        #    return None

        if not self.info.validate(res):
            return None
        
        return ptoks

DEFAULTPARSER = parser()
def parse(timestr, parserinfo=None, **kwargs):
    if parserinfo:
        return parser(parserinfo).parse(timestr, **kwargs)
    else:
        return DEFAULTPARSER.parse(timestr, **kwargs)

def digest(timestr, parserinfo=None, **kwargs):
    if parserinfo:
        return parser(parserinfo).digest(timestr, **kwargs)
    else:
        return DEFAULTPARSER.digest(timestr, **kwargs)


class _tzparser(object):

    class _result(_resultbase):

        __slots__ = ["stdabbr", "stdoffset", "dstabbr", "dstoffset",
                     "start", "end"]

        class _attr(_resultbase):
            __slots__ = ["month", "week", "weekday",
                         "yday", "jyday", "day", "time"]

        def __repr__(self):
            return self._repr("")

        def __init__(self):
            _resultbase.__init__(self)
            self.start = self._attr()
            self.end = self._attr()

    def parse(self, tzstr):
        res = self._result()
        l = _timelex.split(tzstr)
        try:

            len_l = len(l)

            i = 0
            while i < len_l:
                # BRST+3[BRDT[+2]]
                j = i
                while j < len_l and not [x for x in l[j]
                                            if x in "0123456789:,-+"]:
                    j += 1
                if j != i:
                    if not res.stdabbr:
                        offattr = "stdoffset"
                        res.stdabbr = "".join(l[i:j])
                    else:
                        offattr = "dstoffset"
                        res.dstabbr = "".join(l[i:j])
                    i = j
                    if (i < len_l and
                        (l[i] in ('+', '-') or l[i][0] in "0123456789")):
                        if l[i] in ('+', '-'):
                            signal = (1,-1)[l[i] == '+']
                            i += 1
                        else:
                            signal = -1
                        len_li = len(l[i])
                        if len_li == 4:
                            # -0300
                            setattr(res, offattr,
                                    (int(l[i][:2])*3600+int(l[i][2:])*60)*signal)
                        elif i+1 < len_l and l[i+1] == ':':
                            # -03:00
                            setattr(res, offattr,
                                    (int(l[i])*3600+int(l[i+2])*60)*signal)
                            i += 2
                        elif len_li <= 2:
                            # -[0]3
                            setattr(res, offattr,
                                    int(l[i][:2])*3600*signal)
                        else:
                            return None
                        i += 1
                    if res.dstabbr:
                        break
                else:
                    break

            if i < len_l:
                for j in range(i, len_l):
                    if l[j] == ';': l[j] = ','

                assert l[i] == ','

                i += 1

            if i >= len_l:
                pass
            elif (8 <= l.count(',') <= 9 and
                not [y for x in l[i:] if x != ','
                       for y in x if y not in "0123456789"]):
                # GMT0BST,3,0,30,3600,10,0,26,7200[,3600]
                for x in (res.start, res.end):
                    x.month = int(l[i])
                    i += 2
                    if l[i] == '-':
                        value = int(l[i+1])*-1
                        i += 1
                    else:
                        value = int(l[i])
                    i += 2
                    if value:
                        x.week = value
                        x.weekday = (int(l[i])-1)%7
                    else:
                        x.day = int(l[i])
                    i += 2
                    x.time = int(l[i])
                    i += 2
                if i < len_l:
                    if l[i] in ('-','+'):
                        signal = (-1,1)[l[i] == "+"]
                        i += 1
                    else:
                        signal = 1
                    res.dstoffset = (res.stdoffset+int(l[i]))*signal
            elif (l.count(',') == 2 and l[i:].count('/') <= 2 and
                  not [y for x in l[i:] if x not in (',','/','J','M',
                                                     '.','-',':')
                         for y in x if y not in "0123456789"]):
                for x in (res.start, res.end):
                    if l[i] == 'J':
                        # non-leap year day (1 based)
                        i += 1
                        x.jyday = int(l[i])
                    elif l[i] == 'M':
                        # month[-.]week[-.]weekday
                        i += 1
                        x.month = int(l[i])
                        i += 1
                        assert l[i] in ('-', '.')
                        i += 1
                        x.week = int(l[i])
                        if x.week == 5:
                            x.week = -1
                        i += 1
                        assert l[i] in ('-', '.')
                        i += 1
                        x.weekday = (int(l[i])-1)%7
                    else:
                        # year day (zero based)
                        x.yday = int(l[i])+1

                    i += 1

                    if i < len_l and l[i] == '/':
                        i += 1
                        # start time
                        len_li = len(l[i])
                        if len_li == 4:
                            # -0300
                            x.time = (int(l[i][:2])*3600+int(l[i][2:])*60)
                        elif i+1 < len_l and l[i+1] == ':':
                            # -03:00
                            x.time = int(l[i])*3600+int(l[i+2])*60
                            i += 2
                            if i+1 < len_l and l[i+1] == ':':
                                i += 2
                                x.time += int(l[i])
                        elif len_li <= 2:
                            # -[0]3
                            x.time = (int(l[i][:2])*3600)
                        else:
                            return None
                        i += 1

                    assert i == len_l or l[i] == ','

                    i += 1

                assert i >= len_l

        except (IndexError, ValueError, AssertionError):
            return None

        return res


DEFAULTTZPARSER = _tzparser()
def _parsetz(tzstr):
    return DEFAULTTZPARSER.parse(tzstr)


def _parsems(value):
    return int(value), int(value * 1000000) - int(value) * 1000000


# vim:ts=4:sw=4:et
