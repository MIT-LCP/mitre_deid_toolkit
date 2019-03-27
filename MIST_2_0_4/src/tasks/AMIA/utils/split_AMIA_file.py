# Copyright (C) 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

# This simple script converts a single XML file from the
# AMIA 2006 evaluation into a directory of individual documents.

import sys, os, re, getopt

#
# Guts
#

SPLIT_PAT = re.compile('<RECORD ID="([^"]*)".*?</RECORD>', re.S)

# The patterns I've found in the AMIA files are:
# "/dddd", "/dd" (6/14/</PHI>/2005)
# " , dddd"
# " dddd" (April</PHI> 2001) (but be careful of " 12:03")
# "-dd" (6-14</PHI>-05)
# " of dddd" (December</PHI> of 1992) (also OF)
# "dddd"<PHI>dddd (2005<PHI>1216)

DATE_PAT = re.compile("""<PHI\s+TYPE\s*=\s*['"]DATE["']\s*>([^<]*)</PHI>""")
FOURDIGIT_GENERAL_SUFFIX_PAT = re.compile("[- /]\d{4,4}")
TWODIGIT_GENERAL_SUFFIX_PAT = re.compile("[- /]\d{2,2}")
COMMA_SUFFIX_PAT = re.compile("\s+,\s+\d{4,4}")                              
OF_SUFFIX_PAT = re.compile("\s+of\s+\d{4,4}", re.I)
FOUR_DIGIT_PAT = re.compile("\d{4,4}")

PHI_PAT = re.compile("""<PHI\s+TYPE\s*=\s*['"]([^'"]*)['"]\s*>([^<]*)</PHI>""")

def editContents(s, extendDates, promoteTypes):
    if extendDates:
        for m in DATE_PAT.finditer(s):
            m1 = FOURDIGIT_GENERAL_SUFFIX_PAT.match(s, m.end())
            if m1 is not None:
                s = s[:m.start()] + s[m.start():m.end(1)] + s[m1.start():m1.end()] + "</PHI>" + s[m1.end():]
                continue
            m1 = TWODIGIT_GENERAL_SUFFIX_PAT.match(s, m.end())
            if (m1 is not None) and ((m1.end() == len(s)) or (s[m1.end()] != ":")):
                s = s[:m.start()] + s[m.start():m.end(1)] + s[m1.start():m1.end()] + "</PHI>" + s[m1.end():]
                continue
            m1 = COMMA_SUFFIX_PAT.match(s, m.end())
            if m1 is not None:
                s = s[:m.start()] + s[m.start():m.end(1)] + s[m1.start():m1.end()] + "</PHI>" + s[m1.end():]
                continue
            m1 = OF_SUFFIX_PAT.match(s, m.end())
            if m1 is not None:
                s = s[:m.start()] + s[m.start():m.end(1)] + s[m1.start():m1.end()] + "</PHI>" + s[m1.end():]
                continue
            # Left context
            m1 = FOUR_DIGIT_PAT.match(s, m.start() - 4)
            if (m1 is not None) and FOUR_DIGIT_PAT.match(s, m.start(1)):
                s = s[:m.start() - 4] + s[m.start():m.start(1)] + s[m.start() - 4:m.start()] + s[m.start(1):m.end()] + s[m.end():]
                continue
    if promoteTypes:
        sChunks = []
        i = 0
        for m in PHI_PAT.finditer(s):
            if i < m.start():
                sChunks.append(s[i:m.start()])
            sChunks.append("<" + m.group(1) + ">")
            sChunks.append(m.group(2))
            sChunks.append("</" + m.group(1) + ">")
            i = m.end()
        if i < len(s):
            sChunks.append(s[i:])
        s = "".join(sChunks)
    return s

# There are some errors in the released version of the data. Here, we fix them.

def makeRepairs(s):
    train1ErrorPos = s.find(' and Keflex since the <PHI TYPE="DATE">25th of July<PHI TYPE="DOCTOR">')
    if train1ErrorPos > -1:
        print 'Repairing training data error:  <PHI TYPE="DATE">25th of July<PHI TYPE="DOCTOR"> ->  <PHI TYPE="DATE">25th of July</PHI>'
        s = s.replace(' and Keflex since the <PHI TYPE="DATE">25th of July<PHI TYPE="DOCTOR">',
                      ' and Keflex since the <PHI TYPE="DATE">25th of July</PHI>', 1)
    s = s.replace('\r\n', '\n')
    return s

def splitAMIAFile(inputFile, outputDir, extendDates, promoteTypes, simulate):
    fp = open(inputFile, "r")
    s = fp.read()
    fp.close()
    s = makeRepairs(s)
    for m in SPLIT_PAT.finditer(s):
        fName = os.path.join(outputDir, m.group(1) + ".xml")
        print "Writing", m.group(1) + ".xml"
        newS = editContents(s[m.start():m.end()], extendDates, promoteTypes)
        if not simulate:
            fp = open(fName, "w")
            fp.write(newS)
            fp.close()

#
# Toplevel
#

def Usage():
    print >> sys.stderr, "Usage: split_AMIA_file.py [ --extend_dates ] [ --promote_type_attr ] [ --simulate ] input_file output_dir"
    sys.exit(1)

opts, args = getopt.getopt(sys.argv[1:], "", ["extend_dates", "promote_type_attr", "simulate"])

EXTEND_DATES = False
PROMOTE_TYPES = False
SIMULATE = False

if len(args) != 2:
    Usage()

for k, v in opts:
    if k == "--extend_dates":
        EXTEND_DATES = True
    elif k == "--promote_type_attr":
        PROMOTE_TYPES = True
    elif k == "--simulate":
        SIMULATE = True

[INPUT_FILE, OUTPUT_DIR] = args

if os.path.exists(OUTPUT_DIR) and (not SIMULATE):
    print >> sys.stderr, "Error: output directory %s already exists." % OUTPUT_DIR
    Usage()    

if not os.path.exists(INPUT_FILE):
    print >> sys.stderr, "Error: input file %s does not exist." % INPUT_FILE
    Usage()

if not SIMULATE:
    os.makedirs(OUTPUT_DIR)

splitAMIAFile(INPUT_FILE, OUTPUT_DIR, EXTEND_DATES, PROMOTE_TYPES, SIMULATE)
