#!/bin/sh

# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.


# A simple utility which will loop until a file exists,
# and then tail it.

if [ $# -ne 1 ] ; then
  echo "Usage: tail_file.sh f"
  exit 1
fi

_file="$1"

if [ ! -f "$_file" ] ; then
  echo "[No log found yet]";
  while [ ! -f "$_file" ] ; do 
    sleep 1
  done
fi

tail -f "$_file"
