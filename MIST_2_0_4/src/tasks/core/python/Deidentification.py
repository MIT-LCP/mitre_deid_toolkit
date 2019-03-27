# Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
# file LICENSE for license terms.

from MAT.PluginMgr import PluginTaskDescriptor, \
     PluginError, FindPluginClass, PluginStep, TagStep, WholeZoneStep
from MAT.PluginDocInstaller import PluginDocInstaller
from ReplacementEngine import PIIReplacementEngine, DOC_CACHE_SCOPE, \
     BATCH_CACHE_SCOPE, NO_CACHE_SCOPE
from ClearReplacementStrategy import ClearRenderingStrategy
from MAT import Error
from MAT.Workspace import WorkspaceOperation, WorkspaceError, WorkspaceFolder, \
     CMDLINE_DEBUG_AVAILABLE, UI_AVAILABLE, NOT_AVAILABLE, CMDLINE_AVAILABLE, \
     CoreWorkspaceFolder, Workspace, \
     MATEngineExecutionWorkspaceOperationMixin
from MAT.WorkspaceDB import WorkspaceDB
from MAT.Operation import OpArgument
from MAT.Score import AggregatorScoreColumn, FileAggregateScoreRow, BaseScoreRow, Formula

import os

# Used way below, in augmentTagSummaryScoreTable etc.

class DocConfidence(Formula):

    def __init__(self, header):
        self.header = header

    def render(self, scoreTable, separator = None):
        return self.compute()

    def compute(self):
        # So I've passed in None below, just to trigger
        # the capture of the file row. 
        fileRow, ignore = self.header
        doc = fileRow.hypDoc
        # Let's see if there's any confidence info here.
        # This will work with Carafe, probably nothing else.
        seqConfidences = doc.getAnnotations(["seq_confidence"])
        if not seqConfidences:
            return None
        return reduce(lambda x, y: x * y, [float(a["posterior"]) for a in seqConfidences])

# I limit this to just completed documents, unless specified.

class RedactionOperation(WorkspaceOperation):

    name = "redact"

    argList = [OpArgument("replacer", help = "specify the replacer to use for this redaction (optional; obligatory if no replacer is specified in the task.xml file)",
                          hasArg = True),
               OpArgument("retain_existing", help = "don't clear the redacted folders first"),
               OpArgument("dont_limit_to_gold", help = "under normal circumstances, the redaction will apply only to gold and reconciled documents. If this flag is present, it applies to all documents.")]

    def getAffectedFolders(self):
        return ["redacted, rich", "redacted, raw"]

    def getTargetFolderAndDocuments(self):
        return "redacted, rich", self._getTargetDocuments("redacted, rich")

    def do(self, replacer = None, retain_existing = False, dont_limit_to_gold = False):

        # Clear the redacted folders. Run the engine.
        
        operationSettings = self.getOperationSettings()
        
        if operationSettings is None:        
            raise WorkspaceError, ("no operation settings in task '%s' for operation '%s'" % (self.folder.workspace.task.name, self.name))

        operationSettings = operationSettings.copy()

        # Now, we've got our settings. At least workflow and steps are defined.

        try:        
            workflow = operationSettings["workflow"]
        except KeyError:
            raise WorkspaceError, ("workflow undefined in tag prep operation settings")

        if replacer is not None:
            operationSettings["replacer"] = replacer
        elif not operationSettings.has_key("replacer"):
            raise WorkspaceError, "no replacer specified in operation settings or command"

        del operationSettings["workflow"]

        rawFolder = self.folder.workspace.folders['redacted, raw']
        richFolder = self.folder.workspace.folders['redacted, rich']
        
        if not retain_existing:
            rawFolder.clear()
            richFolder.clear()

        if not dont_limit_to_gold:
            # Find the documents which are completed, and only use those.
            self.affectedBasenames = [r[1] for r in self.folder.workspace.getDB().basenameInfo(self.affectedBasenames)
                                      if r[2] in ("reconciled", "gold")]

        allPaths = self.folder.getFiles(self.affectedBasenames)

        try:
            import MAT.ToolChain
            e = MAT.ToolChain.MATEngine(workflow = workflow, task = self.folder.workspace.task.name)
            # I'd forced this to be debug = True, back when I was passing debug all over the place.
            # At this point, we're going to have to go with the less informative message.
            dataPairs = e.Run(inputFileList = allPaths, input_file_type = "mat-json", 
                              **operationSettings)
        except Exception, e:
            raise WorkspaceError, str(e)
        
        # If this succeeds, I should write all the files to
        # the appropriate folder.        

        for file, output in dataPairs:
            richFolder.saveFile(output, os.path.basename(file))
            rawFolder.saveFile(output, os.path.basename(file))
    
    def webResult(self):
        d = WorkspaceOperation.webResult(self)
        # We want the document status to be something consistent.
        # It doesn't really matter what the actual status is.
        # The folder listing will reveal no
        # basename info for the target folder, so I don't need to hack that too.
        if d.has_key("status"):
            del d["status"]
        return d

# The only reason I need this is because I need to be able to review
# nominations in workspaces. Grrr.

# Because this requires a lock ID, etc., I'm replacing it with something very similar
# to autotag.

class NominationOperation(WorkspaceOperation, MATEngineExecutionWorkspaceOperationMixin):

    name = "nominate"
    
    argList = [OpArgument("replacer", help = "specify the replacer to use for this nomination (optional; obligatory if no replacer is specified in the task.xml file)",
                          hasArg = True),
               OpArgument("dont_limit_to_gold", help = "under normal circumstances, the nomination will apply only to gold and reconciled documents. If this flag is present, it applies to all documents."),
               OpArgument("lock_id", hasArg = True, help="lock ID (if document is locked)")]

    def getAffectedFolders(self):
        return ["nominated"]
    
    def getTargetFolderAndDocuments(self):
        # Cache the target documents, so I don't open them
        # again when I lock in webResult().
        self.targetDocuments = self._getTargetDocuments("nominated")
        return "nominated", self.targetDocuments    

    def getAffectedFileBasenames(self):
        if hasattr(self, "affectedFileBasename"):
            return {self.affectedFileBasename: self.affectedBasenames[0]}
        else:
            return WorkspaceOperation.getAffectedFileBasenames(self)

    def allPaths(self):
        if not self.dont_limit_to_gold:
            # Find the documents which are completed, and only use those.
            if hasattr(self, "affectedFileBasename"):
                paths = [os.path.join(self.folder.dir, p[0])
                         for p in self.folder.workspace.getDB().basenameInfo(self.affectedBasenames)
                         if p[0] == self.affectedFileBasename and p[2] in ("reconciled", "gold")]
            else:
                paths = [os.path.join(self.folder.dir, r[0])
                         for r in self.folder.workspace.getDB().basenameInfo(self.affectedBasenames)
                         if r[2] in ("reconciled", "gold")]
        elif hasattr(self, "affectedFileBasename"):
            paths = [os.path.join(self.folder.dir, self.affectedFileBasename)]
        else:
            paths = self.folder.getFiles(self.affectedBasenames)
        return paths

    # lock_id is only
    # used from the UI. If the requested basenames have a lock that doesn't
    # match the lock ID, you can't do anything.
    # This lock_id is for the CORE. So if the lock is there, it's just used to
    # determine the source file, and whether to lock the output. But
    # we need to check the target locks the same way we do for autotag.
    
    def do(self, checkPathsAffected = True, lock_id = None, replacer = None, dont_limit_to_gold = False):
        self.replacer = replacer
        self.dont_limit_to_gold = dont_limit_to_gold
        db = self.folder.workspace.getDB()
        # If there's a lock_id, there better be only one affected basename.
        if lock_id and len(self.affectedBasenames) != 1:
            raise WorkspaceError, "lock_id requires exactly one affected basename"
        nominationLockInfo = db.nominationLockInfo()
        if nominationLockInfo and (lock_id is None):
            # In this situation, we can't proceed.
            raise WorkspaceError, "can't nominate while documents are locked"
        if lock_id:            
            # First, see if that file in the nomination folder is already locked.
            idInfo = db.coreGetLockIDInfo(lock_id)
            if [p for p in nominationLockInfo if p[0] == idInfo[0]]:
                raise WorkspaceError, "can't nominate while documents are locked"
            # Otherwise, make sure that the affected file basenames are just
            # the one for the lock info.
            self.affectedFileBasename = idInfo[0]
            self.lockingUser = idInfo[2]
        t = self.folder.workspace.beginTransaction(self)
        self.transaction = t
        try:
            self._do(checkPathsAffected = checkPathsAffected)
            t.commit()
        except:
            t.rollback()
            raise
            
    def _do(self, checkPathsAffected = True):
        try:
            MATEngineExecutionWorkspaceOperationMixin.do(self, checkPathsAffected = checkPathsAffected)
        except:
            raise

    def getRunParameters(self, operationSettings):
        
        replacer  = self.replacer or operationSettings.get("replacer")
        if replacer is None:
            raise WorkspaceError, "no replacer specified in operation settings or command"

        # In order to process the command lines really correctly, we
        # pass the operationSettings to an XMLOpArgumentAggregator.
        for key in ["input_file", "input_file_type", "output_file",
                    "output_dir", "input_file_re", "input_encoding",
                    "input_dir", "output_file_type", "output_encoding",
                    "output_fsuff"]:
            if operationSettings.has_key(key):
                raise WorkspaceError, ("workspace operation settings don't permit %s option to MATEngine", key)
            
        return {"input_file_type": self.folder.fileType,
                "input_encoding": "utf-8",
                "replacer": replacer}

    def wrapup(self, dataPairs):
        nominationFolder = self.folder.workspace.folders['nominated']
        db = self.folder.workspace.getDB()
        # Next, we'd better check to make sure that we can write each file.
        # If we can't, we want to raise an error. We should check each
        # individual file, because we don't want ANYthing to happen
        # if the writes can fail.
        if not os.access(nominationFolder.dir, os.W_OK | os.X_OK):
            raise WorkspaceError, "folder nominated not available for writing"
        self.transaction.addFilesToAdd([os.path.join(nominationFolder.dir, os.path.basename(p))
                                        for (p, iData) in dataPairs])
        for p, iData in dataPairs:            
            fileBasename = os.path.basename(p)
            if not os.access(os.path.join(nominationFolder.dir, p), os.W_OK):
                raise WorkspaceError, ("file %s in folder nominated not available for writing" % fileBasename)
            nominationFolder.saveFile(iData, fileBasename)
            
    def webResult(self):
        d = WorkspaceOperation.webResult(self)
        if d.get("basename"):
            nominationFolder = self.folder.workspace.folders['nominated']
            basename, fileBasename, doc = self.targetDocuments[0]
            ignore, fileBasename, lockId = self.folder.workspace._openFileBasename(nominationFolder, fileBasename,
                                                                                   self.lockingUser, False, doc = doc)
            d["lock_id"] = lockId
        # We want the document status to be something consistent.
        # It doesn't really matter what the actual status is.
        # The folder listing will reveal no
        # basename info for the target folder, so I don't need to hack that too.
        if d.has_key("status"):
            del d["status"]
        return d

        
class NominationReleaseLockOperation(WorkspaceOperation):

    name = "release_lock"

    availability = NOT_AVAILABLE

    argList = [OpArgument("lock_id", hasArg = True, help="lock ID")]

    def do(self, lock_id = None):
        _in_transaction = self.transaction
        if lock_id is None:
            raise WorkspaceError, "Can't release a lock without an ID"
        db = self.folder.workspace.getDB()
        # I'm wrapping this because I don't know whether this
        # operation is going to remain atomic.
        if _in_transaction:
            self._do(db, lock_id)
        else:
            t = self.folder.workspace.beginTransaction(self)
            try:
                self._do(db, lock_id)
                t.commit()
            except:
                t.rollback()
                raise

    def _do(self, db, lock_id):
        db.unlockNominationLock(lock_id)


class NominationForceUnlockOperation(WorkspaceOperation):

    name = "force_unlock"

    availability = CMDLINE_AVAILABLE

    argList = [OpArgument("user", hasArg = True,
                          help = "the user who's locked the basename")]

    def do(self, user = None):
        if user is None:
            raise WorkspaceError, "can't force unlock a basename without a user"
        t = self.folder.workspace.beginTransaction(self)
        try:
            self._do(user)
            t.commit()
        except:
            t.rollback()
            raise

    def _do(self, user):
        db = self.folder.workspace.getDB()
        unlocked = db.forceUnlockNominationBasenames(user, self.affectedBasenames)
        if self.fromCmdline:
            if unlocked:
                print "Unlocked core documents:", " ".join(unlocked)
            else:
                print "Unlocked no documents."

class NominationSaveOperation(WorkspaceOperation):

    name = "nominate_save"

    availability = CMDLINE_DEBUG_AVAILABLE | UI_AVAILABLE
    
    argList = [OpArgument("retain_existing", help = "don't clear the redacted folders first, if transform is set"),
               OpArgument("doc", help = "a document to save, as a JSON string", hasArg = True),
               OpArgument("transform", help = "transform after saving"),
               OpArgument("lock_id", hasArg = True, help="lock ID (if document is locked)"),
               OpArgument("release_lock", help="release the lock after save")]

    def getAffectedFolders(self):
        if hasattr(self, "doTransform") and self.doTransform:
            return ["nominated", "redacted, rich", "redacted, raw"]
        else:
            return ["nominated"]

    def getTargetFolderAndDocuments(self):
        if hasattr(self, "doTransform") and self.doTransform:
            return "redacted, rich", self._getTargetDocuments("redacted, rich")
        else:
            return "nominated", self._getTargetDocuments("nominated")
        
    def getAffectedFileBasenames(self):
        return {self.affectedFileBasename: self.affectedBasenames[0]}
        
    def do(self, retain_existing = False, doc = None, transform = False, lock_id = None, release_lock = False):

        self.doTransform = transform
        
        if lock_id is None:
            raise WorkspaceError, "can't save without lock ID"
        # Now we get the basename. Must check to ensure that
        # the lock ID matches. Need to get the file basename
        # from the transaction.
        db = self.folder.workspace.getDB()
        fileBasename, basename, user = db.nominationGetLockIDInfo(lock_id)
        if basename != self.affectedBasenames[0]:
            raise WorkspaceError, ("wrong lock ID %s for basename %s" % (lock_id, self.affectedBasenames[0]))
        self.affectedFileBasename = fileBasename
        t = self.folder.workspace.beginTransaction(self, filesToPreserve = [os.path.join(self.folder.dir, fileBasename)])
        try: 

            if doc is not None:
                # It can be none, if it's not dirty.
                # First, make it into a document. The document
                # string is almost certainly not Unicode yet.

                docObj = self.folder.docIO.readFromByteSequence(doc, 'utf-8')

                # There better only be one basename.
                self.folder.saveFile(docObj, fileBasename)

            if release_lock:
                if self.fromCmdline:
                    print "Releasing lock ID %s" % lock_id
                o = self.folder.getOperation("release_lock",
                                             basenames = [basename],
                                             transaction = t)
                o.do(lock_id = lock_id)
            t.commit()
        except:
            t.rollback()
            raise        

        if transform:

            # Clear the redacted folders. Run the engine.

            operationSettings = self.getOperationSettings()

            if operationSettings is None:        
                raise WorkspaceError, ("no operation settings in task '%s' for operation '%s'" % \
                                       (self.folder.workspace.task.name, self.name))

            operationSettings = operationSettings.copy()

            # Now, we've got our settings. At least workflow and steps are defined.

            try:        
                workflow = operationSettings["workflow"]
            except KeyError:
                raise WorkspaceError, ("workflow undefined in tag prep operation settings")

            del operationSettings["workflow"]

            rawFolder = self.folder.workspace.folders['redacted, raw']
            richFolder = self.folder.workspace.folders['redacted, rich']

            if not retain_existing:
                rawFolder.clear()
                richFolder.clear()

            allPaths = [os.path.join(self.folder.dir, fileBasename)]

            try:
                import MAT.ToolChain
                e = MAT.ToolChain.MATEngine(workflow = workflow, task = self.folder.workspace.task.name)
                dataPairs = e.Run(inputFileList = allPaths, input_file_type = "mat-json",
                                  **operationSettings)
            except Error.MATError, e:
                raise WorkspaceError, e.prefix + ": " + e.errstr

            # If this succeeds, I should write all the files to
            # the appropriate folder.

            for file, output in dataPairs:
                richFolder.saveFile(output, os.path.basename(file))
                rawFolder.saveFile(output, os.path.basename(file))

            # And remove them from the nominated folder, I think.
            self.folder.removeFile(fileBasename)
    
    def webResult(self):
        d = WorkspaceOperation.webResult(self)
        # We want the document status to be something consistent.
        # It doesn't really matter what the actual status is.
        # The folder listing will reveal no
        # basename info for the target folder, so I don't need to hack that too.
        if d.has_key("status"):
            del d["status"]
        return d

class NominationFolder(CoreWorkspaceFolder):
    
    def fileBasenameLocked(self, fileBasename):
        return self.workspace.getDB().nominationDocumentLocked(fileBasename)

    def updateOpenFileWebResultSeed(self, doc, basename, seed):
        return

    def prepareForEditing(self, doc, fileBasename, user, lockId):
        db = self.workspace.getDB()
        db.lockNominationDocument(lockId, fileBasename, user)

    def listContents(self, basenames):
        db = self.workspace.getDB()
        bPairs = []
        # For these basenames, see which files are actually present.
        lockInfo = dict([(docName, lockedBy) for (docName, lockedBy, lockID) in db.nominationLockInfo()])
        for docName, basename, status, assignedUser, lockedBy in db.basenameInfo(basenames):
            # Ignore locking and status - this is just to get assignment info.
            if os.path.exists(os.path.join(self.dir, docName)):
                info = {"basename": basename}
                if docName != basename:
                    info["doc name"] = docName
                if assignedUser:
                    info["assigned to"] = assignedUser
                lockedBy = lockInfo.get(docName)
                if lockedBy:
                    info["locked by"] = lockedBy
                bPairs.append(info)
        return bPairs

    def removeFile(self, fileBasename):
        CoreWorkspaceFolder.removeFile(self, fileBasename)
        self.workspace.getDB().unlockNominationDocument(fileBasename)        

class RedactionFolder(CoreWorkspaceFolder):
    
    def fileBasenameLocked(self, fileBasename):
        return None

    def updateOpenFileWebResultSeed(self, doc, basename, seed):
        return

    def prepareForEditing(self, doc, fileBasename, user, lockId):
        raise WorkspaceError, "folder is not editable"

    def listContents(self, basenames):
        db = self.workspace.getDB()
        bPairs = []
        # For these basenames, see which files are actually present.
        for docName, basename, status, assignedUser, lockedBy in db.basenameInfo(basenames):
            # Ignore locking and status - this is just to get assignment info.
            if os.path.exists(os.path.join(self.dir, docName)):
                info = {"basename": basename}
                if docName != basename:
                    info["doc name"] = docName
                if assignedUser:
                    info["assigned to"] = assignedUser
                bPairs.append(info)
        return bPairs

class DeidentificationDB(WorkspaceDB):

    def nominationDocumentLocked(self, docName):
        lockedByResult = self._execute("SELECT locked_by FROM nomination_lock WHERE doc_name = ?",
                                       params = [docName])
        if not lockedByResult:
            return None
        else:
            return lockedByResult[0][0]

    def lockNominationDocument(self, lockId, docName, lockedBy):
        # If there's already one, we overwrite the original lock.
        if self._execute("SELECT locked_by FROM nomination_lock WHERE doc_name = ?",
                         params = [docName]):
            self._execute("UPDATE nomination_lock SET lock_id = ?, locked_by = ? WHERE doc_name = ?",
                          params = [lockId, lockedBy, docName],
                          retrieval = False)
        else:
            self._execute("INSERT INTO nomination_lock VALUES (?, ?, ?)",
                          params = [docName, lockedBy, lockId],
                          retrieval = False)
        
    def unlockNominationLock(self, lockId):
        self._execute("DELETE FROM nomination_lock WHERE lock_id = ?",
                      params = [lockId],
                      retrieval = False)

    def unlockNominationDocument(self, docName):
        self._execute("DELETE FROM nomination_lock WHERE doc_name = ?",
                      params = [docName],
                      retrieval = False)

    def nominationLockInfo(self):
        return self._execute("SELECT doc_name, locked_by, lock_id FROM nomination_lock")

    def nominationGetLockIDInfo(self, lockId):
        v = self._execute("SELECT A.doc_name, B.basename, A.locked_by FROM nomination_lock A, document_info B WHERE A.lock_id = ? AND A.doc_name = B.doc_name",
                          params = [lockId])
        if len(v) == 0:
            return None, None, None
        else:
            return v[0]

    # Another situation where we can't use substitution because I need "IN".
    def forceUnlockNominationBasenames(self, user, basenames):
        docLocksToDelete = [r[0] for r in self._executeWithParamDict("SELECT B.doc_name FROM document_info A, nomination_lock B WHERE A.doc_name = B.doc_name AND B.locked_by = $(user) AND A.basename IN ($(basenames))", {"user": user, "basenames": basenames})]
        if docLocksToDelete:
            self._executeWithParamDict("DELETE FROM nomination_lock WHERE doc_name IN ($(docLocksToDelete))", {"docLocksToDelete": docLocksToDelete}, retrieval = False)
        return docLocksToDelete

class DeidTaskDescriptor(PluginTaskDescriptor):

    categories = {}

    REDACTION_ATTR = "redacted"

    SEED_UNPARSEABLE_ATTR = "seed_unparseable"

    def __init__(self, *args, **kw):
        PluginTaskDescriptor.__init__(self, *args, **kw)
        self.localReplacers = {}
        self._rdirCache = None
        self._replacerCache = None        
        self._instantiatedReplacerCache = {}

    def fromXML(self, *args):
        PluginTaskDescriptor.fromXML(self, *args)
        # At this point, we want to pull out the redaction settings.
        # Now, we look for all the settings which end in
        # _replacers, which have a corresponding setting
        # which ends in _replacers_workflows.
        import re
        replPat = re.compile("^(.*)_replacers$")
        replWFPat = re.compile("^(.*)_replacers_workflows$")
        replKeyPairs = {}
        for key in self.settings.keys():
            m = replPat.match(key)
            if m is not None:
                try:
                    replKeyPairs[m.group(1)][0] = key
                except KeyError:
                    replKeyPairs[m.group(1)] = [key, None]
            else:
                m = replWFPat.match(key)
                if m is not None:
                    try:
                        replKeyPairs[m.group(1)][1] = key
                    except KeyError:
                        replKeyPairs[m.group(1)] = [None, key]
        # Now, we've gone through all the keys.
        # I need two types of mappings. First, I need to be able
        # to find a replacer of a particular name. Second, I need
        # to be able to see if a replacer supports a workflow.
        # Third, I need to report, for various workflows, what
        # replacers are available. The last is least important.
        # This all needs to happen by the rname in the replacer.
        self.localReplacers = {}
        for family, [repls, replWFs] in replKeyPairs.items():
            if (repls is not None) and (replWFs is not None):
                replWFs = self.settings[replWFs].split(",")
                repls = self.settings[repls].split(",")
                # Now, we have all the workflow names and the replacer names.
                for rName in repls:
                    try:
                        r = FindPluginClass(rName, self.name)
                        if not issubclass(r, PIIReplacementEngine):
                            raise PluginError, ("replacer class %s is not a subclass of PIIReplacementEngine" % rName)
                        if self.localReplacers.has_key(r.__rname__):
                            entry = self.localReplacers[r.__rname__][1]
                            for wf in replWFs:
                                if wf not in entry:
                                    entry.append(wf)
                        else:
                            self.localReplacers[r.__rname__] = [r, replWFs[:]]
                    except NameError:
                        raise PluginError, ("unknown replacer %s" % rName)

    # Now, anyone who gets the replacers, gets a mapping from workflows
    # to replacer names.
    
    def findReplacer(self, rName):
        try:
            return self.localReplacers[rName]
        except KeyError:
            return None

    def allReplacers(self):
        return self.localReplacers.keys()

    def getReplacerRDirs(self):
        if self._rdirCache is not None:
            return self._rdirCache
        else:
            # Return all resource directories up to the root.
            if self.parentObj and hasattr(self.parentObj, "getReplacerRDirs"):
                seed = self.parentObj.getReplacerRDirs()[:]
            else:
                seed = []
            if self.resourceDir not in seed:
                seed[0:0] = [self.resourceDir]
            self._rdirCache = seed
            return seed
    
    # Fetch the CGI task metadata. Only called on leaves.

    def getCGIWorkflowMetadata(self, wfObj):
        params = PluginTaskDescriptor.getCGIWorkflowMetadata(self, wfObj)
        workFlow = wfObj.name
        # Return the replacers.
        params["uiSettings"]["replacers"] = [key for (key, rPair) in self.localReplacers.items() if workFlow in rPair[1]]
        return params

    def enhanceCGIMetadata(self, metadata):
        PluginTaskDescriptor.enhanceCGIMetadata(self, metadata)
        # What I need to do here is get the replacers for the
        # workspace.
        try:
            redactionWorkflow = self.getWorkspaceOperations()["redact"]["workflow"]
            metadata["workspaceReplacers"] = [key for (key, rPair) in self.localReplacers.items() if redactionWorkflow in rPair[1]]
        except KeyError:
            metadata["workspaceReplacers"] = []

    def getCmdlineTaskMetadata(self):
        # How should we format this? We need to find all the possible sets.
        wfSets = {}
        for key, rPair in self.localReplacers.items():
            wfSet = rPair[1][:]
            wfSet.sort()
            wfTuple = tuple(wfSet)
            try:
                wfSets[wfTuple].append(key)
            except KeyError:
                wfSets[wfTuple] = [key]

        return ["  replacers : " +  ", ".join([", ".join(vals) + " (" + ", ".join(key) + ")" for key, vals in wfSets.items()])]

    # Workspace customization. Add the redact action to the
    # completed folder. Add the redacted, rich and redacted, raw folders.
    # Redaction has default settings in the 

    def workspaceCustomize(self, workspace, create = False):

        workspace.addFolder('redacted, rich', "redacted_rich", create = create,
                            folderClass = RedactionFolder,
                            description = "rich versions of redacted documents",
                            importTarget = False)
        workspace.addFolder('redacted, raw', "redacted_raw", create = create,
                            folderClass = RedactionFolder,
                            description = "raw versions of redacted documents",
                            importTarget = False)
        from MAT.DocumentIO import getDocumentIO
        workspace.folders["redacted, raw"].docIO = getDocumentIO("raw", encoding = "utf-8")
        workspace.folders['core'].addOperation("redact", RedactionOperation)
        # I have to make sure that this folder gets created if it's not already
        # there, because some of the folks who are using this code have already
        # made workspaces.
        f = NominationFolder(workspace, 'nominated',
                             description = "completed documents with nominated replacements",
                             importTarget = False)
        workspace.folders['nominated'] = f
        if not os.path.isdir(f.dir):
            f.create()
        workspace.folders['core'].addOperation("nominate", NominationOperation)
        workspace.folders['nominated'].addOperation("nominate_save", NominationSaveOperation)
        workspace.folders["nominated"].addOperation("release_lock", NominationReleaseLockOperation)
        workspace.folders["nominated"].addOperation("force_unlock", NominationForceUnlockOperation)
        workspace.getDB = lambda: self._getEnhancedWorkspaceDB(workspace)

    def _getEnhancedWorkspaceDB(self, ws):
        db = Workspace.getDB(ws)
        db.run_script(os.path.join(os.path.dirname(os.path.abspath(__file__)), "deid_ws.sql"))
        db.__class__ = DeidentificationDB
        return db

    def workspaceUpdate1To2(self, workspace, oldWorkspaceDir, basenames, initialUser):
        import shutil
        # Just copy them over. The folders will already have been created.
        redactedRichBasenames = list(set(os.listdir(os.path.join(oldWorkspaceDir, "folders", "redacted_rich"))) & basenames)
        print "Copying basenames from 'redacted, rich':", " ".join(redactedRichBasenames)
        for b in redactedRichBasenames:
            shutil.copy(os.path.join(oldWorkspaceDir, "folders", "redacted_rich", b),
                        os.path.join(workspace.folders["redacted, rich"].dir, b))

        redactedRawBasenames = list(set(os.listdir(os.path.join(oldWorkspaceDir, "folders", "redacted_raw"))) & basenames)
        print "Copying basenames from 'redacted, raw':", " ".join(redactedRawBasenames)
        for b in redactedRawBasenames:
            shutil.copy(os.path.join(oldWorkspaceDir, "folders", "redacted_raw", b),
                        os.path.join(workspace.folders["redacted, raw"].dir, b))
            
        nominatedBasenames = list(set(os.listdir(os.path.join(oldWorkspaceDir, "folders", "nominated"))) & basenames)
        print "Copying basenames from 'nominated': ", " ".join(nominatedBasenames)
        for b in nominatedBasenames:
            shutil.copy(os.path.join(oldWorkspaceDir, "folders", "nominated", b),
                        os.path.join(workspace.folders["nominated"].dir, b))        
        
    # Local operations.
    
    def replaceableAnnotations(self):
        return self.getAnnotationTypesByCategory("content")

    def instantiateReplacer(self, rName, **kw):
        
        if self._instantiatedReplacerCache.has_key(rName):
            return self._instantiatedReplacerCache[rName]
        else:
            rPair = self.findReplacer(rName)
            if rPair is not None:
                r = rPair[0]
                c = r(self.getReplacerRDirs(), self.categories, **kw)
                self._instantiatedReplacerCache[rName] = c
                return c
            return None

    # Here, I'm going to try to add a column which reflects the
    # document-level probabilities.
    
    def augmentTagSummaryScoreTable(self, tbl):
        c = AggregatorScoreColumn("doc_confidence",
                                  rowDispatch = [(FileAggregateScoreRow, DocConfidence, None),
                                                 (BaseScoreRow, None)])
        tbl.addColumn(c, after = "accum")
        tbl.aggregates.append(c)
        return tbl

    def augmentTokenSummaryScoreTable(self, tbl):
        c = AggregatorScoreColumn("doc_confidence",
                                  rowDispatch = [(FileAggregateScoreRow, DocConfidence, None),
                                                 (BaseScoreRow, None)])
        tbl.addColumn(c, after = "accum")
        tbl.aggregates.append(c)
        return tbl

    def augmentDetailScoreTable(self, tbl):
        return tbl

#
# Here are the deidentification steps
#

class NominateStep(PluginStep):

    argList = [OpArgument("replacer", help = "specify the replacer to use. Obligatory if more than one replacer is available. See above for available replacers.", hasArg = True),
               OpArgument("cache_scope", help = "specify the cache scope for particular tags. Argument is a semicolon-delimited sequence of <tag>,doc|batch|none, e.g. 'PERSON,batch;LOCATION;doc'. Default scope is document scope.", hasArg = True),
               OpArgument("cache_case_sensitivity", help = "specify which tags have case-sensitive caches. Argument is a semicolon-delimited sequence of tags, e.g., 'PERSON;LOCATION'.", hasArg = True),
               OpArgument("resource_file_repl", help="specify a replacement for one of the resource files used by the replacement engine. Argument is a semicolon-delimited sequence of <file>=<repl>. See the ReplacementEngine.py for details.", hasArg = True),
               OpArgument("replacement_map_file", help="Specify a replacement map file to provide some detailed control over clear -> clear replacements. See documentation for details.", hasArg = True),
               OpArgument("replacement_map", help="Specify a replacement map to provide some detailed control over clear -> clear replacements. See documentation for details.", hasArg = True),
               OpArgument("dont_nominate", help = "A comma-separated list of labels for which nominations should not be proposed", hasArg = True),
               OpArgument("flag_unparseable_seeds", hasArg = True,
                          help = "A comma-separated list of labels whose annotations should be flagged in clear -> clear replacement when the phrase in the original document could not be parsed appropriately (and thus whose replacements might not have the appropriate fidelity). Currently, only dates, URLs, phone numbers, and can be flagged in this way.")]

    def paramsSatisfactory(self, wfName, failureReasons, replacer = None, **params):
        if replacer is None:
            allReplacers = self.descriptor.allReplacers()
            if len(allReplacers) == 1:
                replacer = allReplacers[0]
        if replacer is None:
            raise PluginError, "no replacer specified"
        # Filter the task implementation based on the replacer.
        # If the named replacer isn't one of the replacers
        # in the task, we bail.
        rPair = self.descriptor.findReplacer(replacer)
        if rPair is None:
            failureReasons.append("task '%s' does not know about the replacer '%s'" % (self.descriptor.name, replacer))
            return False
        elif wfName not in rPair[1]:
            failureReasons.append("workflow '%s' in task '%s' does not support the replacer '%s'" % (wfName, self.descriptor.name, replacer))
            return False
        else:
            return True

    # This drives the replacers.

    def doBatch(self, iDataPairs, replacer = None, dont_nominate = None, flag_unparseable_seeds = None, **kw):

        # This needs to be a batch step, so that we can get corpus-level
        # weights to work.

        # Don't bother catching the errors; we'll deal with them
        # in the engine.

        if replacer is None:
            # Checked in paramsSatisfactory().
            replacer = self.descriptor.allReplacers()[0]

        r = self.descriptor.instantiateReplacer(replacer, **kw)
        if not r:
            raise Error.MATError("nominate", "couldn't find the replacer named " + replacer)

        if dont_nominate is not None:
            dontNominate = set([x.strip() for x in dont_nominate.split(",")])
        else:
            dontNominate = set()

        if flag_unparseable_seeds is not None:
            flagUnparseableSeeds = set([x.strip() for x in flag_unparseable_seeds.split(",")])
        else:
            flagUnparseableSeeds = set()

        # print "FLAGGING", flagUnparseableSeeds

        # This should only happen with spanned annotations, but we
        # have to make absolutely sure. See below.
        
        replaceableAnnots = set(self.descriptor.replaceableAnnotations()) - dontNominate        
        
        # Two phases: first we digest, then we replace.
        # Note that what we need for the replacement is the
        # effective label, as defined by the task.

        nomMapping = {}

        # Apparently, you may have the same file more than once. This
        # is a bug in the bug queue, and the only instance of doBatch in the
        # system where that problem might arise is this one. So let's fix it.
        
        for f, annotSet in iDataPairs:

            annotSet.metadata["replacer_used"] = replacer
            
            # First, generate all the nominations.

            digestionDict = {}
            annList = []

            for eName in replaceableAnnots:
                try:
                    eType = annotSet.anameDict[eName]
                except KeyError:
                    # There may not be any.
                    continue
                # If it's spanless, skip it.
                if not eType.hasSpan:
                    continue
                annList = annList + annotSet.atypeDict[eType]

            # Sort them in order.

            annList.sort(key = lambda ann: ann.start)

            # Digest.

            for annot in annList:
                lab = self.descriptor.getEffectiveAnnotationLabel(annot)
                digestionDict[annot] = (lab, r.Digest(lab, annotSet.signal[annot.start:annot.end]))

            r.EndDocumentForDigestion()

            if hasattr(r,  "dateDelta"):
                # This is an integer.
                annotSet.metadata["dateDelta"] = r.dateDelta

            nomMapping[(f, annotSet)] = (annList, digestionDict)
            
        # Replace.

        for f, annotSet in iDataPairs:

            annList, digestionDict = nomMapping[(f, annotSet)]

            for annot in annList:
                lab, digestions = digestionDict[annot]
                repl = r.Replace(lab, digestions, filename = f)
                annot[self.descriptor.REDACTION_ATTR] = repl
                # ONLY if we're in clear -> clear. Otherwise, it doesn't matter
                # that the seed is unparseable. Either it's not expected to be,
                # or the target doesn't care. 
                if (replacer == "clear -> clear") and (lab in flagUnparseableSeeds) and \
                   hasattr(digestions, "seed_unparseable") and digestions.seed_unparseable:
                    import sys
                    print >> sys.stderr, "WARNING: the '%s' phrase '%s' from %d to %d could not be parsed for nomination, and its nomination must be reviewed before the transform step can apply" % (annot.atype.lab, annotSet.signal[annot.start:annot.end], annot.start, annot.end)
                    annot[self.descriptor.SEED_UNPARSEABLE_ATTR] = digestions.__ctype__

            r.EndDocumentForReplacement()
            
        return iDataPairs

    def undo(self, annotSet, **kw):
        try:
            del annotSet.metadata["replacer_used"]
        except KeyError:
            pass
        for tag in self.descriptor.getAnnotationTypesByCategory("content"):
            try:
                atype = annotSet.anameDict[tag]
                if not atype.attr_table.has_key(self.descriptor.REDACTION_ATTR):
                    continue
                # We can't remove the attribute from the
                # annotation TYPE, because those are global.
                # Once the attribute is defined, it's always
                # defined. However, we can remove it most efficiently
                # from the ANNOTATION by seeing how many attributes
                # the annotation has (remember, a shorter list
                # is equal to nulls everywhere). If the annotation
                # list is no longer than the index of the
                # redacted attribute, then we can just truncate
                # the list of attrs. This should probably
                # be a delitem on the annotation. Well, no;
                # you can set an attribute to null, but you
                # can't actually delete it once it's set.                
                i = atype.attr_table[self.descriptor.REDACTION_ATTR]
                for annot in annotSet.atypeDict[atype]:
                    if len(annot.attrs) > i:
                        # There's something at that index.
                        annot.attrs[i] = None
                i = atype.attr_table.get(self.descriptor.SEED_UNPARSEABLE_ATTR)
                if i is not None:
                    for annot in annotSet.atypeDict[atype]:
                        if len(annot.attrs) > i:
                            annot.attrs[i] = None                    
            except KeyError:
                pass

    def isDone(self, annotSet):
        for annot in annotSet.getAnnotations(self.descriptor.getAnnotationTypesByCategory("content")):
            try:
                if annot[self.descriptor.REDACTION_ATTR] is not None:
                    return True
            except KeyError:
                pass
        return False        
                
from MAT.Document import OverlapError, AnnotatedDoc
import sys

class TransformStep(PluginStep):

    argList = [OpArgument("prologue", help = "Specify the text of a prologue to insert into the transformed document. You may wish to do this, e.g., to assert that all names in the document are fake. This option takes preference over --prologue_file.", hasArg = True),
               OpArgument("prologue_file", help = "Specify a file which contains the text of a prologue to insert into the transformed document. You may wish to do this, e.g., to assert that all names in the document are fake. The file is assumed to be in UTF-8 encoding. --prologue takes preference over this option.", hasArg = True),
               OpArgument("dont_transform", help = "A comma-separated list of labels that should not be transformed", hasArg = True)]    

    def __init__(self, *args, **kw):
        PluginStep.__init__(self, *args, **kw)
        
        # We need to know which
        # step to use to prep the final document after the tags
        # have been located. The prepping differs
        # depending on whether the redaction is to clear or not.
        # If it's to clear, find the "zone" task in the demo workflow;
        # otherwise, find the zone task in the resynth workflow.

        # We don't want to have to find the replacer in the
        # invocation of do(). In particular, we should expect that the
        # replacer be in the document itself. But that means that we'd
        # need to figure out, on a document-by-document basis,
        # which prep function to use. So let's cache them in advance.

        # Well, we can't, actually, because looking for a step
        # in the context of when the steps are created gives you
        # infinite recursion. So we need to create them later.

        self._postTransformStepsFound = False
        self.clearZoneStep = None
        self.resynthZoneStep = None

    def _ensurePostTransformSteps(self):

        if not self._postTransformStepsFound:
            self._postTransformStepsFound = True

            self.clearZoneStep = self.descriptor.getStep("Demo", "zone") 
            try:
                self.resynthZoneStep = self.descriptor.getStep("Resynthesize", "zone")
            except PluginError:
                pass
    
    #
    # Core deidentification engine. Transform step is general.
    #

    def augmentClearZones(self, iDataPairs):
        self.clearZoneStep.doBatch(iDataPairs)
        # And, once it's tokenized, I have to make sure that (believe it
        # or not) no tags mismatch the annotation boundaries. If they do,
        # I need to expand the annotation boundaries to match the nearest
        # token. This is a messy computation, but it turns out I need
        # it in the core, anyway.
        for fname, annotSet in iDataPairs:
            for seg in annotSet.getAnnotations(["SEGMENT"]):
                seg["annotator"] = "unknown human"
                seg["status"] = "human gold"
            annotSet.adjustTagsToTokens(self.descriptor)

    def augmentRedactedZones(self, iDataPairs):
        # There may not be a zone step. But in any case, what we
        # want to do is go back through the annotations and adjust
        # the boundaries until there's no leading or trailing whitespace.
        if self.resynthZoneStep:
            resynthZoneStep.doBatch(iDataPairs)

        for fname, annotSet in iDataPairs:
            annotSet.avoidWhitespaceInTags(self.descriptor)

    # The problem with doing this file by file is that you have to call the
    # tokenizer every damn time when you align. What I really want to do is
    # do it in batch, and within the batch process, do the individual file
    # replacements.
            
    def doBatch(self, iDataPairs, replacer = None, prologue = None, prologue_file = None, dont_transform = None, **kw):

        if (prologue is None) and (prologue_file is not None):
            if not os.path.isabs(prologue_file):
                prologue_file = os.path.join(self.descriptor.taskRoot, prologue_file)
            import codecs
            fp = codecs.open(prologue_file, "r", "utf-8")
            prologue = fp.read()
            fp.close()
        elif type(prologue) is str:
            prologue = prologue.decode('ascii')

        if dont_transform is not None:
            dontTransform = set([x.strip() for x in dont_transform.split(",")])
        else:
            dontTransform = set()

        # Someone might decide to call do() on this object. Let's see if we can
        # figure out what replacer was used.

        replacersUsed = set([annotSet.metadata.get("replacer_used") for fname, annotSet in iDataPairs])
        replacersUsed.discard(None)

        if len(replacersUsed) > 1:
            raise Error.MATError("transform", "multiple replacers specified in transform set")
        if replacer is None:
            if len(replacersUsed) == 0:
                raise Error.MATError("transform", "no replacer specified")
            else:
                replacer = list(replacersUsed)[0]

        r = self.descriptor.instantiateReplacer(replacer, **kw)
        if not r:
            raise Error.MATError("transform", "couldn't find the replacer named " + replacer)
        if isinstance(r.renderingStrategy, ClearRenderingStrategy):
            clearTarget = True
        else:
            clearTarget = False

        self._ensurePostTransformSteps()
        
        # From these, we remove the ones which don't have any redaction attributes
        # specified (they may have been filtered out by dont_nominate), and the ones which
        # shouldn't be transformed.

        # Actually, it's a bit more complicated than that. We don't want to LOSE
        # content annotations which aren't replaceable. So what we want to do
        # is build up a map of replacements for all content annotations, and
        # then, for the subset of annotations which are transformable and
        # have a replacement, use that replacement.

        annotNames = self.descriptor.getAnnotationTypesByCategory("content")

        outPairs = []
        for fname, annotSet in iDataPairs:
            try:
                newSet = self._transformAnnotSet(r, annotSet, annotNames, dontTransform, prologue)
                outPairs.append((fname, newSet))
            except OverlapError:
                sys.stderr.write("Can't transform document %s because there's an overlap\n" % fname)
                return []
            
        if clearTarget:
            self.augmentClearZones(outPairs)
        else:
            self.augmentRedactedZones(outPairs)

        # Finally, mark the document as zoned and tagged.
        for fname, d in outPairs:
            d.setStepsDone(["zone", "tag"])

        return outPairs

    def _transformAnnotSet(self, engine, annotSet, annotNames, dontTransform, prologue):

        # Seed it with mapings into the original signal.
        replacerMap = {}

        replaceableAnnotNames = set([a for a in self.descriptor.replaceableAnnotations()
                                     if (a not in dontTransform) and \
                                     (annotSet.findAnnotationType(a).attr_table.has_key(self.descriptor.REDACTION_ATTR))])
        
        # We have to change the regions in the signal so that
        # they're substituted. We order them because we need to
        # go through them in order to handle the substitutions cleanly.
        # Note that orderAnnotations will filter out the spanless types.
        # This might generate an overlap error; see caller.
        
        try:
            annots = annotSet.orderAnnotations(annotNames)
        except OverlapError:
            sys.stderr.write("Can't transform document because there's an overlap\n")
            return None

        atypeIndexDict = {}

        for aname in replaceableAnnotNames:
            try:
                t = annotSet.anameDict[aname]
            except KeyError:
                # There may not be any.
                continue
            atypeIndexDict[t] = t.ensureAttribute(self.descriptor.REDACTION_ATTR)
            # Update the replacer map.
            replacerMap[t] = lambda x: x[atypeIndexDict[x.atype]]

        # Build a new doc.
        
        d = AnnotatedDoc(globalTypeRepository = annotSet.atypeRepository.globalTypeRepository)
        
        # Copy the metadata, because the interface will need it.
        d.metadata = annotSet.metadata.copy()
        d.metadata["phasesDone"] = []
        
        signal = annotSet.signal
        
        unparseableAttr = self.descriptor.SEED_UNPARSEABLE_ATTR
        
        # Originally, I was going to have the
        # untransformed ones as no annotations at all, but
        # really, I should have an annotation, since I may
        # need to compare them later.

        replacementTuples = []
        preservationTuples = []
        
        for a in annots:
            if a.get(unparseableAttr) is not None:
                raise PluginError, ("The '%s' phrase '%s' from %d to %d could not be parsed for nomination, and its nomination must be reviewed before the transform step can apply" % (a.atype.lab, signal[a.start:a.end], a.start, a.end))
            if a.atype.lab in replaceableAnnotNames:
                replacementTuples.append((a.atype.lab, a.start, a.end, replacerMap[a.atype](a)))
            else:
                preservationTuples.append((a.atype.lab, a.start, a.end))

        output, finalTuples = engine.Transform(signal, prologue, replacementTuples, preservationTuples)

        for lab, start, end in finalTuples:

            # Poo. The type is going to have the "redacted" attribute,
            # which may hose me at some point.
            newT = d.findAnnotationType(lab)
            d.createAnnotation(start, end, newT)
            
        d.signal = output
        return d

    # This won't be recorded as a step done, but if it were, you can't
    # undo it anyway.

    def do(self, annotSet, **kw):
        iDataPairs = self.doBatch([("<file>", annotSet)], **kw)
        if iDataPairs:
            return iDataPairs[0][1]
        else:
            return None
    
    def undo(self, annotSet, **kw):
        pass

class ResynthZoneStep(PluginStep):

    def do(self, annotSet, **kw):
        return annotSet

    def undo(self, annotSet, **kw):
        pass

class MultiZoneStepForUndo(PluginStep):

    # This had better never be called.
    def do(self, annotSet, **kw):
        return annotSet

    def undo(self, annotSet, **kw):
        self.removeAnnotationsByCategory(annotSet, "token", "zone")

    def isDone(self, annotSet):
        return False

class ResynthTagStep(TagStep):

    def __init__(self, *args, **kw):
        if (kw.has_key("by_hand") and kw["by_hand"]):
            raise PluginError, "by_hand attribute applies only to a real tagging step"
        TagStep.__init__(self, *args, **kw)
        # This isn't really a tag step.
        del self.initSettings["tag_step"]

    def paramsSatisfactory(self, wfName, failureReasons, replacer = None, **params):
        if replacer is None:
            allReplacers = self.descriptor.allReplacers()            
            if len(allReplacers) == 1:
                replacer = allReplacers[0]
        if replacer is None:
            raise PluginError, "no replacer specified"
        # Filter the task implementation based on the replacer.
        # If the named replacer isn't one of the replacers
        # in the task, we bail.
        rPair = self.descriptor.findReplacer(replacer)
        if rPair is None:
            failureReasons.append("task '%s' does not know about the replacer '%s'" % (self.descriptor.name, replacer))
            return False
        elif wfName not in rPair[1]:
            failureReasons.append("workflow '%s' in task '%s' does not support the replacer '%s'" % (wfName, self.descriptor.name, replacer))
            return False
        else:
            return True

    def do(self, annotSet, replacer = None, **kw):
        # Ask the current replacer to find all the matches.
        
        if replacer is None:
            # Checked in paramsSatisfactory().
            replacer = self.descriptor.allReplacers()[0]

        try:
            r = self.descriptor.instantiateReplacer(replacer, **kw)
            if not r:
                raise Error.MATError("tag", "couldn't find the replacer named " + replacer)
            
            # Two phases: first we digest, then we replace.

            tuples = r.FindReplacedElements(annotSet.signal)
            for start, end, tname in tuples:
                atype = annotSet.findAnnotationType(tname)
                annotSet.createAnnotation(start, end, tname)
                
            return annotSet
        except Exception, e:
            raise Error.MATError("tag", str(e), show_tb = True)

# Undocumented utility for expanding the documentation in-line.

class DocEnhancer(PluginDocInstaller):

    def process(self):
        
        #
        # BEGIN APP-SPECIFIC MODIFICATIONS
        #

        # In this section, you should modify the value of INDEX_CONTENTS,
        # and populate the HTML target directory appropriately.

        # The deidentification bundle consists of three things: the deidentification
        # summary and the general extensions, which are only provided by the core, and
        # the site modifications, which are only provided by the sites. Ideally,
        # these should be loadable in any order. So let's say that we expect to insert,
        # under the section marker

        # <div class="invisible" id="appcustomizations"></div>

        # something that looks like

        # <div id="deidcustomizations">
        # <ul class="secthead"><li>Deidentification customizations</li><ul>
        # <ul><li>General
        # <li><...site link...>
        # </ul>
        # </div>

        self.ensureDEID()

        # Now, since this is the core, we insert the general link
        # at the beginning of the deidcustomization list, and we
        # insert the introduction at the appropriate place.

        self.addListElement(self.getElementById("deidcustomizationlist"),
                            "General", href = "doc/general.html", first = True)

        self.addAppOverviewEntry("doc/intro.html", "MIST: The MITRE Identification Scrubber Toolkit")

    def ensureDEID(self):
        
        # So if there isn't any div yet, insert the infrastructure. Then, add the local
        # link at the end, if this is the local one, and if it's the core, add the
        # core link.

        DEID_INSERT = """
        <div id="deidcustomizations">
        <ul class="secthead"><li>Deidentification customizations</li></ul>
        <ul id="deidcustomizationlist"></ul>
        </div>
        """

        # Everybody makes sure that the deidcustomization node is present.

        custNode = self.getElementById("deidcustomizations")
        if custNode is None:
            self.addAppCustomizationList(DEID_INSERT)

    def addSubtaskDetail(self, url, listEntry):

        self.ensureDEID()

        # Now, since this is one of the sites, we insert the site link
        # at the end of the deidcustomization list.

        self.addListElement(self.getElementById("deidcustomizationlist"),
                            listEntry, href = url)
        
