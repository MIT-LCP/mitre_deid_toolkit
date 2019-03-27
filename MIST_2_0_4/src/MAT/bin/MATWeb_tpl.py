#!MF_PYTHONBIN

# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

import os, sys

MAT_PKG_PYLIB = "MF_MAT_PKG_PYLIB"
sys.path.insert(0, MAT_PKG_PYLIB)

# Must import MAT so that sys.path is enhanced.

import MAT

#
# Constants
#

PORT = MAT.Config.MATConfig["HTTP_PORT"]
TABBED_TERMINAL_BIN = MAT.Config.MATConfig.get("TABBED_TERMINAL_BIN")

#
# Toplevel
#

from MAT.Operation import OptionParser, OptionGroup

parser = OptionParser(usage = "Usage: MATWeb [options]")
parser.add_option("--port", type="int",
                  dest = "port",
                  metavar = "num",
                  help = "port to listen on (default is %s)" % PORT)
parser.add_option("--noscreen", action="store_true",
                  dest = "noscreen",
                  help = "don't report errors and access to stdout")
parser.add_option("--access_log",
                  dest = "access_log",
                  metavar = "<log>",
                  help = "absolute pathname of intended access log file. If absent, the Web access information will be written to standard output, unless --noscreen is specified.")
parser.add_option("--error_log",
                  dest = "error_log",
                  metavar = "<log>",
                  help = "absolute pathname of intended error log file. If absent, the Web error information will be written to standard output, unless --noscreen is specified.")
parser.add_option("--tagger_log",
                  dest = "tagger_log",
                  metavar = "<log>",
                  help = "absolute pathname of intended tagger log file. If absent, tagger service status output will be routed to standard output.")
parser.add_option("--clear_logs", action="store_true",
                  dest = "clear_logs",
                  help = "clear the logs before startup")
parser.add_option("--no_cmdloop", action="store_true",
                  dest = "no_cmdloop",
                  help = "don't start up an interactive command loop")
parser.add_option("--disable_interactive_restart", action="store_true",
                  dest = "disable_interactive_restart",
                  help = "don't allow restart from the command loop (the Windows terminal doesn't like it)")
parser.add_option("--no_tagger_service", action="store_true",
                  dest = "no_tagger_service",
                  help = "don't start up the tagger service")
parser.add_option("--localhost_only", action="store_true",
                  dest = "localhost_only",
                  help = "accept connections only from localhost or 127.0.0.1")
parser.add_option("--log_rotation_count", type="int",
                  dest = "log_rotation_count",
                  metavar = "<n>",
                  help = "rotate logs on restart, and keep only n logs")
parser.add_option("--midnight_restart", action="store_true",
                  dest = "midnight_restart",
                  help = "restart automatically at midnight (useful for rolling over logs)")
parser.add_option("--workspace_key", action="store",
                  dest = "workspace_key",
                  metavar = "key",
                  help = "use a specific workspace key. WARNING: the key will be visible in process listings. If you want something more secure, use --workspace_key_file.")
parser.add_option("--workspace_key_file", action="store",
                  dest = "workspace_key_file",
                  metavar = "file",
                  help = "a more secure way of specifying the workspace key. The key file should be readable only by the user starting up MATWeb, and should be a UTF-8 file containing the workspace key.")
parser.add_option("--workspace_key_file_is_temporary", action="store_true",
                  dest = "workspace_key_file_is_temporary",
                  help = "if --workspace_key_file is provided, remove the file immediately after startup.")
parser.add_option("--allow_remote_workspace_access", action="store_true",
                  dest = "allow_remote_workspace_access",
                  help = "allow workspaces to be accessed by clients on remote hosts")
parser.add_option("--workspace_container_directory",
                  dest = "workspace_container_directories",
                  action="append",
                  metavar="<dir>",
                  help = "directory to look for workspaces in (repeatable, must be absolute path)")
parser.add_option("--supersede_existing_server",
                  dest = "supersede_existing_server",
                  action="store_true",
                  help = "if specified, terminate any MATWeb server running on the requested port on this machine, if the current user has permission to do so")
parser.add_option("--output_log",
                  dest = "output_log",
                  metavar = "<log>",
                  help = "redirect all stray output from stdout and stderr to this log")
parser.add_option("--as_service",
                  dest = "as_service",
                  metavar = "<dir>",
                  help = "start up MATWeb as a service. This creates the specified log directory and starts up as if you specified --log_rotation_count 7 --midnight_restart --allow_remote_workspace_access --supersede_existing_server --noscreen --no_cmdloop --access_log <dir>/access.log --error_log <dir>/error.log --tagger_log <dir>/tagger.log --output_log <dir>/output.log . This option is interpreted before all other command line options, so you can also specify options like --log_rotation_count or --access_log if you like. Options like --workspace_container_directory, --localhost_only, --workspace_key, --no_tagger_service are also respected.")
parser.add_option("--spawn_tabbed_terminal",
                  dest = "spawn_tabbed_terminal",
                  action="store_true",
                  help = "If available, spawn the Web server in a tabbed terminal and exit. The tabbed terminal is " + (((not TABBED_TERMINAL_BIN) and "NOT ") or "") + "available in this installation.")
MAT.ExecutionContext.addOptions(parser)

options, args = parser.parse_args()
if args:
    parser.print_help()
    sys.exit(1)

if options.spawn_tabbed_terminal:
    # Set up the tabbed terminal.
    if not TABBED_TERMINAL_BIN:
        print >> sys.stderr, "No tabbed terminal available. Ignoring."
    elif options.no_tagger_service or options.no_cmdloop or \
       options.log_rotation_count or options.midnight_restart or options.as_service or \
       options.output_log:
        print >> sys.stderr, "Some options (--no_tagger_service, --no_cmdloop, --log_rotation_count, --midnight_restart, --as_service, --output_log) are incompatible with tabbed terminal mode."
        sys.exit(1)
    else:
        # First, make sure the port isn't taken. The Jarafe server port will increment by itself
        # if it's taken. If we're going to supersede server, don't bother checking.
        httpPort = options.port or int(PORT)
        if (not options.supersede_existing_server) and MAT.Utilities.portTaken(httpPort):
            print >> sys.stderr, ("The requested Web server port %d is taken." % httpPort)
            sys.exit(1)
        # Next, make sure we have logs.
        MAT_PKG_HOME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        logRoot = os.path.join(MAT_PKG_HOME, "http_log")
        if not (options.access_log and options.error_log and options.tagger_log):
            if os.path.exists(logRoot):
                if not os.path.isdir(logRoot):
                    print >> sys.stderr, ("Log root %s exists, but is not a directory." % logRoot)
                else:
                    for p in ["access_log", "error_log", "tagger_log"]:
                        if os.path.exists(os.path.join(logRoot, p)):
                            os.remove(os.path.join(logRoot, p))
            else:
                os.makedirs(logRoot)
        accessLog = options.access_log or os.path.join(logRoot, "access_log")
        errorLog = options.error_log or os.path.join(logRoot, "error_log")
        taggerLog = options.tagger_log or os.path.join(logRoot, "tagger_log")
        import subprocess

        # Gotta create a command line for the Web stuff.
        # What params do I have to add?

        def assemble_params(protectFn):
            params = [protectFn(os.path.abspath(sys.argv[0])),
                      "--noscreen", '--access_log', protectFn(accessLog),
                      "--error_log", protectFn(errorLog),
                      '--tagger_log', protectFn(taggerLog),
                      ("--port %d" % httpPort)]
            for op in ["clear_logs", "localhost_only", "workspace_key_file_is_temporary",
                       "allow_remote_workspace_access", "supersede_existing_server",
                       "debug", "subprocess_statistics", "preserve_tempfiles"]:
                if getattr(options, op):
                    params.append("--" + op)
            for op in ["workspace_key", "workspace_key_file", "tmpdir_root"]:
                if getattr(options, op) is not None:
                    params.append('--%s %s' % (op, protectFn(getattr(options, op))))
            if options.workspace_container_directories:
                for d in options.workspace_container_directories:
                    params.append('--workspace_container_directory %s' % protectFn(d))
            if options.subprocess_debug is not None:
                params.append("--subprocess_debug %d" % options.subprocess_debug)
            return params
        
        if sys.platform == "win32":
            # For the life of me, I can't figure out how to pass a double-quoted
            # string in as an argument inside a single-quoted string for the 
            # tabbed terminal. I don't know whether it's something that CMD /K
            # can't do, or whether it's a defect of Console.exe. (And yes, I
            # tried both /s and escaping with ^; I either get a breaks on
            # the space in the argument or no arguments at all.) So my solution
            # is to get the short name.
            # This protector only works with EXISTING files. So I have to check
            # to see if MAT_PKG_HOME is a prefix if it fails.
            def protector(p):
                if p[-1] == '"':
                    p = p[:-1] + "\\"
                path = unicode(p)
                from ctypes import windll, create_unicode_buffer, sizeof, WinError
                buf=create_unicode_buffer(4*len(path))
                v = windll.kernel32.GetShortPathNameW(path,buf,sizeof(buf))
                if v:
                    return buf.value
                elif p.startswith(MAT_PKG_HOME):
                    return protector(MAT_PKG_HOME) + p[len(MAT_PKG_HOME):]
                else:
                    return path
            params = assemble_params(protector) + ["--disable_interactive_restart"]
            subprocess.Popen([protector(TABBED_TERMINAL_BIN), "-w", "MAT Controller",
                              "-c", protector(os.path.join(MAT_PKG_HOME, "etc", "console_win32.xml")),
                              "-t", "Web access log", "-r",
                              "/k %s %s %s" % (protector(sys.executable), protector(os.path.join(MAT_PKG_HOME, "etc", "tail.py")), protector(accessLog)), 
                              "-t", "Web error log", "-r",
                              "/k %s %s %s" % (protector(sys.executable), protector(os.path.join(MAT_PKG_HOME, "etc", "tail.py")), protector(errorLog)),
                              "-t", "Tagger status log", "-r",
                              "/k %s %s %s" % (protector(sys.executable), protector(os.path.join(MAT_PKG_HOME, "etc", "tail.py")), protector(taggerLog)),
                              "-t", "Web server", "-r",
                              ("/k %s" % " ".join(params))])
            sys.exit(0)
        elif os.path.basename(TABBED_TERMINAL_BIN) == "mrxvt":
            # Unix. On Mac, it'll be Terminator; otherwise, mrxvt.
            # mrxvt. Double quotes are NOT allowed for commands - they're passed
            # directly through. You must escape with backquote. And it's even
            # worse for the tail.
            def protector(s):
                return s.replace(" ", "\\ ")
            subprocess.Popen([protector(TABBED_TERMINAL_BIN), "--title", "MAT Controller",
                              "--holdExit", "yes", "--hideButtons",
                              "--initProfileList", "0,1,2,3",
                              "--profile0.tabTitle", "Web server",
                              "--profile0.command", " ".join(assemble_params(protector)),
                              "--profile1.tabTitle", "Web access log",
                              "--profile1.command",
                              '%s %s' % (protector(os.path.join(MAT_PKG_HOME, "etc", "tail_file.sh")), protector(accessLog)),
                              "--profile2.tabTitle", "Web error log",
                              "--profile2.command",
                              '%s %s' % (protector(os.path.join(MAT_PKG_HOME, "etc", "tail_file.sh")), protector(errorLog)),
                              "--profile3.tabTitle", "Tagger status log",
                              "--profile3.command",
                              '%s %s' % (protector(os.path.join(MAT_PKG_HOME, "etc", "tail_file.sh")), protector(taggerLog))])
            sys.exit(0)
        else:
            def protector(s):
                return '"%s"' % s
            subprocess.Popen([protector(TABBED_TERMINAL_BIN), 
                              "-n", "Web server", " ".join(assemble_params(protector)),
                              "-n", "Web access log",
                              '%s %s' % (protector(os.path.join(MAT_PKG_HOME, "etc", "tail_file.sh")), protector(accessLog)),
                              "-n", "Web error log",
                              '%s %s' % (protector(os.path.join(MAT_PKG_HOME, "etc", "tail_file.sh")), protector(errorLog)),
                              "-n", "Tagger status log",
                              '%s %s' % (protector(os.path.join(MAT_PKG_HOME, "etc", "tail_file.sh")), protector(taggerLog))]
                             )
            sys.exit(0)        

MAT.ExecutionContext.extractOptions(options)

from MAT.CherryPyService import CherryPyService, ServiceConfigurationException

if options.workspace_container_directories is not None:
    for w in options.workspace_container_directories:
        if not os.path.isabs(w):
            print >> sys.stderr, "Workspace container directory '%s' is not an absolute pathname." % w
            sys.exit(1)

try:
    svc = CherryPyService(options.port or int(PORT),
                          localhostOnly = options.localhost_only,
                          noScreen = options.noscreen,
                          accessLog = options.access_log,
                          errorLog = options.error_log,
                          taggerLog = options.tagger_log,
                          clearLogs = options.clear_logs,
                          runTaggerService = not options.no_tagger_service,
                          runCmdLoop = not options.no_cmdloop,
                          disableInteractiveRestart = options.disable_interactive_restart,
                          logRotationCount = options.log_rotation_count,
                          midnightRestart = options.midnight_restart,                      
                          workspaceKey = options.workspace_key,
                          workspaceKeyFile = options.workspace_key_file,
                          workspaceKeyFileIsTemporary = options.workspace_key_file_is_temporary,
                          workspaceContainerDirectories = options.workspace_container_directories,
                          allowRemoteWorkspaceAccess = options.allow_remote_workspace_access,
                          supersedeExistingServer = options.supersede_existing_server,
                          outputLog = options.output_log,
                          asService = options.as_service)
    svc.run()
except ServiceConfigurationException, e:
    print >> sys.stderr, "Encountered service configuration exception: %s" % e
    print >> sys.stderr, "Exiting."
    sys.exit(1)
