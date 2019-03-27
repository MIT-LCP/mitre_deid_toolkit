#!/bin/sh

# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.


# A simple utility which will loop until a file exists,
# and then tail it.

if [ $# -lt 1 ] ; then
  echo "Usage: tail_text.sh s ..."
  exit 1
fi

for x in "$@" ; do
  echo $x
done

cat -
