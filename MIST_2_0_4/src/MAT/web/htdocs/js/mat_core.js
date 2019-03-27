/* Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
file LICENSE for license terms. */

/* The contents of this file are intended to represent the core of
  a dynamic annotation and annotation visualization tool: the annotated
  document, the interface to the backend which does the work, the 
  connection to the (external) UI, the core steps involved,
  and the overall context. */

/*
 *                    MAT.Logger
 *
 *
 * This object is a thin wrapper around the Yahoo! logger. It knows
 * a lot about what's supposed to be happening in the logs.
 * Actually, as this has matured, it turns out that I'm really not
 * using any properties of the Yahoo logger anyway. So we're going to
 * rip it out.
 *
 */

MAT.Logger = function(context) {
  this._context = context;
  this._loggerStarted = false;
  this._reset();
}

MAT.Extend(MAT.Logger, {
  
  startLogging: function() {
    this._loggerStarted = true;
    this._reset();
    // Log the start. Bypass all the complex log processing.
    this._rawLog({ms: new Date().getTime(), action: "log_start"});
  },

  loggerRunning: function() {
    return this._loggerStarted;
  },

  _reset: function () {
    this._gestureCount = 1;
    this._fileCount = 1;
    this._fileMapping = {};
    this._wsCount = 1;
    this._wsMapping = {};
    this._windowCount = 1;
    this._windowMapping = {};
    this._userCount = 1;
    this._userMapping = {};
    this._inTransaction = false;
    this._transactionBuffer = [];
    this._logEntries = [];
  },

  // What do we want to do if the save failed, due to a communications
  // failure? We don't really want to notify that the logging was stopped.
  
  stopLogging: function(successCb) {
    if (this._loggerStarted) {
      // Just in case.
      this.commitLogTransaction();
      // Log the stop. Bypass all the complex log processing.
      this._rawLog({ms: new Date().getTime(), action: "log_stop"});
      // Send the log.
      var l = this;
      this._context.backend.saveLog(this._logEntries, function () {
        // Stop logging.
        l._loggerStarted = false;
        successCb();
      });
    }
  },

  _anonymize: function(vals, prefix, mapping, curCount) {
    if (vals[prefix]) {
      if (mapping[vals[prefix]]) {
        vals[prefix] = mapping[vals[prefix]];
      } else {
        var anonString = prefix + curCount;
        curCount++;
        mapping[vals[prefix]] = anonString;
        vals[prefix] = anonString;
      }
    }
    return curCount;
  },

  _anonymizeAll: function(vals) {
    this._fileCount = this._anonymize(vals, "file", this._fileMapping, this._fileCount);
    this._wsCount = this._anonymize(vals, "workspace", this._wsMapping,
                                    this._wsCount);
    this._windowCount = this._anonymize(vals, "window", this._windowMapping,
                                        this._windowCount);
    this._userCount = this._anonymize(vals, "userid", this._userMapping, this._userCount);
  },

  // msg can be an array of messages. It's all
  // a single gesture. What we want to do is to set the
  // time and distribute the common values, and then
  // decide if we're in a transaction or not. If we are,
  // save the messages and commit them later. Later, we
  // make them share the same gesture and actually add them
  // to the log.
  
  log: function(msgArray, commonVals /*, anonymize */) {
    var anonymize = true;
    if (arguments.length > 2) {
      anonymize = arguments[2];
    }
    if (this._loggerStarted) {
      var ms = new Date().getTime();
      if (msgArray.constructor != Array) {
        msgArray = [msgArray];
      }
      if (commonVals && anonymize) {
        this._anonymizeAll(commonVals);
      }          
      for (var i = 0; i < msgArray.length; i++) {
        var msg = msgArray[i];
        msg.ms = ms;
        if (anonymize) {
          this._anonymizeAll(msg);
        }
        if (commonVals) {
          for (var k in commonVals) {
            msg[k] = commonVals[k];
          }
        }
        if (this._inTransaction) {
          this._transactionBuffer.push(msg);
        }
      }
      // Now that everything's anonymized and timestamped,
      // if we haven't been saving to the transaction buffer,
      // log that sucker.
      if (!this._inTransaction) {
        this._log(msgArray);
      }
    }
  },

  _log: function(msgArray) {
    var gNum = this._gestureCount;
    this._gestureCount++;
    for (var i = 0; i < msgArray.length; i++) {
      msgArray[i].gesture = gNum;
      this._rawLog(msgArray[i]);
    }    
  },

  _rawLog: function(msg) {
    this._logEntries.push(msg);
  },

  beginLogTransaction: function () {
    if (!this._inTransaction) {
      this._transactionBuffer = [];
      this._inTransaction = true;
    }
  },

  commitLogTransaction: function() {
    if (this._inTransaction) {
      var buf = this._transactionBuffer;
      this._inTransaction = false;
      this._transactionBuffer = [];    
      this._log(buf);
    }
  }
});

/*
 *                    MAT.Context
 *
 *
 * This object contains the overall context of the processing,
 * including the computation of which steps to do, the current
 * document, and a pointer to the UI it's using. It also has a public
 * API. It's responsible for executing the step updates that the backend
 * reports.
 *
 */

MAT.Context = function(ui, cgiURL, webRoot, tasksOfInterest) {

  // Must be initialized somehow.
  this.ui = ui;

  this.webRoot = webRoot;

  this.tasksOfInterest = tasksOfInterest;

  this.backend = new MAT.Backend(this, cgiURL);

  this.logger = new MAT.Logger(this);

  // workspace available.
  this._workspaceAccess = false;

  // There can only be one workspace key, so let's keep
  // it centrally, so we can also update it.

  this._workspaceKey = null;

  // task table.

  this.taskTable = {};
  
  // Initialization.
  ui.setContext(this);

  this._docCounter = 1;
  this._objHash = {}
}

MAT.Extend(MAT.Context, {


  /*
 *                   Public API
 *
 *
 * These are functions which are called by other elements, either in the
 * core or in the UI.
 *
 */

  getWebRoot: function () {
    return this.webRoot;
  },

  incrementCounter: function() {
    var i = this._docCounter;
    this._docCounter++;
    return i;
  },
  
  newDocument: function(data) {
    var i = this.incrementCounter();
    var docLabel = 'appdoc' + i;
    var doc = new MAT.ApplicationDocument(this, data, i, docLabel);
    this._objHash[docLabel] = doc;
    // Let's make sure that the only element which holds the docs themselves
    // is the context (i.e., the controller).
    return docLabel;
  },

  getDocument: function(docLabel) {
    return this._objHash[docLabel];
  },

  // Are there any dirty documents? Used during UI shutdown.
  
  documentsDirty: function() {
    for (var k in this._objHash) {
      if (this._objHash.hasOwnProperty(k)) {
        var d = this._objHash[k];
        if (d && d.currentDocument && d.currentDocument.isDirty()) {
          return true;
        }
      }
    }
    return false;
  },

  // Can be used during UI shutdown.
  
  releaseAllWorkspaceLocks: function () {
    var warned = false;
    for (var k in this._objHash) {
      if (this._objHash.hasOwnProperty(k)) {
        var d = this._objHash[k];
        if ((d.constructor == MAT.WorkspaceDocument) && (d.getLockId() != null)) {
          if (!warned) {
            this.ui.inform(null, "Releasing workspace locks. This may take a second or two.");
            warned = true;
          }
          // SYNCHRONOUSLY remove the lock. And NO CALLBACKS.
          // I hope backendRequest is low-level enough for that.
          var data = d.getWorkspace().getData();
          this.backend.backendRequest({
            parameters: {
              "operation": "do_workspace_operation",
              "workspace_dir": data.workspace_dir,
              "workspace_key": this.getWorkspaceKey(),
              "read_only": data.workspace_read_only ? "yes" : "no",
              "file": d.getFilename(),
              "folder": d.getFolder(),
              "ws_operation": "release_lock",
              "lock_id": d.getLockId()
            },
            synchronous: true,
            success: function (obj) {
            },
            failure: function (s) {
            },
            jsonError: function (s) {
            }
          });                
        }
      }
    }
  },

  // You can pass in params here. The only key recognized so far is taskName.
  getDocuments: function() {
    var params = {};
    if (arguments.length > 0) {
      params = arguments[0];
    }
    var taskName = params.taskName || null;
    var res = [];
    for (var k in this._objHash) {
      if (this._objHash.hasOwnProperty(k)) {
        var v = this._objHash[k];
        if (v.docLabel !== undefined) {
          if ((taskName == null) || (taskName == v.getTask())) {
            res.push(v);
          }
        }
      }
    }
    return res;
  },

  documentReconciliation: function(docLabels, panelCreationData) {
    var docs = [];
    for (var i = 0; i < docLabels.length; i++) {
      docs.push(this._objHash[docLabels[i]]);
    }
    this.backend.documentReconciliation(docs, panelCreationData);
  },

  documentComparison: function(compEntries, data) {
    var docs = [];
    var docLabels = []
    for (var i = 0; i < compEntries.length; i++) {
      var label = compEntries[i].label;
      var position = compEntries[i].position;
      if (position === "behind") {
        docs.unshift(this._objHash[label]);
        docLabels.unshift(label);
      } else {
        docs.push(this._objHash[label]);
        docLabels.push(label);
      }
    }
    this.backend.documentComparison(docs, docLabels, data);
  },
  
  openWorkspace: function(data) {
    this.backend.openWorkspace(data);
  },  

  listWorkspaceFolder: function(wsLabel, folderName) {
    this.backend.listWorkspaceFolder(this._objHash[wsLabel], folderName);
  },

  openWorkspaceFile: function(wsLabel, fileName, folderName) {
    this.backend.openWorkspaceFile(this._objHash[wsLabel], fileName, folderName);
  },

  setWorkspaceKey: function(key) {
    this._workspaceKey = key;
  },

  getWorkspaceKey: function() {
    return this._workspaceKey;
  },

  newWorkspace: function(data, task, loggingEnabled) {
    var i = this.incrementCounter();
    var wsLabel = 'workspace' + i;
    var ws = new MAT.Workspace(this, data, task, loggingEnabled, i, wsLabel);
    this._objHash[wsLabel] = ws;
    return wsLabel;
  },

  getWorkspace: function(wsLabel) {
    return this._objHash[wsLabel];
  },

  newWorkspaceDocument: function(ws, folderName, fileName, jsonObj) {
    var i = this.incrementCounter();
    var docLabel = 'wsdoc' + i;
    var doc = new MAT.WorkspaceDocument(
      this, ws, folderName, fileName,
      jsonObj, i, docLabel);
    this._objHash[docLabel] = doc;
    // Let's make sure that the only element which holds the docs themselves
    // is the context (i.e., the controller).
    return docLabel;
  },

  startLogging: function() {
    this.logger.startLogging();
    this.ui.notifyLoggingStarted();
  },

  loggerRunning: function() {
    return this.logger.loggerRunning();
  },

  stopLogging: function() {
    var context = this;
    this.logger.stopLogging(function () {
      context.ui.notifyLoggingStopped();
    });
  },

  beginLogTransaction: function() {
    this.logger.beginLogTransaction();
  },

  commitLogTransaction: function() {
    this.logger.commitLogTransaction();
  },
  
  log: function(msg, commonVals) {
    this.logger.log(msg, commonVals);
  },

  // Globally, I need to do some surgery on the task table. The
  // fact is that there's a UI-only step, "mark gold", which I need
  // to insert everywhere that there's a tag step. And it needs to
  // be in the step successors as well. So I might as well do this
  // once, when the task table is initialized.
  
  setTaskTable: function(table) {

    for (var k in table) {
      if (!table.hasOwnProperty(k)) {
        continue;
      }
      var task = table[k];
      // Build the global annotation set repository.
      task.globalAnnotationTypeRepository = new MAT.Annotation.GlobalAnnotationTypeRepository();
      try {
        task.globalAnnotationTypeRepository.fromJSON(task.annotationSetRepository);
      } catch (e) {
        this.ui.notifyError("For task " + k + ": " + MAT.Annotation.errorToString(e));
        return;
      }
      // Make sure that untaggable appears in the tag order.
      if (task.globalAnnotationTypeRepository.typeTable.untaggable) {
        if (task.tagOrder != null) {
          task.tagOrder.push("untaggable");
        }
      }
      // Gotta add it to the tag order, too.
      var tagSteps = {};
      // First, update the workflows. Each step which is a tag
      // step should have a "mark gold" step after it. Then, each
      // of the steps which are tag steps must have that step
      // as a successor in the step successors.
      // Ugh. AND all tasks which have no steps, but have hand annotation
      // available at the end, must be fixed so that there's 1 step which
      // is a mark gold step.
      // STILL not done. The idea is that hand_annotation_available_at_end
      // is a duplicate marking, in some sense; if there's a tag step,
      // mark gold must follow immediately, and otherwise, if hand_annotation_available_at_end
      // is specified (OR hand_annotation_available_at_beginning, which I've just
      // added), then deal with THAT.
      for (var j in task.workflows) {
        var wf = task.workflows[j];
        var steps = wf.steps;
        wf.steps = [];
        var addedGold = false;
        if (wf.workflowData.hand_annotation_available_at_beginning) {
          wf.steps.push(new MAT.MarkGoldWorkflowStep(wf.steps.length));
          tagSteps["<start>"] = true;
          addedGold = true;
        }
        var lastStep = null;
        for (var i = 0; i < steps.length; i++) {          
          var step = new MAT.WorkflowStep(steps[i], wf.steps.length);
          wf.steps.push(step);
          lastStep = step;
          if (step.initSettings.tag_step) {
            // If it's a tag step, then record it, and add another step.
            tagSteps[step.initSettings.name] = true;
            if (!addedGold) {
              wf.steps.push(new MAT.MarkGoldWorkflowStep(wf.steps.length));
              addedGold = true;
            }
          }
        }
        if ((!addedGold) && wf.workflowData.hand_annotation_available_at_end) {
          // There are no steps, but hand annotation is available at the end.
          if (lastStep) {
            tagSteps[lastStep.initSettings.name] = true;
          } else {
            tagSteps["<start>"] = true;
          }
          wf.steps.push(new MAT.MarkGoldWorkflowStep(wf.steps.length));
        }
        wf.workflowData.hand_annotation_available_at_end = false;
        wf.workflowData.hand_annotation_available_at_beginning = false;
      }
      
      // Now, look through the step successors, and insert
      // "mark gold" everywhere that you find a tag step.
      // AND I have to construct a similar entry for "mark gold"
      // (actually, I just need to copy the one for any tag
      // step). AND I need to  insert it at the beginning of
      // each tag step.

      // The annoying bit comes when there are multiple
      // tag steps. Can I ignore that part? For the moment, I might.

      for (var s in task.stepSuccessors) {
        var successors = task.stepSuccessors[s];
        for (var i = 0; i < successors.length; i++) {
          if (tagSteps[successors[i]]) {
            // Insert the label.
            successors.splice(i + 1, 0, "mark gold");
          }
        }
      }

      for (var t in tagSteps) {
        var steps = task.stepSuccessors[t];
        task.stepSuccessors["mark gold"] = steps.slice(0);
        steps.splice(0, 0, "mark gold");
      }
    }
    
    this.taskTable = table;
    this.ui.notifyTaskTable(table);    
  },

  setWorkspaceAccess: function(bool) {
    this._workspaceAccess = bool;
    this.ui.notifyWorkspaceAccess(bool);
  },

  oneStepForward: function(docLabel) {
    this._objHash[docLabel].oneStepForward();
  },

  oneStepBack: function(docLabel) {
    this._objHash[docLabel].oneStepBack();
  },

  loadDocument: function(docLabel, params) {
    this.backend.loadDocument(this._objHash[docLabel], params);
  },

  reloadDocument: function(docLabel, form) {
    this.backend.reloadDocument(this._objHash[docLabel], form);
  },

  doWorkspaceOperationOnFile: function(docLabel, op) {
    this.backend.doWorkspaceOperationOnFile(this._objHash[docLabel], op);
  },

  destroyDocument: function(docLabel) {
    var d = this._objHash[docLabel];
    if (d) {
      d.destroy();
      // Don't remove until the very end.
      delete this._objHash[docLabel];
    }
  },

  destroyWorkspace: function(wsLabel) {
    var d = this._objHash[wsLabel];
    if (d) {
      d.destroy();
      // Don't remove until the very end.
      delete this._objHash[wsLabel];
    }
  },

  isDirty: function(docLabel) {
    var d = this._objHash[docLabel];
    if (d && d.currentDocument) {
      return d.currentDocument.isDirty();
    } else {
      return false;
    }
  },

  // One of these days, I'm going to have to undo this
  // amazing stupidity about the frontend not being
  // able to touch the backend objects. So this API will
  // be the first.

  saveDocument: function(appDoc, outType) {
    var parameters = {};
    if (arguments.length > 2) {
      parameters = arguments[2];
    }
    var d = appDoc;
    var b = this;
    this.backend.saveDocument(d, outType, function () {
      if (MAT.FileFormats.formats[outType].richFormat) {
        // We saved the rich document; it's no longer
        // dirty.
        d.markNotDirty();
      }
    }, parameters);
  },

  // can't be dirty, no updating needed, so just save it
  saveComparisonDocument: function(appDoc) {
    this.backend.saveDocument(appDoc, "mat-json");
  },
    
  
  saveReconciliationDocument: function (appDoc) {
    var d = appDoc;
    var v = this;
    this.backend.updateReconciliationDocument(d, function () {        
      v.backend.saveDocument(d, "mat-json", function () {
        d.markNotDirty();
      });
    });
  },

  refreshReconciliationDocument: function(appDoc) {
    var d = appDoc;
    this.backend.updateReconciliationDocument(d, function() {
      d.markNotDirty();
    });
  },

  exportAndSaveReconciliationDocument: function(appDoc, format, parameters) {
    var d = appDoc;
    var v = this;
    this.backend.updateReconciliationDocument(d, function() {
      v.backend.exportAndSaveReconciliationDocument(d, format, parameters);
    });
  },

  exportReconciliationDocument: function(appDoc) {
    var v = this;
    this.backend.updateReconciliationDocument(appDoc, function() {
      v.backend.exportReconciliationDocument(appDoc);
    });
  },

  // Reported by the doc display.
  handAnnotationChanged: function(docLabel) {
    var d = this._objHash[docLabel];
    if (d) {
      d.handAnnotationChanged();
    }
  },

  // This needs to be centrally located, to deal with what happens
  // when we get a reconciliation or comparison document, no matter where
  // it comes from.
  
  documentPresent: function (appDoc) {
    // Just in case.
    this.ui.ensureDocumentPanel(appDoc.docLabel, {});
    this.ui.notifyDocumentPresent(appDoc.docLabel);
  }
  
});


/*
 *                    MAT.Workspace
 *
 *
 * This object is the encapsulation of everything the backend needs to
 * know about the workspace. This is the object which takes care of
 * retrieving the contents of individual files, etc.
 *
 */


MAT.Workspace = function (context, data, task, loggingEnabled, counter, label) {
  // Public, so the UI can grab them.
  this.wsCounter = counter;
  this.wsLabel = label;
  this._loggingEnabled = loggingEnabled;
  this._logger = null;
  if (loggingEnabled) {
    this._logger = new MAT.Logger(context);
    this._logger.startLogging();
  }

  this._task = task;

  // The display config is a property of the task.
  this._displayConfig = context.taskTable[task].displayConfig;

  this._taskConfig = new MAT.CoreTask();

  this._context = context;
  // Copy this, just in case it's a reference in YUI.
  this._data = {};
  for (var key in data) {
    this._data[key] = data[key];
  }

  if (data.workspace_dir) {
    this.wsName = data.workspace_dir;
    this.log({action: "open_workspace"});
  }

  // Do this last, so that it has all the data above.
  
  var tConfig = MAT.TaskConfig[this._displayConfig];
  if (tConfig) {
    this._taskConfig = tConfig;
    if (tConfig.workspaceConfigure) {
      tConfig.workspaceConfigure(this);
    }
  }
  
};

MAT.Extend(MAT.Workspace, {

  log: function(msg) {
    this._wslog(msg, {workspace: this.wsName, window: this.wsLabel, userid: this._data.userid});
  },

  // If we're logging, we had better copy the
  // msg and vommonVals, since it will be anonymized
  // otherwise. And we better do it before we
  // log to the global context.

  _wslog: function(msg, commonVals) {
    if (this._logger) {
      if (msg.constructor != Array) {
        msg = [msg];
      }
      var newMsgs = [];
      for (var i = 0; i < msg.length; i++) {
        var d = {};
        for (var k in msg[i]) {
          if (msg[i].hasOwnProperty(k)) {
            d[k] = msg[i][k];
          }
        }
        newMsgs.push(d);
      }
      var newCommonVals = {};
      for (var k in commonVals) {
        if (commonVals.hasOwnProperty(k)) {
          newCommonVals[k] = commonVals[k];
        }
      }
      this._logger.log(newMsgs, newCommonVals, false);
    }
    this._context.log(msg, commonVals);
  },

  // This function rescues
  // and resets the log entries.
  
  _retrieveIntermediateLog: function() {
    if (this._logger) {
      this._logger.commitLogTransaction();
      var ms = new Date().getTime();
      // Send the log.
      var entries = this._logger._logEntries;
      this._logger._logEntries = [];
      return {
        ms: ms, entries: entries
      }
    }
  },

  getTask: function() {
    return this._task;
  },

  loggingEnabled: function() {
    return this._loggingEnabled;
  },

  getDir: function() {
    return this.wsName;
  },

  getFolders: function() {
    return this._taskConfig.workspaceFolders;
  },

  getData: function() {
    return this._data;
  },

  getTaskConfig: function() {
    return this._taskConfig;
  },

  destroy: function() {
    // Who do I need to notify?
    this.log({action: "close_workspace"});
    this._context.ui.notifyWorkspaceClosed(this.wsLabel);
    // Well, at the very least, if there's a logger and
    // there's logging left, I have to upload the log.
    // If it succeeds or fails, I don't care either way.
    if (this._loggingEnabled) {
      var log = this._retrieveIntermediateLog();
      if (log.entries.length > 0) {
        var data = this.getData();
        this._context.backend.backendRequest({
          parameters: {
            "operation": "do_toplevel_workspace_operation",
            "workspace_dir": data.workspace_dir,
            "workspace_key": this._context.getWorkspaceKey(),
            "read_only": data.workspace_read_only ? "yes" : "no",
            ws_operation: "upload_ui_log",
            log: JSON.stringify(log.entries),
            log_format: "json",
            timestamp: log.ms
          }, 
          success: function () {
          },
          failure: function () {
          },
          jsonError: function () {
          }
        });
      }
    }
  },

  // wsDoc might be null, in which case we create one.
  
  docDo: function(responseObj, folderName, fileName, wsDoc) {
    // responseObj will have the new document and other parameters, like the
    // lock ID and the status.
    var jsonObj = responseObj.doc;
    wsDoc = this._taskConfig.workspaceDocDo(this, jsonObj, folderName, fileName, wsDoc);
    // If the document was just created, this may be superfluous.
    wsDoc.setFolder(folderName);
    wsDoc.setExtraDataFields(responseObj);
    if (responseObj.lock_id) {
      wsDoc.setLockId(responseObj.lock_id);
    }
    return wsDoc;
  },

  isReadOnly: function() {
    return this._data.workspace_read_only;
  }

});

/*
 *
 *
 *                      MAT.WorkflowStep
 *
 * I can't believe I need this, but I think the right thing to do about
 * marking things gold is to make a virtual step.
 *
 */

MAT.WorkflowStep = function (stepHash, uiPosition) {
  this.initSettings = stepHash.initSettings || {};
  this.runSettings = stepHash.runSettings || {};
  this.uiSettings = stepHash.uiSettings || {};
  this.virtual = stepHash.virtual || false;
  this._uiPosition = uiPosition;
};

MAT.Extend(MAT.WorkflowStep, {

  isDone: function(doc) {
    return doc.stepIsDone(this.initSettings.name);
  },

  oneStepForward: function(appDoc) {
    appDoc._context.backend.stepsForward(appDoc, [this.initSettings.name]);
  },

  rollback: function(appDoc, backend) {
    backend._rollbackContinuation(appDoc, this.initSettings.name);
  }
});

MAT.MarkGoldWorkflowStep = function (uiPosition) {
  this.initSettings = {name: "mark gold", hand_annotation_available: true};
  this.runSettings = {};
  this.uiSettings = {};
  this._uiPosition = uiPosition;
};

MAT.Extend(MAT.MarkGoldWorkflowStep, {

  isDone: function(doc) {
    if (doc.stepIsDone(this.initSettings.name)) {
      return true;
    } else {
      // See if all the segments are gold or reconciled.
      // If there are no segments, then it hasn't been
      // zoned, which means it's not taggable.      
      var segType = doc.doc.annotTypes.typeTable.SEGMENT;
      if (segType) {
        var segAnnots = doc.doc.annotTypes.getAnnotations("SEGMENT");
        for (var i = 0; i < segAnnots.length; i++) {
          var annot = segAnnots[i];
          var status = annot.getAttributeValue("status");
          if ((status != "human gold") && (status != "reconciled")) {
            // Oops, it's not.
            return false;
          }
        }
        // If we've gotten this far, it is. Mark it done now,
        // but make sure you mark
        // it not dirty, since we're checking here, not updating.
        // When can we get here? If we're looking at a document
        // we haven't modified ourselves. And I think the only
        // time that can be the case is if we're reading a loaded
        // document. It's a little sneaky, but I think that's safe.
        doc.stepDone(this.initSettings.name, {
          dirty: false,
          doneAtLoad: true
        });
        return true;
      } else {
        return false;
      }
    }
  },

  oneStepForward: function(appDoc) {
    // Mark all the segments gold.
    var segType = appDoc.currentDocument.doc.annotTypes.typeTable.SEGMENT;
    if (segType) {
      var segAnnots = appDoc.currentDocument.doc.annotTypes.getAnnotations("SEGMENT");
      for (var i = 0; i < segAnnots.length; i++) {
        var annot = segAnnots[i];
        var status = annot.getAttributeValue("status");
        if ((status != "human gold") && (status != "reconciled")) {
          annot.setAttributeValue("status", "human gold");
        }
      }
    }
    // Now what? This will take care of steps done, too.
    appDoc.updateResult({successes: [{steps: [this.initSettings.name]}]});
  },

  rollback: function(appDoc, backend) {
    // Mark all the segments NON-gold.
    var segType = appDoc.currentDocument.doc.annotTypes.typeTable.SEGMENT;
    if (segType) {
      var segAnnots = appDoc.currentDocument.doc.annotTypes.getAnnotations("SEGMENT");
      for (var i = 0; i < segAnnots.length; i++) {
        var annot = segAnnots[i];
        var status = annot.getAttributeValue("status");
        if ((status == "human gold") || (status == "reconciled")) {
          annot.setAttributeValue("status", "non-gold");
        }
      }
    }
    // Now what?
    backend._finishRollbackContinuation(appDoc, {
      doc: null,
      stepsUndone: ["mark gold"],
      skipDoc: true
    });
  }
});

/*
 *                    MAT.ApplicationDocument
 *
 *
 * This object is the parent class of a number of different document types
 * I think I'm going to leap whole-hog into using Yahoo! for object hierarchies.
 * I've found a number of references out on the Web, and I don't like any
 * of the mechanisms.
 *
 */

MAT.ApplicationDocument = function (context, data, counter, label) {

  // Public, so the UI can grab them.
  this.docCounter = counter;
  this.docLabel = label;
  
  this._context = context;
  // Copy this, just in case it's a reference in YUI.
  this._data = {};
  for (var key in data) {
    this._data[key] = data[key];
  }

  if (this._data.readonly || this._data.suppress_controls) {
    delete this._data.workflow;
  }

  if (data.input) {
    this.currentDocumentName = data.input;
    this.log({"file_type": data.file_type, action: "open_file"});
  }
  
  // Private.
  this._wfObj = null;
  this._uiAvailableSteps = [];
  // Public.
  this.currentDocument = null;

  // Managing the steps. See configure().
  this._taskConfig = new MAT.CoreTask();
  
  // Initialized by setStepProperties().
  // this.stepProperties = {};
}

MAT.Extend(MAT.ApplicationDocument, {


  /*
 *                   Public API
 *
 *
 * These are functions which are called by other elements, either in the
 * core or in the UI.
 *
 */

  getDescription: function () {
    var desc = this._data.memo;
    if (!desc) {
      desc = "";
    }
    if (desc.length > 0) {
      desc = desc + ", ";
    }
    if (this._data.readonly) {
      desc = "read-only, " + desc;
    }
    var s = this.currentDocumentName + " (" + desc + "task " + this._data.task + ")";
    if (this.currentDocument && this.currentDocument.isDirty()) {
      s += " (modified)";
    }
    return s;
  },

  getShortDescription: function () {
    // For use in, for instance, a tab.
    var s = this.currentDocumentName;
    if (this.currentDocument && this.currentDocument.isDirty()) {
      s = "*" + s;
    }
    return s;
  },

  getTask: function() {
    return this._data.task;
  },
  
  // This function sets up all the information about the current
  // configuration. It is called AFTER the UI is created. In fact,
  // it's called after the document is loaded, always.

  // The task will never change.

  // This is called ONLY when the document is loaded. 

  configure: function () {

    // First, let's make sure that reconciliation and comparison docs
    // have the controls suppressed.
    if (this.currentDocument.doc.isReconciliationDoc() ||
        this.currentDocument.doc.isComparisonDoc()) {
      this.updateConfiguration({suppress_controls: true});
    }

    if ((!this._data.readonly) && (!this._data.suppress_controls)) {
      var wfObj = this.getCurrentWorkflow();
      if (wfObj.displayConfig) {
        var tConfig = MAT.TaskConfig[wfObj.displayConfig];
        if (tConfig) {
          this._taskConfig = tConfig;
          if (tConfig.workflowConfigure) {
            tConfig.workflowConfigure(this);
          }
        }
      }
      this.updateFromWorkflow();
    } else {
      this._context.documentPresent(this);
    }
  },

  getCurrentWorkflow: function () {
    return this._context.taskTable[this._data.task].workflows[this._data.workflow];
  },

  getAnnotationTypeRepository: function() {
    return this._context.taskTable[this._data.task].globalAnnotationTypeRepository;
  },

  getStepSuccessors: function(step) {
    return this._context.taskTable[this._data.task].stepSuccessors[step];
  },

  isReadOnly: function() {
    return this._data.readonly;
  },

  updateConfiguration: function (attrs) {

    // First we overwrite.
    for (var key in attrs) {
      this._data[key] = attrs[key];
      // See the init function.
      if (((key == "readonly") || (key == "suppress_controls")) && attrs[key]) {
        delete this._data.workflow;
      } else if (key == "workflow") {
        this.updateFromWorkflow();
      }
    }    
  },

  clearConfiguration: function(attrList) {
    for (var i = 0; i < attrList.length; i++) {
      delete this._data[attrList[i]];
    }
  },

  // This function will ALWAYS have a document now.

  updateFromWorkflow: function () {

    var wfObj = this.getCurrentWorkflow();
    this._wfObj = wfObj;
    this._uiAvailableSteps = [];

    // Some of the steps are display only, which means
    // that they can't be undone, and no button
    // should be displayed for them. The only routine that
    // needs them is the loadDocument routine.

    // There used to be this notion of display_only steps,
    // but that makes no real difference now. 
    
    this._uiAvailableSteps = [];

    for (var i = 0; i < wfObj.steps.length; i++) {
      this._uiAvailableSteps.push(wfObj.steps[i]);
    }
      
    this._context.ui.notifyStepsAvailable(this.docLabel, this._uiAvailableSteps);
    
    // Undo all the UI stuff. This function NEVER redraws the document.
    this.uiUndoAll();

    // The steps we need to do are all of them, not just the available ones.
    // uiRollForward takes care of filtering out the ones that are display only.

    var stepHash = {};
    for (var i = 0; i < this._uiAvailableSteps.length; i++) {
      var step = this._uiAvailableSteps[i];
      if (step.isDone(this.currentDocument)) {
        stepHash[step.initSettings.name] = true;
      }
    }

    this.uiRollForward(stepHash);

  },
  
  // Undo all the UI stuff. This function NEVER redraws the document.
  uiUndoAll: function() {
        
    var orderedSteps = this.getStepSuccessors("<start>");
    
    for (var i = orderedSteps.length - 1; i >= 0; i--) {
      var thisStep = orderedSteps[i];
      if (this.currentDocument.stepIsDone(thisStep)) {
        this._taskConfig.undo(thisStep, this, false, false);
      }
    }

    // Now, we're at ground zero.    
    // Ground zero. Not available.
    
    this._context.ui.notifyHandAnnotationAvailability(this.docLabel, false);
  },

  // This function is used both after load and updateFromWorkflow.
  // In the latter case, we have to roll back all the UI stuff
  // first, which isn't quite what is happening in rollback.
  // You have to uiUdo ALL the steps, even if they're not display
  // only, because we have to catch the display only ones at the
  // beginning.

  uiRollForward: function(stepHash) {
    // Notify about hand annotation availability. This happens as
    // each step is passed, but we have to notify about the initial
    // availability. The availability for each workflow is
    // relative to the step that's being passed by. The next step
    // in the workflow dictates whether hand annotation is available, and
    // if we run out of steps, it's the workflow taskData which tells us
    // about it.
    this.notifyHandAnnotationAvailability(null);

    // We have to roll forward from this point if the document
    // already has steps done. But only the steps that are
    // in the workflow.

    // Since we're now adding frontend-only steps like mark gold,
    // we have to go through the ui available steps, which are a superset
    // of the steps.

    // ONLY redisplay on the final step. That means we need to know
    // which steps are going to be done first.

    var stepsPreviouslyDone = [];
    
    for (var i = 0; i < this._uiAvailableSteps.length; i++) {
      var thisStep = this._uiAvailableSteps[i];
      var stepName = thisStep.initSettings.name;
      if (stepHash[stepName]) {
        stepsPreviouslyDone.push(thisStep);
      }
    }

    // SAM 12/17/12: The UI really needs to know whether
    // hand annotation is available before it displays, so in this
    // loop, the refreshFlag really should never be true. This may
    // require a global change, ultimately, but for now, I'm just
    // going to force it to be false, rather than checking to see
    // if we've reached the end of the list of steps.

    for (var i = 0; i < stepsPreviouslyDone.length; i++) {
      var thisStep = stepsPreviouslyDone[i];
      var stepName = thisStep.initSettings.name;
      this.uiDo(stepName, false);
    }

    // At this point, before the above change, I was calling
    // documentPresent() if there were no stepsPreviouslyDone, but
    // now the right thing to do is notify steps previously done, and
    // then ALWAYS redisplay.
        
    this.notifyStepsPreviouslyDone(stepsPreviouslyDone);
    
    this._context.documentPresent(this);
  },

  // These functions are called with an existing document.
  // load/reload happens elsewhere. The UI will never do
  // anything besides:
  // (a) roll all steps forward from a load
  // (b) roll all steps backward for a reload
  // (c) roll one step forward
  // (d) roll one step backward

  // No steps might be done in this workflow, even though
  // steps are done in the doc. In that case, we have to
  // pick the first step.  

  nextUIStep: function() {
    return this.followingUIStep(this.currentUIStep());
  },

  followingUIStep: function(currentStep) {
    var nextStep = 0;
    if (currentStep !== null) {
      nextStep = currentStep._uiPosition + 1;
    }
    if (nextStep >= this._uiAvailableSteps.length) {
      return null;
    } else {
      return this._uiAvailableSteps[nextStep];
    }
  },

  currentUIStep: function() {
    var mostRecent = this.currentDocument.mostRecentPhase(this._uiAvailableSteps);
    if (mostRecent === null) {
      return null;
    } else {
      return this._uiAvailableSteps[mostRecent];
    }
  },

  // Special, special case. If the current step is a tagging step,
  // and annotation is underway, then don't advance.
  
  oneStepForward: function() {
    var currentStep = this.currentUIStep();
    var nextStep = this.followingUIStep(currentStep);
    
    if (nextStep === null) {
      // You won't be able to roll forward, because there's
      // nothing left to do.
      this._context.ui.error(this.docLabel, "No step to do.");
      return;
    }
    nextStep.oneStepForward(this);
  },

  // If none of the steps in the current workflow are done,
  // don't undo anything.  

  oneStepBack: function() {
    var currentStep = this.currentUIStep();
    if (currentStep === null) {
      this._context.ui.error(this.docLabel, "No step to undo.");
      return;
    }
    // This doesn't call oneStepBack on the step directly, because
    // I need to check for dirtiness.
    this._context.backend.stepBackward(this, currentStep);
  },

  // How will this be implemented?
  
  allSteps: function() {
    return this._wfObj.steps;
  },

  uiAvailableSteps: function() {
    return this._uiAvailableSteps;
  },

  // Handling the notification of steps done and undone.
  // The step is an object.

  notifyStepDone: function(step) {
    this._context.ui.notifyStepDone(this.docLabel, step.initSettings.name);
    this.notifyHandAnnotationAvailability(step);
  },

  // Since we're now adding "mark gold" after all tag steps,
  // we can safely advance past that step.
  
  notifyStepsPreviouslyDone: function (steps) {
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      this.notifyStepDone(step);
    }
  },

  notifyHandAnnotationAvailability: function(completedStep) {
    // completedStep may be null, in which case it means
    // no steps have been completed.
    var pendingStep = this.followingUIStep(completedStep);
    // Every time a step is announced, hand annotation availability is turned
    // off. So we only have to turn it on.
    if (!pendingStep) {
      // At the end.
      if (this._wfObj.workflowData.hand_annotation_available_at_end) {
        this._context.ui.notifyHandAnnotationAvailability(this.docLabel, true);
      }
    } else if (pendingStep.initSettings.hand_annotation_available) {
      this._context.ui.notifyHandAnnotationAvailability(this.docLabel, true);
    }
  },

  log: function(msg) {
    this._context.log(msg, {file: this.currentDocumentName, window: this.docLabel});
  },

  // Takes the digestion from the backend and makes all the updates happen.
  
  updateResult: function(resultHash) {

    // Clear both output DIVs.
    
    // Now, we have lots of error steps, and we can evaluate
    // the result of each step. We'll do updates for each step,
    // and then we'll raise failures if we have to.

    // We have to be careful to distinguish between the steps
    // that need to be rolled forward in the document, and
    // the steps which need to be rolled forward in the workflow.
    // Steps to be rolled forward in the document can happen
    // in the docDo() loop, because these are things which 
    // happened to the document.

    // Obviously, only the earliest docDo() happens. So it
    // had better cover everything for all the steps. Fortunately,
    // in all cases, it's just a matter of copying the whole
    // document in.

    var resultDict = {};

    var allCompletedSteps = [];

    for (var i = 0; i < resultHash.successes.length; i++) {
      var entry = resultHash.successes[i];
      // Success. Set up the successful steps
      // and the mapping from step names to result steps.
      // Use the first step to digest the entry.
      // Once docDo() is called, currentDocument will be
      // sure to exist. docDo() has to take care of
      // things for all the steps that apply to this document.      
      this._taskConfig.docDo(entry.steps[0], this, entry.val);
      for (var j = 0; j < entry.steps.length; j++) {
        // isDirty is true. It won't be true if the step ends
        // up being load, because stepDone() filters out that case.
        // It also doesn't matter what order these are done in,
        // because the display happens in order in a minute.
        var entryStep = entry.steps[j];
        this.stepDone(entryStep);
        allCompletedSteps.push(entryStep);
        this.log({action: "do_step", step: entryStep});
        resultDict[entryStep] = entry;
      }
    }

    // Now, update the UI separately, only for the steps in the
    // workflow. But only refresh at the end. And we can't be counting
    // the completed steps - we have to know whether they're
    // in the available steps as well. So we need to go through this
    // twice, sort of.

    var availableStepsToDo = [];
    
    for (var i = 0; i < this._uiAvailableSteps.length; i++) {
      if (resultDict[this._uiAvailableSteps[i].initSettings.name]) {
        availableStepsToDo.push(this._uiAvailableSteps[i]);
      }
    }

    for (var i = 0; i < availableStepsToDo.length; i++) {
      this.updateUIForResult(availableStepsToDo[i], i == (availableStepsToDo.length - 1));
    }

    // I've set this up so that there are additional keys added locally:
    // dontTell (notify instead of tell) 
    if (resultHash.error != null) {
      this.log({action: "do_step_failure",
                reason: "application",
                step: resultHash.errorStep,
                error_text: resultHash.error});
      var s = "";
      if (allCompletedSteps.length > 0) {
        s += "Steps '" + allCompletedSteps.join(", ") + "' were completed, but step " + resultHash.errorStep + " failed. Reason:";
      } else if (resultHash.errorStep == "[init]") {
        // Before anything happened.
        s += "Step failed during initialization. Reason:";
      } else if (resultHash.errorStep == "[eval]") {
        s += "The application encountered an unexpected error. Reason:";
      } else if (resultHash.errorStep == "[parse]") {
        s += "The UI encountered an error while trying to digest the server response. Reason:";
      } else {
        s += "Step " + resultHash.errorStep + " failed. Reason:";
      }
      s += "<p>" + resultHash.error;
      if (resultHash.dontTell) {
        this._context.ui.notifyError(s);
      } else {
        this._context.ui.error(this.docLabel, s);
      }
    }
  },
  
  // Followup for step updater. Called in load step, in which case
  // the steps can't be dirty. The idea is that the output was
  // originally generated for the first step in the sequence
  // of steps in the success array, and in order to get the right
  // value for the current step, you have to ask the first step
  // for it.
  
  updateUIForResult: function(step, refreshFlag) {
    // FIRST we notify everybody the step is done, THEN
    // we update the UI. This way, the document knows that hand
    // annotation is enabled/disabled before we render.
    this.notifyStepDone(step);
    this.uiDo(step.initSettings.name, refreshFlag);
  },

  uiDo: function(stepName, refreshFlag) {
    this._taskConfig.uiDo(stepName, this, refreshFlag);
  },

  // This can be entered in a number of ways, and you don't want
  // to call it as a result of calling it (e.g., you destroy the doc,
  // which closes the window, which destroys the doc...). We have
  // a recursion cutoff for the panels in workbench_ui.js; we should have
  // one here too.
  
  destroy: function() {
    if (!this._beingDestroyed) {
      this._beingDestroyed = true;
      // Who do I need to notify?
      this.log({action: "close_file"});
      this._context.ui.notifyDocumentClosed(this.docLabel);
    }
  },

  // Notified by the doc display. What should it do?
  // Arguably, if the current step is hand tagging, and
  // tag isn't yet done, we should notify that hand annotation
  // is underway, and mark on the doc somehow that hand
  // annotation is partially complete. But right now, since
  // I haven't yet cleaned up the metadata stuff, I'm just going
  // to tell the current document that the step is done.

  // The new SEGMENT stuff makes this all a LOT easier.
  // But it also means that it needs to advance the step.
  
  handAnnotationChanged: function() {
    // We have to check this BEFORE we mark the step as done,
    // because afterward, tag will already be marked, and we
    // only want it done for the first annotation. This is called
    // when annotations are added OR removed; stepDone marks
    // the document as dirty, and we need that.

    // Actually, this is a lot more complicated here, because
    // we have the case of when the "tag" step is "done" (i.e.,
    // we've had at least one hand annotation), and then we
    // load that document and do more annotation. We need to
    // know that the CURRENT step is a tag step, in which case
    // we mark the document dirty.

    var curStep = this.currentUIStep();
    var followingStep = this.followingUIStep(curStep);

    // There's one final perverse case: when there's a single step
    // in the workflow (e.g., "mark gold"), and hand annotation is
    // available during it.
    
    if (followingStep && followingStep.initSettings.tag_step) {
      this.stepDone(followingStep.initSettings.name);
      this.notifyStepDone(followingStep);
    } else if (curStep && curStep.initSettings.tag_step) {
      // Mark it dirty.
      this.markDirty(curStep.initSettings.name);
    } else if (followingStep && !curStep && (this._uiAvailableSteps.length == 1)) {
      // You landed here because the document has been annotated. This means
      // that the workflow says that hand annotation is available at the end,
      // and the step is "mark gold".
      this.markDirty(followingStep.initSettings.name);
    }
  },

  markDirty: function(curStepName) {
    this.currentDocument.markDirty(curStepName);
    this._context.ui.notifyDocumentModified(this);
  },

  stepDone: function(stepName) {
    this.currentDocument.stepDone(stepName, {
      dirty: true
    });
    this._context.ui.notifyDocumentModified(this);
  },

  markNotDirty: function() {
    this.currentDocument.notDirty();
    this._context.ui.notifyDocumentUnmodified(this);
  }
  
});

/*
 *                    MAT.WorkspaceDocument
 *
 *
 * It turns out that workspace documents are actually notably different
 * than application documents. None of that step management. I get to
 * pass in the initial document state, too.
 *
 */

MAT.WorkspaceDocument = function (context, ws, folderName, fileName, jsonObj, counter, label) {

  // Public, so the UI can grab them.
  this.docCounter = counter;
  this.docLabel = label;
  
  this._context = context;
  this._workspace = ws;
  this._currentFolder = folderName;
  this._currentStatus = null;
  this._fileName = fileName;
  this._data = {};
  this._lockid = null;
  this._localReadOnly = false;
  
  this.log({action: "open_file"});
  
  // Public.
  this.currentDocument = null;
  if (jsonObj) {
    this.currentDocument = new MAT.Annotation.AnnotatedDocWithMetadata().fromJSON(jsonObj, this.getAnnotationTypeRepository());
  }
  var tConfig = this._workspace.getTaskConfig();
  if (tConfig.workspaceDocumentConfigure) {
    tConfig.workspaceDocumentConfigure(this);
  }
  this._extraDataFields = null;
}

MAT.Extend(MAT.WorkspaceDocument, {

  getExtraDataFields: function () {
    return this._extraDataFields;
  },

  getExtraDataField: function (k) {
    if (this._extraDataFields) {
      return this._extraDataFields[k] || null;
    } else {
      return null;
    }
  },

  // o is the response object from the backend.
  // The keys should be suitable for presentation.
  setExtraDataFields: function(o) {
    var edf = this._workspace.getTaskConfig().workspaceFolders[this._currentFolder].setExtraDataFields;
    if (edf) {
      this._extraDataFields = edf(o);
    }
  },

  getDescription: function () {
    var s = this._fileName + " (workspace " + this._workspace.getDir() + ")"; 
      if (this.currentDocument && this.currentDocument.isDirty()) {
      s += " (modified)";
    }
    return s;
  },

  getShortDescription: function () {
    // For use in, for instance, a tab.
    var s = this._fileName;
    if (this.currentDocument && this.currentDocument.isDirty()) {
      s = "*" + s;
    }
    return s;
  },

  getTask: function() {
    return this._workspace.getTask();
  },
  
  log: function(msg) {
    this._workspace._wslog(msg, {file: this._fileName,
                                 window: this.docLabel,
                                 folder: this._currentFolder || "<none>",
                                 workspace: this._workspace.wsName});
  },

  // This can be reentrant, just like file mode.
  destroy: function() {
    if (!this._beingDestroyed) {
      this._beingDestroyed = true;
      // Who do I need to notify?
      this.log({action: "close_file"});
      this._context.ui.notifyDocumentClosed(this.docLabel);
      this.releaseLock();
    }
  },
  
  getAnnotationTypeRepository: function() {
    return this._context.taskTable[this._workspace.getTask()].globalAnnotationTypeRepository;
  },

  getWorkspace: function () {
    return this._workspace;
  },

  getFilename: function () {
    return this._fileName;
  },

  setFolder: function (folderName) {
    this._currentFolder = folderName;
  },

  getFolder: function() {
    return this._currentFolder;
  },

  setLockId: function (lockid) {
    this._lockid = lockid;
  },

  getLockId: function() {
    return this._lockid;
  },

  // If this was opened read-only, there's no lock to release.
  // And once the lock is released, we need to notify the
  // workspace listing. Note that we do NOT want to do the
  // optional save if dirty here; we've already presented a popup
  // warning that there are unsaved changes.
  
  releaseLock: function () {
    if (this._lockid) {
      var v = this;
      var op = {
        name: "release_lock",
        defaultOperation: false,
        blockInitialSave: true,
        getParameters: function(wsDoc) {
          return {lock_id: wsDoc.getLockId()};
        },
        onSuccess: function(wsDoc) {
          // Notify the workspace listing.
          v._context.ui.notifyWorkspaceFolderRefresh(wsDoc.getWorkspace().wsLabel, [wsDoc.getFolder()]);
        }        
      };
      this._context.backend._doWorkspaceOperationOnFile(this, op);
    }
  },

  updateUI: function() {
    var tConfig = this._workspace.getTaskConfig();
    // uiDo.
    tConfig.workspaceUIDo(this);
  },

  updateConfiguration: function (attrs) {
    // Overwrite.
    for (var key in attrs) {
      this._data[key] = attrs[key];
    } 
  },

  clearConfiguration: function(attrList) {
    for (var i = 0; i < attrList.length; i++) {
      delete this._data[attrList[i]];
    }
  },

  getOperations: function () {
    return this._workspace.getTaskConfig().workspaceFolders[this._currentFolder].operations;
  },

  isReadOnly: function () {
    return this._localReadOnly || this._workspace.isReadOnly();
  },

  setReadOnly: function() {
    this._localReadOnly = true;
  },

  unsetReadOnly: function () {
    this._localReadOnly = false;
  },

  // I need this to live on the document, so I can update
  // it in the enhancements.
  notifyWorkspaceDocument: function () {
    this._context.ui.notifyWorkspaceDocument(this.docLabel);
  },

  // So when hand annotation is added, it's the folder, not the step,
  // which tells me where hand annotation is underway. We have to be in the
  // in process folder.

  handAnnotationChanged: function() {
    this.currentDocument.stepDone("tag");
    this._context.ui.notifyDocumentModified(this);
  },

  markNotDirty: function() {
    this.currentDocument.notDirty();
    this._context.ui.notifyDocumentUnmodified(this);
  }
  
});

/*
 *                MAT.FileFormats
 *
 *
 * There's a bunch of data we need to record for a given format. And
 * now that we're getting more of them, I'd better start encapsulating it.
 * It also needs to include behavior for loading and saving, etc., and
 * probably for the UI menus, but maybe I have to do that elsewhere.
 *
 */

/* Some of the formats are only readers, or only writers. We have
   to reflect that here, too. If the direction key is present, it should
   be "in" or "out". If it's not present, both are assumed. */

MAT.FileFormats = {
  formats: {
    raw: {
      richFormat: false,
      distinguishedSuffix: ".txt",
      replacementRootSuffix: "_txt"
    },
    "mat-json": {
      richFormat: true,
      distinguishedSuffix: ".json",
      replacementRootSuffix: "_json"
    },
    "mat-json-v1": {
      richFormat: true,
      distinguishedSuffix: ".json",
      replacementRootSuffix: "_json",
      direction: "out"
    },
    "xml-inline": {
      richFormat: true,
      distinguishedSuffix: ".xml",
      replacementRootSuffix: "_xml"
    },
    "fake-xml-inline": {
      richFormat: true,
      // These are only needed for output formats.
      distinguishedSuffix: null,
      replacementRootSuffix: null,
      direction: "in"
    }
  },
  
  // Here's a little utility to grab a filename without
  // its extension. If I'm going to add extensions, and also
  // a suffix to the basename, I have to grab all the existing
  // extensions and add to them. But I also need to sever
  // final .txt or .json.

  _splitExt: function(path) {
    var idx = path.indexOf(".");
    if (idx == -1) {
      return [path, "", ""];
    } else {
      var lastIdx = path.lastIndexOf(".");
      // There will always be one.
      var lastSuff = path.substring(lastIdx);
      // See if a distinguished suffix is present.
      for (fmt in MAT.FileFormats.formats) {
        if (MAT.FileFormats.formats[fmt].distinguishedSuffix == lastSuff) {
          return [path.substring(0, idx), path.substring(idx, lastIdx), fmt];
        }
      }
      return [path.substring(0, idx), path.substring(idx), null];
    }
  },

  newFilename: function(inType, outType, fileName) {
    var rootSuff = "";
    if ((arguments.length > 3) && (arguments[3] != null)) {
      rootSuff = arguments[3];
    }
    
    if (inType == outType) {
      if (rootSuff) {
        var triple = MAT.FileFormats._splitExt(fileName);
        var ext = "";
        if (triple[2]) {
          ext = MAT.FileFormats.formats[triple[2]].distinguishedSuffix;
        }
        return triple[0] + rootSuff + triple[1] + ext;
      } else {
        return fileName;
      }
    }
    
    var triple = MAT.FileFormats._splitExt(fileName);
    // Add the root suffix if there was a previous extension
    // of the appropriate type. Otherwise, do nothing.
    var ext = MAT.FileFormats.formats[outType].distinguishedSuffix;
    var suffixedFmt = triple[2];
    if (suffixedFmt) {
      rootSuff += MAT.FileFormats.formats[suffixedFmt].replacementRootSuffix;
    }
    return triple[0] + rootSuff + triple[1] + ext;
  }
  
}

/*
 *                MAT.BackendConnector
 *
 *
 * This is a stub, which is instantiated if there's no other backend
 * connector registered via setConnector. All it does is fail.
 *
 */

MAT.BackendConnector = function (backend) {
  this.backend = backend;
}

MAT.Extend(MAT.BackendConnector, {

  backendRequest: function(properties) {
    properties.failure("No AJAX connection configured");
  },

  ping: function(url, cb) {
    cb.failure(null);
  }
});

/*
 *                MAT.Backend
 *
 *
 * This object contains all the code for performing a single
 * operation with the backend. It needs to know the CGI script location.
 * It also digests the result and prepares it for the context to
 * execute the steps.
 *
 */

// Just in case we want multiple backends, we're going to have to
// ensure that the hidden frame continuation can pick out a unique MAT.Backend object.

MAT.Backend = function (context, cgiURL) {
  // Private.
  this._cgiURL = cgiURL;
  this._context = context;
  this._hiddenSaveTarget = null;
  this._saveTimeout = null;
  this._saveTransaction = null;
  this._backendConnection = null;
}           

MAT.Extend(MAT.Backend, {
  
/* 
 *                PUBLIC API
 *
 *
 * Used internally by MAT.Context, and by the external UI.
 */

  // First, the three connector methods.
  
  setConnector: function(cls) {
    this._backendConnection = new cls(this);
  },
  
  backendRequest: function(properties) {
    if (this._backendConnection === null) {
      this.setConnector(MAT.BackendConnector);
    }
    this._backendConnection.backendRequest(properties);
  },
  
  ping: function(url, cb) {
    if (this._backendConnection === null) {
      this.setConnector(MAT.BackendConnector);
    }
    this._backendConnection.ping(url, cb);
  },
      
  // Well, we need the tasks from the backend.
  // In JUST THIS CASE, we add untaggable to the
  // tag table for each task. It's always available in the
  // UI display, but the chances that we want it to be added
  // if setTaskTable is called independently (e.g., when
  // we're managing a non-MAT task using the MAT UI elements,
  // as we do in DEPOT) are rather slim.
    
  loadTasks: function() {
    this.backendRequest({
      parameters: {
        operation: "fetch_tasks"
      },
      success: function (pair) {
        if (pair[0]) {
          this._context.setTaskTable(pair[1].metadata);
          this._context.setWorkspaceAccess(pair[1].workspace_access);
          this._context.ui.notifyTasksLoaded();
        } else {
          this._context.ui.notifyError(pair[1]);
        }
      },
      failure: function (s) {
        this._context.ui.notifyError("<h2>Error fetching tasks</h2><p>" + s);
      },
      jsonError: function (s) {
        this._context.ui.notifyError(s);
      }
    });
  },

  // Hm. This has many documents, all of which are locally loaded.

  documentReconciliation: function(docs, panelCreationData) {
    // Jut encode the docs as a list of docs.
    var docList = [];
    for (var i = 0; i < docs.length; i++) {
      docList.push(docs[i]._taskConfig.serialize(docs[i].currentDocument));
    }
    var params =  {
      "operation": "document_reconciliation",
      "input": JSON.stringify(docList),
      "task": docs[0].getTask()
    };
    var appDoc = this._context.getDocument(this._context.newDocument({
      task: docs[0].getTask(),
      // I need these for document save.
      file_type: "mat-json",
      input: (docs[0].currentDocumentName || "doc") + "_reconciliation.json"
    }));
    var v = this;
    this.backendRequest({
      parameters: params,
      success: function (obj) {
        panelCreationData.description = docs[0].getDescription();
        this._loadDocumentBackendSuccess(obj, appDoc, {
          panelCreationParams: panelCreationData,
          failureCb: function () {
            v._context.destroyDocument(appDoc.docLabel);
          }
        }, "open_file_reconciliation");
      },
      failure: function (s) {
        this._context.ui.notifyError("<h2>Error reconciling documents</h2><p>" + s);
        this._context.log({action: "open_file_reconciliation_failure",
                           reason: "implementation",
                           error_text: s}, null);
      },
      jsonError: function (s) {
        this._context.ui.notifyError(s);
        this._context.log({action: "open_file_reconciliation_failure",
                           reason: "json_decode",
                           error_text: s}, null);
      }
    });    
  },

  // This is very, very similar to documentReconciliation.
  // This requires the first item in docs to be the pivot document
  documentComparison: function(docs, docLabels, panelCreationData) {
    // Jut encode the docs as a list of docs.
    var docList = [];
    for (var i = 0; i < docs.length; i++) {
      docList.push(docs[i]._taskConfig.serialize(docs[i].currentDocument));
    }
    var params =  {
      "operation": "document_comparison",
      "input": JSON.stringify(docList),
      "labels": docLabels,
      "task": docs[0].getTask()
    };
    var appDoc = this._context.getDocument(this._context.newDocument({
      readonly: true,
      task: docs[0].getTask(),
      // I need these for document save.
      file_type: "mat-json",
      input: (docs[0].currentDocumentName || "doc") + "_comparison.json"
    }));
    var v = this;
    this.backendRequest({
      parameters: params,
      success: function (obj) {
        panelCreationData.description = docs[0].getDescription();
        this._loadDocumentBackendSuccess(obj, appDoc, {
          panelCreationParams: panelCreationData,
          failureCb: function () {
            v._context.destroyDocument(appDoc.docLabel);
          }
        }, "open_file_comparison");
      },
      failure: function (s) {
        this._context.ui.notifyError("<h2>Error comparing documents</h2><p>" + s);
        this._context.log({action: "open_file_comparison_failure",
                           reason: "implementation",
                           error_text: s}, null);
      },
      jsonError: function (s) {
        this._context.ui.notifyError(s);
        this._context.log({action: "open_file_comparison_failure",
                           reason: "json_decode",
                           error_text: s}, null);
      }
    });    
  },

  openWorkspace: function(data) {
    this.backendRequest({
      parameters: {
        "operation": "open_workspace",
        "workspace_dir": data.workspace_dir,
        "workspace_key": this._context.getWorkspaceKey(),
        "read_only": data.workspace_read_only ? "yes" : "no",
        "user": data.userid
      },
      success: function (obj) {
        if (obj.success) {
          // We've opened the task appropriately. Make sure
          // we get a workspace_dir back, in case we passed in
          // a bare name and it was fleshed out on the backend.
          data.workspace_dir = obj.workspace_dir;
          var wsLabel = this._context.newWorkspace(data, obj.task, obj.logging_enabled);
          this._context.ui.notifyWorkspaceOpen(wsLabel, data.userid);
        } else {
          this._context.ui.notifyOpenWorkspaceError(obj.error, true);
          this._context.log({action: "open_workspace_failure",
                             workspace: data.workspace_dir,
                             reason: "application",
                             error_text: obj.error}, null);
        }
      },
      failure: function (s) {
        this._context.ui.notifyOpenWorkspaceError("<h2>Error opening workspace</h2><p>" + s);
        this._context.log({action: "open_workspace_failure",
                           workspace: data.workspace_dir,
                           reason: "implementation",
                           error_text: s}, null);
      },
      jsonError: function (s) {
        this._context.ui.notifyOpenWorkspaceError(s);
        this._context.log({action: "open_workspace_failure",
                           workspace: data.workspace_dir,
                           reason: "json_decode",
                           error_text: s}, null);
      }
    });
  },

  // only get the workspace key from the context (not data) because it can be changed
  listWorkspaceFolder: function(ws, folderName) {
    var data = ws.getData();
    this.backendRequest({
      parameters: {
        "operation": "list_workspace_folder",
        "workspace_dir": data.workspace_dir,
        "workspace_key": this._context.getWorkspaceKey(),
        "read_only": data.workspace_read_only ? "yes" : "no",
        "folder": folderName
      },
      success: function (obj) {
        if (obj.success) {
          ws.log({folder: folderName, action: "list_workspace_folder"});
          this._context.ui.notifyWorkspaceFolderContents(
            ws.wsLabel, folderName, obj.basename_info);
        } else {
          ws.log({folder: folderName,
                  action: "list_workspace_folder_failure",
                  reason: "application",
                  error_text: obj.error});
          this._context.ui.notifyWorkspaceFolderRefreshCompleted(ws.wsLabel);
          this._context.ui.error(null, obj.error);
        }
      },
      failure: function (s) {
        ws.log({folder: folderName,
                action: "list_workspace_folder_failure",
                reason: "implementation",
                error_text: s});
        this._context.ui.notifyWorkspaceFolderRefreshCompleted(ws.wsLabel);
        this._context.ui.notifyError("<h2>Error listing workspace folder</h2><p>" + s);
      },
      jsonError: function (s) {
        ws.log({folder: folderName,
                action: "list_workspace_folder_failure",
                reason: "json_decode",
                error_text: s});
        this._context.ui.notifyWorkspaceFolderRefreshCompleted(ws.wsLabel);
        this._context.ui.notifyError(s);
      }
    });
  },
  
  openWorkspaceFile: function(ws, fileName, folderName) {
    // Is it already open?
    for (var k in this._context._objHash) {
      if (this._context._objHash.hasOwnProperty(k)) {
        var d = this._context._objHash[k];
        if ((d.constructor == MAT.WorkspaceDocument) &&
            (d.getFolder() == folderName) &&
            (d.getFilename() == fileName)) {
          // Can't open the same file twice.
          ws.log({action: "load_file_failure",
                  file: fileName,
                  folder: folderName,
                  reason: "application",
                  error_text: "file is already open"});
          this._context.ui.error(null, "Workspace file is already open.");
          return;
        }
      }
    }
    var data = ws.getData();
    localReadOnly = ws.getFolders()[folderName].folder_read_only;
    this.backendRequest({
      parameters: {
        "operation": "open_workspace_file",
        "workspace_dir": data.workspace_dir,
        "workspace_key": this._context.getWorkspaceKey(),
        "read_only": (data.workspace_read_only || localReadOnly) ? "yes" : "no",
        "file": fileName,
        "folder": folderName,
        "user": data.userid
      },
      success: function (obj) {
        if (obj.success) {
          try {
            var doc = ws.docDo(obj, folderName, fileName, null);
          } catch (e) {
            var errTxt = MAT.Annotation.errorToString(e);
            ws.log({action: "load_file_failure",
                    file: fileName,
                    folder: folderName,
                    reason: "application",
                    error_text: errTxt});
            this._context.ui.error(null, errTxt);
            return;
          }
        }
        if (obj.success) {
          if (localReadOnly) {
            doc.setReadOnly();
          }
          doc.notifyWorkspaceDocument();
          // Aaaaand...refresh the folder listing.
          this._context.ui.notifyWorkspaceFolderRefresh(doc.getWorkspace().wsLabel, [doc.getFolder()]);
        } else {
          ws.log({action: "load_file_failure",
                  file: fileName,
                  folder: folderName,
                  reason: "application",
                  error_text: obj.error});
          this._context.ui.error(null, obj.error);
        }
      },
      failure: function (s) {
        ws.log({action: "load_file_failure",
                file: fileName,
                folder: folderName,
                reason: "implementation",
                error_text: s});
        this._context.ui.notifyError("<h2>Error opening workspace file</h2><p>" + s);
      },
      jsonError: function (s) {
        ws.log({action: "load_file_failure",
                file: fileName,
                folder: folderName,
                reason: "json_decode",
                error_text: s});
        this._context.ui.notifyError(s);
      }
    });
  },

  // If the operation is not "save", and the document is dirty,
  // we must do a save + a followup operation, which we should
  // encode using JSON.stringify. The followon operation
  // doesn't need the workspace dir, or key, or read_only, or file, or folder.
  // Just the operation and whatever options are required.
  // Actually, we need to block initial save with release_lock, too,
  // so let's just add a blockInitialSave flag to the op.
  
  doWorkspaceOperationOnFile: function(wsDoc, op) {
    op = wsDoc.getOperations()[op];
    return this._doWorkspaceOperationOnFile(wsDoc, op);
  },
  
  _doWorkspaceOperationOnFile: function(wsDoc, op) {
    var folder = wsDoc.getFolder();
    var thebackend = this;
    // If the document has changes, and we're in the core folder, and
    // we can do an initial save, then ask the user if they want to save first
    if (wsDoc.currentDocument.isDirty() && (folder == "core") && !op.blockInitialSave) {
      this._context.ui.ask(wsDoc.docLabel,
                           "Performing this " + op.name + " operation will discard unsaved changes.  Would you like to save first?",
                           [{text: "Save & Proceed", 
                             handler: function () {
                               // proceed with doSave = true
                               thebackend._reallyDoWorkspaceOperationOnFile(wsDoc, op, true);
                             }
                            },
                            {text: "Discard Changes & Proceed",
                             handler: function () {
                               // proceed with doSave = false
                               thebackend._reallyDoWorkspaceOperationOnFile(wsDoc, op, false);
                             }
                            },
                            {text: "Cancel",
                             isDefault: true,
                             handler: function () {
                               // log it
                               wsDoc.log({action: "do_operation_aborted", reason: "user_request"});
                               // don't do the operation but instead call notifyOperationCompleted 
                               // to do the cleanup
                               thebackend._context.ui.notifyOperationCompleted(wsDoc.getWorkspace().wsLabel, 
                                                                               wsDoc.docLabel, []);
                             }
                            }]);
                   
    } else {
      // it wasn't dirty to begin with, so we don't have to ask, we just pass through doSave=false
      this._reallyDoWorkspaceOperationOnFile(wsDoc, op, false);
    }

  },
  
  _reallyDoWorkspaceOperationOnFile: function(wsDoc, op, doSave) {
    var data = wsDoc.getWorkspace().getData();
    var parameters = {
      "operation": "do_workspace_operation",
      "workspace_dir": data.workspace_dir,
      "workspace_key": this._context.getWorkspaceKey(),
      "read_only": data.workspace_read_only ? "yes" : "no",
      "file": wsDoc.getFilename(),
      "folder": wsDoc.getFolder(),
      "ws_operation": op.name
    };
    if (doSave) {
      // if the user decided to save first, then get the "Save" operation and
      // apply its parameters here, and the other parameters to the embedded operation.
      var saveOp = wsDoc.getOperations()["Save"];
      parameters.ws_operation = saveOp.name;
      if (saveOp.getParameters) {
        var p = saveOp.getParameters(wsDoc);
        for (var key in p) {
          if (p.hasOwnProperty(key)) {
            parameters[key] = p[key];
          }
        }
      }
      var opParameters = {operation: op.name};
      if (op.getParameters) {
        var p = op.getParameters(wsDoc);
        for (var key in p) {
          if (p.hasOwnProperty(key)) {
            opParameters[key] = p[key];
          }
        }
      }
      parameters.next_op = JSON.stringify(opParameters);
    } else if (op.getParameters) {
      var p = op.getParameters(wsDoc);
      for (var key in p) {
        if (p.hasOwnProperty(key)) {
          parameters[key] = p[key];
        }
      }
    }
    
    this.backendRequest({
      parameters: parameters,
      success: function (obj) {
        if (obj.success) {
          // We have an updated document, in "doc"; a new folder, in "target";
          // and possibly affected folders to check, in "affected_folders".
          // The doc and/or target may be empty, if the target didn't change
          // or the document didn't change.
          // How to log this? docDo() might create a new document, which
          // should be the same gesture as this, but may not be able to be.
          // You also want to do the log before the update, so you can get the
          // before and after folder. Well, here's a genius idea: log transactions.
          // And here's a better idea: start the transactions in the UI.

          var newWsDoc;
          try {
            // If we don't have a doc, we don't digest.
            if (obj.doc) {
              var doc = obj.doc;
              var target = obj.target || wsDoc.getFolder();
              newWsDoc = wsDoc.getWorkspace().docDo(obj, target, wsDoc.getFilename(), wsDoc);
            }
          } catch (e) {
            var errTxt = MAT.Annotation.errorToString(e);
            obj.success = false;
            obj.error = errTxt;
          }
        }

        if (obj.success) {
          if (newWsDoc) {            
            newWsDoc.notifyWorkspaceDocument();
          }

          // Now, make sure the onSuccess is executed. The one example so far
          // is if the document was successfully saved. I think this operation
          // needs to be called on the OLD document. Another example is
          // when the document's lock is released.
          if (op.onSuccess) {
            op.onSuccess(wsDoc);
          }

          var logMsg = {action: "do_operation", operation: op.name};
          if (obj.target) {
            logMsg.advance_to = obj.target;
          }
          wsDoc.log(logMsg);

        } else {
          wsDoc.log({action: "do_operation_failure",
                     reason: "application",
                     error_text: obj.error});
          this._context.ui.error(wsDoc.docLabel, obj.error);
        }
        this._context.ui.notifyOperationCompleted(wsDoc.getWorkspace().wsLabel,
                                                  wsDoc.docLabel,
                                                  obj.affected_folders);
      },
      failure: function (s) {
        wsDoc.log({action: "do_operation_failure",
                   reason: "implementation",
                   error_text: s});
        this._context.ui.notifyError("<h2>Error performing workspace operation</h2><p>" + s);
        this._context.ui.notifyOperationCompleted(wsDoc.getWorkspace().wsLabel,
                                                  wsDoc.docLabel,
                                                  []);
      },
      jsonError: function (s) {
        wsDoc.log({action: "do_operation_failure",
                   reason: "json_decode",
                   error_text: s});
        this._context.ui.notifyError(s);
        this._context.ui.notifyOperationCompleted(wsDoc.getWorkspace().wsLabel,
                                                  wsDoc.docLabel,
                                                  []);
      }
    });
  },

    
  // If the server is unavailable, and I don't reset the target,
  // the current display will vanish. However, if we redirect the
  // target to _blank, we'll end up with a window flashing and then
  // being destroyed in Firefox. So we should have a hidden iframe target.
  // But THAT has the same problem as in the load document case;
  // the error gets redirected to the hidden iframe, and the user
  // never sees it. So this sort of save form should only be used
  // in conjunction with a "GET"-based ping.

  // Actually, the problem is even worse. I'm invoking the browser to
  // save the document via the content-disposition header. But that means
  // that even if I catch an error and return it, I won't be able to
  // show it, because it's written to the hidden iFrame and that's
  // never checked. And what's worse is that I have no idea when the
  // submit is finished, because I'm not doing AJAX because I have to
  // hit the browser, so I don't even know if there WAS an error. The best
  // I can do is monitor the save target and see if it contains anything
  // in the first, oh, 10 seconds after the save.

  _saveDocument: function(parameters) {
          
    // Pop up a window with the document, with Save as... enabled.
    // I think. Well, no. You have to select "Text file" to
    // save it as a text file. Better to send it to the
    // server, so the server forces a download. Just submit a form.

    // Because the parameters can vary, I really need to create and destroy
    // the form each time; I used to cache it, but no longer. I do
    // need a save target, so that I don't replace this page or
    // pop up a new one, but it can be the same save target in
    // each case, since I don't use it for anything.

    var id = this._randomID('saveform');
      
    var form = document.createElement("form");
    form.id = id;
    form.setAttribute("style", "display: none");
    if (this._saveInterval) {
      // We're never gonna catch it anyway.
      clearTimeout(this._saveTimeout);
    }
    this._initializeHiddenSave();
    form.target = this._hiddenSaveTarget.id;
    form.action = this._cgiURL;
    form.method = "post";
    // Apparently, according to the spec, in order to ensure
    // that the right things happen with Unicode, I need
    // to use multipart/form-data.
    // form.encoding = "application/x-www-form-urlencoded";
    form.encoding = "multipart/form-data";
    if (parameters.operation == undefined) {
      parameters.operation = "save";
    }
    parameters.save_transaction = this._saveTransaction;
    for (param in parameters) {
      var elt = document.createElement('input');
      elt.type = 'hidden';
      elt.name = param;
      var val = parameters[param];
      if (val === true) {
        elt.value = "yes";
      } else if (val === false) {
        elt.value = "no";
      } else {
        elt.value = val;
      }
      form.appendChild(elt);
    }      
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
    this._initializeHiddenSaveErrorChecking();
  },

  exportAndSaveReconciliationDocument: function(appDoc, outType, parameters) {
    parameters.ui = {rootSuffix: "_exported"};
    parameters.operation = "export_reconciliation_doc";
    parameters.for_save = true;
    this.saveDocument(appDoc, outType, null, parameters);
  },

  exportReconciliationDocument: function(appDoc) {
    this.backendRequest({
      parameters: {
        task: appDoc._data.task,
        operation: "export_reconciliation_doc",
        input: JSON.stringify(appDoc.currentDocument.toJSON())
      },
      success: function (obj) {
        // New document. Load it.
        var newLabel = this._context.newDocument({
          task: appDoc._data.task,
          input: MAT.FileFormats.newFilename("mat-json", "mat-json", appDoc.currentDocumentName, "_exported")
        });
        var newAppdoc = this._context.getDocument(newLabel);
        this._loadDocumentBackendSuccess(obj, newAppdoc, {}, "export_reconciliation_doc");
      },
      failure: function (s) {
        appDoc.log({action: "export_reconciliation_doc_failure",
                    reason: "implementation",
                    error_text: s});
        this._context.ui.notifyError("<h2>Error during export</h2><p>" + s);
      },
      jsonError: function (s) {
        appDoc.log({action: "export_reconciliation_doc_failure",
                    reason: "json_decode",
                    error_text: s});
        this._context.ui.notifyError(s);
      }
    });
  },
  
  saveDocument: function(appDoc, outType, successCb) {
    
    if (appDoc.currentDocument != null) {

      var inType = appDoc._data.file_type;
      var fileName = appDoc._data.input;
      var taskName = appDoc._data.task;
      var parameters = {};
      if (arguments.length > 3) {
        parameters = arguments[3];
      }
      var uiParameters = parameters.ui || {};
      delete parameters.ui;

      // If the input type and output type match, then
      // use the input filename. Otherwise, play with it.

      // Let's fix this a little bit. Document paths should be
      // consistent. Let's say that rich documents should always
      // end in .json, and raw documents in .txt. If you're
      // switching a document, don't add another extension -
      // extend the root with the current type and add a new
      // extension.

      var backend = this;
      this.ping(this._cgiURL, {
        success: function (transport) {
          // We can't do any better than submitting the form.
          // Call the success callback in that case.
          appDoc.log({"file_type": outType, action: "save_file", "save_type": parameters.operation || "save"});
          parameters.input = JSON.stringify(appDoc._taskConfig.serialize(appDoc.currentDocument));
          parameters.filename = MAT.FileFormats.newFilename(inType, outType, fileName, uiParameters.rootSuffix || null);
          parameters.out_type = outType;
          parameters.task = taskName;
          backend._saveDocument(parameters);
          if (successCb) {
            successCb();
          }
        },
        failure: function (transport) {
          backend._context.ui.notifyError("<h2>Error saving document</h2><p>Communications failure");
          appDoc.log({action: "save_file_failure",
                      "save_type": parameters.operation || "save",
                      reason: "implementation"});
        }
      });
    }
  },

  // Saving a reconciliation document is a little complicated, because we need
  // to ask the backend to update the document (e.g., compute the new segment
  // statuses, eliminate duplicate votes), and then redisplay it, and THEN save it.

  updateReconciliationDocument: function(appDoc, successCb) {
    
    if (appDoc.currentDocument != null) {

      // Just to be sure.

      var backend = this;
      this._context.ui.notifyNoDocumentPresent(appDoc.docLabel);
      
      this.backendRequest({
        parameters: {
          task: appDoc._data.task,
          operation: "update_reconciliation_document",
          input: JSON.stringify(appDoc.currentDocument.toJSON())
        },
        success: function (resultHash) {
          try {
            appDoc.currentDocument.doc = new MAT.Annotation.AnnotatedDoc().fromJSON(resultHash.doc, appDoc.getAnnotationTypeRepository());
          } catch (e) {
            var errTxt = MAT.Annotation.errorToString(e);
            appDoc.log({action: "update_reconciliation_doc_failure",
                        reason: "application",
                        error_text: errTxt});
            backend._context.ui.error(appDoc.docLabel, errTxt);
            return;
          }

          appDoc.log({action: "update_reconciliation_doc"});
          // Now, I've got a document back. I should update the panel,
          // and then save the document I got back.
          backend._context.documentPresent(appDoc);
          // For some bizarre reason, I'm calling configure() here - but
          // as far as I can tell, it can't ever be called, because the
          // document is ALWAYS marked readonly.
          // appDoc.configure();
          // Now, we try to save it.
          if (successCb) {
            successCb();
          }
        },
        failure: function (s) {
          appDoc.log({action: "update_reconciliation_doc_failure",
                      reason: "implementation",
                      error_text: s});
          this._context.ui.notifyError("<h2>Error saving document</h2><p>" + s);
        },
        jsonError: function (s) {
          appDoc.log({action: "update_reconciliation_doc_failure",
                      reason: "json_decode",
                      error_text: s});
          this._context.ui.notifyError(s);
        }
      });
    }
  },

  saveLog: function(logContents, successCb) {
    var backend = this;
    this.ping(this._cgiURL, {
      success: function (transport) {
        backend._saveDocument({log: JSON.stringify(logContents), operation: "save_log"});
        successCb();
      },
      failure: function (transport) {
        backend._context.ui.notifyError("<h2>Error saving log</h2><p>Communications failure");
        backend._context.log({action: "log_stop_failure",
                              reason: "implementation"}, null);
      }
    });
  },

  // Jeez. It turns out that uploading a file via AJAX isn't possible.
  // The standard gimmick appears to be to have a hidden IFRAME which
  // you load the document into. Grrr. The idea will be that we'll
  // create a temporary DIV with a pointer to that document, and 
  // set the onload to do SOMEthing. First pass will probably just
  // alert the text.

  // This was inspired by code from 
  // http://www.webtoolkit.info/ajax-file-upload.html

  // Actually, it's worse than I thought. I can upload the file without
  // AJAX if I don't want control over the result of the AJAX call
  // which uses the contents, but if I want the results, I have to 
  // create a separate form to do the upload, and then retrieve the
  // results.

  // Doing the encapsulation is hard here, because of this. So I need
  // to temporarily redirect the target of the UI form. So the argument
  // of reachStep must be the ID of the UI form.

  // For some reason, if I try to delete the hidden DIV,
  // Firefox keeps spinning. So we build one and reuse it.

  // Hell. If I want to check for rollback before I run the
  // steps, reachStep has to be a callback.

  stepBackward: function(appDoc, candidateRollbackStepObj) {

    if (!candidateRollbackStepObj) {
      return;
    }

    var candidateRollbackStep = candidateRollbackStepObj.initSettings.name;
    
    // First, we disable the input buttons, so we don't get this
    // function pressed again.

    this._context.ui.disableOperationControls(appDoc.docLabel);
    
    // rollBack now recurses, rather than loops. The 
    // method should call rollBack() on the next step
    // forward, and THEN undo itself. 

    // Once the rollback reaches the end of its chain,
    // we check to see whether any of the steps are dirty.

    // Actually, the problem is that at some point, we 
    // may encounter a dirty step, and at that point
    // we need to ask whether we should rollback, and
    // if the answer is no, we need to abort, and if
    // it's yes, proceed. This is pretty hard to do
    // with asynchronous dialogs and callbacks if
    // you're recursing - basically, you need continuations,
    // which Javascript doesn't have. So back to the loop.
    // At the end of the loop, we reverse the collected
    // steps and undo them in order.
    
    // Argument list is actually stepName, refreshFlag, stepsDirty.
    // Default of refreshFlag is true; default for stepsDirty is false.

    // I get in a list of steps to undo. It may be incomplete,
    // because it may skip over some steps that have to
    // be undone if you're going to undo that step as well.
    // So how to do this? Pick the first rollback step, and
    // roll forward from there.

    // Note, by the way, that the step successors do NOT include the original
    // candidate step. So if you're going to roll back, you MUST include
    // that step.

    var rollbackSteps = appDoc.getStepSuccessors(candidateRollbackStep);
    var stepsDirty = false;

    if (appDoc.currentDocument) {
      for (var i = 0; i < rollbackSteps.length; i++) {
        var stepName = rollbackSteps[i];
        if (appDoc.currentDocument.stepIsDirty(stepName)) {
          // Check all the steps, because it'll be easier at the
          // end to set up the callback if the test is at the end.
          stepsDirty = true;
        }
      }
      // And, finally, for the candidate step.
      if (appDoc.currentDocument.stepIsDirty(candidateRollbackStep)) {
        stepsDirty = true;
      }
    }

    var be = this;

    // The arrays have values text, handler, isDefault. Map directly to the
    // buttons: value of YUI SimpleDialog.

    if (stepsDirty) {
      appDoc._context.ui.ask(appDoc.docLabel,
                             "Undoing these steps will erase unsaved changes. Continue?",
                             [{ text:"Yes",
                                handler: function () {
                                  candidateRollbackStepObj.rollback(appDoc, be);
                                }
                              }, {
                                text: "No",
                                isDefault: true,
                                handler: function () {
                                  appDoc.log({action: "undo_step_aborted", reason: "dirty"});                                
                                  be._context.ui.enableOperationControls(appDoc.docLabel);
                                }
                              }]);
    } else {
      candidateRollbackStepObj.rollback(appDoc, this);
    }
  },

  _rollbackContinuation: function (appDoc, undoThrough) {

    // Now, I have to send the rollback request to the backend.
    // The document I send it MUST have the current phases in it.
    // What does the return look like? When I get it back, I have to
    // uiUndo everything that was undone. I also have to update the
    // currentDocument.

    var p = {
      undo_through: undoThrough,
      operation: "undo_through",
      input: JSON.stringify(appDoc.currentDocument.toJSON())
    };

    // We have to be careful here. "input" never gets sent,
    // via this loop, because either it's supposed to be a JSON string.
    
    for (var label in appDoc._data) {
      if (label != "input") {
        p[label] = appDoc._data[label];
      }
    }

    this.backendRequest({
      parameters: p,
      success: function (resultHash) {
        this._finishRollbackContinuation(appDoc, resultHash);
      },
      failure: function (s) {
        appDoc.log({action: "undo_step_failure",
                    reason: "implementation",
                    error_text: s});
        this._finishRollbackContinuation(appDoc, {
          doc: null, stepsUndone: [], errorStep: "[eval]", error: s,
          dontTell: true
        });
      },
      jsonError: function (s) {
        appDoc.log({action: "undo_step_failure",
                    reason: "json_decode",
                    error_text: s});
        this._finishRollbackContinuation(appDoc, {
          doc: null, stepsUndone: [],
          errorStep: "[parse]",
          error: s
        });
      }
    });
  },

  // Now that we're relying on general steps to undo documents, and
  // we're expecting the display to reflect the state of the document,
  // we really can't update the document AFTER we undo the UI.
  
  _finishRollbackContinuation: function(appDoc, resultHash) {

    var allStepsUndone = [];

    if (resultHash.stepsUndone.length > 0) {

      // First, we update the document. Note that all the step updates are
      // happening in the metadoc, not in the doc. We may get an decode error,
      // in which case we'll fail.

      // resultHash may have a key from the special MarkGold step being
      // undone, to indicate that there's no document update to deal with.

      if (!resultHash.skipDoc) {
        try {
          appDoc.currentDocument.doc = new MAT.Annotation.AnnotatedDoc().fromJSON(resultHash.doc, appDoc.getAnnotationTypeRepository());
        } catch (e) {
          var errTxt = MAT.Annotation.errorToString(e);
          // Oops. Didn't actually succeed in undoing anything.
          resultHash.stepsUndone = [];
          resultHash.error = {errorStep: "[deserialize]",
                              error: errTxt};
        }
      }
      
      for (var i = 0; i < resultHash.stepsUndone.length; i++) {
        // These will be in REVERSE ORDER.
        var isLast = (i == resultHash.stepsUndone.length - 1);
        var stepName = resultHash.stepsUndone[i];
        if (appDoc.currentDocument.stepIsDone(stepName)) {
          // Only refresh at the end. But first, we have to
          // update the hand annotation availability. But before THAT,
          // we have to make sure to undo the step in the document.
          appDoc.currentDocument.phaseUndone(stepName);
          // Do this for every step we have to undo.
          appDoc._context.ui.notifyStepNotDone(appDoc.docLabel, stepName);
          if (isLast) {
            var mostRecent = appDoc.currentDocument.mostRecentPhase(appDoc._uiAvailableSteps);
            if (mostRecent !== null) {
              mostRecent = appDoc._uiAvailableSteps[mostRecent];
            }
            appDoc.notifyHandAnnotationAvailability(mostRecent);
          }
          appDoc._taskConfig.undo(stepName, appDoc, isLast, true);
          appDoc.log({action: "undo_step", step: stepName});
          allStepsUndone.push(stepName);
        }
      }
      
      if (appDoc.currentDocument.isDirty()) {
        this._context.ui.notifyDocumentModified(appDoc);
      } else {
        this._context.ui.notifyDocumentUnmodified(appDoc);
      }
    }

    // If there's an error, notify.

    // I've set this up so that there are additional keys added locally:
    // dontTell (notify instead of tell) 

    if (resultHash.error != null) {
      appDoc.log({action: "undo_step_failure",
                  reason: "application",
                  step: resultHash.errorStep,
                  error_text: resultHash.error});
      var s = "";
      if (allStepsUndone.length > 0) {
        s += "Steps '" + allStepsUndone.join(", ") + "' were undone, but undoing step " + resultHash.errorStep + " failed. Reason:";
      } else if (resultHash.errorStep == "[init]") {
        // Before anything happened.
        s += "Undoing the step failed during initialization. Reason:";
      } else if (resultHash.errorStep == "[eval]") {
        s += "The application encountered an unexpected error. Reason:";
      } else if (resultHash.errorStep == "[parse]") {
        s += "The UI encountered an error while trying to digest the server response. Reason:";
      } else if (resultHash.errorStep == "[deserialize]") {
        s += "The UI encountered an error while trying to deserialize the document it received. Reason:";
      } else {
        s += "Undoing step " + resultHash.errorStep + " failed. Reason:";
      }
      s += "<p>" + resultHash.error;

      if (resultHash.dontTell) {
        this._context.ui.notifyError(s);
      } else {
        this._context.ui.error(appDoc.docLabel, s);
      }
    }
    
    // Re-enable step selection, and we're done.

    this._context.ui.enableOperationControls(appDoc.docLabel);
  },

  loadDocument: function(appDoc, params) {

    if (!params) {
      params = {};
    }
    
    var form = params.form;
    var p = {operation: "load"};
    
    // We have to be careful here. "input" never gets sent,
    // via this loop, because it's going to be form-uploaded.
    
    // And everything else in the form will also get sent.
    // If the element isn't disabled.
    
    for (var label in appDoc._data) {
      if (label == "input") {
        // Do nothing, ever.
      } else {
        if (form && form[label] && !form[label].disabled) {
          // Trust that the value is right. Updating it is
          // too complicated. It might not be right if you're
          // reloading, in which case I need to fix the UI.
          // Problem is that if the value is a boolean, we have
          // to make sure it gets across appropriately.
          if ((form[label].type == "checkbox") || (form[label].type == "radio")) {
            var val = appDoc._data[label];
            if (val === true) {
              form[label].value = "yes";
            } else if (val === false) {
              form[label].value = "no";
            }
          }
        } else {
          // Make sure that boolean values are handled appropriately.
          var val = appDoc._data[label];
          if (val === true) {
            val = "yes";
          } else if (val === false) {
            val = "no";
          }
          p[label] = val;
        }
      }
    }

    // OK. The problem is that when there's a form, and file upload
    // is involved, the mechanisms in YUI to report the result
    // via the hidden iframe don't work, because apparently Firefox
    // (and Safari) both defeat the "onload" action when reporting
    // a page load error. So if I'm going to do this, I'm going to
    // have to "ping", by sending a normal request first, which
    // may fail. If the server goes down in between the ping and the
    // next request, I ain't about to worry about it.

    this.backendRequest({
      form: form,
      parameters: p,
      uploadConversion: this._frameLoadDocumentContinuation,
      success: function (obj) {
        this._loadDocumentBackendSuccess(obj, appDoc, params, "load_file");
      },
      failure: function (s) {
        appDoc.log({action: "load_file_failure",
                    reason: "implementation",
                    error_text: s});
        this._context.ui.notifyError("<h2>Error during load</h2><p>" + s);
        if (params.failureCb) {
          params.failureCb();
        }
      },
      jsonError: function (s) {
        appDoc.log({action: "load_file_failure",
                    reason: "json_decode",
                    error_text: s});
        this._context.ui.notifyError(s);
        if (params.failureCb) {
          params.failureCb();
        }
      }
    });
  },

  reloadDocument: function(appDoc, form) {
    this._context.ui.disableOperationControls(appDoc.docLabel);
    var v = this;
    var aDoc = appDoc;
    // Clear the panel.
    // Remove the document.
    aDoc._context.ui.notifyNoDocumentPresent(aDoc.docLabel);
    // Undo all the UI stuff. This function NEVER redraws the document.
    aDoc.uiUndoAll();
    aDoc.currentDocument = null;
    
    this.loadDocument(appDoc, {
      form: form,
      panelCreationParams: {doButtons: true},
      successCb: function () {
        v._context.ui.enableOperationControls(aDoc.docLabel);
        // This is what happens when you reload.
        v._context.ui.notifyDocumentUnmodified(aDoc);
      },
      failureCb: function () {
        v._context.ui.enableOperationControls(aDoc.docLabel);        
      }
    });
  },

  // This is called from the demo UI, with a sequence of names. The idea is
  // that it's being done entirely in the backend. So I think oneStepForward
  // is my entry point for the fake step.

  stepsForward: function(appDoc, steps) {

    this._context.ui.disableOperationControls(appDoc.docLabel);

    this._context.ui.notifyStepsUnderway(appDoc.docLabel, steps);

    var p = {
      steps: steps.join(","),
      operation: "steps",
      input: JSON.stringify(appDoc.currentDocument.doc.toJSON())
    };

    // We have to be careful here. "input" never gets sent,
    // via this loop, because either it's supposed to be a JSON string.
    
    for (var label in appDoc._data) {
      if (label != "input") {
        p[label] = appDoc._data[label];
      }
    }

    // reachStep continuations.
  
    // Here's the output format. It's a hash of three elements: error (None if
    // there's no error), errorStep (None if there's no error), and
    // a list of success hashes, which have a val and steps.
    // See OutputObj in MATCGI_tpl.py. An error always terminates the processing,
    // so on the client, you process the successes and then the error.
    // The steps should be in order of execution, and so should the
    // successes. It's not EXACTLY enforced.
  
    // One of the steps may be the dummy step load.
  
    // We try to parse the result. If we succeed, we
    // make the failure pretty; if we fail, we generate
    // a failure.

    this.backendRequest({
      parameters: p,
      success: function (resultHash) {
        this._finishReachStepContinuation(appDoc, resultHash);
      },
      failure: function (s) {
        appDoc.log({action: "do_step_failure",
                    reason: "implementation",
                    error_text: s});
        this._finishReachStepContinuation(appDoc, {
          successes: [], errorStep: "[eval]", error: s,
          dontTell: true
        });
      },
      jsonError: function (s) {
        appDoc.log({action: "do_step_failure",
                    reason: "json_decode",
                    error_text: s});
        this._finishReachStepContinuation(appDoc, {
          successes: [],
          errorStep: "[parse]",
          error: s
        });
      }
    });
  },
  
/*
 *           INTERNAL PROPERTIES
 *
 */

  _loadDocumentBackendSuccess: function(obj, appDoc, params, logAction) {
    if (obj.success) {
      var doc;
      try {
        doc = new MAT.Annotation.AnnotatedDocWithMetadata().fromJSON(obj.doc, appDoc.getAnnotationTypeRepository());
      } catch (e) {
        var errTxt = MAT.Annotation.errorToString(e);
        appDoc.log({action: logAction + "_failure",
                    reason: "application",
                    error_text: errTxt});
        this._context.ui.error(appDoc.docLabel, errTxt);
        if (params.failureCb) {
          params.failureCb();
        }
        return;
      }

      appDoc.currentDocument = doc;
      appDoc.log({action: logAction});
      
      // So configure() calls updateFromWorkflow(), which will
      // redisplay the document. But if there's no workflow,
      // then it won't. So let's get configure to report
      // whether it updated the doc or not. No, let's do this
      // differently - let's have configure take care of
      // notifying the document is present.
      // But first, make sure there's a proper panel.
      var pParams = params.panelCreationParams;
      if (!pParams) {
        pParams = {};
      }
      if (doc.doc.metadata.comparison && !params.panelCreationParams.compEntries) {
        // must create compEntries -- we don't have actual docs though so those are not included.
        // docName might be in the pair entries, but might not.
        var _compEntries = [];
        var pairs = doc.doc.metadata.comparison.pairs;
        for (var i = 0; i < pairs.length; i++) {
          if (i == 0) {
            _compEntries.push({label: pairs[0].pivot, position: "behind",
                               initial: null, docname: pairs[0].pivotDocName || pairs[0].pivot});
          }
          _compEntries.push({label: pairs[i].other, position: "above",
                             initial: null, docname: pairs[i].otherDocName || pairs[i].other});
        }
        params.panelCreationParams.compEntries = _compEntries;
      }

      this._context.ui.ensureDocumentPanel(appDoc.docLabel, params.panelCreationParams);
      appDoc.configure();
      
      if (params.successCb) {
        params.successCb(appDoc.docLabel);
      }

    } else {
      appDoc.log({action: logAction + "_failure",
                  reason: "application",
                  error_text: obj.error});
      this._context.ui.error(appDoc.docLabel, obj.error);
      if (params.failureCb) {
        params.failureCb();
      }
    }
  },

  // We need to do this because these saves are intended to
  // activate the browser's download functionality, and the only
  // way we ever get an error is if it gets written to the hidden save target
  // when the download functionality isn't triggered because of the error.
  // So we can't KNOW we're going to get an error within 10 seconds
  // (which is how long I check for), but there's not much else
  // I can do under the circumstances.
  
  _initializeHiddenSave: function() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
    }
    // Set the transaction ID. We'll discard errors
    // we find that aren't this one.
    this._saveTransaction = this._randomID("savetransaction");
    if (this._hiddenSaveTarget == null) {
      var id = this._randomID('hiddensavetarget');
      var iframe = document.createElement("iframe");
      iframe.id = id;
      iframe.name = id;
      iframe.setAttribute("style", "display: none");
      document.body.appendChild(iframe);
      this._hiddenSaveTarget = iframe;
    } else {
      // Clear it.
      this._hiddenSaveTarget.innerHTML = "";
    }
  },

  _initializeHiddenSaveErrorChecking: function () {
    var b = this;
    this._saveTimeout = setTimeout(function () { b._checkSaveError(0); }, 1000);
  },

  _checkSaveError: function(howManySeconds) {
    var w = this._hiddenSaveTarget.contentWindow;
    if (w && w.document && w.document.body && (w.document.body.innerHTML.length > 0)) {
      var msg = w.document.body.innerHTML;
      w.document.body.innerHTML = "";
      // And now, to interpret the message.
      try {
        var obj = JSON.parse(msg);
        if ((obj.save_transaction == this._saveTransaction) && !obj.success) {
          this._context.ui.error(null, obj.error);
        }
      }
      catch (ex) {
        // It's a parsing error - assume it's HTML.
        this._context.ui.notifyError(msg);
      }
    } else if (howManySeconds < 10) {
      var b = this;
      this._saveTimeout = setTimeout(function () { b._checkSaveError(howManySeconds + 1); }, 1000);
    }
  },
  
  _randomID: function(prefix) {
    return prefix + Math.floor(Math.random() * 99999);
  },

  // Update the status. Disable the submit button, update the
  // status line.

  // In YUI, the responseText is a string. Because I'm using their file
  // upload, I don't need to do any of the bizarre juggling I was doing before.
  // The response will be HTML, no matter what.
  
  _frameLoadDocumentContinuation: function (responseText) {

    var obj = document.createElement("div");
    obj.innerHTML = responseText;
    
    // The NodeFilter and NodeIterator, available in 
    // DOM level 2, aren't implemented in Firefox. So
    // we have to do a walk.

    // We really do want to do some parsing here.
    // Either it's a successful evaluation, or
    // it's a failure. A successful evaluation
    // has text/plain as the content type, and a single
    // PRE child in the body (at least, I think so).
    // Otherwise, we should just take the inner HTML
    // and use it as an error message. So we'd have to
    // build one.

    var s;
    var successFlag;

    if ((obj.firstChild.nodeType == Node.ELEMENT_NODE) &&
        (obj.firstChild.tagName == "PRE")) {

      // Actually, since I don't want the HTML encodings,
      // which is what I'd get if I just took innerHTML of the PRE,
      // I have to gather the text.

            
      var sArray = [];

      function collectTextNodes (node) {
        if (node.nodeType == Node.ELEMENT_NODE) {
          var children = node.childNodes;        
          for (var i = 0; i < children.length; i++) {
            collectTextNodes(children[i]);
          }
        } else if (node.nodeType == Node.TEXT_NODE) {
          sArray.push(node.nodeValue);
        }
      }

      collectTextNodes(obj.firstChild);

      s = sArray.join("");
      successFlag = true;      
  
    } else {
      // We're in an HTML document, which means that something has gone
      // horribly wrong. We'll just take the inner HTML as a formatted
      // failure.
      successFlag = false;
      s = responseText;
    }

    return {
      successFlag: successFlag,
      responseText: s,
      contentType: null
    };
  },

  _finishReachStepContinuation: function(appDoc, resultHash) {

    // Update the result.

    appDoc.updateResult(resultHash);

    // Re-enable the buttons.

    this._context.ui.notifyNothingUnderway(appDoc.docLabel);
    
    this._context.ui.enableOperationControls(appDoc.docLabel);
    
  }

});

/*
 *                    MAT.TaskConfig
 *
 *
 * This is a table which contains entries for various task configurations.
 * Tasks will be able to specify which configurations, if any, to invoke.
 * Each task should have a config() and an unconfig() method, for when
 * the task is selected and unselected.
 *
 */

MAT.TaskConfig = {
}


/*
 *                    MAT.CoreTask
 *
 *
 * This object includes the state machine for the steps, and some 
 * utilities for building new tasks. It's the only thing
 * that should know anything about any action besides "load", which is
 * special. The steps load, zone and tag are general; others might come
 * in the applications of the tool.
 *
 * This is the sort of thing that would be a value in the MAT.TaskConfig
 * table. The required keys are configure, steps and serialize.
 *
 */

MAT.CoreTask = function () {
}

MAT.Extend(MAT.CoreTask, {

  workflowConfigure: function (appDoc) {
  },

  workspaceConfigure: function (workspace) {
  },

  workspaceDocumentConfigure: function (wsDoc) {
  },

  serialize: function(metadoc) {
    return metadoc.toJSON();
  },

  // These next two functions are used by a number of intermediate steps.

  _digestDoc: function(appDoc, jsonStruct) {
    appDoc.currentDocument.doc = new MAT.Annotation.AnnotatedDoc().fromJSON(jsonStruct, appDoc.getAnnotationTypeRepository());
  },

  updateHash: function(oldHash, newHash) {

    function copyHash (hash) {
      // First copy.
      var o = {};
      for (var key in hash) {
        var entry = hash[key];
        if ((entry instanceof Object) && !(entry instanceof Function)) {
          o[key] = copyHash(entry);
        } else {
          o[key] = entry;
        }
      }
      return o;
    }

    var copiedHash = copyHash(oldHash);

    function overwriteHash(oldH, newH) {
      for (var key in newH) {
        var entry = oldH[key];
        var newEntry = newH[key];
        if (entry === undefined) {
          if ((newEntry instanceof Object) && !(entry instanceof Function)) {
            oldH[key] = copyHash(newEntry);
          } else {
            oldH[key] = newEntry;
          }
        } else if ((entry instanceof Object) && !(entry instanceof Function)) {
          overwriteHash(entry, newEntry);
        } else {
          oldH[key] = newEntry;
        }
      }
    }

    overwriteHash(copiedHash, newHash);

    return copiedHash;
  },


  copySteps: function(newSteps) {
    this.steps = this.updateHash(this.steps, newSteps);
  },

  // And now, the steps themselves.
  // The default step shows the document at the end of
  // the undo chain, digests the document moving forward, and displays
  // the document for uiDo.

  // Public methods which set "this" to the task.

  undo: function(stepName, appDoc, refreshFlag, fromRollback) {
    var step = this.steps[stepName] || this._defaultStep;
    return step.undo.call(this, appDoc, refreshFlag, fromRollback);
  },

  docDo: function(stepName, appDoc, o) {
    var step = this.steps[stepName] || this._defaultStep;
    return step.docDo.call(this, appDoc, o);
  },

  uiDo: function(stepName, appDoc, refreshFlag) {
    var step = this.steps[stepName] || this._defaultStep;
    return step.uiDo.call(this, appDoc, refreshFlag);
  },

  _defaultStep: {
    
    undo: function(appDoc, refreshFlag, fromRollback) {
      // To get back to the point immediately before this,
      // we clear all the nodes, and redisplay the raw doc.
      // If this is the last step to undo, reestablish the
      // input state.
      if (refreshFlag && appDoc.currentDocument) {
        appDoc._context.documentPresent(appDoc);
      }
    },
      
    // Can't just set digest to _digestDoc, because the
    // scope isn't defined yet.
      
    docDo: function(appDoc, o) {
      this._digestDoc(appDoc, o);        
    },

    uiDo: function(appDoc, refreshFlag) {
      if (refreshFlag) {
        appDoc._context.documentPresent(appDoc);
      }
    }
  },

  // All the core steps are default steps.
  steps: {
    "mark gold": {
      uiDo: function(appDoc, refreshFlag) {
        if (refreshFlag) {
          appDoc._context.documentPresent(appDoc);
        }
      },
      docDo: function(appDoc, o) {
      },
      undo: function(appDoc, refreshFlag, fromRollback) {
        if (refreshFlag && appDoc.currentDocument) {
          appDoc._context.documentPresent(appDoc);
        }
      }
    }
  },

  cleanStepEnhancement: {
    
    /* This is a lot like load, a lot like zone. */

    clean: {

      // to undo it, you'd have to load the document all over again,
      // unless I store away the original. Which is what I'm going to
      // do. This has to work cleanly in uiUndo and uiDo, for when
      // we switch workflows.

      // If this is from the rollback, then we delete the cached signals.

      undo: function(appDoc, refreshFlag, fromRollback) {
        if (appDoc.origSignal) {
          appDoc.currentDocument.doc.signal = appDoc.origSignal;
          // We're going to roll forward again.
          if (fromRollback) {
            delete appDoc.modifiedSignal;
            delete appDoc.origSignal;
          }
          // If this is the last rollback step, then refresh.
          if (refreshFlag) {
            appDoc._context.documentPresent(appDoc);
          }
        }
      },

      docDo: function(appDoc, o) {
        // Capture the original signal and the modified signal.
        appDoc.origSignal = appDoc.currentDocument.doc.signal;
        this._digestDoc(appDoc, o);
        appDoc.modifiedSignal = appDoc.currentDocument.doc.signal;
      },    

      uiDo: function(appDoc, refreshFlag) {
        var aset = appDoc.currentDocument.doc;
        // Make sure the modified signal is the signal. Always do this.
        aset.signal = appDoc.modifiedSignal;
        if (refreshFlag) {
          appDoc._context.documentPresent(appDoc);
        }
      }
    }
  },

  _digestWorkspaceDoc: function (ws, o, folderName, fileName, wsDoc) {
    // In each case, we create a doc if there isn't one.
    if (!wsDoc) {
      var docLabel = ws._context.newWorkspaceDocument(ws, folderName, fileName, o);
      wsDoc = ws._context.getDocument(docLabel);
    } else {
      // Can't use _digestDoc() here, because the steps are processed
      // AND SAVED in the backend. So I need to strip them and set them
      // aside, as if I'm reading this document for the first time.
      wsDoc.currentDocument = new MAT.Annotation.AnnotatedDocWithMetadata().fromJSON(o, wsDoc.getAnnotationTypeRepository());
    }
    return wsDoc;
  },

  // Public methods which set "this" to the task.
  
  workspaceDocDo: function(ws, o, folderName, fileName, wsDoc) {
    return this.workspaceFolders[folderName].docDo.call(this, ws, o, folderName, fileName, wsDoc);
  },

  workspaceUIDo: function(wsDoc) {
    return this.workspaceFolders[wsDoc._currentFolder].uiDo.call(this, wsDoc);
  },

  workspaceFolders: {
    "core": {
      setExtraDataFields: function(responseObj) {
        var d = {"Status": responseObj.status};
        if (responseObj.assigned_to) {
          d["Assigned to"] = responseObj.assigned_to;
        }
        return d;
      },
      docDo: function (ws, o, folderName, fileName, wsDoc) {
        wsDoc = this._digestWorkspaceDoc(ws, o, folderName, fileName, wsDoc);
        return wsDoc;
      },
      uiDo: function (wsDoc) {
        // Hand annotation is available if the document is (a) at least partially non-gold,
        // and (b) not read only.
        var handAnnotationBlocked = wsDoc.isReadOnly() || (wsDoc.getExtraDataField("Status") == "gold") || (wsDoc.getExtraDataField("Status") == "reconciled");
        wsDoc._context.ui.notifyHandAnnotationAvailability(wsDoc.docLabel, !handAnnotationBlocked);
        // Notify about hand annotation availability, THEN notify the document as present.
        wsDoc._context.documentPresent(wsDoc);
      },
      operations: {
        "Mark gold": {          
          name: "markgold",
          // The document can't be gold.          
          condition: function (wsDoc) {
            var s = wsDoc.getExtraDataField("Status");
            return (s != "reconciled") && (s != "gold");
          },
          // Need the lock ID and the user.
          getParameters: function(wsDoc) {
            return {lock_id: wsDoc.getLockId(), user: wsDoc.getWorkspace().getData().userid};
          }
        },
        "Unmark gold": {          
          name: "unmarkgold",
          // The document must be at least partially gold.
          condition: function (wsDoc) {
            var s = wsDoc.getExtraDataField("Status");
            return (s == "reconciled") || (s == "gold");
          },
          // Need the lock id and the user.
          getParameters: function(wsDoc) {
            return {lock_id: wsDoc.getLockId(), user: wsDoc.getWorkspace().getData().userid};
          }
        },
        "Save": {
          name: "save",
          defaultOperation: true,
          // Obviously...
          blockInitialSave: true,
          getParameters: function(wsDoc) {
            var d = {lock_id: wsDoc.getLockId()};
            if (wsDoc.currentDocument.isDirty()) {
              d.doc = JSON.stringify(wsDoc.getWorkspace()._taskConfig.serialize(wsDoc.currentDocument));
              var w = wsDoc.getWorkspace();
              if (w._loggingEnabled) {
                // Save and clear the log.
                var logData = w._retrieveIntermediateLog();
                d.timestamp = logData.ms;
                d.log_format = "json";
                d.log = JSON.stringify(logData.entries);
              }
            }
            return d;
          },
          onSuccess: function(wsDoc) {
            wsDoc.markNotDirty();
            
          }
        },
        "Autotag": {
          name: "autotag",
          getParameters: function(wsDoc) {
            return {lock_id: wsDoc.getLockId()};
          }
        }
      }
    },
    "export": {
      docDo: function (ws, o, folderName, fileName, wsDoc) {
        wsDoc = this._digestWorkspaceDoc(ws, o, folderName, fileName, wsDoc);
        return wsDoc;
      },
      uiDo: function (wsDoc) {
        wsDoc._context.documentPresent(wsDoc);
      },
      operations: { }
    }
  },

  copyWorkspaceFolders: function(newFolders) {
    this.workspaceFolders = this.updateHash(this.workspaceFolders, newFolders);
  }
});


/*
 *                    MAT.Annotation
 *
 *
 * There are four classes here. MAT.Annotation.AnnotatedDoc, 
 * MAT.Annotation.AnnotatedDocWithMetadata, MAT.Annotation.AnnotationType, and 
 * MAT.Annotation.Annotation. Their functions are the obvious ones.
 * Oops, also added the various attribute types, for 2.0.
 *
 */


// Annotation sets.

MAT.Annotation = {ACount: 0};

MAT.Annotation.DocumentError = function(msg) {
  this.msg = msg;
};

MAT.Annotation.errorToString = function(e) {
  if (e.constructor === MAT.Annotation.DocumentError) {
    return e.msg;
  } else {
    return "" + e;
  }
};

// And now, the attribute types. We'll have to deal with these slightly differently
// than we do in Python, but the spirit will be the same. First, we borrow
// the attribute value set from mat_doc_display, and abstract it a bit.

MAT.Annotation.AttributeValueSequence = function(s) {
  this.ofDoc = null;
  this.ofAttribute = null;
  this._clearValue = null;
  if (arguments.length > 0) {
    this.elements = s.slice(0);
  } else {
    this.elements = [];
  }
};

MAT.Extend(MAT.Annotation.AttributeValueSequence, {
  // I'm not going to worry about copying the attribute values,
  // since in the rare cases where I copy a document, I do the dodge of
  // encoding and decoding it again. Not efficient, but saves a ton of code...
  
  _setAttribute: function(doc, attr) {
    // Now, we have to make sure that we check
    // the values, and do the right thing
    this.ofDoc = doc; 
    this.ofAttribute = attr;
    for (var i = 0; i < this.elements.length; i++) {
      var val = this.elements[i];
      if (!attr._checkAndImportSingleValue(doc, val)) {
        throw new MAT.Annotation.DocumentError("value of element of attribute '" + attr.name + "' must be a " + attr._typename);
      }
    }
  },
  
  _checkAttribute: function(doc, attr) {
    // Now, we have to make sure that we check
    // the values, and do the right thing 
    for (var i = 0; i < this.elements.length; i++) {
      var val = this.elements[i];
      if (!attr._checkSingleValue(doc, val)) {
        throw new MAT.Annotation.DocumentError("value of element of attribute '" + attr.name + "' must be a " + attr._typename);
      }
    }
  },

  _checkVal: function(v /*, clear = false */) {
    if (this.ofAttribute && this.ofDoc) {
      var attr = this.ofAttribute;
      var doc = this.ofDoc;
      if ((arguments.length > 0) && arguments.length[1] && (attr._clearValue != null)) {
        attr._clearValue(doc);
      }
      if (!attr._checkAndImportSingleValue(doc, v)) {
        throw new MAT.Annotation.DocumentError("value of element of attribute '" + attr.name + "' must be a " + attr._typename);
      }
    }
  },
            
  _checkSeq: function(vl /*, clear = false */) {
    if (this.ofAttribute && this.ofDoc) {
      var attr = this.ofAttribute;
      var doc = this.ofDoc;
      if ((arguments.length > 0) && arguments.length[1] && (attr._clearValue != null)) {
        attr._clearValue(doc);
      }
      for (var i = 0; i < vl.length; i++) {
        var v = vl[i];
        if (!attr._checkAndImportSingleValue(doc, v)) {
          throw new MAT.Annotation.DocumentError("value of element of attribute '" + attr.name + "' must be a " + attr._typename);
        }
      }
    }
  },

  _clearAttr: function () {
    if (this.ofAttribute && this.ofDoc && this.ofAttribute._clearValue) {
      this.ofAttribute._clearValue(this.ofDoc);
    }
  },

  // A public method.
  
  size: function() {
    return this.elements.length;
  },

  // Copying for a new annotation.
  copy: function() {
    return new this.constructor(this.elements);    
  }

});

// Lists.

MAT.Annotation.AttributeValueList = function(s) {
  MAT.Annotation.AttributeValueSequence.apply(this, arguments);
};

MAT.Extend(MAT.Annotation.AttributeValueList, MAT.Annotation.AttributeValueSequence, {

  set: function(i, v) {
    this._checkVal(v, true);
    this.elements[i] = v;
  },

  get: function(i) {
    return this.elements[i];
  },

  push: function(elt) {
    this._checkVal(elt, true);
    this.elements.push(elt);
  },

  pop: function() {
    this._clearAttr();
    return this.elements.pop();
  },

  indexOf: function(elt) {
    return this.elements.indexOf(elt);    
  },

  contains: function(elt) {
    return this.elements.indexOf(elt) > -1;
  },

  splice: function(i) {
    if ((arguments.length > 2) || ((arguments.length > 1) && (arguments[1] > 0))) {
      // We're adding values, or popping values.
      this._clearAttr();
    }
    if (arguments.length > 2) {
      this._checkSeq(arguments.slice(2));
    }
    this.elements.splice.apply(this.elements, arguments);
  }
  
});

// Sets.

MAT.Annotation.AttributeValueSet = function(s) {
  MAT.Annotation.AttributeValueSequence.apply(this, arguments);
  this.keySet = {};
  this._needsList = false;
  if (this.elements.length > 0) {
    this._needsList = this._typeNonHashable(this.elements[0]);
    if (!this._needsList) {
      for (var i = 0; i < this.elements.length; i++) {
        var elt = this.elements[i];
        if (elt.constructor === MAT.Annotation.Annotation) {
          this.keySet[elt.id] = i;
        } else {
          this.keySet[this.elements[i]] = i;
        }
      }
    }
  }  
}

// Hm. The problem is that I'm using a hash to keep track of
// uniqueness, and only strings can be hashed in Javascript. Everything
// else won't work. If it's an annotation, I can use the private ID,
// but booleans and numbers have to do the full check. And the first element
// in the list determines the status, if there's no attribute - we don't
// tolerate mixed situations, so if there's no attribute, it would get
// flagged when an attribute was set anyway.

MAT.Extend(MAT.Annotation.AttributeValueSet, MAT.Annotation.AttributeValueSequence, {

  _setAttribute: function(doc, attr) {
    MAT.Annotation.AttributeValueSequence.prototype._setAttribute.call(this, doc, attr);
    // So the problem here is that if we haven't called add() on this element,
    // or passed in any data, _needsList will not be set.
    // The final say on this is the type itself. So we update it, now that we have the
    // attribute.
    this._needsList = this.ofAttribute._nonHashable;
  },

  _typeNonHashable: function(elt) {
    if ((typeof elt == "number") || (elt.constructor === Number)) {
      return true;
    } else if ((typeof elt == "boolean") || (elt.constructor === Boolean)) {
      return true;
    } else {
      return false;
    }
  },

  add: function(elt) {
    if (elt == null) {
      throw new MAT.Annotation.DocumentError("can't add null to a set");
    }
    this._checkVal(elt);
    if (!this.contains(elt)) {
      this._clearAttr();
      this.elements.push(elt);
      if (this.elements.length == 1) {
        // We must set _needsList, if there's no attribute.
        if (!this.ofAttribute) {
          this._needsList = this._typeNonHashable(elt);
        }
      }
      if (!this._needsList) {
        if (elt.constructor === MAT.Annotation.Annotation) {
          this.keySet[elt.id] = this.elements.length - 1;
        } else {
          this.keySet[elt] = this.elements.length - 1;
        }
      }
    }
  },

  addMany: function(elts) {
    for (var i = 0; i < elts.length; i++) {
      this.add(elts[i]);
    }
  },

  // To see if an element is already here, you need to do
  // some complicated stuff. First, it can't be null. Next,
  // if there's an attribute, we can ask the attribute if we need to
  // check the list or the keyset. Otherwise, we need to know if it's
  // a number or a boolean, in which case we need the list. If it's
  // an annotation, we use the annotation ID.

  _contains: function(elt) {      
    if (elt == null) {
      return false;
    } else if (this.elements.length == 0) {
      return false;
    } else {
      // There's at least one element in the list, which
      // means that needsList can be trusted.
      if (this._needsList) {
        for (var i = 0; i < this.elements.length; i++) {
          if (this.elements[i] === elt) {
            return i;
          }
        }
        return false;
      } else if (elt.constructor === MAT.Annotation.Annotation) {
        return this.keySet[elt.id];
      } else {
        return this.keySet[elt];
      }
    }
  },

  contains: function(elt) {
    var i = this._contains(elt);
    return (typeof i == "number");
  },

  remove: function(elt) {
    var i = this._contains(elt);
    if (typeof i == "number") {
      this._clearAttr();
      // It's there.
      this.elements.splice(i, 1);
      if (elt.constructor === MAT.Annotation.Annotation) {
        delete this.keySet[elt.id];
      } else {
        delete this.keySet[elt];
      }
      if (!this._needsList) {
        // Now, update all the indices.
        for (j = i; j < this.elements.length; j++) {
          var elt = this.elements[j];
          if (elt.constructor === MAT.Annotation.Annotation) {
            this.keySet[elt.id] = j;
          } else {
            this.keySet[elt] = j;
          }
        }
      }
    }
  },

  removeMany: function(elts) {
    var removed = false;
    for (var i = 0; i < elts.length; i++) {
      var j = this._contains(elts[i]);
      if (typeof j == "number") {
        removed = true;
        this.elements.splice(j, 1);
        if (elts[i].constructor === MAT.Annotation.Annotation) {
          delete this.keySet[elts[i].id];
        } else {
          delete this.keySet[elts[i]];
        }
      }
    }
    if (removed) {
      this._clearAttr();
    }
    if (removed && (!this._needsList)) {
      // Refresh the key set from the elts.
      var i = 0;
      for (var i = 0; i < this.elements.length; i++) {
        var elt = this.elements[i];
        if (elt.constructor === MAT.Annotation.Annotation) {
          this.keySet[elt.id] = i;
        } else {
          this.keySet[elt] = i;
        }
      }
    }
  },

  union: function(elts) {
    if (elts.constructor == MAT.Annotation.AttributeValueSet) {
      elts = elts.elements;
    }
    // Start with yourself, and then add.
    var newSet = new MAT.Annotation.AttributeValueSet();
    newSet.addMany(this.elements);
    newSet.addMany(elts);
    return newSet;
  },

  intersection: function(elts) {
    if (elts.constructor == MAT.Annotation.AttributeValueSet) {
      elts = elts.elements;
    }
    var newSet = new MAT.Annotation.AttributeValueSet();
    // If it's in this set, add it to the new set.    
    for (var i = 0; i < elts.length; i++) {
      if (this.contains(elts[i])) {
        newSet.add(elts[i]);
      }
    }
    return newSet;
  },

  foreach: function(f) {
    for (var i = 0; i < this.elements.length; i++) {
      f(this.elements[i]);
    }
  }
});

// And now, the actual attribute types. Much to my dismay, I'm going to have to
// implement all the restrictions, because I need to support them when we ultimately
// try to set values in the UI.

MAT.Annotation.AttributeType = function(atype, name /*, {optional: false, aggregation: null, 
                                                         display: null, category: null, set_name: null,
                                                         default: null, default_is_text_span: false} */) {
  this._clearValue = null;
  this.optional = false;
  this.aggregation = null;
  this.category = null;
  this.set_name = null;
  this.name = null;
  this.annotationType = null;
  this.display = null;
  // This will be updated, so I can check this rather than
  // making sure the default isn't undefined or null.
  this.hasDefault = false;
  this.dflt = null;
  this.defaultIsTextSpan = false;
  this._nonHashable = false;
  // See _choiceAttributeOK below.
  this._choiceAttribute = false;
  if (arguments.length > 0) {
    this.annotationType = atype;
    this.name = name;
    if (arguments.length > 2) {
      this.optional = arguments[2].optional;
      this.aggregation = arguments[2].aggregation;
      this.category = arguments[2].category || atype.category;
      this.set_name = arguments[2].set_name || atype.set_name;
      this.display = arguments[2].display || null;
      this.dflt = (arguments[2]["default"] !== undefined) ? arguments[2]["default"] : null;
      this.defaultIsTextSpan = arguments[2].default_is_text_span || false;
    }
    if (this.aggregation != null) {
      if ((this.aggregation != "list") && (this.aggregation != "set") && (this.aggregation != "none")) {
        throw new MAT.Annotation.DocumentError("unknown attribute aggregation type '" + this.aggregation + "'");
      }
      if (this.aggregation == "none") {
        this.aggregation = null;
      }
    }
  }  
};

MAT.Extend(MAT.Annotation.AttributeType, {

  copy: function(newAtype) {
    var inits = {
      category: this.category,
      set_name: this.set_name,
      optional: this.optional,
      aggregation: this.aggregation,
      display: this.display,
      default_is_text_span: this.defaultIsTextSpan,
      hasDefault: this.hasDefault
    };
    inits["default"] = this.dflt;
    var t = new this.constructor(newAtype, this.name, inits);
    t._copyDetails(this);
    t._computeMethods();
    return t;
  },

  _copyDetails: function(origAtype) {
  },  

  _computeMethods: function() {
    if (this.aggregation == null) {
      this._checkValue = this._checkSingleValue;
      this._importValue = this._importSingleValue;
      this._checkAndImportValue = this._checkAndImportSingleValue;
      // _toStringSingleValue has to be set.
      this.convertToStringNonNull = this._toStringSingleValue;
    } else if (this.aggregation == "list") {
      this._checkValue = this._checkListValue;
      this._importValue = this._importSequenceValue;
      this._checkAndImportValue = this._checkAndImportListValue;
      this.convertToStringNonNull = this._toStringSequenceValue;
    } else if (this.aggregation == "set") {
      this._checkValue = this._checkSetValue;
      this._importValue = this._importSequenceValue;
      this._checkAndImportValue = this._checkAndImportSetValue;
      this.convertToStringNonNull = this._toStringSequenceValue;
    }
  },

  _manageDefaults: function() {
    var dflt = this.dflt;
    var default_is_text_span = this.defaultIsTextSpan;
    if ((dflt !== null) || default_is_text_span) {
      if ((dflt !== null) && default_is_text_span) {
        throw new MAT.Annotation.DocumentError("can't declare both default and default_is_text_span for attribute '" + this.name + "'");
      }
      if (this.aggregation) {
        throw new MAT.Annotation.DocumentError("can't declare default for aggregated " + this._typename + " attribute '" + this.name + "'");
      }
      if (dflt !== null) {
        // We won't need the doc in checkSingleValue here, which is good,
        // because we don't have it.
        if (!this._checkSingleValue(null, dflt)) {
          throw new MAT.Annotation.DocumentError("default for attribute '" + this.name + "' does not meet attribute requirements");
        }
        this._getAttributeDefault = function (a) { return dflt; };
      } else {
        if (!this.annotationType.hasSpan) {
          throw new MAT.Annotation.DocumentError("can't use text span as default for attribute '" + this.name + "' of spanless annotation type '" + this.annotationType.label + "'");
        }
        this._getAttributeDefault = this._extractAndCoerceTextExtent;
      }
      this.hasDefault = true;
    }
  },

  // John A. points out that this should be SLOPPY; if the digestion fails, there should
  // be no default. Don't bother checking for null or whether the value is legal.
  // Actually, I DO need to check if the value is legal; if it isn't, I need to make it null.
  _extractAndCoerceTextExtent: function(annot) {
    var s = this._digestSingleValueFromString(annot.doc.signal.substring(annot.start, annot.end));
    if ((s !== null) && (!this._checkSingleValue(annot.doc, s))) {
      s = null;
    }
    return s;
  },

  _digestSingleValueFromString: function(v) {
    return v;
  },

  convertToString: function(v /* , params */) {
    if (v == null) {
      return "(null)";
    } else if (arguments.length > 1) {
      return this.convertToStringNonNull(v, arguments[1]);
    } else {
      return this.convertToStringNonNull(v);
    }
  },

  // Not going to worry about escaping the commas - this isn't
  // supposed to be robust.

  _toStringSequenceValue: function(v /*, params */) {
    var params = {};
    var elideNoninitialValues = false;
    var suppressBrackets = false;
    if (arguments.length > 1) {
      params = arguments[1];
      if (params.elideNonInitialSequenceValues) {
        elideNoninitialValues = true;
      }
      if (params.suppressSequenceBrackets) {
        suppressBrackets = true;
      }
    }
    var sVals = [];
    for (var i = 0; i < v.elements.length; i++) {
      if ((i > 0) && elideNoninitialValues) {
        sVals.push("...");
        break;
      }        
      sVals.push(this._toStringSingleValue(v.elements[i], params));
    }
    var s = sVals.join(", ");
    if (!suppressBrackets) {
      if (v.constructor === MAT.Annotation.AttributeValueSet) {
        s = "{ "+s+" }";
      } else {
        s = "[ "+s+" ]";
      }
    }
    return s;
  },

  _checkSingleValue: function(doc, v) {
    throw new MAT.Annotation.DocumentError("undefined");
  },

  // Guaranteed not to be null.
  
  _checkValue: function(doc, v) {
    throw new MAT.Annotation.DocumentError("undefined");
  },

  _checkListValue: function(doc, v) {
    if (v.constructor !== MAT.Annotation.AttributeValueList) {
      throw new MAT.Annotation.DocumentError("value of attribute '" + this.name + "' must be an AttributeValueList of " + this._typename);
    }
    if (v.ofAttribute && ((v.ofAttribute != this) || (v.ofDoc != doc))) {
      throw new MAT.Annotation.DocumentError("can't reuse list value attributes");
    }
    v._checkAttribute(doc, this);
    return true;
  },

  
  _checkAndImportListValue: function(doc, v) {
    if (v.constructor !== MAT.Annotation.AttributeValueList) {
      throw new MAT.Annotation.DocumentError("value of attribute '" + this.name + "' must be an AttributeValueList of " + this._typename);
    }
    if (v.ofAttribute && ((v.ofAttribute != this) || (v.ofDoc != doc))) {
      throw new MAT.Annotation.DocumentError("can't reuse list value attributes");
    }
    v._setAttribute(doc, this);
    return true;
  },

  _checkSetValue: function(doc, v) {
    if (v.constructor !== MAT.Annotation.AttributeValueSet) {
      throw new MAT.Annotation.DocumentError("value of attribute '" + this.name + "' must be an AttributeValueSet of " + this._typename);
    }
    if (v.ofAttribute && ((v.ofAttribute != this) || (v.ofDoc != doc))) {
      throw new MAT.Annotation.DocumentError("can't reuse set value attributes");
    }
    v._checkAttribute(doc, this);
    return true;
  },

  
  _checkAndImportSetValue: function(doc, v) {
    if (v.constructor !== MAT.Annotation.AttributeValueSet) {
      throw new MAT.Annotation.DocumentError("value of attribute '" + this.name + "' must be an AttributeValueSet of " + this._typename);
    }
    if (v.ofAttribute && ((v.ofAttribute != this) || (v.ofDoc != doc))) {
      throw new MAT.Annotation.DocumentError("can't reuse set value attributes");
    }
    v._setAttribute(doc, this);
    return true;
  },

  _importValue: function(doc, v) {
  },

  _importSingleValue: function(doc, v) {
  },

  _importSequenceValue: function(doc, v) {
    for (var i = i; i < v.elements.length; i++) {
      this._importSingleValue(doc, v.elements[i]);
    }
  },

  // This is general functionality for all
  // singleton choice attributes. If you're about to
  // change one of these values, you need to know if it
  // CAN be changed - and it can be changed if the annotation
  // isn't attached to anything, or if the resulting
  // set of choice attributes satisfy SOME restriction
  // on EACH of the places it's attached to.    

  _choiceAttributeOK: function(annot, candidateVal) {
    if (!this._choiceAttribute) {
      // Shouldn't be called in this case, but whatever.
      return true;
    } else if (!annot.publicID) {
      // It's not attached to anything.
      return true;
    } else {
      var doc = annot.doc;
      doc._buildInverseIdDict();
      var refs = doc._inverseIdDict[annot.publicID];
      if (!refs) {
        // No refs.
        return true;
      } else {
        // So now we have a set of refs, and what I need
        // to do is grab the label and choice vals
        // from the annot, ladle the candidate on top,
        // and make sure that the result satisfies at least
        // one set of restrictions for each reference.
        // I only need the label and choice vals because
        // only choice vals can be part of the label
        // restrictions.
        var theseBits = this.annotationType._generateChoiceBitsFromAnnot(annot);
        var candBits = this.annotationType._substituteChoiceBitCandidate(theseBits, this.name, candidateVal);
        for (var i = 0; i < refs.length; i++) {
          var ref = refs[i];
          if (!ref.annot.atype.attrs[ref.annot.atype.attrTable[ref.attr]]._choicesSatisfyRestrictions(annot.atype.label, candBits)) {
            return false;
          }
        }
        return true;
      }
    }
  }

});

// No regexes yet. Sorry.

MAT.Annotation.StringAttributeType = function (atype, name /* {optional: false, aggregation: null,
                                                               default: null, default_is_text_span: false,
                                                               choices: null, regexes: null} */) {
  this._typename = "string";
  MAT.Annotation.AttributeType.apply(this, arguments);
  this.choices = null;
  if (arguments.length > 2) {
    if (arguments[2].choices !== undefined) {
      this.choices = {};
      for (var i = 0; i < arguments[2].choices.length; i++) {
        var v = arguments[2].choices[i];
        // Gotta be a string.
        if ((v == null) || (v.constructor !== String)) {
          throw new MAT.Annotation.DocumentError("not all choices for attribute '" + this.name + "' are strings");
        }
        this.choices[v] = true;
      }
      if (!this.aggregation) {
        this._choiceAttribute = true;
        this.annotationType._recordChoiceAttribute(this);
      }
    }
  }
  this._computeMethods();
  this._manageDefaults();
};

MAT.Extend(MAT.Annotation.StringAttributeType, MAT.Annotation.AttributeType, {

  _computeMethods: function () {
    if (this.choices == null) {
      this._checkSingleValue = this._checkTypeAlone;
    } else {
      this._checkSingleValue = this._checkChoices;
    }
    this._checkAndImportSingleValue = this._checkSingleValue;
    MAT.Annotation.AttributeType.prototype._computeMethods.call(this);
  },
  
  _checkTypeAlone: function(doc, v) {
    return v.constructor === String;
  },

  _checkChoices: function(doc, v) {
    return (v.constructor === String) && this.choices[v];
  },

  _copyDetails: function(origAtype) {
    if (origAtype.choices) {
      this.choices = {};
      for (var k in origAtype.choices) {
        if (origAtype.choices.hasOwnProperty(k)) {
          this.choices[k] = true;
        }        
      }
      if (!this.aggregation) {
        this._choiceAttribute = true;
        this.annotationType._recordChoiceAttribute(this);
      }
    }
  },

  _toStringSingleValue: function(v /*, params */) {
    if (arguments.length > 1) {
      var truncLen = arguments[1].stringTruncationLength;
      if (truncLen == null) {
        return v;
      } else if (v.length <= truncLen) {
        return v;
      } else {
        /* So the idea is that we want to truncate the MIDDLE,
           so we can see the start and end. */
        if (truncLen < 5) {
          truncLen = 5;
        }
        var lastPart = Math.floor((truncLen - 3)/ 2);
        var firstPart = truncLen - 3 - lastPart;
        return v.substr(0, firstPart) + "..." + v.substr(-lastPart);
      }
    } else {
      return v;
    }
  }
  
});

// Javascript numbers don't distinguish between int and float. I have to make
// damn sure that when I serialize and deserialize, the right things happen, because
// 1.0 and 1 seem to be exactly equivalent in Javascript - if you type 1.0 to the console,
// you get 1 back. So there's no way, at all, to determine that a number with a trailing
// .0 is a float or an int, so in other words, ints have to be a subset of floats in
// the Javascript implementation, but when they're serialized, the floats that are
// also ints need to have a .0 appended to them.

MAT.Annotation.IntAttributeType = function(atype, name /* {optional: false, aggregation: null,
                                                           default: null, default_is_text_span: false,
                                                           choices: null,
                                                           minval: null, maxval: null} */) {  
  this._typename = "int";
  MAT.Annotation.AttributeType.apply(this, arguments);
  this._nonHashable = true;
  this.choices = null;
  this.minval = null;
  this.maxval = null;
  if (arguments.length > 2) {
    if (arguments[2].choices !== undefined) {
      this.choices = {};
      for (var i = 0; i < arguments[2].choices.length; i++) {
        var v = arguments[2].choices[i];
        // Gotta be a number. It'll be coerced to a string when we set the choices.
        if ((v == null) || (v.constructor !== Number) || ((v|0) != v)) {
          throw new MAT.Annotation.DocumentError("not all choices for attribute '" + this.name + "' are integers");
        }
        this.choices[v] = true;
      }
      if (!this.aggregation) {
        this._choiceAttribute = true;
        this.annotationType._recordChoiceAttribute(this);
      }
    }
    if (arguments[2]["default"] !== undefined) {
      dflt = arguments[2]["default"];
    }
    if (arguments[2].minval !== undefined) {
      if (arguments[2].choices !== undefined) {
        throw new MAT.Annotation.DocumentError("can't define both range and choices for int attribute '" + this.name);
      }
      var minval = arguments[2].minval;
      if ((minval == null) || (minval.constructor !== Number)) {
        throw new MAT.Annotation.DocumentError("minval for attribute '" + this.name + "' is not a numeric");
      }
      this.minval = minval;
    }
    if (arguments[2].maxval !== undefined) {
      if (arguments[2].choices !== undefined) {
        throw new MAT.Annotation.DocumentError("can't define both range and choices for int attribute '" + this.name);
      }
      var maxval = arguments[2].maxval;
      if ((maxval == null) || (maxval.constructor !== Number)) {
        throw new MAT.Annotation.DocumentError("maxval for attribute '" + this.name + "' is not a numeric");
      }
      this.maxval = maxval;
    }
  }
  this._computeMethods();
  this._manageDefaults();
};                                           

MAT.Extend(MAT.Annotation.IntAttributeType, MAT.Annotation.AttributeType, {

  _computeMethods: function() {
    if (this.choices == null) {
      if (this.minval == null) {
        if (this.maxval == null) {
          this._checkSingleValue = this._checkType;
        } else {
          this._checkSingleValue = this._checkTypeAndMaxval;
        }
      } else if (this.maxval == null) {
        this._checkSingleValue = this._checkTypeAndMinval;
      } else {
        this._checkSingleValue = this._checkTypeAndRange;
      }
    } else {
      this._checkSingleValue = this._checkTypeAndChoices;
    }
    this._checkAndImportSingleValue = this._checkSingleValue;
    MAT.Annotation.AttributeType.prototype._computeMethods.call(this);
  },

  // all guaranteed not to be null.
  _checkType: function (doc, v) {
    return (v.constructor === Number) && ((v|0) == v);
  },

  _checkTypeAndMaxval: function(doc, v) {
    return (v.constructor === Number) && ((v|0) == v) && (v <= this.maxval);
  },

  _checkTypeAndMinval: function(doc, v) {
    return (v.constructor === Number) && ((v|0) == v) && (v >= this.minval);
  },

  _checkTypeAndRange: function(doc, v) {
    return (v.constructor === Number) && ((v|0) == v) && (v >= this.minval) && (v <= this.maxval);
  },

  _checkTypeAndChoices: function(doc, v) {
    return (v.constructor === Number) && ((v|0) == v) && this.choices[v];
  },

  _digestSingleValueFromString: function(v) {
    v = parseInt(v)
    if (isNaN(v)) {
      return null;
    } else {
      return v;
    }
  },

  _copyDetails: function(origAtype) {
    if (origAtype.choices) {
      this.choices = {};
      // Remember, these are integers coerced to strings.
      for (var k in origAtype.choices) {
        if (origAtype.choices.hasOwnProperty(k)) {
          this.choices[k] = true;
        }        
      }
      if (!this.aggregation) {
        this._choiceAttribute = true;
        this.annotationType._recordChoiceAttribute(this);
      }
    }
    this.minval = origAtype.minval;
    this.maxval = origAtype.maxval;
  },

  _toStringSingleValue: function(v /*, params */) {
    return v.toString();
  }
});
                                           
MAT.Annotation.FloatAttributeType = function(atype, name /* {optional: false, aggregation: null,
                                                             default: null, default_is_text_span: false,
                                                             minval: null, maxval: null} */) {  

  this._typename = "float";
  MAT.Annotation.AttributeType.apply(this, arguments);
  this._nonHashable = true;
  this.minval = null;
  this.maxval = null;
  if (arguments.length > 2) {
    if (arguments[2].minval !== undefined) {
      var minval = arguments[2].minval;
      if ((minval == null) || (minval.constructor !== Number)) {
        throw new MAT.Annotation.DocumentError("minval for attribute '" + this.name + "' is not a numeric");
      }
      this.minval = minval;
    }
    if (arguments[2].maxval !== undefined) {
      var maxval = arguments[2].maxval;
      if ((maxval == null) || (maxval.constructor !== Number)) {
        throw new MAT.Annotation.DocumentError("maxval for attribute '" + this.name + "' is not a numeric");
      }
      this.maxval = maxval;
    }
  }
  this._computeMethods();
  this._manageDefaults();
};

// Remember, we can't distinguish between floats with .0 and integers.

MAT.Extend(MAT.Annotation.FloatAttributeType, MAT.Annotation.AttributeType, {

  _computeMethods: function() {
    if (this.minval == null) {
      if (this.maxval == null) {
        this._checkSingleValue = this._checkType;
      } else {
        this._checkSingleValue = this._checkTypeAndMaxval;
      }
    } else if (this.maxval == null) {
      this._checkSingleValue = this._checkTypeAndMinval;
    } else {
      this._checkSingleValue = this._checkTypeAndRange;
    }
    this._checkAndImportSingleValue = this._checkSingleValue;
    MAT.Annotation.AttributeType.prototype._computeMethods.call(this);
  },

  _checkType: function(doc, v) {
    return (v.constructor === Number);
  },

  _checkTypeAndMaxval: function(doc, v) {
    return (v.constructor === Number) && (v <= this.maxval);
  },

  _checkTypeAndMinval: function(doc, v) {
    return (v.constructor === Number) && (v >= this.minval);
  },

  _checkTypeAndRange: function(doc, v) {
    return (v.constructor === Number) && (v >= this.minval) && (v <= this.maxval);
  },

  _digestSingleValueFromString: function(v) {
    v = parseFloat(v);
    if (isNaN(v)) {
      return null;
    } else {
      return v;
    }
  },

  _toStringSingleValue: function(v /*, params */) {
    // If it's an integer, make it look like a float.
    if ((v|0) == v) {
      return v.toString() + ".0";
    } else {
      return v.toString();
    }
  },

  _copyDetails: function(origAtype) {
    this.minval = origAtype.minval;
    this.maxval = origAtype.maxval;
  }

});

MAT.Annotation.BooleanAttributeType = function(atype, name /* {optional: false, aggregation: nulll} */) {
  this._typename = "boolean";
  MAT.Annotation.AttributeType.apply(this, arguments);
  if (this.defaultIsTextSpan) {
    throw new MAT.Annotation.DocumentError("default_is_text_span not permitted for boolean attribute '" + this.name + "'");
  }
  this._nonHashable = true;
  this._computeMethods();
  this._manageDefaults();
};

MAT.Extend(MAT.Annotation.BooleanAttributeType, MAT.Annotation.AttributeType, {

  _computeMethods: function() {
    this._checkAndImportSingleValue = this._checkSingleValue;
    MAT.Annotation.AttributeType.prototype._computeMethods.call(this);
  },

  _checkSingleValue: function(doc, v) {
    return (v.constructor === Boolean);
  },

  _digestSingleValueFromString: function(v) {
    if (v == "yes") {
      return true;
    } else if (v == "no") {
      return false;
    } else {
      return null;
    }
  },

  _toStringSingleValue: function (v /*, params */) {
    return (v ? "yes" : "no");
  }
});

// Finally, the annotation attribute type. This is something of a mess, because of
// having to evaluate the label restrictions.

// The label restrictions should be either string atoms, or tuples
// whose first element is a string and second element is a dictionary or a list, set or tuple of attribute-value
// pairs. The values of the attributes in these pairs must already be the
// right type for the attribute.

MAT.Annotation.AnnotationAttributeType = function(atype, name /* {optional: false, aggregation: null,
                                                                  label_restrictions: null} */) {
  this._typename = "annotation";
  MAT.Annotation.AttributeType.apply(this, arguments);
  if ((this.dflt !== null) || this.defaultIsTextSpan) {
    throw new MAT.Annotation.DocumentError("defaults not permitted for annotation attribute '" + this.name + "'");
  }
  this.atomicLabelRestrictions = null;
  this.complexLabelRestrictions = null;
  this.digestedComplexLabelRestrictions = null;
  if (arguments.length > 2) {
    var labelRestrictions = arguments[2].label_restrictions;
    if (labelRestrictions !== undefined) {
      if (labelRestrictions.constructor !== Array) {
        throw new MAT.Annotation.DocumentError("label restrictions for attribute '" + this.name + "' are not an array");
      }
      for (var i = 0; i < labelRestrictions.length; i++) {
        var e = labelRestrictions[i];
        if ((e != null) && (e.constructor === String)) {
          // It's just an atom.
          if (this.atomicLabelRestrictions == null) {
            this.atomicLabelRestrictions = {};
          }
          this.atomicLabelRestrictions[e] = true;
        } else if ((e != null) && (e.constructor === Array)) {
          if ((e.length < 1) || (e[0] == null) || (e[0].constructor !== String)) {
            throw new MAT.Annotation.DocumentError("complex label restriction for attribute '" + this.name + "' must begin with a string");
          }
          if ((e.length == 1) || ((e.length == 2) && (!e[1]))) {
            // It's just an atom.
            if (this.atomicLabelRestrictions == null) {
              this.atomicLabelRestrictions = {};
            }
            this.atomicLabelRestrictions[e[0]] = true;
          } else if (e.length == 2) {
            var l = e[0];
            var pairs = e[1];
            if ((pairs != null) && (pairs.constructor === Object)) {
              var pairs = [];
              for (var k in e[1]) {
                pairs.push([k, e[1][k]]);
              }              
            } else if ((pairs == null) || (pairs.constructor !== Array)) {
              throw new MAT.Annotation.DocumentError("complex label restriction for attribute '" + this.name + "' must be a sequence of a string and either an object or a list of attribute-value pairs");
            }
            for (var j = 0; j < pairs.length; j++) {
              var p = pairs[j];
              if ((p == null) || (p.constructor !== Array) || (p.length != 2) || (p[0] == null) || (p[0].constructor !== String)) {
                throw new MAT.Annotation.DocumentError("complex label restriction for attribute '" + this.name + "' must be a sequence of a string and either an object or a list of attribute-value pairs");
              }
            }
            // Not gonna check the types of the restrictions right now.
            if (this.complexLabelRestrictions == null) {
              this.complexLabelRestrictions = [[l, pairs]];
            } else {
              this.complexLabelRestrictions.push([l, pairs]);
            }
          } else {
            throw new MAT.Annotation.DocumentError("label restrictions for attribute '" + this.name + "' must each be a string or a sequence of a string and either an object or a list of attribute-value pairs");
          }
        } else {
          throw new MAT.Annotation.DocumentError("label restrictions for attribute '" + this.name + "' must each be a string or a sequence of a string and either an object or a list of attribute-value pairs");
        }        
      }
    }
  }
  this._computeMethods();
};

MAT.Extend(MAT.Annotation.AnnotationAttributeType, MAT.Annotation.AttributeType, {

  _computeMethods: function() {
    if (this.atomicLabelRestrictions == null) {
      if (this.complexLabelRestrictions == null) {
        this._checkSingleValue = this._checkType;
      } else {
        this._checkSingleValue = this._checkTypeAndComplexRestrictions;
      }
    } else if (this.complexLabelRestrictions == null) {
      this._checkSingleValue = this._checkTypeAndSimpleRestrictions;
    } else {
      this._checkSingleValue = this._checkTypeAndRestrictions;
    }
    MAT.Annotation.AttributeType.prototype._computeMethods.call(this);
    this._clearValue = this._clearAnnotationValue;
  },

  _checkAndImportSingleValue: function(doc, v) {
    if (this._checkSingleValue(doc, v)) {
      doc.registerAnnotationReference(v);
      return true;
    } else {
      return false;
    }
  },

  _importSingleValue: function(doc, v) {
    doc.registerAnnotationReference(v);
  },

  _checkType: function(doc, v) {
    return (v.constructor === MAT.Annotation.Annotation);
  },

  _checkTypeAndSimpleRestrictions: function(doc, v) {
    return ((v.constructor === MAT.Annotation.Annotation) && this.atomicLabelRestrictions[v.atype.label]);
  },

  _checkTypeAndComplexRestrictions: function(doc, v) {
    if (v.constructor !== MAT.Annotation.Annotation) {
      return false;
    }
    for (var i = 0; i < this.complexLabelRestrictions.length; i++) {
      var lab = this.complexLabelRestrictions[i][0];
      var pairs = this.complexLabelRestrictions[i][1];
      if (v.atype.label != lab) {
        continue;
      }
      var failed = false;
      for (var j = 0; j < pairs.length; j++) {
        if (v.getAttributeValue(pairs[j][0]) != pairs[j][1]) {
          failed = true;
          break;
        }
      }
      if (!failed) {
        return true;
      }
    }
    return false;
  },
  
  _checkTypeAndRestrictions: function(doc, v) {
    if (v.constructor !== MAT.Annotation.Annotation) {
      return false;
    }
    if (this.atomicLabelRestrictions[v.atype.label]) {
      return true;
    }
    for (var i = 0; i < this.complexLabelRestrictions.length; i++) {
      var lab = this.complexLabelRestrictions[i][0];
      var pairs = this.complexLabelRestrictions[i][1];
      if (v.atype.label != lab) {
        continue;
      }
      var failed = false;
      for (var j = 0; j < pairs.length; j++) {
        if (v.getAttributeValue(pairs[j][0]) != pairs[j][1]) {
          failed = true;
          break;
        }
      }
      if (!failed) {
        return true;
      }
    }
    return false;
  },

  _digestSingleValueFromString: function(v) {
    // Not possible.
    return null;
  },

  /* For the annotations, this function is going to be pretty complicated.
     It should have options to create a name string using a Regex template,
     and also a default name, and the label and intervals. Note that it does
     NOT show the attribute values. That's only when we're displaying
     a toplevel annotation. */

  /* Nevertheless, we'll still be collecting the presentation information 
     in the annotContext object. */
  
  _toStringSingleValue: function(v /*, params */) {
    var showLabel = true;
    var showIndices = false;
    var showFormattedName = false;
    var showFeatures = false;
    var annotContext = null;
    if (arguments.length > 1) {
      params = arguments[1];
      if (params.dontShowAnnotationLabel) {
        showLabel = false;
      }
      if (params.showAnnotationIndices) {
        showIndices = true;
      }
      if (params.showAnnotationFormattedName) {
        showFormattedName = true;
      }
      if (params.showAnnotationFeatures) {
        showFeatures = true;
      }
      if (params.annotContext) {
        annotContext = params.annotContext;
      }
    }
    return v.format({
      dontShowLabel: !showLabel,
      showIndices: showIndices,
      showFormattedName: showFormattedName,
      showFeatures: showFeatures,
      annotContext: annotContext
    });    
  },  

  _clearAnnotationValue: function(doc) {
    doc.clearIDReferences();
  },

  _copyDetails: function(origAtype) {
    this.atomicLabelRestrictions = origAtype.atomicLabelRestrictions;
    this.complexLabelRestrictions = origAtype.complexLabelRestrictions;
    this.digestedComplexLabelRestrictions = origAtype.digestedComplexLabelRestrictions;
  },

  // We want to ensure that effective labels are unpacked, and that all the
  // annotations and attributes exist, and that if there's an effective label,
  // it's noted, and that the effective label attribute is separately marked.
  // I need all this info for the attribute editor. The effective labels
  // SHOULD have been checked in the backend, but this may be used without
  // a backend. The effective label info has already been checked.

  // Although the documentation does claim that the atomic restrictions
  // must be true labels. So maybe I don't need to to that part.
  
  // We ALSO want to know the reverse pointers; i.e., for each annotation type,
  // which annotations point to it, and how?
  
  digestLabelRestrictions: function(globalATR) {
    var toRemove = {};
    var digestedRestrictions = {};
    var allRemoved = true;
    var toAdd = [];
    var someMoved = false;
    if (this.atomicLabelRestrictions != null) {
      for (var a in this.atomicLabelRestrictions) {
        if (this.atomicLabelRestrictions.hasOwnProperty(a)) {
          var trueLabel = globalATR.effectiveLabelTable[a];
          if (trueLabel) {
            // It's an effective label. Unpack it.
            var trueType = globalATR.typeTable[trueLabel];
            var eEntry = trueType.effective_labels[a];
            var finalPairs = [[eEntry.attr, eEntry.val]];
            if (digestedRestrictions[trueLabel] === undefined) {
              digestedRestrictions[trueLabel] = [];
            }
            digestedRestrictions[trueLabel].push({
              label: trueLabel,
              // The bitmask is for checking, the attrs are
              // for creating. I need the attrs WITHOUT
              // the effective label attr. See _addAnnotation
              // and selectOrCreateContextuallyRestrictedAnnotation
              // in mat_doc_display.js.
              creationAttrs: null,
              attrBitmask: trueType._generateChoiceBitsFromAttrs(finalPairs),
              fromEffectiveLabel: a,
              effectiveLabelAttr: eEntry.attr
            });            
            toAdd.push([label, [[eEntry.attr, eEntry.val]]]);
            // Mark it as used in. The used in list is a list of
            // locations to CONSIDER for attachment.
            trueType.markUsedIn(this.annotationType.label, this.name);
            someMoved = true;
            toRemove[a] = true;
          } else if (!globalATR.typeTable[a]) {
            throw new MAT.Annotation.DocumentError("label restriction refers to unknown label " + a);
          } else {
            allRemoved = false;
            // Fill in the usedIn table for the actual type.
            // NOTE THAT I DO NOT ALLOW LABEL RESTRICTIONS ON
            // ARGUMENTS OF EFFECTIVE LABELS. I.e., you can't
            // have a limitation which applies to an attribute
            // value ONLY if the bearer of the attribute has a
            // particular other attribute-value pair.
            globalATR.typeTable[a].markUsedIn(this.annotationType.label, this.name);            
          }
        }
      }
    }
    // Update the atomic label restrictions.
    if (someMoved) {
      if (allRemoved) {
        this.atomicLabelRestrictions = null;
      } else {
        for (var k in toRemove) {
          if (toRemove.hasOwnProperty(k)) {
            delete this.atomicLabelRestrictions[k];
          }
        }
      }
    }
    if (this.complexLabelRestrictions != null) {
      // I need this for figuring out effective labels below.
      for (var i = 0; i < this.complexLabelRestrictions.length; i++) {
        var lab = this.complexLabelRestrictions[i][0];
        var pairs = this.complexLabelRestrictions[i][1];
        // I need to digest the restrictions, and also to modify the list
        // if needed.
        // The finalPairs are the pairs wrt the true label.
        // They are NOT the display pairs. The display pairs are
        // everything else. The creationAttrs are those pairs.
        var finalPairs = [];
        // The trueAttrs are the hash version of the finalPairs.
        var trueAttrs = {};
        var digestedEntry;
        var trueLabel = globalATR.effectiveLabelTable[lab];
        var valChanged = false;
        var lObj;
        if (trueLabel) {
          // It's an effective label. Unpack it.
          lObj = globalATR.typeTable[trueLabel]
          var eEntry = lObj.effective_labels[lab];
          finalPairs.push([eEntry.attr, eEntry.val]);
          trueAttrs[eEntry.attr] = eEntry.val;
          attrs[eEntry.attr] = eEntry.val;
          digestedEntry = {
            label: trueLabel,
            // These should be the features WITHOUT the
            // effective label pair.
            creationAttrs: pairs,
            fromEffectiveLabel: lab,
            effectiveLabelAttr: eEntry.attr
          };
          this.complexLabelRestrictions[i] = [lab, finalPairs];
          lab = trueLabel;
        } else {
          lObj = globalATR.typeTable[lab];
          if (!lObj) {
            throw new MAT.Annotation.DocumentError("label restriction refers to unknown label " + lab);
          }
          digestedEntry = {
            label: lab,
            creationAttrs: pairs
          };
        }
        // This entry might turn out to correspond to an effective label, which I need to
        // know. I also have to ensure that if the entry is ALREADY an effective label,
        // the effective label attr can't be used.
        for (var j = 0; j < pairs.length; j++) {
          var attr = pairs[j][0];
          var val = pairs[j][1];
          var attrIdx = lObj.attrTable[attr];
          if (attrIdx == null) {
            throw new MAT.Annotation.DocumentError("found a label restriction which refers to an attribute " + attr + " which hasn't been defined for true label " + lab);
          }
          if (digestedEntry.effectiveLabelAttr && (attr == digestedEntry.effectiveLabelAttr)) {
            throw new MAT.Annotation.DocumentError("found a label restriction which is already an effective label which separately refers to the effective label attribute '" + attr + "'");
          }
          var attrObj = lObj.attrs[attrIdx];
          if (attrObj.aggregation != null) {
            throw new MAT.Annotation.DocumentError("found a label restriction which refers to a non-singleton attribute " + attr);
          }
          if ((attrObj._typename != "string") && (attrObj._typename != "int")) {
            throw new MAT.Annotation.DocumentError("found a label restriction which refers to a non-string, non-int attribute " + attr + " for label " + lab);
          }
          if (!attrObj.choices) {
            throw new MAT.Annotation.DocumentError("found a label restriction which refers to an attribute " + attr + " for label " + lab + "which has no choices");
          }
          if (val == null) {
            throw new MAT.Annotation.DocumentError("found a label restriction whose attribute value is null");
          }
          if (!attrObj._checkSingleValue(null, val)) {
            throw new MAT.Annotation.DocumentError("value " + val + " is not a legal value for attribute " + attr + " of label " + lab + " in label restriction");
          }
          trueAttrs[attr] = val;
          finalPairs.push([attr, val]);
        }
        if (digestedRestrictions[lab] === undefined) {
          digestedRestrictions[lab] = [];
        }
        digestedRestrictions[lab].push(digestedEntry);
        // The usedIn list is a list of labels to CONSIDER for attachment.
        lObj.markUsedIn(this.annotationType.label, this.name);
        // Note that I do this here rather than when I first
        // find the label, because the user may have explicitly declared
        // label_restriction truelabel attr=val where truelabel
        // attr=val amounts to an effective label.
        if (!digestedEntry.fromEffectiveLabel) {
          if (lObj.effective_labels) {
            for (var k in lObj.effective_labels) {
              if (lObj.effective_labels.hasOwnProperty(k)) {
                var labEntry = lObj.effective_labels[k];
                if (trueAttrs[labEntry.attr] == labEntry.val) {
                  // The digested entry is actually from an effective label.
                  digestedEntry.fromEffectiveLabel = k;
                  digestedEntry.effectiveLabelAttr = labEntry.attr;
                  // And I must REMOVE it from the creationAttrs.
                  for (var w = 0; w < digestedEntry.creationAttrs.length; w++) {
                    if (labEntry.attr == digestedEntry.creationAttrs[w][0]) {
                      digestedEntry.creationAttrs.splice(w, 1);
                      break;
                    }
                  }
                  break;
                }
              }
            }
          }
        }
        // Do this last, after the attrs are created.
        digestedEntry.attrBitmask = lObj._generateChoiceBitsFromAttrs(finalPairs);
      }
      if (someMoved) {
        this.complexLabelRestrictions = this.complexLabelRestrictions.concat(toAdd);
      }
    } else if (someMoved) {
      this.complexLabelRestrictions = toAdd;
    }
    if (this.complexLabelRestrictions && (this.complexLabelRestrictions.length > 0)) {
      this.digestedComplexLabelRestrictions = digestedRestrictions;
    }
    // This has to be recomputed if we've moved stuff around.
    if (someMoved) {
      this._computeMethods();
    }    
  },


  // And finally, here's where the bits are checked.
  _choicesSatisfyRestrictions: function(candidateLabel, candBits) {
    if (this.atomicLabelRestrictions && this.atomicLabelRestrictions[candidateLabel]) {
      return true;
    } else if (this.digestedComplexLabelRestrictions) {
      var entries = this.digestedComplexLabelRestrictions[candidateLabel];
      if (entries) {
        for (var k = 0; k < entries.length; k++) {
          var entry = entries[k];
          // If, when you AND the attrBitmask with the candBits,
          // you get the attrBitmask, it matches.
          if ((entry.attrBitmask & candBits) == entry.attrBitmask) {
            return true;
          }
        }
        return false;
      }
    } else if ((!this.atomicLabelRestrictions) && (!this.digestedComplexLabelRestrictions)) {
      // Note that while it's not possible for an annotation-valued attribute
      // to lack all restrictions when the attribute is defined in a task
      // specification, the attribute ITSELF imposes no such restriction, in
      // case you're simply inducing the type from an annotation. So we have
      // to worry about this case, just in case.
      return true;
    } else {
      return false;
    }
  }

  
});

MAT.Annotation.AttributeTypeTable = {
  string: MAT.Annotation.StringAttributeType,
  int: MAT.Annotation.IntAttributeType,
  float: MAT.Annotation.FloatAttributeType,
  boolean: MAT.Annotation.BooleanAttributeType,
  annotation: MAT.Annotation.AnnotationAttributeType
};
  

// I'm not going to worry about spanless annotations here. That is,
// it'll all have start and end - they'll just be null.

MAT.Annotation.Annotation = function(doc, atype, start, end, publicID, attrs) {
  this.doc = doc;
  this.atype = atype;
  this.start = start;
  this.end = end;
  // This is the ID the backend has reported.
  this.publicID = publicID;
  this.attrs = [];
  // We used to cache the presented name, but it can change,
  // so we'll generate it each time.
  this.effectiveDisplayEntry = undefined;
  // Most of the time, I'll have an array, because I'm
  // populating it from the MAT JSON format. But sometimes, I'll
  // be building a document from the API, in which case I will
  // provide attrs as a hash.
  if (attrs) {
    if (attrs.constructor == Array) {
      if (this.attrs.length > atype.attrs.length) {
        throw new MAT.Annotation.DocumentError("too many attributes");
      }
      this._setAttrList(attrs);
    } else if (attrs.constructor == Object) {
      for (var k in attrs) {
        if (attrs.hasOwnProperty(k)) {
          this.setAttributeValue(k, attrs[k]);
        }
      }
    } else {
      throw new MAT.Annotation.DocumentError("attrs must be list or object");
    }
  }
  if (this.atype.hasDefaults) {
    for (var i = 0; i < this.atype.attrs.length; i++) {
      // We don't need to check the value, or the existence of the attr,
      // or anything. Just whomp in the value.
      if (this.atype.attrs[i].hasDefault) {
        if (this.attrs.length <= i) {
          while (this.attrs.length <= i) {
            this.attrs.push(null);
          }
          this.attrs[i] = this.atype.attrs[i]._getAttributeDefault(this);
        } else if (this.attrs[i] == null) {
          this.attrs[i] = this.atype.attrs[i]._getAttributeDefault(this);
        }
      }
    }
  }
  // This ID is used when creating the regions.
  this.id = MAT.Annotation.ACount++;
  // And this is the type-specific counter. It's updated during addAnnotation.
  // We'll use it in the namer by default if it's a spanless annotation.
  this.typeCounter = 0;
  // Let's see if we can cache this. It needs to be cleared every time an
  // attribute is set.
  this._cssLabels = null;
}

MAT.Extend(MAT.Annotation.Annotation, {

  addVisualDisplay: function(disp) {
    this.doc.rd.registerAnnotationDisplay(this, disp);
  },
    
  removeVisualDisplay: function(disp) {
    this.doc.rd.unregisterDisplay(disp);
  },    

  isContentAnnotation: function() {
    return MAT.Annotation.AnnotationType.isContentType(this.atype.category);
  },

  // Ask the global type, not the local type. I think.
  isEditable: function() {
    var globalType = this.doc.annotTypes.globalATR.typeTable[this.atype.label];
    return (globalType && globalType.isEditable());
  },

  // Ask the global type, not the local type. I think.
  isViewable: function() {
    var globalType = this.doc.annotTypes.globalATR.typeTable[this.atype.label];
    return (globalType && globalType.isViewable());
  },

  _setAttrList: function(attrs) {
    if (this.attrs) {
      this.doc.clearIDReferences();
    }
    for (var i = 0; i < attrs.length; i++) {
      var v = attrs[i];
      if (v !== null) {
        if (!this.atype.attrs[i]._checkAndImportValue(this.doc, v)) {
          throw new MAT.Annotation.DocumentError("value of attribute '" + this.atype.attrs[i].name + "' must be a " + this.atype.attrs[i]._typename);
        }
      }
    }
    this.attrs = attrs;
    this._cssLabels = null;
  },

  // There are some things we have little control over. E.g., if I create
  // an attribute given an integer, I really don't know if it's an integer
  // or a float.

  // None of the values here will be null.
  
  _computeAttributeType: function(v) {
    if ((v.constructor === MAT.Annotation.AttributeValueSet) || (v.constructor === MAT.Annotation.AttributeValueList)) {
      var aggrType = (v.constructor == MAT.Annotation.AttributeValueList ? "list" : "set");
      if (v.size() == 0) {
        return {type: MAT.Annotation.StringAttributeType, aggregation: aggrType};
      } else {
        var first = true;
        var finalT = null;
        var size = v.size();
        for (var i = 0; i < size; i++) {
          var subT = this._computeAnnotationType(v.elements[i]);
          if (subT.aggregation) {
            throw new MAT.Annotation.DocumentError("list or sequence attribute value may not have list or sequence members");
          }
          if (first) {
            finalT = subT.type;
            first = false;
          } else if (subT.type != finalT) {
            throw new MAT.Annotation.DocumentError("not all members of list or sequence attribute value are the same type");
          }
        }
        return {type: finalT, aggregation: aggrType};
      }
    } else if (v.constructor === String) {
      return {type: MAT.Annotation.StringAttributeType, aggregation: null};
    } else if (v.constructor === Number) {
      if ((v|0) == v) {
        return {type: MAT.Annotation.IntAttributeType, aggregation: null};
      } else {
        return {type: MAT.Annotation.FloatAttributeType, aggregation: null};
      }
    } else if (v.constructor === MAT.Annotation.Annotation) {
      return {type: MAT.Annotation.AnnotationAttributeType, aggregation: null};      
    } else if (v.constructor === Boolean) {
      return {type: MAT.Annotation.BooleanAttributeType, aggregation: null};
    } else {
      throw new MAT.Annotation.DocumentError("attribute value " + v + " must be MAT.Annotation.AttributeValueList, MAT.Annotation.AttributeValueSet, string, number, MAT.Annotation.Annotation, or boolean");
    }
  },
  
  setAttributeValue: function(aName, v) {
    if (!(aName && (aName.constructor === String))) {
      throw new MAT.Annotation.DocumentError("key must be a string");
    }
    var attrIsNew = false;
    var k;
    if (this.atype.attrTable[aName] != null) {
      k = this.atype.attrTable[aName];
    } else {
      var t;
      var aggr;
      if (v == null) {
        // What else can I do?
        t = MAT.Annotation.StringAttributeType;
        aggr = null;
      } else {
        var subT = this._computeAttributeType(v);
        t = subT.type;
        aggr = subT.aggregation;
      }
      k = this.atype._createAttributeType(t, aName, {aggregation: aggr});
      attrIsNew = true;
    }
    while (this.attrs.length <= k) {
      this.attrs.push(null);
    }
    
    if (!attrIsNew) {
      // If the attribute is new, the type has already been checked, and the current
      // value is known to be null.
      var attrObj = this.atype.attrs[k];
      if (attrObj._choiceAttribute) {
        if (!attrObj._choiceAttributeOK(this, v)) {
          throw new MAT.Annotation.DocumentError("value of attribute '" + attrObj.name + "' can't be changed to '" + v + "' because the result is inconsistent with the attribute restrictions of the attributes the annotation fills");
        }
        if (this.effectiveDisplayEntry && (aName == this.effectiveDisplayEntry.attr)) {
          // Gotta clear this.
          this.effectiveDisplayEntry = undefined;
        }
      }
      if (v !== null) {
        if (!attrObj._checkAndImportValue(this.doc, v)) {
          throw new MAT.Annotation.DocumentError("value of attribute '" + attrObj.name + "' must be a " + attrObj._typename + " and meet the other requirements");
        }
      } else if ((this.attrs.length > k) && (this.attrs[k] != null) && attrObj._clearValue) {
        attrObj._clearValue(this.doc);
      }
    } else if (v !== null) {
      // attrIsNew, and the types ar checked. But I need to do _importValue in this case.
      var attrObj = this.atype.attrs[k];
      attrObj._importValue(this.doc, v);
    }
    this.attrs[k] = v;
    this._cssLabels = null;
  },

  // This will add the element as an element of an AttributeValueSequence, if needed.
  addAttributeValue: function(aName, v) {
    // Get the existing attrObj. That's the only way
    // you're going to get an aggregation.
    var attrObj = null;
    if (this.atype.attrTable[aName] != null) {
      attrObj = this.atype.attrs[this.atype.attrTable[aName]];
    }

    var done = false;
    if (attrObj && attrObj.aggregation && (v !== null) && 
        (v.constructor !== MAT.Annotation.AttributeValueList) &&
        (v.constructor !== MAT.Annotation.AttributeValueSet)) {
      // If it's a known attribute, and it's an aggregation attribute, and we're holding a non-sequence value...
      var curV = this.getAttributeValue(aName);
      if (curV != null) {
        // And the current value is non-null, add it.
        if (attrObj.aggregation == "list") {
          curV.push(v);
        } else {
          curV.add(v);
        }
        done = true;
      } else if (attrObj.aggregation == "list") {
        // Otherwise, wrap it in the appropriate element.
        v = new MAT.Annotation.AttributeValueList([v]);
      } else {
        v = new MAT.Annotation.AttributeValueSet([v]);
      }
    }
    if (!done) {
      // This is the case where we don't have
      // an existing attribute (in which case the type will be inferred from the value),
      // or the attribute doesn't have an aggregation (in which case the value will
      // just be whomped in), or the value is null (in which case aggregation doesn't matter),
      // or it's already an aggregation, or we've wrapped a non-aggregation value because there's no value yet.
      this.setAttributeValue(attrObj.name, v);
    }
  },

  // This is a LITTLE different. It's analogous to addAttributeValue above,
  // but not like setAttributeValue(null). Here, we remove the element if
  // it's the actual value, or, if it's not a sequence and we have an aggregation,
  // we remove it from the aggregation.

  // Returns true if it did anything, false otherwise.
  
  removeAttributeValue: function(aName, v) {
    if (v === null) {
      return false;
    }
    var attrObj = null;
    if (this.atype.attrTable[aName] != null) {
      attrObj = this.atype.attrs[this.atype.attrTable[aName]];
    }
    if (attrObj) {
      var curV = this.getAttributeValue(aName);
      if (curV === v) {
        // If it really is the value, set the value to null.
        this.setAttributeValue(aName, null);
        return true;
      } else if (attrObj.aggregation && (curV !== null) && 
                 (v.constructor !== MAT.Annotation.AttributeValueList) &&
                 (v.constructor !== MAT.Annotation.AttributeValueSet)) {
        // Remove it from curV, if possible.
        if (attrObj.aggregation == "list") {
          var i = curV.indexOf(v);
          if (i > -1) {
            curV.splice(i, 1);
            return true;
          }
        } else if (curV.contains(v)) {
          curV.remove(v);
          return true;
        }
      }
    }
    return false;
  },

  //
  // And this is yet a third variation.
  // Eventually, something like this will be the "real" version, but not right now.
  //

  addAttributeValuesViaUI: function(hash, dispSource, popupMgr) {
    var eventsToFire = null;
    for (var k in hash) {
      if (hash.hasOwnProperty(k)) {
        var res = this._addAttributeValueViaUI(k, hash[k], popupMgr);
        if (res !== null) {
          // Didn't fail.
          if (eventsToFire === null) {
            eventsToFire = res;
          } else {
            eventsToFire = eventsToFire.concat(res);
          }
        }
      }
    }
    if (eventsToFire && (eventsToFire.length > 0)) {
      this.doc.rd.fireGestureEvents(dispSource, eventsToFire);
    }
    return eventsToFire;
  },

  addAttributeValueViaUI: function(aName, v, dispSource, popupMgr) {
    var res = this._addAttributeValueViaUI(aName, v, popupMgr);
    if (res !== null) {
      this.doc.rd.fireGestureEvents(dispSource, res);
      return res;
    } else {
      return null;
    }
  },

  _addAttributeValueViaUI: function(aName, v, popupMgr) {
    var attrObj = null;
    if (this.atype.attrTable[aName] != null) {
      attrObj = this.atype.attrs[this.atype.attrTable[aName]];
    }
    var curVal = null;
    if (attrObj && (attrObj._typename == "annotation")) {
      // If the attrObj doesn't exist yet, then the value
      // will definitely be null :-).
      curVal = this.getAttributeValue(aName);
    }
    try {
      // This will add to an existing value if it's supposed to be an aggregation,
      // or make it a set appropriately, or just set the value otherwise.
      this.addAttributeValue(aName, v);
      if (!attrObj) {
        // If we're setting for the first time, we have to
        // get the created attrObj.
        attrObj = this.atype.attrs[this.atype.attrTable[aName]];
      }
      var events = [];
      if (attrObj._typename == "annotation") {
        // Let's fire attach/detach for this case.
        var aVal = v;
        // If this isn't an aggregation, a previous value will be
        // overwritten. If it IS an aggregation, we know that aVal is
        // an annotation, so it'll be added to the current value, so
        // nothing needs to happen.
        // But there's one more case: if the attrObj is an aggregation,
        // and there's a curVal, and aVal is null. Then we're unsetting,
        // and we need to detach ALL the children.
        if (curVal) {
          if (attrObj.aggregation && (!v)) {
            // We're removing an aggregate value.
            var size = curVal.size();
            for (var k = 0; k < size; k++) {
              var subval = curVal.elements[k];
              events.push({
                event_name: "detach_from_parent",
                attr_name: aName,
                parent_annot: this,
                annot: subval
              });
              events.push({
                event_name: "detach_child",
                attr_name: aName,
                annot: this,
                child_annot: subval
              });
            }
          } else if (!attrObj.aggregation) {
            // We're about to overwrite a single value.
            events.push({
              event_name: "detach_from_parent",
              attr_name: aName,
              parent_annot: this,
              annot: curVal
            });
            events.push({
              event_name: "detach_child",
              attr_name: aName,
              annot: this,
              child_annot: curVal
            });
          }
        }
        
        // Do the detaches first, and then the attaches.
        if (v) {
          events.push({
            event_name: "attach_to_parent",
            attr_name: aName,
            parent_annot: this,
            annot: v
          });
          events.push({
            event_name: "attach_child",
            attr_name: aName,
            child_annot: v,
            annot: this
          });
        }
        
      } else {
        // Otherwise, just fire a normal modify_annotation action.
        events.push({
          annot: this,
          event_name: "modify_annotation",
          attr_name: aName
        });
      }
      return events;
    } catch (e) {
      var msg;
      if (e.constructor === MAT.Annotation.DocumentError) {
        msg = e.msg;
      } else {
        msg = "setting the value of the '" + attr + "' attribute failed for an unknown reason";
      }
      // I don't have the application document here, unfortunately.
      popupMgr.error(null, msg);
      return null;
    }
  },

  removeAttributeValueViaUI: function(aName, v, dispSource, popupMgr) {    
    var res = this._removeAttributeValueViaUI(aName, v, popupMgr);
    if ((res !== null) && (res.length > 0)) {
      this.doc.rd.fireGestureEvents(dispSource, res);
      return res;
    } else {
      return null;
    }
  },

  _removeAttributeValueViaUI: function(aName, v, popupMgr) {
    try {
      if (this.removeAttributeValue(aName, v)) {
        // The aName must exist, because removeAttributeValue succeeded.
        attrObj = this.atype.attrs[this.atype.attrTable[aName]];
        if (attrObj._typename == "annotation") {
          // Fire the detaches.
           return [{
             annot: this,
             event_name: "detach_child",
             attr_name: aName,
             child_annot: v
           }, {
             annot: v,
             event_name: "detach_from_parent",
             attr_name: aName,
             parent_annot: this
           }];
        } else {
          return [{
            annot: this,
            event_name: "modify_annotation",
            attr_name: aName
          }];
        }
      } else {
        // Nothing happened. Nothing needs to change.
        return null;
      }
    }
    catch (e) {
      var msg;
      if (e.constructor === MAT.Annotation.DocumentError) {
        msg = e.msg;
      } else {
        msg = "removing the value of the '" + attr + "' attribute failed for an unknown reason";
      }
      // I don't have the application document here, unfortunately.
      popupMgr.error(null, msg);
      return null;
    }
  },

  modifyExtent: function(startI, endI) {
    this.start = startI;
    this.end = endI;
  },

  getAttributeValue: function(k) {
    var k = this.atype.attrTable[k];
    if (k === undefined) {
      return undefined;
    } else if (this.attrs.length <= k) {
      return undefined;
    } else {
      return this.attrs[k];
    }
  },

  getID: function() {
    if (this.publicID === null) {
      // Make a new one.
      this.publicID = this.doc._generateID(this);
    }
    return this.publicID;
  },  

  setID: function(id) {
    this.doc.registerID(id, this);
    this.publicID = id;
  },

  // Presentation stuff. We do have to worry about the recursive case,
  // where the annotation points to itself. I think the right thing
  // to do in that circumstance is temporarily insert a "<circular ref>"
  // element.

  getEffectiveLabel: function() {
    var dEntry = this.getEffectiveDisplayEntry();
    if (dEntry) {
      return dEntry.name;
    } else {
      return this.atype.label;
    }
  },  
    
  getEffectiveDisplayEntry: function() {
    if (this.effectiveDisplayEntry !== undefined) {
      return this.effectiveDisplayEntry;
    } else {
      // Let's look at the local version - it should have all the
      // same info as the global one.    
      var tEntry = this.atype;
      // Let's start with the toplevel display entry.
      var cssEntry = tEntry.display || null;
      // Now, let's look through the effective labels.
      if (tEntry.effective_labels) {
        for (var eName in tEntry.effective_labels) {
          if (tEntry.effective_labels.hasOwnProperty(eName)) {
            var eEntry = tEntry.effective_labels[eName];
            if (eEntry.display && eEntry.display.css) {
              var j = this.getAttributeValue(eEntry.attr);
              if (j == eEntry.val) {
                // Found one that works.
                cssEntry = eEntry.display;
                break;
              }
            }
          }
        }
      }
      // This may be null.
      this.effectiveDisplayEntry = cssEntry;
      return cssEntry;
    }
  },

  // This is regardless of whether it's spanned or spanless, since
  // I'm going to be displaying icons for the spanless ones.
  
  _computeCSSLabels: function() {
    if (this._cssLabels === null) {
      // Everything has to have whitespace replaced - tags may have whitespace in them.
      var labels = [this.atype.label.replace(/\W/g, "_")];
      for (var j = 0; j < this.attrs.length; j++) {
        if (this.attrs[j] != null) {
          // The attribute can't be an aggregation, and can't be an annotation-valued attribute.
          // In fact, we should probably only do this for attributes which are limited choices.
          // But that's later.
          var attrObj = this.atype.attrs[j];
          if ((attrObj.aggregation == null) && (attrObj._typename != "annotation")) {
            labels.push("attr_"+this.atype.attrs[j].name.replace(/\W/g, "_")+"_is_"+attrObj._toStringSingleValue(this.attrs[j]).replace(/\W/g, "_"));
          }
        }
      }
      this._cssLabels = labels;
    }
    return this._cssLabels;
  },

  // We're going to use a Python string interpolation-like technique here.
  // The pattern $(...) refers to either attributes, or the special
  // strings _text (the spanned text), _start, _end (the endpoints of the label),
  // _label (the effective label).
  // _text and the other special ones take x=y pairs, as follows:
  // _text: truncate=<num>
  // _parent: truncate=<num> (how many parents to show)

  // This definitely returns null if no name can be computed, so I can
  // deal with the defaults in format(). This will only happen for spanless annotations.

  // I'm no longer going to cache the presented name - I need to approach
  // this from various positions, and I can't reliably manage it. We may
  // also introduce a difference between embedded and unembedded names.

  // The primary entry point here is in format(), but we should duplicate
  // the management of the annotContext here as well. The trick here is that
  // we need to ensure that the previously recognized annotContext in getPresentedName
  // isn't triggered by the setup in format(). That is, this should be able
  // to be its own toplevel call, but it should be smart enough to know
  // when format() just introduced the context for saving.

  getPresentedName: function() {
    var annotContext = null;
    var formatString = null;
    if (arguments.length > 0) {
      annotContext = arguments[0].annotContext;
      formatString = arguments[0].formatString || null;
    }
    if (!annotContext) {
      annotContext = {};
    }
    var thisContext = annotContext[this.id];
    if (thisContext && thisContext.presentedNameCreated) {
      // If we've already seen it, we really want to
      // return something simple; don't reformat. And, of course,
      // we don't need to add any events.
      return "<#>";
    } else {
      if (!thisContext) {
        
        thisContext = {
          annot: this,
          labelDisplayed: false,
          spanDisplayed: false,
          textDisplayed: false,
          attrsDisplayed: null,
          annotAttrsDisplayed: null,
          parentDisplayed: false,
          // This is a special flag for getPresentedName, so
          // that both it and format() can be entry points.
          presentedNameCreated: false
        }
      }

      if (formatString || (this.atype.display && this.atype.display.presented_name)) {
        // Record the annot context, because we're generating something.
        annotContext[this.id] = thisContext;
        thisContext.presentedNameCreated = true;
        var nameSpec = (this.atype.display && this.atype.display.presented_name) || formatString;
        var pat = new RegExp("[$][(]([^)]+)[)]", "g");
        var specialPat = new RegExp("^(_start|_end|_label|_text|_parent)($|:.+$)");
        var kvPat = new RegExp("(^:|,)(.+?)=(.+?)($|,)", "g");
        var result;
        var sList = [];      
        var lastI = 0;
        while ((result = pat.exec(nameSpec)) != null) {
          sList.push(nameSpec.substring(lastI, result.index));          
          var m = result[1];
          var kv = {};
          var subResult = specialPat.exec(m);
          if (subResult != null) {
            m = subResult[1];
            kvPat.lastIndex = 0;
            var kvResult = null;
            while ((kvResult = kvPat.exec(subResult[2])) != null) {
              kv[kvResult[2]] = kvResult[3];
              // Back up one, so I can pick up the comma again.
              kvPat.lastIndex -= 1;
            }
          }
          if (m == "_start") {
            if (this.atype.hasSpan) {
              sList.push("" + this.start);
              thisContext.spanDisplayed = true;
            } else {
              sList.push("(null)");
            }
          } else if (m == "_end") {
            if (this.atype.hasSpan) {
              thisContext.spanDisplayed = true;
              sList.push("" + this.end);
            } else {
              sList.push("(null)");
            }
          } else if (m == "_label") {
            thisContext.labelDisplayed = true;
            var e = this.getEffectiveDisplayEntry();
            var l = this.getEffectiveLabel();
            if (e && e.attr) {
              if (!thisContext.attrsDisplayed) {
                thisContext.attrsDisplayed = {};
              }
              thisContext.attrsDisplayed[e.attr] = true;
            }
            sList.push(l);
          } else if (m == "_parent") {
            thisContext.parentDisplayed = true;
            // get the parents.
            this.doc._buildInverseIdDict();
            var parents = this.doc._inverseIdDict[this.publicID];
            if (!parents) {
              sList.push("(null)");
            } else if (parents.length == 0) {
              sList.push("(null)");
            } else {
              var limit = parents.length;
              if (kv.truncate) {
                var trunc = parseInt(kv.truncate);
                if (trunc < 1) {
                  trunc = 1;
                }                  
                if (trunc < limit) {
                  limit = trunc;
                }
              }
              // If there are parents, format them. If we
              // reach trunc before the end, add "..." and break.
              sList.push("{ ");
              for (var w = 0; w < limit; w++) {
                if (w > 0) {
                  sList.push(", ");
                }
                var parent = parents[w];
                // kv can contain recursive info for format.
                var params = {
                  annotContext: annotContext
                }
                if (kv.showLabel == "no") {
                  params.dontShowLabel = true;
                }
                if (kv.showIndices == "yes") {
                  params.showIndices = true;
                }
                if (kv.showFormattedName == "yes") {
                  params.showFormattedName = true;
                }
                if (kv.showFeatures == "yes") {
                  params.showFeatures = true;
                }
                sList.push("in " + parent.attr + " of " + parent.annot.format(params));
              }
              if (limit < parents.length) {
                sList.push(", ...");
              }
              sList.push(" }");
            }
          } else if (m == "_text") {
            if (this.atype.hasSpan) {
              // Mark span displayed because if the span changes,
              // so must this display.
              thisContext.textDisplayed = true;
              var spanned = this.doc.signal.substring(this.start, this.end);
              if (kv.truncate) {
                var trunc = parseInt(kv.truncate);
                if (trunc < 5) {
                  trunc = 5;
                }
                if (spanned.length > trunc) {
                  var lastPart = Math.floor((trunc - 3)/ 2);
                  var firstPart = trunc - 3 - lastPart;
                  spanned = spanned.substr(0, firstPart) + "..." + spanned.substr(-lastPart);
                }
              }
              sList.push(spanned);
            } else {
              sList.push("(null)");
            }
          } else {
            var v = this.getAttributeValue(m);
            var attrObj = this.atype.attrs[this.atype.attrTable[m]];
            if (attrObj._typename == "annotation") {
              if (!thisContext.annotAttrsDisplayed) {
                thisContext.annotAttrsDisplayed = {};
              }
              thisContext.annotAttrsDisplayed[attrObj.name] = true;
            } else {
              if (!thisContext.attrsDisplayed) {
                thisContext.attrsDisplayed = {};
              }
              thisContext.attrsDisplayed[attrObj.name] = true;
            }
            if (v === undefined) {
              sList.push("(undefined)");
            } else {
              var params = {annotContext: annotContext};
              if (attrObj._typename == "annotation") {
                if (kv.showLabel == "no") {
                  params.dontShowLabel = true;
                }
                if (kv.showIndices == "yes") {
                  params.showIndices = true;
                }
                if (kv.showFormattedName == "yes") {
                  params.showFormattedName = true;
                }
                if (kv.showFeatures == "yes") {
                  params.showFeatures = true;
                }
              }
              sList.push(attrObj.convertToString(v, params));
            }
          }
          lastI = pat.lastIndex;
        }
        sList.push(nameSpec.substring(lastI));
        return sList.join("");
      } else if (this.atype.hasSpan) {
        // Record the annot context, because we're generating something.
        annotContext[this.id] = thisContext;
        // Mark span displayed because if the span changes,
        // so must this display.
        thisContext.textDisplayed = true;
        thisContext.presentedNameCreated = true;
        return this.doc.signal.substring(this.start, this.end);
      } else {
        return null;
      }
    }  
  },  

  // Again, don't think I can cache, because of recursion.
  getPresentedFeatures: function() {
    var annotContext = null;
    if (arguments.length > 0) {
      annotContext = arguments[0].annotContext;
    }
    if (!annotContext) {
      annotContext = {};
    }
    if (this.attrs.length == 0) {
      return null;
    } else {
      // I'm not sure I really need to fill this in in this
      // particular function (vs. format() or getPresentedName())
      // but I don't think it'll hurt.
      var thisContext = annotContext[this.id];
      if (!thisContext) {
        thisContext = {
          annot: this,
          labelDisplayed: false,
          spanDisplayed: false,
          textDisplayed: false,
          attrsDisplayed: null,
          annotAttrsDisplayed: null,
          parentDisplayed: false,
          // A special flag so that getPresentedName and format can both
          // be entry points.
          presentedNameCreated: false
        }
        annotContext[this.id] = thisContext;
      }
      var sList = [];
      for (var i = 0; i < this.attrs.length; i++) {
        if (this.attrs[i] != null) {
          var attrObj = this.atype.attrs[i];
          if (attrObj._typename == "annotation") {            
            if (!thisContext.annotAttrsDisplayed) {
              thisContext.annotAttrsDisplayed = {};
              thisContext.annotAttrsDisplayed[attrObj.name] = true;
            } else if (thisContext.annotAttrsDisplayed[attrObj.name]) {
              // Don't display an attr we already have.
              continue;
            } else {
              thisContext.annotAttrsDisplayed[attrObj.name] = true;
            }
          } else {
            if (!thisContext.attrsDisplayed) {
              thisContext.attrsDisplayed = {};
              thisContext.attrsDisplayed[attrObj.name] = true;
            } else if (thisContext.attrsDisplayed[attrObj.name]) {
              continue;
            } else {
              thisContext.attrsDisplayed[attrObj.name] = true;
            }
          }
          sList.push(attrObj.name+"="+attrObj.convertToString(this.attrs[i], {
            showAnnotationFormattedName: true,
            dontShowAnnotationLabel: true,
            annotContext: annotContext
          }));
        }
      }
      if (sList.length == 0) {
        return null;
      } else {
        return sList.join(" ");
      }
    }
  },

  // This is the primary entry point for formatting annotation names.
  // _toStringSingleValue for annotation attributes uses it, as does the
  // tool which creates an annotation name as a tiny registerable display.
  
  format: function(/* params */) {
    var showLabel = true;
    var expandEffectiveLabel = false;
    var showIndices = false;
    var showFormattedName = false;
    var formattedNameFormatString = null;
    var showFeatures = false;
    var annotContext = null;
    // I'm going to set it up so that I can get
    // a pair back, so I can construct things with the name
    // separately.
    var returnPair = false;
    if (arguments.length > 0) {
      var params = arguments[0];
      if (params.dontShowLabel) {
        showLabel = false;
      }
      if (params.expandEffectiveLabel) {
        expandEffectiveLabel = true;
      }
      if (params.showIndices) {
        showIndices = true;
      }
      if (params.showFormattedName) {
        showFormattedName = true;
      }
      if (params.formattedNameFormatString) {
        formattedNameFormatString = params.formattedNameFormatString;
      }
      if (params.showFeatures) {
        showFeatures = true;
      }
      if (params.annotContext) {
        annotContext = params.annotContext;
      }
      if (params.returnPair) {
        returnPair = true;
      }
    }

    // We're not going to collect the events to
    // register here - we'll figure them out if we need them later.

    // Note that we return something to cut off the recursion
    // if we have recursion, as indicated by the presence of
    // an entry in annotContext. However, we want to ensure that
    // getPresentedName doesn't get thrown off by this. So
    // we're going to introduce an additional flag here which
    // getPresentedName can test for.
    
    if (!annotContext) {
      annotContext = {};
    }
    var thisContext = annotContext[this.id];
    if (thisContext) {
      // If we've already seen it, we really want to
      // return something simple; don't reformat. And, of course,
      // we don't need to add any events.
      return "<#>";
    } else {
      thisContext = {
        annot: this,
        labelDisplayed: false,
        spanDisplayed: false,
        textDisplayed: false,
        attrsDisplayed: null,
        annotAttrsDisplayed: null,
        parentDisplayed: false,
        // An additional flag specifically for getPresentedName().
        presentedNameCreated: false
      }
      annotContext[this.id] = thisContext;
    }

    // Start with getting the presented name, just to see what
    // it includes. Then, show the label and indices and features
    // if necessary.

    var presentedName = null;
    if (showFormattedName) {
      presentedName = this.getPresentedName({annotContext: annotContext,
                                             formatString: formattedNameFormatString});
    }

    // Start with the label and features.
    // Add indices at the end if appropriate.
    // If there's a name, then show it with the rest in parentheses.

    var s = null;
    if (showLabel) {
      if (!thisContext.labelDisplayed) {
        thisContext.labelDisplayed = true;
        s = this.getEffectiveLabel();
        var e = this.getEffectiveDisplayEntry();
        if (e && e.attr) {
          if (!thisContext.attrsDisplayed) {
            thisContext.attrsDisplayed = {};
          }
          thisContext.attrsDisplayed[e.attr] = true;
          if (expandEffectiveLabel) {
            s += " ("+e.tag_name+" "+e.attr+"="+e.val+")";
          }
        }
      }
      if (showIndices && !thisContext.spanDisplayed) {
        if (s == null) {
          s = "";
        } else {
          s += " ";
        }
        if (this.atype.hasSpan) {
          s += "(" + this.start + "-" + this.end + ")";
          thisContext.spanDisplayed = true;
        } else {
          s += this.typeCounter;
        }
      }
      if (showFeatures) {
        // Always present the features. We may end up with nothing, if
        // it turns out that all the annotations are already presented.
        var features = this.getPresentedFeatures({annotContext: annotContext});
        if (features != null) {
          if (s == null) {
            s = features;
          } else {
            s += " " + features;
          }
        }
      }
    }

    // If the presented name is null, don't use it (duh).
    // And by default, we always use the label, even if
    // it wasn't requested.
    
    var lastResort = null;
    if ((presentedName == null) && (s == null)) {
      thisContext.labelDisplayed = true;
      var e = this.getEffectiveDisplayEntry();
      lastResort = this.getEffectiveLabel();
      if (e && e.attr) {
        if (!thisContext.attrsDisplayed) {
          thisContext.attrsDisplayed = {};
        }
        thisContext.attrsDisplayed[e.attr] = true;
        if (expandEffectiveLabel) {
          lastResort += " ("+e.tag_name+" "+e.attr+"="+e.val+")";
        }
      }
    }

    if (returnPair) {
      return [s || lastResort, presentedName];
    } else if (presentedName || s) {
      if (presentedName && s) {
        return presentedName + " (" + s + ")";
      } else {
        return presentedName || s;
      }
    } else {
      return lastResort;
    }
  }
           
});

// This is typically called from fromJSON(), but occasionally is called in other 
// circumstances. The problem now is that we need to have access to the task
// when we're creating this. Well, that DOES happen in fromJSON, pretty much. So let's
// not worry about it for now. At the moment, the attrs will be a list of 
// either simple Objects or AnnotationType objects.

// I'm going to put this object to multiple uses. It supports the annotation types
// inside document annotation sets, but ALSO the annotation types inside GLOBAL annotation
// sets, which admit things like effective labels. 

MAT.Annotation.AnnotationType = function(repository, label, attrs, hasSpan
                                         /*, {category: ..., set_name: ..., display: ...,
                                              effective_labels: ..., allAttributesKnown: ...} */) {
  this.repository = repository;
  this.label = label;
  this.attrs = [];
  this.hasSpan = hasSpan;
  this.hasAnnotationValues = false;
  // Choice attributes are singleton attributes with choice lists.
  // These are candidates for label restrictions. I'm going to
  // keep a cache of info about these so I can generate bit masks
  // to do quick comparisons.
  this.hasChoiceAttributeValues = false;
  this._choiceAttributeInfoCache = null;
  this.hasDefaults = false;
  this.allAttributesKnown = false;
  this.attrTable = {};
  this.display = null;  
  if (attrs != null) {
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      if ((attr.constructor === String) || (attr.constructor === Object)) {
        this.ensureAttributeFromDescriptor(attr);
      } else {
        this._addAttribute(attr);
      }
    }
  }
  // This information is task-level information, but I'm going
  // to put it here anyway.
  this.category = null;
  this.set_name = null;
  this.effective_labels = null;
  var effectiveLabelAttributes = {};
  if (arguments.length > 4) {
    var params = arguments[4];
    this.category = params.category || null;
    this.set_name = params.set_name || null;
    this.effective_labels = params.effective_labels || null;
    if (this.effective_labels) {
      // Check the effective labels to ensure that the true labels exist, and
      // that the attribute exists, and that the value meets the proper conditions.
      // It should ALREADY be the right type.
      for (var k in this.effective_labels) {
        if (this.effective_labels.hasOwnProperty(k)) {
          var labEntry = this.effective_labels[k];
          // 'attr': 'type', 'val': 'ORGANIZATION'
          var attr = this.attrTable[labEntry.attr];
          if (attr == null) {
            throw new MAT.Annotation.DocumentError("found an effective label " + k + " which refers to an attribute " + labEntry.attr + " which hasn't been defined for true label " + this.label);
          }
          attr = this.attrs[attr];
          if (attr.aggregation != null) {
            throw new MAT.Annotation.DocumentError("found an effective label " + k + " which refers to a non-singleton attribute " + labEntry.attr);
          }
          if ((attr._typename != "string") && (attr._typename != "int")) {
            throw new MAT.Annotation.DocumentError("found an effective label " + k + " which refers to a non-string, non-int attribute " + labEntry.attr);
          }
          if (!attr.choices) {
            throw new MAT.Annotation.DocumentError("found an effective label " + k + " which refers to an attribute " + labEntry.attr + " without choices");
          }
          if (labEntry.val == null) {
            throw new MAT.Annotation.DocumentError("found an effective label " + k + " whose attribute value is null");
          }
          if (!attr._checkSingleValue(null, labEntry.val)) {
            throw new MAT.Annotation.DocumentError("value " + labEntry.val + " is nt a legal value for attribute " + labEntry.attr + " of label " + this.label + " for effective label " + k);
          }
          effectiveLabelAttributes[labEntry.attr] = true;
        }
      }      
    }
    if (params.allAttributesKnown) {
      this.allAttributesKnown = true;
    }
    this.display = params.display || null;
  }

  // This will be populated by digestLabelRestrictions on AnnotationAttributeType.
  this.usedIn = false;
  this.usedInTable = {};
}

MAT.Annotation.AnnotationType.isContentType = function(category) {
  return category == "content";
}

MAT.Extend(MAT.Annotation.AnnotationType, {

  // An annotation type is editable if it has at least one
  // attribute which doesn't participate in any effective label, OR
  // it's pointed to by at least one type. The usedInTable needs to be
  // populated in order to know this. Note markUsedIn sets this.
  isEditable: function() {
    return this.usedIn || (this.attrs.length > 0);
  },

  // An annotation type is viewable if it has at least one
  // attribute which doesn't participate in any effective label.
  isViewable: function() {
    return (this.attrs.length > 0);
  },

  // The usedIn list is a list of labels to CONSIDER for attachment.
  markUsedIn: function(label, attrName) {
    var uiTable = this.usedInTable[label];
    if (!uiTable) {
      uiTable = {};
      this.usedInTable[label] = uiTable;
    }
    // Make this a hash from attribute names, to make it set-like.
    uiTable[attrName] = true;
    this.usedIn = true;
  },

  ensureAttributeFromDescriptor: function(attr) {    
    var name;
    var t;
    var params = {aggregation: null};
    if (attr.constructor === String) {
      // version 1.0 compatibility.
      name = attr;
      t = "string";
    } else {
      name = attr.name;
      t = attr.type;
      for (var k in attr) {
        if ((k != "name") && (k != "type")) {
          params[k] = attr[k];
        }
      }
    }
    // Now, convert this into an attribute.
    return this.ensureAttribute(name, t, params);
  },

  _addAttribute: function(attr) {
    if (attr.annotationType != null) {
      if (attr.annotationType != this) {
        throw new MAT.Annotation.DocumentError("attribute '" + attr.name + "' belongs to a different annotation type");
      }
    } else {
      attr.annotationType = this;
    }
    if (this.allAttributesKnown) {
      throw new MAT.Annotation.DocumentError("no attributes can be added to annotation type '" + this.label + "'");
    }
    if (this.attrTable[attr.name] !== undefined) {
      throw new MAT.Annotation.DocumentError("attribute '" + attr.name + "' is defined more than once");
    }
    if (attr._typename === "annotation") {
      this.hasAnnotationValues = true;
    }
    if (attr.hasDefault) {
      this.hasDefaults = true;
    }
    this.attrs.push(attr);
    this.attrTable[attr.name] = this.attrs.length - 1;
  },

  copy: function(newRepository) {
    var atype = new MAT.Annotation.AnnotationType(newRepository, this.label,
                                                  [], this.hasSpan, {
                                                    category: this.category,
                                                    set_name: this.set_name
                                                  });
    atype.display = this.display;
    // Ignore allAttributesKnown until after we copy.
    for (var i = 0; i < this.attrs.length; i++) {
      atype._addAttribute(this.attrs[i].copy(atype));
    }

    // These have already been checked, so don't pass them through the params.
    atype.effective_labels = this.effective_labels;
    atype.usedIn = this.usedIn;
    if (this.allAttributesKnown) {
      atype.allAttributesKnown = true;
    }
    // Copy the usedInTable.
    for (var k in this.usedInTable) {
      if (this.usedInTable.hasOwnProperty(k)) {
        var d = {};
        var entry = this.usedInTable[k];
        for (var q in entry) {
          if (entry.hasOwnProperty(q)) {
            d[q] = entry[q];
          }
        }
        atype.usedInTable[k] = d;
      }
    }
    return atype;
  },

  ensureAttribute: function (attrName, aType /*, params */) {
    if ((attrName == null) || (attrName.constructor !== String)) {
      throw new MAT.Annotation.DocumentError("attribute name must be string");
    }
    var i;
    if (this.attrTable[attrName] === undefined) {
      var attrType;
      if (aType == null) {
        attrType = MAT.Annotation.StringAttributeType;
      } else {
        attrType = MAT.Annotation.AttributeTypeTable[aType];
        if (attrType === undefined) {
          throw new MAT.Annotation.DocumentError("unknown attribute type '" + aType + "'");
        }
      }
      var params = {};
      if (arguments.length > 2) {
        params = arguments[2];
      }
      i = this._createAttributeType(attrType, attrName, params);
    } else {
      i = this.attrTable[attrName];
      if (aType !== null) {
        var aggr = null;
        if (arguments.length > 2) {
          aggr = arguments[2].aggregation || null;
        }
        if (aggr == "none") {
          aggr = null;
        }
        if ((this.attrs[i]._typename != aType) || (this.attrs[i].aggregation != aggr)) {
          throw new MAT.Annotation.DocumentError("requested annotation type doesn't match existing annotation type");
        }
      }
    }
    return i;
  },

  _createAttributeType: function(attrType, name, params) {
    if (this.allAttributesKnown) {
      throw new MAT.Annotation.DocumentError("no attributes can be added to annotation type '" + this.label + "'");
    }
    var newAttr = new attrType(this, name, params);
    var i = this.attrs.length;
    this.attrTable[name] = i;
    this.attrs.push(newAttr);
    if (newAttr._typename === "annotation") {
      this.hasAnnotationValues = true;
    }
    return i;
  },

  forEachDisplayEntry: function(fn) {
    if (this.display && this.display.css) {
      fn.call(this, this.label, this.label, this, null);
    }
    if (this.effective_labels) {
      for (var k in this.effective_labels) {
        if (this.effective_labels.hasOwnProperty(k)) {
          var eLabel = this.effective_labels[k];
          if (eLabel.display && eLabel.display.css) {
            fn.call(this, this.label, k, eLabel, this.attrs[this.attrTable[eLabel.attr]]);
          }
        }
      }
    }
  },

  // Internal management for choice attributes.
  
  // I'm going to set all these up as bitmasks in order
  // to facilitate rapid comparison between annotation
  // fillers and the positions they can fill.

  _recordChoiceAttribute: function(attr) {
    this.hasChoiceAttributeValues = true;
    if (this._choiceAttributeInfoCache === null) {
      this._choiceAttributeInfoCache = {
        maxPosition: 0,
        allBits: 0,
        attrMasks: {},
        valMasks: {}
      };
    }
    var attrMask = 0;
    var valMasks = {};
    this._choiceAttributeInfoCache.valMasks[attr.name] = valMasks;
    for (var choice in attr.choices) {
      if (attr.choices.hasOwnProperty(choice)) {
        var valMask = Math.pow(2, this._choiceAttributeInfoCache.maxPosition);
        this._choiceAttributeInfoCache.maxPosition++;
        valMasks[choice] = valMask;
        attrMask |= valMask;
      }
    }
    this._choiceAttributeInfoCache.attrMasks[attr.name] = attrMask;
    // Update allBits. This is the mask for everything.
    this._choiceAttributeInfoCache.allBits = Math.pow(2, this._choiceAttributeInfoCache.maxPosition) - 1;
  },

  // This is used in digesting the annotations.
  _generateChoiceBitsFromAnnot: function(annot) {
    // Assume that this is called only on annots which
    // are of this type.
    if (!this.hasChoiceAttributeValues) {
      return null;
    } else {
      var masks = this._choiceAttributeInfoCache.valMasks;
      var mask = 0;
      for (var k in masks) {
        if (masks.hasOwnProperty(k)) {
          var v = annot.getAttributeValue(k);
          if (v != null) {
            mask |= masks[k][v];
          }
        }
      }
      return mask;
    }
  },

  // This is used in digesting the label restrictions.
  _generateChoiceBitsFromAttrs: function(attrPairs) {
    if (!this.hasChoiceAttributeValues) {
      return null;
    } else {
      var masks = this._choiceAttributeInfoCache.valMasks;
      var mask = 0;
      for (var i = 0; i < attrPairs.length; i++) {
        mask |= masks[attrPairs[i][0]][attrPairs[i][1]];
      }
      return mask;
    }
  },

  _substituteChoiceBitCandidate: function(theseBits, attrName, candidateVal) {
    // candidateVal may be null.
    var cache = this._choiceAttributeInfoCache;
    // First, mask out the attribute. XOR the allBits with the
    // mask for this attr to get a vector which is 1 for everything
    // BUT this attr, and AND it with theseBits.
    theseBits &= (cache.attrMasks[attrName] ^ cache.allBits);
    if (candidateVal != null) {
      // Now, if there's a candidate val, OR in the value.
      return theseBits | cache.valMasks[attrName][candidateVal];
    } else {
      return theseBits;
    }
  },

  // This is very similar to _choiceAttributeOK above, but more
  // efficient. And we have to make sure that null is considered.
  
  _permittedChoiceAttributes: function(annot) {
    if (!this.hasChoiceAttributeValues) {
      return null;
    } else if (!annot.publicID) {
      // It's not attached.
      return null;
    } else {
      var doc = annot.doc;
      doc._buildInverseIdDict();      
      var refs = doc._inverseIdDict[annot.publicID];
      if (!refs) {
        // No refs.
        return null;
      } else {
        var baseBits = this._generateChoiceBitsFromAnnot(annot);
        // First, go through the available choices and create
        // possible settings for all of them.
        var cache = this._choiceAttributeInfoCache;
        var masks = cache.valMasks;
        var enabledCache = {};
        var candidateEntries = [];
        for (var k in masks) {
          if (masks.hasOwnProperty(k)) {
            var thisAttrEntry = masks[k];
            enabledCache[k] = {
              nullCandidate: true,
              valCandidates: {}
            };
            for (var j in thisAttrEntry) {
              if (thisAttrEntry.hasOwnProperty(j)) {
                var localMask = thisAttrEntry[j];
                enabledCache[k].valCandidates[j] = true;
                candidateEntries.push({
                  attr: k,
                  val: j,
                  enabled: true,
                  // See _substituteChoiceBitCandidate above.
                  candBits: (baseBits & (cache.attrMasks[k] ^ cache.allBits)) | localMask
                });
              }
            }
            // And null.
            candidateEntries.push({
              attr: k,
              val: null,
              enabled: true,
              candBits: (baseBits & (cache.attrMasks[k] ^ cache.allBits))
            });
          }
        }        

        // So now we have a set of refs, and what I need
        // to do is, for each ref, test each entry in
        // the candidateEntries.
        for (var i = 0; i < refs.length; i++) {
          var ref = refs[i];
          var attrObj = ref.annot.atype.attrs[ref.annot.atype.attrTable[ref.attr]];
          for (var w = 0; w < candidateEntries.length; w++) {
            if (candidateEntries[w].enabled &&
                !attrObj._choicesSatisfyRestrictions(annot.atype.label, candidateEntries[w].candBits)) {
              candidateEntries[w].enabled = false;
              if (candidateEntries[w].val === null) {
                enabledCache[candidateEntries[w].attr].nullCandidate = false;
              } else {
                enabledCache[candidateEntries[w].attr].valCandidates[candidateEntries[w].val] = false;
              }
            }
          }
        }
        return enabledCache;
      }
    }
  }

  
});


/*
 * The type repository. Not sure it does much.
 */

MAT.Annotation.DocumentAnnotationTypeRepository = function(doc) {
  this.doc = doc;
  // All documents have the untaggable type.
  this.typeTable = {};
  this.annotTable = {};
  // We set this in fromJSON, or other places.
  this.globalATR = null;
};

MAT.Extend(MAT.Annotation.DocumentAnnotationTypeRepository, {

  // Regardless of whether there are any annotations yet or not.
  hasSpanlessContentAnnotationTypes: function() {
    for (var k in this.typeTable) {
      if (this.typeTable.hasOwnProperty(k)) {
        if ((this.typeTable[k].category == "content") && !this.typeTable[k].hasSpan) {
          return true;
        }
      }
    }
    if (this.globalATR) {
      for (var k in this.globalATR.typeTable) {
        if (this.globalATR.typeTable.hasOwnProperty(k)) {
          if ((this.globalATR.typeTable[k].category == "content") && !this.globalATR.typeTable[k].hasSpan) {
            return true;
          }
        }
      }
    }
    return false;
  },

  setGlobalAnnotationTypeRepository: function(globalATR) {
    if ((this.globalATR != null) && (this.globalATR != globalATR)) {
      throw new MAT.Annotation.DocumentError("global annotation type repository for document is already set to a different repository");
    }
    this.globalATR = globalATR;
  },
  
  findAnnotationType: function(label /*, hasSpan, create */) {
    var hasSpan = true;
    var create = true;
    if (arguments.length > 1) {
      hasSpan = arguments[1];
      if (arguments.length > 2) {
        create = arguments[2];
      }
    }
    var localT = this.typeTable[label];
    if (localT) {
      if (localT.hasSpan != hasSpan) {
        throw new MAT.Annotation.DocumentError("requesting an annotation type whose hasSpan value doesn't match");
      }
      return localT;
    } else if (this.globalATR) {
      // This will not create an annotation type, no matter what.
      var localT = this.globalATR.findAnnotationType(label, this, hasSpan, false);
      // And whenever I use this, I'm trying to create an annotation type.
      if ((!localT) && (!this.globalATR.allAnnotationsKnown)) {
        // Make a new one.
        localT = new MAT.Annotation.AnnotationType(this, label, [], hasSpan);
      }
      this.typeTable[label] = localT;
      return localT;
    } else if (create) {
      localT = new MAT.Annotation.AnnotationType(this, label, [], hasSpan);
      this.typeTable[label] = localT;
      return localT;
    }
  },

  getAnnotations: function(label) {
    return this.annotTable[label] || [];
  },

  addAnnotation: function(annot) {
    var entry = this.annotTable[annot.atype.label];
    if (entry == null) {
      this.annotTable[annot.atype.label] = [annot];
      annot.typeCounter = 0;
    } else {
      annot.typeCounter = entry.length;
      entry.push(annot);
    }
  },

  removeAnnotation: function(annot) {
    var annotList = this.annotTable[annot.atype.label];
    if (annotList) {
      for (var i = 0; i < annotList.length; i++) {
        if (annotList[i] == annot) {
          annotList.splice(i, 1);
          break;
        }
      }
    }
  }
  
});

MAT.Annotation.AnnotatedDoc = function () {
  this.zones = [];
  this.signal = "";
  this.annotTypes = new MAT.Annotation.DocumentAnnotationTypeRepository(this);
  // These take care of monitoring the IDs.
  this._idDict = {};
  this._internalIdDict = {};
  this._idCount = 0;
  // A hash from annotation IDs to locations of an annotation,
  // which are the annot in which it's found and the attribute in which
  // it's found.
  this._inverseIdDict = null;
  // This is the object which manages redisplays of various
  // annotations, etc.
  this.rd = new MAT.Annotation.RedisplayDispatcher(this);
}

MAT.Annotation.NullType = {category: ""};

MAT.Extend(MAT.Annotation.AnnotatedDoc, {

  hasSpanlessContentAnnotationTypes: function() {
    return this.annotTypes.hasSpanlessContentAnnotationTypes();
  },

  forceRedisplay: function(source, events) {
    this.rd.fireGestureEvents(source, events);
  },

  addVisualDisplay: function(disp) {
    this.rd.registerDocDisplay(disp);
  },
    
  removeVisualDisplay: function(disp) {
    this.rd.unregisterDocDisplay(disp);
  },    

  clearIDReferences: function () {
    this._inverseIdDict = null;
  },

  _generateID: function(annot) {
    var i = this._idCount++;
    i = "" + i;
    this._idDict[i] = annot;
    return i;
  },

  // Note that copyAnnotation() should be used for copying annotations WITHIN a document.
  // It doesn't copy annotation-valued features, so it can't be used to copy
  // across documents. The two conditions below might suggest that the second
  // involves a different document, but it doesn't - it involves a case where the
  // atype may be different for some odd reason.

  // Note, too, that unlike createAnnotation(), this method does NOT add the
  // annotation to the document.
  
  copyAnnotation: function(annot /*, {keepAnnotationValuedAttributes: true/false} */) {
    var keepAnnotationValuedAttributes = true;
    if (arguments.length > 1) {
      if (arguments[1].keepAnnotationValuedAttributes === false) {
        keepAnnotationValuedAttributes = false;
      }
    }
    if (this.annotTypes.typeTable[annot.atype.label] === annot.atype) {
      // They're the same document. If any of the values are sets or lists, those
      // have to be copied.
      var newAttrs = [];
      for (var i = 0; i < annot.attrs.length; i++) {
        var val = annot.attrs[i];
        if ((!keepAnnotationValuedAttributes) && (annot.atype.attrs[i]._typename == "annotation")) {
          val = null;          
        }
        if (val && ((val.constructor === MAT.Annotation.AttributeValueSequence) ||
                    (val.constructor === MAT.Annotation.AttributeValueList))) {
          val = val.copy();
        }
        newAttrs.push(val);
      }
      var a = new MAT.Annotation.Annotation(this, annot.atype, annot.start, annot.end, null, newAttrs);
      if (annot.atype.hasAnnotationValues) {
        // Just in case. We don't need to add an ID
        // to the things in the attrs list, because if they were in the
        // attrs list, they should already have an ID.
        this.clearIDReferences();
      }
      return a;
    } else {
      var a = new MAT.Annotation.Annotation(this, this.annotTypes.typeTable[annot.atype.label], annot.start, annot.end, null, []);
      if (annot.atype.hasAnnotationValues) {
        this.clearIDReferences();
      }
      for (var i = 0; i < annot.attrs.length; i++) {
        var val = annot.attrs[i];
        if ((!keepAnnotationValuedAttributes) && (annot.atype.attrs[i]._typename == "annotation")) {
          val = null;          
        }
        if (val && ((val.constructor === MAT.Annotation.AttributeValueSequence) ||
                    (val.constructor === MAT.Annotation.AttributeValueList))) {
          val = val.copy();
        }
        a.setAttributeValue(annot.atype.attrs[i].name, val);
      }
      return a;
    }
  },

  registerAnnotationReference: function(a) {
    a.getID();
    this.clearIDReferences();
  },

  registerID: function(id, annot) {
    if (this._idDict[id] !== undefined) {
      throw new MAT.Annotation.DocumentError("duplicate annotation id '" + id + "'");
    }
    var i = parseInt(id);
    if (!isNaN(i)) {
      if (i < 0) {
        throw new MAT.Annotation.DocumentError("annotation ID is < 0");
      }
      this._idCount = Math.max(this._idCount, i + 1);
    }
    this._idDict[id] = annot;      
  },  

  // The globalATR is a GlobalAnnotationTypeRepository.
  
  fromJSON: function (jsonStruct, globalATR) {
    this.annotTypes.setGlobalAnnotationTypeRepository(globalATR);
    this.signal = jsonStruct.signal;
    if (jsonStruct.version === undefined) {
      this.version = 1;
    } else {
      this.version = jsonStruct.version;
    }
    if (this.version > 2) {
      throw new MAT.Annotation.DocumentError("MAT-JSON version is later than version 2");
    }
    this.metadata = jsonStruct.metadata;
    // Squash this. The UI backend isn't checking the values,
    // and it's not updated appropriately until save. 
    this.metadata.phasesDone = [];
    var annotMap = {};
    var aPairs = [];
    var zoneTypeFound = false;
    if (jsonStruct.asets) {
      for (var i = 0; i < jsonStruct.asets.length; i++) {
        var aset = jsonStruct.asets[i];
        // BACKWARD COMPATIBILITY. If there HAPPEN to be untaggable
        // annotations in the document, REMOVE THEM. We will recreate
        // them later. This could backfire horribly if, someday, someone
        // tries to use untaggable as a real annotation, but we're not
        // about to worry about that right now.
        if (aset.type == "untaggable") {
          continue;
        }
        var hasSpan = aset.hasSpan;
        if (hasSpan === undefined) {
          hasSpan = true;
        }
        var hasID = aset.hasID;
        if (hasID === undefined) {
          hasID = false;
        }

        var t = this.annotTypes.findAnnotationType(aset.type, hasSpan);
        if (t.category == "zone") {
          // Found a zone annotation type. So we know that zoning has happened.
          // We can't use the annotation name, we have to use the type.
          zoneTypeFound = true;
        }

        var attrIndices = [];
        for (var k = 0; k < aset.attrs.length; k++) {
          attrIndices.push(t.ensureAttributeFromDescriptor(aset.attrs[k]));
        }
        
        var digesters = [];
        // Hash from indices to attribute name and digester.
        var annotIndices = {};
        var maybeAnnotVals = false;
        for (var j = 0; j < t.attrs.length; j++) {
          var attrObj = t.attrs[j];
          if (attrObj._typename == "annotation") {
            // The ids are all strings.
            maybeAnnotVals = true;
            if (attrObj.aggregation == "list") {
              digesters.push(function (x) {
                if (x == null) {
                  return null;
                } else {
                  var val = [];
                  for (var k = 0; k < x.length; k++) {
                    val.push(annotMap[x[k]]);
                  }
                  return new MAT.Annotation.AttributeValueList(val);
                }
              });
            } else if (attrObj.aggregation == "set") {
              digesters.push(function (x) {
                if (x == null) {
                  return null;
                } else {
                  var val = [];
                  for (var k = 0; k < x.length; k++) {
                    val.push(annotMap[x[k]]);
                  }
                  return new MAT.Annotation.AttributeValueSet(val);
                }
              });
            } else {
              digesters.push(function (x) { return ((x != null) ? annotMap[x] : null); });
            }
            annotIndices[j] = {name: attrObj.name, digester: digesters[digesters.length - 1]};
          } else if (attrObj.aggregation == "set") {
            digesters.push(function (x) {return ((x != null) ? new MAT.Annotation.AttributeValueSet(x) : null); });
          } else if (attrObj.aggregation == "list") {
            digesters.push(function (x) {return ((x != null) ? new MAT.Annotation.AttributeValueList(x) : null); });
          } else {
            digesters.push(function (x) { return x; });
          }
        }      
              
        // We're always building a new document here, so
        // if you look at the Python version, we collect attrIndices and attrTypes,
        // but we can just use the ones in the annotation type we just
        // built.      
        for (var j = 0; j < aset.annots.length; j++) {
          var aSeq = aset.annots[j];
          var aI = 0;
          var start = null;
          var end = null;
          var publicID = null;
          if (hasSpan) {
            start = aSeq[0];
            end = aSeq[1];
            aI = 2;
          }
          if (hasID) {
            publicID = aSeq[aI];
            if (publicID != null) {
              // Increment the idcount.
              this._idCount = Math.max(this._idCount, parseInt(publicID) + 1);
            }
            aI += 1;
          }
          var a = null;
          // If there are annotation values, don't add the attribute values yet.
          // The order of attributes in the annotation NO LONGER NECESSARILY MATCHES
          // the order of the attributes in the type, since the type is inherited
          // from the global annotation type repository.
          // Actually, postpone ONLY the annotation-valued attributes themselves;
          // otherwise, if you have an annotation with an effective label
          // AND annotation-valued attributes, if it's a value of
          // some other annotation-valued attribute which expects the
          // effective label to be set, you'll be hosed.

          if (digesters.length > 0) {
            var trueVals = [];
            var annotVals = [];
            for (var k = aI; k < aSeq.length; k++) {
              var attrIdx = attrIndices[k - aI];
              // Pad it!
              while (trueVals.length < (attrIdx + 1)) {
                trueVals.push(null);
              }
              if (annotIndices[attrIdx]) {
                // Postpone it.
                annotVals.push({val: aSeq[k], digester: digesters[k - aI], idx: attrIdx})
              } else {
                trueVals[attrIdx] = digesters[k - aI](aSeq[k]);
              }
            }
            a = new MAT.Annotation.Annotation(this, t, start, end, publicID, trueVals);
            if (maybeAnnotVals) {
              aPairs.push([a, annotVals]);
            }
          } else {
            a = new MAT.Annotation.Annotation(this, t, start, end, publicID, []);
          }
          if (publicID != null) {
            annotMap[publicID] = a;
          }
          // Add the annotation.
          this.addAnnotation(a);
        }
      }
      
      for (var k = 0; k < aPairs.length; k++) {
        var a = aPairs[k][0];
        var aEntries = aPairs[k][1];
        for (var w = 0; w < aEntries.length; w++) {
          var aEntry = aEntries[w];
          a.setAttributeValue(a.atype.attrs[aEntry.idx].name, aEntry.digester(aEntry.val));
        }
      }
    }
    
    // OK. Now that we have all the zone annotations, we have to
    // add in the untaggable annotations in the interstices.
    // BUT. We only want to do this if the zone phase is done. Because
    // if we don't check that, we can't tell the difference between zoning
    // not being done (in which case we don't want any untaggable regions)
    // and zoning being done and not finding any annotations (in which case
    // it should be one big untaggable region).

    // We can't look for the "zone" step, because (a) it's a name, and
    // (b) it's not passed in subsequent steps. So the document has
    // to stand on its own. Fortunately, the backend addZones() method
    // adds the annotation type, so we should look for that.

    if (zoneTypeFound) {
      var zoneAnnots = [];
      var untaggableType = this.annotTypes.findAnnotationType("untaggable", true);
      for (var label in this.annotTypes.typeTable) {
        var aType = this.annotTypes.typeTable[label];
        if (aType.category == "zone") {
          zoneAnnots = zoneAnnots.concat(this.annotTypes.getAnnotations(label));
        }
      }
      zoneAnnots.sort(function (x, y) { return x.start - y.start });
      var startI = 0;
      for (var i = 0; i < zoneAnnots.length; i++) {
        var annot = zoneAnnots[i];
        if (annot.start > startI) {
          this.addAnnotation(new MAT.Annotation.Annotation(this, untaggableType, startI, annot.start, null, []));
        }
        startI = annot.end;
      }
      if (startI < this.signal.length) {
        this.addAnnotation(new MAT.Annotation.Annotation(this, untaggableType, startI, this.signal.length, null, []));
      }
    }

    // Now, let's look at all the SEGMENTs (if they exist), and see if 
    // any of them are non-gold and non-null. If this is the case,
    // annotation is underway. MACHINE counts, since all we care about
    // is if annotation is underway, not if it's hand annotation.
    
    var segType = this.annotTypes.typeTable.SEGMENT;
    if (segType) {
      var segAnnots = this.annotTypes.getAnnotations("SEGMENT");
      for (var i = 0; i < segAnnots.length; i++) {
        var annot = segAnnots[i];
        var human = annot.getAttributeValue("annotator");
        if ((human !== undefined) && (human !== null)) {
          var status = annot.getAttributeValue("status");
          if (status == "non-gold") {
            // We only need to figure it out once.
            this.metadata.annotation_underway = true;
            break;
          }
        }
      }
    }
    return this;
  },

  // Let's take the easy way out here. Let's map to and from JSON.
  // This will force the recreation of untaggables, but whatever. 
  
  copy: function () {
    return new MAT.Annotation.AnnotatedDoc().fromJSON(this.toJSON(), this.annotTypes.globalATR);
  },
  
  addAnnotation: function(annot) {
    this._internalIdDict[annot.id] = annot;
    this.annotTypes.addAnnotation(annot);
    if (annot.publicID) {
      this.registerID(annot.publicID, annot);
    }
  },

  
  // create a spanned annotation and add it to the document.
  createAnnotation: function(atype, start, end /*, attrDict */) {
    if (atype.constructor == String) {
      atype = this.annotTypes.findAnnotationType(atype);
    }
    var a = new MAT.Annotation.Annotation(this, atype, start, end, null, null);
    if (arguments.length > 3) {
      var attrDict = arguments[3];
      for (var k in attrDict) {
        if (attrDict.hasOwnProperty(k)) {
          var v = attrDict[k];
          if (v != null) {
            a.setAttributeValue(k, v);
          }
        }
      }
    }
    this.addAnnotation(a);
    return a;
  },

  // create a spanless annotation and add it to the document.
  createSpanlessAnnotation: function(atype /*, attrDict */) {
    if (atype.constructor == String) {
      atype = this.annotTypes.findAnnotationType(atype, false);
    }
    var a = new MAT.Annotation.Annotation(this, atype, null, null, null, null);
    if (arguments.length > 1) {
      var attrDict = arguments[1];
      for (var k in attrDict) {
        if (attrDict.hasOwnProperty(k)) {
          var v = attrDict[k];
          if (v != null) {
            a.setAttributeValue(k, v);
          }
        }
      }
    }
    this.addAnnotation(a);
    return a;
  },

  // The document should be marked as hand annotated by
  // some human or other. Make sure the segments that
  // overlap the start and end indices are marked as
  // non-gold and assigned to the human specified.
  
  markHandAnnotated: function(startI, endI, who) {
    this.metadata.annotation_underway = true;
    var segType = this.annotTypes.typeTable.SEGMENT;
    if (!segType) {
      // We should NEVER be here, but it's possible.
      this.annotTypes.typeTable.SEGMENT = new MAT.Annotation.AnnotationType(this.annotTypes, "SEGMENT", ["annotator", "status"], true, {category: "admin"});
      segType = this.annotTypes.typeTable.SEGMENT;
      // One segment for each zone annotation.
      for (var k in this.annotTypes.typeTable) {
        if (this.annotTypes.typeTable[k].category == "zone") {
          // Use the first one.
          var zoneAnnots = this.annotTypes.getAnnotations(k);
          for (var j = 0; j < zoneAnnots.length; j++) {
            var z = zoneAnnots[j];
            this.addAnnotation(new MAT.Annotation.Annotation(this, this.annotTypes.typeTable.SEGMENT, z.start, z.end, null, [null, "non-gold"]));
          }
          break;
        }
      }
    }
    // Now that we've dealt with that unpleasantness, let's move on.
    var segAnnots = this.annotTypes.getAnnotations("SEGMENT");
    for (var i = 0; i < segAnnots.length; i++) {      
      var annot = segAnnots[i];
      // If the start and end indices overlap, then mark it.
      if ((endI > annot.start) && (startI < annot.end)) {
        annot.setAttributeValue("annotator", who);
        annot.setAttributeValue("status", "non-gold");
      }
    }
  },

  // Removing annotations is tricky. You need to ensure that the group
  // of annotations includes all the annotations which point to the
  // IDs represented.

  _buildInverseIdDict: function () {
    if (this._inverseIdDict === null) {
      var d = {};
      this._inverseIdDict = d;
      for (var k in this.annotTypes.typeTable) {
        var atype = this.annotTypes.typeTable[k];
        if (atype.hasAnnotationValues) {
          var annots = this.annotTypes.getAnnotations(k);
          for (var i = 0; i < annots.length; i++) {
            var annot = annots[i];
            for (var j = 0; j < annot.attrs.length; j++) {
              var attrObj = annot.atype.attrs[j];
              var attr = annot.attrs[j];
              if ((attrObj._typename == "annotation") && (attr != null)) {
                var aName = attrObj.name;
                var aAggr = attrObj.aggregation;
                if (attr && (attr.constructor === MAT.Annotation.Annotation)) {
                  if (d[attr.publicID]) {
                    d[attr.publicID].push({attr: aName, annot: annot});
                  } else {
                    d[attr.publicID] = [{attr: aName, annot: annot}];
                  }
                } else if (attr && ((attr.constructor === MAT.Annotation.AttributeValueSet) ||
                                    (attr.constructor === MAT.Annotation.AttributeValueList)) &&
                           attr.ofAttribute && (attr.ofAttribute.constructor === MAT.Annotation.AnnotationAttributeType)) {
                  var size = attr.size();
                  for (var k = 0; k < size; k++) {
                    var subval = attr.elements[k];
                    // I don't think I care that this is in an aggregation,
                    // but let's record it anyway.
                    if (d[subval.publicID]) {
                      d[subval.publicID].push({attr: aName, annot: annot, aggregation: aAggr});
                    } else {
                      d[subval.publicID] = [{attr: aName, annot: annot, aggregation: aAggr}];
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },

  removeAnnotationGroup: function(annotList) {
    this._removeAnnotationGroup(annotList, null);
  },

  removeAnnotationGroupViaUI: function(annotList, gestureList) {
    this._removeAnnotationGroup(annotList, gestureList);
  },

  // This is defined so that we can augment the gesture list
  // in the UI. Again, all the gesture and UI response stuff should ultimately be
  // migrated to here anyway.
  
  _removeAnnotationGroup: function(annotList, gestureList) {
    var externalPointers = {};
    var setToRemove = {};
    for (var i = 0; i < annotList.length; i++) {
      var annot = annotList[i];
      setToRemove[annot.id] = true;
      if (annot.publicID) {
        // Make sure the inverse dict is built. This will
        // only happen once.
        this._buildInverseIdDict();
        var refs = this._inverseIdDict[annot.publicID];
        if (refs) {
          // We need set operations, but we don't really have them.
          // Fortunately, each annotation has an ID, in addition to the
          // POSSIBLE public ID.
          for (var j = 0; j < refs.length; j++) {
            // I'm just collecting these to check the comprehensiveness
            // of the set - I don't care about the individual links.
            externalPointers[refs[j].annot.id] = refs[j].annot;
          }
        }
      }
    }
    // The external pointers must ALL be referenced in the
    // annotList.
    if (externalPointers) {
      for (var i = 0; i < annotList.length; i++) {
        delete externalPointers[annotList[i].id];
      }
      // If there are ANY keys left, you're hosed.
      for (var k in externalPointers) {
        throw new MAT.Annotation.DocumentError("a group of annotations to be removed can't be pointed at by annotations outside the group");
      }      
    }
    for (var j = 0; j < annotList.length; j++) {
      this._removeAnnotation(annotList[j], setToRemove, gestureList);
    }
  },
  
  removeAnnotation: function(annot) {
    if (annot.publicID) {
      this._buildInverseIdDict();
      var refs = this._inverseIdDict[annot.publicID];
      if (refs) {
        for (var j = 0; j < refs.length; j++) {
          if (refs[j].annot !== annot) {
            // Hosed. If anybody refers to you, it better be a self-reference.
            throw new MAT.Annotation.DocumentError("a group of annotations to be removed can't be pointed at by annotations outside the group");
          }
        }
      }
    }
    var setToRemove = {};
    setToRemove[annot.id] = true;
    this._removeAnnotation(annot, setToRemove, null);
  },

  // If there's a gesture list, we must tell anything
  // the annotation is attached to that's OUTSIDE THE SET TO DELETE
  // that this is being detached; similarly, anything that's
  // attached to it that's OUTSIDE THE SET TO DELETE.
  
  _removeAnnotation: function(annot, setToRemove, gestureList) {
    for (var i = 0; i < annot.attrs.length; i++) {
      var attr = annot.attrs[i];
      if (attr && (attr.constructor === MAT.Annotation.Annotation)) {
        if (this._inverseIdDict) {
          // I may not have had to build it, if the annotation
          // wasn't referenced.           
          var refs = this._inverseIdDict[attr.publicID];
          // If we've already removed the annotation that's here
          // in the attrs list as part of a group remove, this may
          // not be here.
          if (refs) {
            for (var j = 0; j < refs.length; j++) {
              if (refs[j].annot == annot) {
                if (gestureList && !setToRemove[attr.id]) {
                  gestureList.push({
                    event_name: "detach_from_parent",
                    attr_name: refs[j].attr,
                    parent_annot: annot,
                    annot: attr
                  });
                }
                refs.splice(j, 1);
              }
            }
          }
        }
      } else if (attr && ((attr.constructor === MAT.Annotation.AttributeValueSet) ||
                          (attr.constructor === MAT.Annotation.AttributeValueList)) &&
                 attr.ofAttribute && (attr.ofAttribute.constructor === MAT.Annotation.AnnotationAttributeType)) {
        if (this._inverseIdDict) {
          // I may not have had to build it, if the annotation
          // wasn't referenced.  
          var size = attr.size();
          for (var k = 0; k < size; k++) {
            var subval = attr.elements[k];
            var refs = this._inverseIdDict[subval.publicID];
            // If we've already removed the annotation that's here
            // in the attrs list as part of a group remove, this may
            // not be here.
            if (refs) {
              for (var j = 0; j < refs.length; j++) {
                if (refs[j].annot == annot) {
                  if (gestureList && !setToRemove[subval.id]) {
                    gestureList.push({
                      event_name: "detach_from_parent",
                      attr_name: refs[j].attr,
                      parent_annot: annot,
                      annot: subval
                    });
                  }
                  refs.splice(j, 1);
                }
              }
            }
          }
        }
      }
    }

    // Remove all traces of the annotation. AFTER we do the inverse thing.
    if (annot.publicID) {
      delete this._idDict[annot.publicID];
      if (this._inverseIdDict) {
        if (gestureList) {          
          var refs = this._inverseIdDict[annot.publicID];
          if (refs) {
            for (var i = 0; i < refs.length; i++) {
              if (!setToRemove[refs[i].annot.id]) {
                gestureList.push({
                  event_name: "detach_child",
                  attr_name: refs[i].attr,
                  annot: refs[i].annot,
                  child_annot: annot
                });
              }
            }
          }
        }
        delete this._inverseIdDict[annot.publicID];
      }
    }
    delete this._internalIdDict[annot.id];

    this.annotTypes.removeAnnotation(annot);
  },

  // If sorted is true, then we can't use the atypes which
  // are spanless.
  allContentAnnotations: function(/* {spannedOnly: true, spanlessOnly: true, ordered: true } */) {
    var params;
    if (arguments.length > 0) {
      params = arguments[0];
    } else {
      params = {};
    }
    var spannedOnly = params.spannedOnly;
    var spanlessOnly = params.spanlessOnly;
    var ordered = params.ordered;
    // Not going to throw an error here. ordered takes precedence
    // over spanlessOnly. If both are specified, neither are specified.
    if (spannedOnly && spanlessOnly) {
      spannedOnly = spanlessOnly = false;
    }
    if (ordered) {
      spannedOnly = true;
      spanlessOnly = false;
    }
    var annots = [];
    // Collect all the nominatable annotations.
    for (var label in this.annotTypes.typeTable) {
      var atype = this.annotTypes.typeTable[label];
      if (MAT.Annotation.AnnotationType.isContentType(atype.category)) {
        if ((atype.hasSpan && !spanlessOnly) || ((!atype.hasSpan) && !spannedOnly)) {
          annots = annots.concat(this.annotTypes.getAnnotations(label));
        }
      }
    }
    
    if (ordered) {
      annots.sort(function (x, y) { return x.start - y.start });
    }
    return annots;
  },

  // Helpers for toJSON.

  _renderAnnotationSingleValue: function (v) {
    if (v == null) {
      return v;
    } else {
      return v.publicID;
    }
  },
    
  _renderSequence: function(v) {
    if (v == null) {
      return v;
    } else {
      return v.elements;
    }
  },

  _renderAnnotationSequence: function(v) {
    if (v == null) {
      return v;
    } else {
      var val = [];
      for (var i = 0; i < v.elements.length; i++) {
        val.push(v.elements[i].publicID);
      }
      return val;
    }
  },

  // DO NOT CALL THIS DIRECTLY. Use the serialize() method of the current task.
  
  toJSON: function() {
    var struct = {signal: this.signal, version: 2, metadata: {}, asets: []};
    // Squash phasesDone. The UI backend isn't checking the values,
    // and it's not updated appropriately until save. But
    // let's just make sure that we don't hurt it TOO much.
    // Rendering to JSON should change the document itself.
    for (key in this.metadata) {
      // annotation_underway is for local consumption.
      if (key == "annotation_underway") {
        continue;
      }
      struct.metadata[key] = this.metadata[key];
    }
    struct.metadata.phasesDone = [];
    for (var label in this.annotTypes.typeTable) {
      var t = this.annotTypes.typeTable[label];
      // As of MAT 2.0, untaggable is now a UI-only annotation type. It must be
      // removed before serializing.
      if (t.category == "untaggable") {
        continue;
      }
      var hasSpan = t.hasSpan;
      var hasID = false;
      var atypeDict = {
        type: label,
        hasSpan: hasSpan,
        attrs: [],
        annots: []};
      // Add the annotations.
      var theseAnnots = this.annotTypes.getAnnotations(label);
      for (var i = 0; i < theseAnnots.length; i++) {
        if (theseAnnots[i].publicID !== null) {
          atypeDict.hasID = true;
          hasID = true;
          break;
        }
      }
      var meths = [];
      for (var i = 0; i < t.attrs.length; i++) {
        var attrObj = t.attrs[i];
        atypeDict.attrs.push({name: attrObj.name, type: attrObj._typename, aggregation: attrObj.aggregation});
        if (attrObj.constructor === MAT.Annotation.AnnotationAttributeType) {
          if (attrObj.aggregation == null) {
            meths.push(this._renderAnnotationSingleValue);
          } else {
            meths.push(this._renderAnnotationSequence);
          }
        } else if (attrObj.aggregation != null) {
          meths.push(this._renderSequence);
        } else {
          meths.push(function (x) { return x; });
        }
      }
      for (var i = 0; i < theseAnnots.length; i++) {
        var entry = [];
        var a = theseAnnots[i];
        for (var j = 0; j < a.attrs.length; j++) {
          // Don't need to call(), since this isn't referenced.
          entry.push(meths[j](a.attrs[j]));          
        }
        if (hasSpan && hasID) {
          entry.splice(0, 0, a.start, a.end, a.publicID);
        } else if (hasID) {
          entry.splice(0, 0, a.publicID);
        } else if (hasSpan) {
          entry.splice(0, 0, a.start, a.end);
        }
        atypeDict.annots.push(entry);
      }
      struct.asets.push(atypeDict);
    }
    return struct;
  },

  // for reconciliation documents.

  isReconciliationDoc: function() {
    return this.metadata.reconciliation_doc === true;
  },

  isComparisonDoc: function() {
    return this.metadata.comparison !== undefined;
  },

  getVoteMap: function() {
    if (!this.metadata.reconciliation_doc) {
      return null;
    } else {
      var m = {};
      var votes = this.annotTypes.getAnnotations("VOTE");
      for (var i = 0; i < votes.length; i++) {
        var vote = votes[i];
        var seg = vote.getAttributeValue("segment")
        if (m[seg.id] !== undefined) {
          m[seg.id].push(vote);
        } else {
          m[seg.id] = [vote];
        }
      }
      return m;
    }
  },

  getAnnotationByID: function(id) {
    return this._idDict[id];
  },

  getAnnotationByInternalID: function(id) {
    return this._internalIdDict[id];
  },

  findAnnotationType: function(lab /* {hasSpan: false, create: false} */) {
    var hasSpan = true;
    var create = true;
    if (arguments.length > 1) {
      var params = arguments[1];
      if (params.hasSpan !== undefined) {
        hasSpan = params.hasSpan;
      }
      if (params.create !== undefined) {
        create = params.create;
      }
    }
    return this.annotTypes.findAnnotationType(lab, hasSpan, create);
  },

  findAnnotations: function(label /*, {start: ..., end: ..., text: ..., attrs: { ... }} */) {
    // start, end and text are ignored if the label is spanless.
    var annots = this.annotTypes.getAnnotations(label);
    if (annots.length == 0) {
      // Return a NEW empty list.
      return [];
    } else if (arguments.length == 1) {
      // Return a copy of a list.
      return annots.slice(0);
    } else {
      var params = arguments[0];
      var start = null;
      var end = null;
      var text = null;
      var attrs = params.attrs || null;
      var hasSpan = annots[0].atype.hasSpan;
      if (hasSpan) {
        if (params.start !== undefined) {
          start = params.start;
        }
        if (params.end !== undefined) {
          end = params.end;
        }
        if (params.text !== undefined) {
          text = params.text;
        }
      }
      var res = [];
      for (var i = 0; i < annots.length; i++) {
        var annot = annots[i];
        if (hasSpan) {
          if (((start !== null) && (start != annot.start)) ||
              ((end !== null) && (end != annot.end)) ||
              ((text !== null) && (text != this.signal.slice(annot.start, annot.end)))) {
            continue;
          }
        }
        if (attrs) {
          failed = false;
          for (var k in attrs) {
            if (attrs.hasOwnProperty(k)) {
              if (attrs[k] != annot.getAttributeValue(k)) {
                failed = true;
                break;
              }
            }
          }
          if (failed) {
            continue;
          }
        }
        res.push(annot);
      }
      return res;
    }
  }
  
});

MAT.Annotation.AnnotatedDocWithMetadata = function () {
  this.doc = null;
  // This must be separate, because rolling the
  // updates forward for the documents we read
  // will populate the "real" one. More to the point,
  // we need to keep track of dirty/not dirty, and
  // the phases which were done when the document
  // came in are NOT dirty. We follow up on this in
  // _loadDocumentBackendSuccess for file mode. Workspace
  // mode needs to be handled differently, because
  // each time we read a document from the backend,
  // it may have been changed, because the steps are
  // applied in the backend, and the document is SAVED
  // there - in updateResult() in file mode, on the
  // other hand, the document is NOT saved, and steps
  // applied from the UI count as dirty. So the right answer
  // is to build a new one of these every time you
  // get a workspace reply, rather than just build
  // an AnnotatedDoc.

  // This is actually more complicated even than this. You
  // have to distinguish between the case where a step was
  // marked done AND marked dirty while you're working,
  // vs. a step which was marked done at load but marked
  // dirty while you're working (the only step with this option
  // is "tag", but it's an important one). If you can't distinguish
  // between these cases, and you undo "tag", you may fail to
  // recognize that the document is actually dirty.

  // So what I REALLY need is to know which steps were done
  // at load time, and what's happened since. And when you mark
  // a document not dirty, you have to update that state.

  // So the way I'll do this is to keep an array of phases,
  // with three attributes: doneAtLoad, done, dirty.
  
  this.incomingPhasesDone = [];
  this.phasesDone = {};
}

MAT.Extend(MAT.Annotation.AnnotatedDocWithMetadata, {
  
  // the jsonStruct is just an object, which looks like this:
  // Toplevel keys: signal (string), zones (list of int pairs),
  // metadata (place to store things like list of phases already
  // done and color settings), asets (list of aset entries).
  // Aset entries: type (string; label of tag), attrs (list of
  // attribute names), annots (list of lists of int start, int end,
  // and values for each entry in the attrs lists).
  // We convert this to an annotated doc.
  
  fromJSON: function (jsonStruct, globalATR) {
    if (jsonStruct.metadata.phasesDone) {
      // Grab the phasesDone.
      this.incomingPhasesDone = jsonStruct.metadata.phasesDone;
      // DO NOT SQUASH IT. It will be squashed in fromJSON in AnnotatedDoc.
    }
    this.phasesDone = {};
    this.doc = new MAT.Annotation.AnnotatedDoc().fromJSON(jsonStruct, globalATR);
    
    // Apply the steps done. And apply MarkGold. I can't leave this
    // until later. What a hack.
    
    if (this.incomingPhasesDone.length > 0) {
      for (var i = 0; i < this.incomingPhasesDone.length; i++) {
        var stepName = this.incomingPhasesDone[i];
        // These steps aren't dirty.
        this.stepDone(stepName, {
          dirty: false,
          doneAtLoad: true
        });
      }
    }

    return this;
  },
  
  toJSON: function() {
    var struct = this.doc.toJSON();
    // Overwrite and modify phasesDone.
    struct.metadata.phasesDone = [];    
    // Convert this to a list.
    for (var key in this.phasesDone) {
      // This is a special frontend-only step.
      if ((key != "mark gold") && (key != "reconciliation_vote")) {
        var entry = this.phasesDone[key];
        if (entry && (entry.done || entry.dirty)) {
          struct.metadata.phasesDone.push(key);
        }
      }
    }
    
    return struct;
  },

  copy: function () {
    var d = new MAT.Annotation.AnnotatedDocWithMetadata();
    for (var key in this.phasesDone) {
      if (this.phasesDone.hasOwnProperty(key)) {
        d.phasesDone[key] = {};
        for (var k in this.phasesDone[key]) {
          if (this.phasesDone[key].hasOwnProperty(k)) {
            d.phasesDone[key][k] = this.phasesDone[key][k];
          }
        }
      }
    }
    d.doc = this.doc.copy();
    return d;
  },

  // Default marking is to mark the step not done at load,
  // and done and dirty. If there are params, check the vars.
  
  stepDone: function(phaseName) {
    var isDirty = true;
    var doneAtLoad = false;
    if (arguments.length > 1) {
      isDirty = arguments[1].dirty;
      doneAtLoad = arguments[1].doneAtLoad;
    }
    var entry;
    if (this.phasesDone[phaseName]) {
      entry = this.phasesDone[phaseName];
    } else {
      entry = {doneAtLoad: doneAtLoad};
      this.phasesDone[phaseName] = entry;
    }
    entry.done = true;
    if (isDirty) {
      entry.dirty = true;
    }
  },

  isDirty: function() {
    for (var key in this.phasesDone) {
      if (!this.phasesDone.hasOwnProperty(key)) {
        continue;
      }
      var entry = this.phasesDone[key];
      // If the phase is dirty, or if it's been undone, it's dirty.
      if (entry.dirty || (entry.doneAtLoad && !entry.done) ||
          (entry.done && !entry.doneAtLoad)) {
        return true;
      }
    }
    return false;
  },

  stepIsDirty: function(step) {
    var entry = this.phasesDone[step];
    return (entry && (entry.dirty || (entry.doneAtLoad && !entry.done) || (entry.done && !entry.doneAtLoad)));
  },

  markDirty: function(step) {
    var entry = this.phasesDone[step];
    if (!entry) {
      entry = {doneAtLoad: false, done: true};
      this.phasesDone[step] = entry;
    }
    entry.dirty = true;
  },

  notDirty: function () {
    // make everything undirty, and make sure the
    // doneAtLoad flags are updated. Note that this
    // has to happen in both directions; done and
    // doneAtLoad must be synchronized to the value of done.
    // (I need to get undo correct.)
    for (var key in this.phasesDone) {
      if (!this.phasesDone.hasOwnProperty(key)) {
        continue;
      }
      entry = this.phasesDone[key];
      entry.dirty = false;
      if (entry.done) {
        entry.doneAtLoad = true;
      } else {
        entry.doneAtLoad = false;
      }
    }
  },

  stepNotDirty: function(step) {
    entry = this.phasesDone[step];
    if (entry) {
      entry.dirty = false;
      if (entry.done) {
        entry.doneAtLoad = true;
      }
    }
  },

  // This is a little more complicated than just checking if
  // the step is either done or done at load. If it's doneAtLoad
  // but not done, the step is not done.
  stepIsDone: function(phaseName) {
    var entry = this.phasesDone[phaseName];
    if (!entry) {
      return false;
    }
    if (entry.done !== undefined) {
      // This should always be the current state.
      return entry.done;
    } else {
      return entry.doneAtLoad;
    }
  },
    
  phaseUndone: function(phaseName) {
    var entry = this.phasesDone[phaseName];
    // The entry BETTER be there.
    entry.done = false;
    entry.dirty = false;
  },
  
  mostRecentPhase: function(allSteps) {
    var step = null;
    for (var i = 0; i < allSteps.length; i++) {
      // If the step has been done, mark it.
      var entry = this.phasesDone[allSteps[i].initSettings.name];
      if (entry && entry.done) {
        step = i;
      }
    }
    // This will return the last step in the list of steps
    // that's marked as being done.
    return step;
  }
    
});

/*
 * The GLOBAL annotation type repository. This is the background
 * information for the document.
 */

MAT.Annotation.GlobalAnnotationTypeRepository = function() {
  this.typeTable = {};
  this.allAnnotationsKnown = false;
  this.effectiveLabelTable = {};
};

/* What we get, e.g.

{'ENAMEX': {'category': 'content', 'set_name': 'content', 'hasSpan': True, 'attrs': [{'category': 'content', 'set_name': 'content', 'name': 'type', 'aggregation': None, 'choices': ['PERSON', 'LOCATION', 'ORGANIZATION'], 'type': 'string'}], 'type': 'ENAMEX', 'effective_labels': {'ORGANIZATION': {'category': 'content', 'set_name': 'content', 'attr': 'type', 'val': 'ORGANIZATION', 'display': {'accelerator': 'O', 'name': 'ORGANIZATION', 'css': 'background-color: 99CCFF'}}, 'LOCATION': {'category': 'content', 'set_name': 'content', 'attr': 'type', 'val': 'LOCATION', 'display': {'accelerator': 'L', 'name': 'LOCATION', 'css': 'background-color: FF99CC'}}, 'PERSON': {'category': 'content', 'set_name': 'content', 'attr': 'type', 'val': 'PERSON', 'display': {'accelerator': 'P', 'name': 'PERSON', 'css': 'background-color: CCFF66'}}}}, ...}

*/

MAT.Extend(MAT.Annotation.GlobalAnnotationTypeRepository, {

  fromJSON: function(topD) {
    
    if (topD.allAnnotationsKnown) {
      this.allAnnotationsKnown = true;
    }
    
    var d = topD.types;
    // We're going to add the untaggable annotation to
    // each task which has a zone annotation. We're ONLY going
    // to do this here; if you end up adding a zone annotation type
    // globally some other way, you're hosed. Just warning you.
    for (var typeName in d) {
      if (d.hasOwnProperty(typeName)) {
        var atypeJSON = d[typeName];
        // Convert the entry into an annotation type.
        var attrs = atypeJSON.attrs;
        delete atypeJSON.attrs;
        var hasSpan = atypeJSON.hasSpan;
        delete atypeJSON.hasSpan;
        delete atypeJSON.type;
        // I want to ensure that annotation-valued attributes
        // have label restrictions, WHEN DEFINED FROM A SPEC.
        // Otherwise, I don't care.
        if (attrs != null) {
          for (var i = 0; i < attrs.length; i++) {
            var attr = attrs[i];
            if (attr.constructor !== String) {
              if ((attr.type == "annotation") && !attr.label_restrictions) {
                // It's an error.
                throw new MAT.Annotation.DocumentError("label_restrictions required for annotation attribute '" + attr.name + "' of annotation type '" + typeName + "'");
              }
            }
          }
        }
        var newT = new MAT.Annotation.AnnotationType(this, typeName, attrs, hasSpan, atypeJSON);
        this.typeTable[typeName] = newT;
        if ((newT.category == "zone") && (!this.typeTable.untaggable)) {
          this.typeTable.untaggable = new MAT.Annotation.AnnotationType(this, "untaggable", [], true,
                                                                        {category: "untaggable",
                                                                         set_name: "untaggable",
                                                                         display: {css: "color: gray"}});
        }
        if (newT.effective_labels) {
          for (var k in newT.effective_labels) {
            if (newT.effective_labels.hasOwnProperty(k)) {
              this.effectiveLabelTable[k] = typeName;
            }
          }
        }
      }
    }
    // Postprocess the label restrictions.
    for (var t in this.typeTable) {
      if (this.typeTable.hasOwnProperty(t)) {
        var tObj = this.typeTable[t];
        for (var k = 0; k < tObj.attrs.length; k++) {
          var attr = tObj.attrs[k];
          if (attr.constructor === MAT.Annotation.AnnotationAttributeType) {
            attr.digestLabelRestrictions(this);
          }
        }
      }
    }
  },

  findAnnotationType: function(label, docRepository, hasSpan, create) {
    var localT = this.typeTable[label];
    if (localT) {
      if (localT.hasSpan != hasSpan) {
        throw new MAT.Annotation.DocumentError("requesting an annotation type whose hasSpan value doesn't match");
      }
      return localT.copy(docRepository);
    } else if (create && (!this.allAnnotationsKnown)) {
      localT = new MAT.Annotation.AnnotationType(this, label, [], hasSpan);
      this.typeTable[label] = localT;
      return localT.copy(docRepository);
    }    
  },

  // This was originally in core_ui.js, but it makes sense to put it here now.
  // We need to ensure that the annotation types in the documents inherit these
  // enhancements.

  forEachDisplayEntry: function(fn) {
    for (var k in this.typeTable) {
      if (this.typeTable.hasOwnProperty(k)) {
        this.typeTable[k].forEachDisplayEntry(fn);
      }
    }
  },

  hasContentAnnotationValuedAttributes: function() {
    for (var k in this.typeTable) {
      if (this.typeTable.hasOwnProperty(k)) {
        if ((this.typeTable[k].category == "content") && (this.typeTable[k].hasAnnotationValues)) {
          return true;
        }
      }
    }
    return false;
  }

});


/*
 *                MAT.Annotation.RedisplayDispatcher
 *
 *
 * This object is associated with a document, and manages all the 
 * redisplaying when an annotation changes. It has to be set up
 * to be sensitive to those situations where a change in an annotation
 * affects a display which isn't "owned" by that annotation: for 
 * instance, when an annotation editor popup lists the annotations
 * which it attaches TO.
 *
 * One of these days, these events will be forwarded through the
 * document, which is what should happen in the first place, but
 * not yet.
 *
 */

/* First use of the MAT.Class shorthand. */

/* For the moment, this relies on the annotation gesture object
   in mat_doc_display.js. I'll probably rearrange this someday. */

MAT.Annotation.RedisplayDispatcher = MAT.Class(
  function (doc) {
    this.doc = doc;
    
    // The bookkeeping here has to support three things pretty efficiently:
    // firing an event (perhaps the most important), unregistering an
    // annotation, and unregistering a display. Each of these requires
    // a different toplevel view.

    // To fire an event, you want to start with the affected annotation,
    // and then get the event name, and the fire everything on that list.
    // That hierarchy is kind of clumsy for unregistering an annotation
    // or a display.

    // So let's do it this way. Let's create a key from the triple of
    // the event, the annot ID and the display ID. This is the master table
    // which maps to the metadata and the actual events.
    this.masterTable = {};
    // Next, we have four auxiliary tables: the first maps from
    // annotation IDs to a hash from master keys to truth values (basically,
    // a set implementation);
    this.annotIDsToMasterKeyHash = {};
    // the second maps from display IDs to a master key hash;
    this.displayIDsToMasterKeyHash = {};
    // the third maps from event and annot id to a master key hash;
    this.sourceEventToMasterKeyHash = {};
    // and the fourth maps from annot ID and display ID to a master key hash;
    this.annotAndDisplayIDsToMasterKeyHash = {};
    
    // This is a hash from display IDs to displays.
    this.docDisplays = {};
  }, {

    registerDocDisplay: function(d) {
      this.docDisplays[d.displayId] = d;
    },

    unregisterDocDisplay: function(d) {
      delete this.docDisplays[d.displayId];
    },
    
    // When the eventName event is fired on annot with the appropriate
    // eventParams, then action is fired on disp. Events are:
    // add_annotation (no params)
    // remove_annotation (no params)
    // modify_extent (params old_start, old_end, start, end)
    // modify_annotation (params attr_name) - not fired for annotation-valued attrs
    // attach_to_parent (params attr_name, parent_annot)
    // attach_child (params attr_name, child_annot)
    // detach_from_parent (params attr_name, parent_annot)
    // detach_child (params attr_name, child_annot)
    //
    // Actions are: redisplay, remove, or a function.

    registerEvents: function(annot, display, eventList) {
      for (var i = 0; i < eventList.length; i++) {
        var eventName = eventList[i].event_name;
        var eventParams = eventList[i].params || null;
        var action = eventList[i].action;
        var eventKey = eventName + " " + annot.id + " " + display.displayId;
        var masterEntry = this.masterTable[eventKey];
        if (masterEntry === undefined) {
          masterEntry = {
            display: display,
            annot: annot,
            event_name: eventName,
            events: []
          };
          this.masterTable[eventKey] = masterEntry;
        }
        masterEntry.events.push({
          action: action,
          params: eventParams
        });
        var entry = this.annotIDsToMasterKeyHash[annot.id];
        if (entry === undefined) {
          entry = {};
          this.annotIDsToMasterKeyHash[annot.id] = entry;
        }
        entry[eventKey] = true;
        entry = this.displayIDsToMasterKeyHash[display.displayId];
        if (entry === undefined) {
          entry = {};
          this.displayIDsToMasterKeyHash[display.displayId] = entry;
        }
        entry[eventKey] = true;
        var sourceKey = eventName + " " + annot.id;
        entry = this.sourceEventToMasterKeyHash[sourceKey];
        if (entry === undefined) {
          entry = {};
          this.sourceEventToMasterKeyHash[sourceKey] = entry;
        }
        entry[eventKey] = true;
        var annDispKey = "" + annot.id + " " + display.displayId;
        entry = this.annotAndDisplayIDsToMasterKeyHash[annDispKey];
        if (entry === undefined) {
          entry = {};
          this.annotAndDisplayIDsToMasterKeyHash[annDispKey] = entry;
        }
        entry[eventKey] = true;
      }
    },
    
    registerEvent: function(annot, eventName, eventParams, action, disp) {
      this.registerEvents(annot, disp, [{event_name: eventName, params: eventParams, action: action}]);
    },

    registerAnnotationDisplay: function(annot, d) {
      // This registers a ton of events for this display, because it's
      // "owned" by the annotation. Obviously, not add_annotation, but a bunch
      // of others. Note that I'm not doing anything with attach and detach;
      // the annotation display doesn't know about those by default.
      this.registerEvents(annot, d, [{
        event_name: "remove_annotation",
        action: "remove"
      }, {
        event_name: "modify_annotation",
        action: "redisplay"
      }, {
        event_name: "modify_extent",
        action: "redisplay"
      }, {
        event_name: "attach_child",
        action: "redisplay"
      }, {
        event_name: "detach_child",
        action: "redisplay"
      }]);
    },

    // When an event occurs, it gets added to the list of events in the
    // gesture, and then the gesture is fired.
    // The affected annotation is looked up, and any events registered which
    // match have the displays and events collected. If there's a source
    // display, it's removed from the list of displays, and any display which
    // is to be removed is removed, and removed from the list of things to be
    // redisplayed, and then each of the redisplays is called, exactly once.
    // And don't forget the doc displays.

    fireGesture: function(g) {
      var source = g.gestureDisplaySource;
      var events = g.events;
      this.fireGestureEvents(source, events);
    },

    fireGestureEvents: function(source, events) {
      // hash from display IDs to hashes of the display and the events for it.
      var displaysToRedisplay = {};
      // hash from display IDs to displays
      var displaysToRemove = {};
      var functionDisplays = {};
      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        var k = event.event_name + " " + event.annot.id;
        var kEntry = this.sourceEventToMasterKeyHash[k];
        if (kEntry !== undefined) {
          for (var masterKey in kEntry) {
            if (kEntry.hasOwnProperty(masterKey)) {
              var masterEntry = this.masterTable[masterKey];
              // Don't even consider it if the registered event
              // affects the source. I THINK.
              if (masterEntry.display !== source) {
                var dispCandList = masterEntry.events;
                for (var j = 0; j <  dispCandList.length; j++) {
                  var dispCand = dispCandList[j];
                  // I'm not even going to bother trying to distinguish
                  // between events for registration; it's just going
                  // to be if every key/val in the params matches
                  // the ones in the gesture.
                  var doIt = true;
                  if (dispCand.params) {
                    for (var k in dispCand.params) {
                      if (dispCand.params.hasOwnProperty(k)) {
                        if (event[k] != dispCand.params[k]) {
                          doIt = false;
                          break;
                        }
                      }
                    }
                  }
                  if (doIt) {
                    // OK, it can fire.
                    if (typeof dispCand.action === "function") {
                      // If the action is a function, then we fire it specially.
                      // It's just like redisplay in its bookkeeping, but it's called
                      // directly. We may end up calling this function on multiple
                      // events, which is a bit tricky, because you can't hash
                      // functions.
                      if (!displaysToRemove[masterEntry.display.displayId]) {
                        var displayRecord = functionDisplays[masterEntry.display.displayId];
                        if (displayRecord === undefined) {
                          displayRecord = {display: masterEntry.display, eventHashes: []};
                          functionDisplays[masterEntry.display.displayId] = displayRecord;
                        }
                        var found = false;
                        for (var w = 0; w < displayRecord.eventHashes.length; w++) {
                          if (displayRecord.eventHashes[w].fn === dispCand.action) {
                            found = true;
                            displayRecord.eventHashes[w].events.push(event);
                            break;
                          }
                        }
                        if (!found) {
                          displayRecord.eventHashes.push({
                            fn: dispCand.action,
                            events: [event]
                          });
                        }
                      }
                    } else if (dispCand.action == "redisplay") {
                      // Only register for redisplay if it isn't supposed to be removed.
                      if (!displaysToRemove[masterEntry.display.displayId]) {
                        var displayRecord = displaysToRedisplay[masterEntry.display.displayId];
                        if (displayRecord === undefined) {
                          displayRecord = {display: masterEntry.display, events: []};
                          displaysToRedisplay[masterEntry.display.displayId] = displayRecord;
                        }
                        displayRecord.events.push(event);
                      }
                    } else if (dispCand.action == "remove") {
                      displaysToRemove[masterEntry.display.displayId] = masterEntry.display;
                      // Make sure that if it was going to be redisplayed, it won't be.
                      delete displaysToRedisplay[masterEntry.display.displayId];
                      delete functionDisplays[masterEntry.display.displayId];                      
                    }                  
                  }
                }
              }
            }
          }
        }
      }
      
      // OK, I've reviewed all the events, and collected the displays
      // which need to be dealt with. Now, we can do that. First,
      // redisplay the document displays.
      for (var k in this.docDisplays) {
        if (this.docDisplays.hasOwnProperty(k)) {
          var thisDisplay = this.docDisplays[k];
          if (thisDisplay !== source) {
            thisDisplay.forceRedisplayResponse(events);
          }
        }
      }

      // Next, we force the removes.

      for (var k in displaysToRemove) {
        if (displaysToRemove.hasOwnProperty(k)) {
          this.unregisterDisplay(displaysToRemove[k]);
          // Don't forget to remove it!
          displaysToRemove[k].forceRemoveRedisplayResponse();
        }
      }

      // Finally, we force the redisplay on each of the displays to redisplay.
      for (var k in displaysToRedisplay) {
        if (displaysToRedisplay.hasOwnProperty(k)) {
          var e = displaysToRedisplay[k];
          e.display.forceRedisplayResponse(e.events);
        }
      }    

      // And finally, we run the custom methods.

      for (var k in functionDisplays) {
        if (functionDisplays.hasOwnProperty(k)) {
          var e = functionDisplays[k];
          for (var w = 0; w < e.eventHashes.length; w++) {
            var eHash = e.eventHashes[w];
            eHash.fn.call(e.display, eHash.events);
          }
        }
      }
    },

    unregisterEvent: function(annot, eventName, eventParams, action, disp) {
      var masterKey = eventName + " " + annot.id + " " + display.displayId;
      var eventEntry = this.masterTable[masterKey];
      if (eventEntry !== undefined) {
        for (var i = 0; i < eventEntry.events.length; i++) {
          var event = eventEntry[i].events;
          // It has to be identical.
          if (event.action == action) {
            // AALLLmost there...
            var ok = true;
            if ((!eventParams) && (!event.params)) {
              // We're OK.
            } else if ((!eventParams) || (!event.params)) {
              // We're not OK; move on.
              continue;
            } else {
              // The dictionaries have to match exactly.
              var paramsChecked = {};                
              for (var k in eventParams) {
                if (eventParams.hasOwnProperty(k)) {
                  if (eventParams[k] != event.params[k]) {
                    ok = false;
                    break;
                  } else {
                    paramsChecked[k] = true;
                  }
                }
              }
              if (ok) {
                for (var k in event.params) {
                  if (event.params.hasOwnProperty(k) && !paramsChecked[k]) {
                    // If there's a param we didn't check, we're not OK.
                    ok = false;
                    break;
                  }
                }
              }
            }
            // Finally, if we're OK, splice, then maybe remove from the display->ann hash,
            // then break. 
            if (ok) {
              eventEntry.events.splice(i, 1);
              // If there are no more entries under this key, clean up.
              if (eventEntry.events.length == 0) {
                delete this.masterTable[masterKey];
                delete this.annotIDsToMasterKeyHash[annot.id][masterKey];
                this._maybeTruncateHash(this.annotIDsToMasterKeyHash, annot.id);
                delete this.displayIDsToMasterKeyHash[disp.displayId][masterKey];
                this._maybeTruncateHash(this.displayIDsToMasterKeyHash, disp.displayId);
                var dKey = eventName + " " + annot.id;
                delete this.sourceEventToMasterKeyHash[dKey][masterKey];
                this._maybeTruncateHash(this.sourceEventToMasterKeyHash, dKey);
                dKey = "" + annot.id + " " + disp.displayId;
                this.annotAndDisplayIDsToMasterKeyHash[dKey][masterKey];
                this._maybeTruncateHash(this.annotAndDisplayIDsToMasterKeyHash, dKey);
              }
              break;
            }
          }
        }
      }
    },

    _maybeTruncateHash: function(h, topKey) {
      var keysLeft = false;
      for (var k in h[topKey]) {
        if (h[topKey].hasOwnProperty(k)) {
          keysLeft = true;
          break;
        }
      }
      if (!keysLeft) {
        delete h[topKey];
      }
    },

    // Let's try to avoid calling maybeTruncateHash too often.

    unregisterDisplayForAnnotation: function(disp, annot) {
      var k = "" + annot.id + " " + disp.displayId;
      var masterKeyHash = this.annotAndDisplayIDsToMasterKeyHash[k];
      if (masterKeyHash !== undefined) {
        var eventNames = {};
        delete this.annotAndDisplayIDsToMasterKeyHash[k];
        for (var masterKey in masterKeyHash) {
          if (masterKeyHash.hasOwnProperty(masterKey)) {
            var masterEntry = this.masterTable[masterKey];
            delete this.masterTable[masterKey];
            // Now, we have the event name, and we can do the
            // rest of the deletes.
            var dKey = masterEntry.event_name + " " + annot.id;
            eventNames[masterEntry.event_name] = dKey;
            delete this.sourceEventToMasterKeyHash[dKey][masterKey];
            delete this.annotIDsToMasterKeyHash[annot.id][masterKey];
            delete this.displayIDsToMasterKeyHash[disp.displayId][masterKey];
          }
        }
        this._maybeTruncateHash(this.annotIDsToMasterKeyHash, annot.id);
        this._maybeTruncateHash(this.displayIDsToMasterKeyHash, disp.displayId);
        for (var eventName in eventNames) {
          if (eventNames.hasOwnProperty(eventName)) {
            this._maybeTruncateHash(this.sourceEventToMasterKeyHash, eventNames[eventName]);
          }
        }
      }
    },

    // When an annotation is deleted, we need to call this. Let's see if I can
    // get away with calling maybeTruncate only as many times as I have to.
    // For instance, I should save the display IDs and do those later.
    
    unregisterAnnotation: function(annot) {
      var masterKeyHash = this.annotIDsToMasterKeyHash[annot.id];
      if (masterKeyHash !== undefined) {
        delete this.annotIDsToMasterKeyHash[annot.id];
        var displayIDs = {};
        var eventNames = {};
        for (var masterKey in masterKeyHash) {
          if (masterKeyHash.hasOwnProperty(masterKey)) {
            var masterEntry = this.masterTable[masterKey];
            delete this.masterTable[masterKey];
            var dKey = masterEntry.event_name + " " + annot.id;
            eventNames[masterEntry.event_name] = dKey;
            delete this.sourceEventToMasterKeyHash[dKey][masterKey];
            dKey = "" + annot.id + " " + masterEntry.display.displayId;
            displayIDs[masterEntry.display.displayId] = dKey;
            delete this.annotAndDisplayIDsToMasterKeyHash[dKey][masterKey];
            delete this.displayIDsToMasterKeyHash[masterEntry.display.displayId][masterKey];
          }
        }
        for (var eventName in eventNames) {
          if (eventNames.hasOwnProperty(eventName)) {
            this._maybeTruncateHash(this.sourceEventToMasterKeyHash, eventNames[eventName]);
          }
        }
        for (var displayID in displayIDs) {
          if (displayIDs.hasOwnProperty(displayID)) {
            this._maybeTruncateHash(this.annotAndDisplayIDsToMasterKeyHash, displayIDs[displayID]);      
            this._maybeTruncateHash(this.displayIDsToMasterKeyHash, displayID);
          }
        }
      }
    },

    // When a display is removed, we need to call this. Again, let's only call
    // maybeTruncateHash when we have to.
    
    unregisterDisplay: function(d) {
      var masterKeyHash = this.displayIDsToMasterKeyHash[d.displayId];
      if (masterKeyHash !== undefined) {
        delete this.displayIDsToMasterKeyHash[d.displayId];
        var eventNames = {};
        var annotIDs = {};
        for (var masterKey in masterKeyHash) {
          if (masterKeyHash.hasOwnProperty(masterKey)) {
            var masterEntry = this.masterTable[masterKey];
            delete this.masterTable[masterKey];
            var dKey = masterEntry.event_name + " " + masterEntry.annot.id;
            eventNames[masterEntry.event_name] = dKey;
            delete this.sourceEventToMasterKeyHash[dKey][masterKey];
            dKey = "" + masterEntry.annot.id + " " + d.displayId;
            annotIDs[masterEntry.annot.id] = dKey;
            delete this.annotAndDisplayIDsToMasterKeyHash[dKey][masterKey]
            delete this.annotIDsToMasterKeyHash[masterEntry.annot.id][masterKey];
          }
        }
        for (var eventName in eventNames) {
          if (eventNames.hasOwnProperty(eventName)) {
            this._maybeTruncateHash(this.sourceEventToMasterKeyHash, eventNames[eventName]);
          }
        }
        for (var annotID in annotIDs) {
          if (annotIDs.hasOwnProperty(annotID)) {
            this._maybeTruncateHash(this.annotAndDisplayIDsToMasterKeyHash, annotIDs[annotID]);
            this._maybeTruncateHash(this.annotIDsToMasterKeyHash, annotID);
          }
        }
      }
    }
  }
);
