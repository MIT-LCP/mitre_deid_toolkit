#!/bin/sh

# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.


# This script checks for the appropriate Python installation, and then 
# hands off to Python to finish the install. I can't bear to write 
# this whole thing in sh, even though it's probably the right thing
# to do.

inst_pythonbin=`which python`
if ( echo $inst_pythonbin | grep "^no " > /dev/null ); then
  inst_pythonbin=
fi

while true; do
  while [ -z "$inst_pythonbin" ] ; do
    printf "Please provide a version 2 Python executable (2.6 or later): "
    read inst_pythonbin
  done
  echo "Trying $inst_pythonbin"
  pversion=`$inst_pythonbin -V 2>&1 | sed -e 's|Python ||'`
  major_version=`echo $pversion | cut -d "." -f 1`
  minor_version=`echo $pversion | cut -d "." -f 2`
  if [ "$major_version" -ne 2 -o "$minor_version" -lt 4 ]; then
    echo "Python version ${major_version}.${minor_version} cannot be used."
    inst_pythonbin=
  else
    break
  fi
done

# At this point, we can invoke Python.

# Locate current directory.
d="`/usr/bin/dirname $0`"
# Find its true location
trued="`cd $d; /bin/pwd`"

exec "$inst_pythonbin" "$trued/install.py" "$@"
