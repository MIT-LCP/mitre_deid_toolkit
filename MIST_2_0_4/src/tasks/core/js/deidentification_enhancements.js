/* Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
file LICENSE for license terms. */

/* This file enhances the various namespaces which have already been defined
   to add separate steps. */

/* Make this inaccessible, and "publish" it when the task is activated.
   Trying to avoid name clashes. */

(function () {
    
  function populateNominationTable(table, appDoc, taskName) {
    var aset = appDoc.currentDocument.doc;
    var tagLabel = appDoc._context.taskTable[taskName].tagLabel;
    var docPane = appDoc._context.ui._windowHash[appDoc.docLabel].mainPanel;
    var headerRow = document.createElement("tr");
    // Add headers.
    table.appendChild(headerRow);
    headerRow.innerHTML = "<th>PII</th><th>Type</th><th>Location</th><th>Replacement</th>";
    var annots = aset.allContentAnnotations({ordered: true});

    // I made this a function because I need to change the popup
    // when the value changes.
    function changeCandPopup(td, annot, cand) {
      return function () {
        if (appDoc.currentDocument.stepIsDone("transform")) {
          // Do nothing if the document has been transformed.
          // We need to check this dynamically, because the callback
          // may have been added BEFORE the document was transformed.
          return;
        }
        // Immediately, remove the unparseable mark, if present, and
        // remove the background.
        td.style.backgroundColor = null;
        var unparseableAffix = null;
        var seedVal = annot.getAttributeValue("seed_unparseable");
        if (seedVal != null) {
          if (seedVal == "DATE") {
            // Give a little extra information.
            if (aset.metadata.dateDelta < 0) {
              unparseableAffix = "<p>Date should be " + -aset.metadata.dateDelta + " days before  '" + aset.signal.substring(annot.start, annot.end) + "'.";
            } else {
              unparseableAffix = "<p>Date should be " + aset.metadata.dateDelta + " days after  '" + aset.signal.substring(annot.start, annot.end) + "'.";
            }
          }
          annot.setAttributeValue("seed_unparseable", null);
          // Mark it dirty.
          appDoc.currentDocument.stepDone("nominate", {
            dirty: true
          });
        }
        // Pop up an edit pane. It's tricky because if the candidate
        // contains odd whitespace, including newlines, they need
        // to be cleaned up, AND they need to be reinserted.
        var numNewlines = cand.split(/[\n\r]+/).length - 1;
        var defaultVal = cand.split(/\s+/).join(" ");
        var eId = "edit_" + annot.id + "_" + appDoc.docLabel;
        var replText = "<input type='text' value='" + defaultVal + "'>";
        if (unparseableAffix) {
          replText += unparseableAffix;
        }
        appDoc._context.ui.popup(appDoc.docLabel, replText, eId,
                                 "Edit replacement", [{
                                   text: "OK",
                                   handler: function () {
                                     // How do we retrieve this?
                                     var v = YAHOO.util.Dom.getElementsBy(function (e) { return e.type == "text"; }, 'input', eId)[0].value;
                                     if (v != defaultVal) {
                                       // Update the annotation, mark the document dirty,
                                       // redisplay the document.
                                       // But first, add extra newlines if necessary.
                                       if (numNewlines > 0) {
                                         var vSplit = v.split(/\s+/);
                                         var vList = [];
                                         for (var i = 0; i < vSplit.length; i++) {
                                           if (i > 0) {
                                             if (numNewlines > 0) {
                                               vList.push("\n");
                                               numNewlines -= 1;
                                             } else {
                                               vList.push(" ");
                                             }
                                           }
                                           vList.push(vSplit[i]);
                                         }
                                         while (numNewlines > 0) {
                                           vList.push("\n");
                                           numNewlines -= 1;
                                         }
                                         v = vList.join("");
                                       }
                                       annot.setAttributeValue("redacted", v);
                                       // Mark it dirty.
                                       appDoc.currentDocument.stepDone("nominate", {
                                         dirty: true
                                       });
                                       // Change the cell.
                                       td.firstChild.nodeValue = v;
                                       // Regenerate the onclick.
                                       td.onclick = changeCandPopup(td, annot, v);
                                     }
                                   }
                                 }, {
                                   text: "Cancel",
                                   isDefault: true,
                                   handler: function () {
                                     // Previously we were recomputing the covered content,
                                     // but we no longer need to do that.
                                   }
                                 }]);
      }
    }

    var notifiedUnparseable = false;
    
    // I made this a function because I need to generate callbacks
    // for each annot.
    function createValRow(annot, cand, unparseable) {
      // Add a row.
      var valRow = document.createElement("tr");
      table.appendChild(valRow);
      var td = document.createElement("td");
      td.appendChild(
        document.createTextNode(aset.signal.slice(annot.start, annot.end)));
      valRow.appendChild(td);
      td = document.createElement("td");
      td.setAttribute("class", tagLabel + " " + annot.atype.label);
      td.appendChild(document.createTextNode(annot.atype.label));
      valRow.appendChild(td);
      td = document.createElement("td");
      td.innerHTML = annot.start + " - " + annot.end;
      valRow.appendChild(td);
      td = document.createElement("td");
      if (unparseable) {
        td.style.backgroundColor = "red";
        if (!notifiedUnparseable) {
          notifiedUnparseable = true;
          var s = "This document contains nominations for phrases which could not be parsed to extract their features. These nominations are indicated in the 'Replacement' column with a red background. You must review these nominations in order to transform the document.";
          appDoc._context.ui.popup(appDoc.docLabel, s, "warning", "Warning",
                                   [{text: "OK",
                                     isDefault: true}]);
        }
      }
      td.appendChild(document.createTextNode(cand));
      // Create a callback and mouseover to allow people to edit
      // the candidate. But only if we're in the nominate step.
      td.onmouseover = function () {
        if (!appDoc.currentDocument.stepIsDone("transform")) {
          docPane.mouseOverAnnotations({type: "content", labels: [annot.getEffectiveLabel() + " (click to edit replacement)"]});
        }
      }
      td.onmouseout = function () {
        if (!appDoc.currentDocument.stepIsDone("transform")) {
          docPane.cancelMouseOverAnnotations();
        }
      }
      td.onclick = changeCandPopup(td, annot, cand);
      valRow.appendChild(td);
    }
    
    for (var i = 0; i < annots.length; i++) {
      var annot = annots[i];        
      var cand = annot.getAttributeValue("redacted");
      var unparseable = (annot.getAttributeValue("seed_unparseable") != null);
      if (cand !== null) {
        createValRow(annot, cand, unparseable);
      }
    }
  }

  // Now, we specialize the menu responses.

  // The replacer menu is special. If it's already selected, don't
  // roll back; just change its selection. Otherwise, roll back.

  // Private function.
  
  function updateFromReplacerMenu (appDoc, mainPanel) {
    var rMenu = mainPanel.getControlElement("replacermenu");

    if (rMenu.selectedIndex > 0) {
      var rValue = rMenu.options[rMenu.selectedIndex].value;      
      // If the context has already been configured, don't reset.
      if (!appDoc._data.replacer) {
        // Disable the "Select..." option.
        rMenu.options[0].disabled = true;
      }
      appDoc.updateConfiguration({replacer: rValue});
    }
  }

  function populateReplacerMenu (appDoc, mainPanel, replacers) {
    // We don't configure yet. We populate the replacement menu.
    var rMenu = mainPanel.getControlElement("replacermenu");
    mainPanel._ui._clearMenu(rMenu);
    mainPanel._ui._populateMenuFromArray(rMenu, replacers, appDoc.currentDocument.doc.metadata.replacer_used);
    updateFromReplacerMenu(appDoc, mainPanel);
  }
  
  // And now, we add a replacement document saver to the context object.
  // "this" will be the context.

  function saveReplDocument(appDoc, outType) {

    if (appDoc.replDoc != null) {

      var parameters = {};
      
      if (arguments.length > 2) {
        parameters = arguments[2];
      }
      
      var inType = appDoc._data.file_type;
      var fileName = appDoc._data.input;
      var taskName = appDoc._data.task;

      appDoc.log({"file": fileName, "type": outType+",transformed"}, "save_file");

      if (MAT.FileFormats.formats[outType].richFormat) {
        // Right now, the transformed document is part of the original
        // document pane. Once the rich transformed document is saved,
        // we can clear the transformed state. Check both versions, just in case.
        
        appDoc.currentDocument.stepNotDirty("transform");
      }

      // The inType is the initial type of the SOURCE
      // document.

      var backend = this.backend;
      this.backend.ping(this.backend._cgiURL, {
        success: function (transport) {
          // Let's fix this a little bit. Document paths should be
          // consistent. Let's say that rich documents should always
          // end in .json, and raw documents in .txt. If you're
          // switching a document, don't add another extension -
          // extend the root with the current type and add a new
          // extension.
          parameters.input = YAHOO.lang.JSON.stringify(appDoc._taskConfig.serialize(appDoc.replDoc));
          parameters.filename = MAT.FileFormats.newFilename(inType, outType, fileName, "_repl");      
          parameters.out_type = outType;
          parameters.task = taskName;
          backend._saveDocument(parameters);
        },
        failure: function (transport) {
          backend._context.ui.notifyError("<h2>Error saving document</h2><p>Communications failure");
          appDoc.log({action: "save_file_failure",
                      reason: "implementation"});
        }
      });
    }
  }
  
  var DeidentificationSteps;
  

  // New workbench.

  function augmentMainPanelSelect(mainPanel) {
    if (mainPanel._selectActions === undefined) {
      mainPanel._selectActions = [];
      mainPanel._deselectActions = [];
      mainPanel._nominationTabVisible = false;
      mainPanel._replacementVisible = false;
      var coreSelect = mainPanel.select;
      var coreDeselect = mainPanel.deselect;
      mainPanel.select = function () {
        coreSelect.call(mainPanel);
        for (var i = 0; i < mainPanel._selectActions.length; i++) {
          mainPanel._selectActions[i].call(mainPanel);
        }
      }
      mainPanel.deselect = function () {
        // Do these in REVERSE ORDER.
        for (var i = mainPanel._deselectActions.length - 1; i >= 0; i--) {
          mainPanel._deselectActions[i].call(mainPanel);
        }
        coreDeselect.call(mainPanel);
      }
    }
  }
  
  function nominationUiDo(appDoc, taskName) {
    var aset = appDoc.currentDocument.doc;
    var docPane = appDoc._context.ui._windowHash[appDoc.docLabel].mainPanel;

    // The docPane will have a _nominateDiv, and we write the
    // nominations into there.
    var mDiv = docPane._nominateDiv;
    // Clear it, in case we're reusing.
    mDiv.innerHTML = "";
    // Painfully build a table, since we don't know
    // whether the selected text or the redaction has
    // non-HTML chars in it.

    var table = document.createElement("table");
    table.className = "dataTable";
    populateNominationTable(table, appDoc, taskName);
    // Save the doc. In this case, since we haven't
    // called setText, we need to refresh the
    // current region map.
    mDiv.appendChild(table);
    // And show the tab.
    docPane._nominationTabVisible = true;
    if (docPane._tabView.currentTabContent == docPane) {
      docPane._nominateTab.show();
    }
  }
  
  DeidentificationSteps = {
    
    // The nominate step. 
    
    nominate: {
      
      undo: function(appDoc, refreshFlag, fromRollback) {
        var docPane = appDoc._context.ui._windowHash[appDoc.docLabel].mainPanel;
        docPane._nominateTab.hide();
        docPane._nominationTabVisible = false;
        docPane._nominateDiv.innerHTML = "";
        // Evil! Every time a document is read, the annotation IDs are all
        // incremented, which means that the document has to be redisplayed,
        // otherwise the region map won't be redrawn, and deleting or replacing
        // an annotation will fail. A simpler mapping would help, but 
        // we'll still have the basic problem.
        this._defaultStep.undo(appDoc, refreshFlag, fromRollback);
      },
      
      docDo: function(appDoc, o) {
        this._digestDoc(appDoc, o);
      },
      
      uiDo: function(appDoc, refreshFlag) {
        // Evil! Every time a document is read, the annotation IDs are all
        // incremented, which means that the document has to be redisplayed,
        // otherwise the region map won't be redrawn, and deleting or replacing
        // an annotation will fail. A simpler mapping would help, but 
        // we'll still have the basic problem.
        this._defaultStep.uiDo(appDoc, refreshFlag);
        nominationUiDo(appDoc, appDoc._data.task);
      }
    },

    // The transform step. 
    
    // Transforming produces an annotated document. Right now,
    // we're just going to strip off the annotations.
    
    transform: {

      // What do we want to do about undoing appDoc.replDoc? The problem
      // is that I've eliminated the local docUndo stuff. Perhaps I
      // shouldn't have. Right now, all we do is uiUndo. The docUndo
      // stuff was moved to the backend. But there ARE some display stuff
      // that need to be maintained ONLY if we're undoing because
      // of document undo.

      undo: function(appDoc, refreshFlag, fromRollback) {
        var docPane = appDoc._context.ui._windowHash[appDoc.docLabel].mainPanel;
        if (docPane._tabView.currentTabContent == docPane) {
          docPane._ui._disableMenuBarItem(["File", "Save replacement..."]);
        }
        docPane._replacementVisible = false;
        for (var i = 0; i < docPane._docDiv.childNodes.length; i++) {
          var n = docPane._docDiv.childNodes[i];
          if ((n != docPane._replDiv) && (n.nodeType == Node.ELEMENT_NODE)) {
            n.style.width = "100%";
          }
        }
        docPane._replDiv.style.display = "none";
        if (appDoc.replDisplay) {
          appDoc.replDisplay.clear();
        }
        // This is kind of separate, but since it's never sent to the
        // backend, it's something that needs to be undone here.
        if (fromRollback) {
          appDoc.replDoc = null;
        }

        // Evil! We've undone the transform, and so it gets the CORE
        // document back, but in order to make sure that changing the
        // nomination table changes the hovers, I need to redraw the
        // document. Grrr.
        this._defaultStep.uiDo(appDoc);
        
        // And then, note that the callbacks for the annotation
        // table need to be refreshed, because the document came back
        // from the backend. undo_through transform was a no-op, but it
        // still went to the backend and then came back. So maybe I should
        // just redraw the whole table.
        var mDiv = docPane._nominateDiv;
        var tbl = YAHOO.util.Dom.getElementsByClassName('dataTable', 'table', mDiv)[0];
        tbl.innerHTML = "";
        populateNominationTable(tbl, appDoc, appDoc._data.task);
      },
      
      docDo: function(appDoc, x) {
        // Can't use _digestDoc here, because we may not be at a point where
        // there's a context document already present. Besides, this is a NEW
        // document. Well, there are a couple ways to deal with this. On the
        // one hand, I can go back and make the steps digest their result
        // when they execute the step, instead of in advance. But actually,
        // what we're seeing here is an indication that this operation
        // really does generate a NEW document, and I really need to pass along
        // the document metadata.
        appDoc.replDoc = new MAT.Annotation.AnnotatedDocWithMetadata().fromJSON(x, appDoc.getAnnotationTypeRepository());
        // The document comes in with incomingPhasesDone set.
        // The problem is, when we save it we want those phases
        // to be actually recorded. But remember, the incoming is
        // a list, and the phases done is a hash.
        for (var i = 0; i < appDoc.replDoc.incomingPhasesDone.length; i++) {
          appDoc.replDoc.stepDone(appDoc.replDoc.incomingPhasesDone[i]);
        }
      },

      uiDo: function(appDoc, refreshFlag) {
        var metadataDoc = appDoc.replDoc;
        var docPane = appDoc._context.ui._windowHash[appDoc.docLabel].mainPanel;
        var outputDiv = YAHOO.util.Dom.getElementsByClassName("docPaneContainer", "div", docPane._replDiv)[0];
        if (!appDoc.replDisplay) {
          // How to create a new doc display? Its first argument is
          // now a panel from the UI, but that's not really right, since
          // it should be one-to-one with the panel, and it's not. Yet.
          // It APPEARS to be harmless, unless I'm adding tags.
          appDoc.replDisplay = new MAT.DocDisplay.DocDisplay(docPane, appDoc._context, outputDiv, {
            annotatable: false
          });
        }
        // Split the docdiv.          
        var rDiv = docPane._replDiv;
        var dDiv = docPane._docDiv;

        // Make the rDiv visible, and then make the width of
        // the input document column half of what it is.

        for (var i = 0; i < dDiv.childNodes.length; i++) {
          var n = dDiv.childNodes[i];
          if ((n != rDiv) && (n.nodeType == Node.ELEMENT_NODE)) {
            n.style.width = "49%";
          }
        }
        
        appDoc.replDisplay.setData(metadataDoc.doc);
        
        rDiv.style.display = "block";
        // And, make the save element active.
        docPane._replacementVisible = true;
        if (docPane._tabView.currentTabContent == docPane) {
          docPane._ui._enableMenuBarItem(["File", "Save replacement..."]);
        }
      }
    }
  };

  function addWorkflowMenuHTML(appDoc, mainPanel) {
    var tbl = YAHOO.util.Dom.getElementsByClassName("docInput", "table", mainPanel._controlDiv)[0];
    var newTR = MAT.Dom._buildElement("tr", {
      attrs: {className: "writeOnly"}
    });
    tbl.appendChild(newTR);
    addMenuHTML(newTR, appDoc, mainPanel);
  }

  function addWorkspaceMenuHTML(wsDoc, mainPanel) {
    var oMenu = mainPanel.getControlElement("panel_operationmenu");
    var tr = oMenu.parentNode.parentNode;
    // Insert this new row before the last two lines.
    var newTR = MAT.Dom._buildElement("tr");
    tr.parentNode.insertBefore(newTR, tr);
    addMenuHTML(newTR, wsDoc, mainPanel);
  }

  // I'm going to add a sequence of select and deselect actions which
  // are done at the appropriate times. 
  
  function addMenuHTML (parentTR, appDoc, mainPanel) {
    parentTR.id = mainPanel.newId("deidReplacerMenuSpan");
    parentTR.appendChild(MAT.Dom._buildElement("td", {
      children: [{
        label: "span",
        text: "Replacer:"
      }]
    }));
    parentTR.appendChild(MAT.Dom._buildElement("td", {
      children: [{
        label: "select",
        attrs: {
          id: mainPanel.newId("replacermenu"),
          name: "replacer",
          onchange: function () { updateFromReplacerMenu(appDoc, mainPanel); },
          disabled: true
        },
        children: [{
          label: "option",
          attrs: {
            value: "",
            text: "Select replacer..."
          }
        }]
      }]
    }));
    augmentMainPanelSelect(mainPanel);
  }

  // In the new UI, we add a nomination tab.
  
  function addNominateBlock (mainPanel) {
    // Needed in nominate step in workspaces.
    augmentMainPanelSelect(mainPanel);
    if (!mainPanel._nominateDiv) {
      mainPanel._nominateDiv = MAT.Dom._buildElement("div", {
        style: {
          height: "100%",
          width: "100%",
          overflow: "auto"
        }
      });
      mainPanel._nominateTab = new MAT.WorkbenchUI.UITabContent(mainPanel._ui._detailsTabView,
                                                                "Nominations", "Nominations", mainPanel._nominateDiv);
      // Here's how to select.
      function nominationSelect() {
        // nominationTabVisible is set when we've passed the nominate step,
        // and unset when we undo it.
        if (mainPanel._nominationTabVisible) {
          mainPanel._nominateTab.show();
        }
      }
      mainPanel._selectActions.push(nominationSelect);
      mainPanel._deselectActions.push(function () { mainPanel._nominateTab.hide(); });
    }
  }

  // In the 2.0 UI, we're just going to split the docdiv.
  // But we also need to make sure that select and deselect work -
  // the save menu gets added THEN. Of course, if this
  // is currently selected...
  
  function addRenderColumn (appDoc, mainPanel) {
    // Must be a DIFFERENT ID. 
    var div = mainPanel._ui.fromTemplate("docColumnContainerTemplate", "docRender", mainPanel._docLabel+"_repl");
    div.style.display = "none";
    div.style.left = "50%";
    div.style.borderLeft = "1px solid black";
    div.style.paddingLeft = "1%";
    div.style.width = "49%";
    mainPanel._docDiv.appendChild(div);
    mainPanel._replDiv = div;

    // And now, set the callbacks, now that the elements
    // are hooked up.
    
    // Now, we need to put together the save menu list.
    // Create a factory function so we get the right encapsulations.

    // We enable "Save replacement..." once the replacement is visible.

    function renderSelect() {

      var saveMenuItems = mainPanel.createSaveMenuItems({
        formatSuffixForLogging: ",transformed",
        saveTypeForLogging: "save_repl",
        saveCb: function(context, appDoc, format, parameters) {
          saveReplDocument.call(context, appDoc, format, parameters);
        }
      });

      mainPanel._ui._addMenuBarItems(["File"], [{
        text: "Save replacement...",
        disabled: !mainPanel._replacementVisible,
        submenu: {
          id: "savereplmenu",
          itemdata: saveMenuItems
        }
      }], 3);
    }

    function renderDeselect() {
      mainPanel._ui._removeMenuBarItems(["File"], ["Save replacement..."], 3);
    }
    mainPanel._selectActions.push(renderSelect);
    mainPanel._deselectActions.push(renderDeselect);
    // If we're already selected...
    if (mainPanel._tabView.currentTabContent === mainPanel) {
      renderSelect();
    }      
  }
  

  var DeidentificationFolders = {
    "redacted, rich": {
      setExtraDataFields: function(responseObj) {
        if (responseObj.assigned_to) {
          return {"Assigned to": responseObj.assigned_to};
        } else {
          return null;
        }
      },
      folder_read_only: true,
      docDo: function (ws, o, folderName, fileName, wsDoc) {
        // Ignore any existing wsDoc.
        wsDoc = this._digestWorkspaceDoc(ws, o, folderName, fileName, null);
        return wsDoc;
      },
      uiDo: function (wsDoc) {
        wsDoc._context.ui.notifyDocumentPresent(wsDoc.docLabel);
      }
    },
    "redacted, raw": {
      setExtraDataFields: function(responseObj) {
        if (responseObj.assigned_to) {
          return {"Assigned to": responseObj.assigned_to};
        } else {
          return null;
        }
      },
      folder_read_only: true,
      docDo: function (ws, o, folderName, fileName, wsDoc) {
        // Ignore any existing wsDoc.
        wsDoc = this._digestWorkspaceDoc(ws, o, folderName, fileName, null);        
        return wsDoc;
      },
      uiDo: function (wsDoc) {
        wsDoc._context.ui.notifyDocumentPresent(wsDoc.docLabel);
      }
    },
    // The only reason to have this one is to have a chance to review documents.
    // Otherwise, there's no point.
    "nominated": {
      setExtraDataFields: function(responseObj) {
        if (responseObj.assigned_to) {
          return {"Assigned to": responseObj.assigned_to};
        } else {
          return null;
        }
      },
      operations: {
        "Transform": {
          name: "nominate_save",
          defaultOperation: true,
          getParameters: function (wsDoc) {
            var p = {"transform": "yes", "retain_existing": "yes", lock_id: wsDoc.getLockId()};
            if (wsDoc.currentDocument.isDirty()) {
              p.doc = JSON.stringify(wsDoc.getWorkspace()._taskConfig.serialize(wsDoc.currentDocument));
            }
            return p;
          },
          // The other thing that needs to happen is that I need to close the window that's displaying
          // the doc, since if it was transformed, it's no longer in core. Or maybe the window
          // needs to revert to the core folder.
          // But how do I find the source document? Duh. This IS the source document.
          onSuccess: function (wsDoc) {
            wsDoc.currentDocument.notDirty();
            var docPane = wsDoc._context.ui._windowHash[wsDoc.docLabel].mainPanel;
            // I can't call closePanel, because it takes an event argument.
            // So I have to call its bits.
            // The problem is that if the selected folder is "nominated" in
            // the UI folder view, this will fire a release_lock, but there's no
            // guarantee the folder re-list will be done. The thing is, the
            // file is already gone; so no release lock should be needed.
            wsDoc.setLockId(null);
            wsDoc._context.destroyDocument(wsDoc.docLabel);
          }
        },
        "Save": {
          name: "nominate_save",
          getParameters: function (wsDoc) {
            var p = {lock_id: wsDoc.getLockId()};
            if (wsDoc.currentDocument.isDirty()) {
              p.doc = JSON.stringify(wsDoc.getWorkspace()._taskConfig.serialize(wsDoc.currentDocument));
            }
            return p;
          },
          onSuccess: function(wsDoc) {
            wsDoc.currentDocument.notDirty();
          }
        }
      },
      // Conveniently enough, I copied this code from the redacted cases, which
      // force a new window to be created. I didn't realize that this is what
      // I wanted in this case as well - but I do, since I have to CLOSE this
      // window again when we transform, because the transform step clears
      // the nominated folder.
      docDo: function (ws, o, folderName, fileName, wsDoc) {
        // Ignore any existing wsDoc, if this is a new doc coming back.
        // Otherwise, reuse.
        if (wsDoc && (wsDoc.getFolder() == folderName)) {
          wsDoc = this._digestWorkspaceDoc(ws, o, folderName, fileName, wsDoc);
        } else {
          wsDoc = this._digestWorkspaceDoc(ws, o, folderName, fileName, null);
        }
        return wsDoc;
      },
      uiDo: function (wsDoc) {
        wsDoc._context.ui.notifyDocumentPresent(wsDoc.docLabel);
        var docPane = wsDoc._context.ui._windowHash[wsDoc.docLabel].mainPanel;
        addNominateBlock(docPane);
        nominationUiDo(wsDoc, wsDoc.getWorkspace().getTask());
      }
    },
    "core": {
      operations: {
        "Nominate": {
          name: "nominate",
          condition: function (wsDoc) {
            var s = wsDoc.getExtraDataField("Status");
            return (s == "reconciled") || (s == "gold");
          },
          getParameters: function (wsDoc) {
            if (wsDoc._data.replacer) {
              // By default, the redacted folders are cleared.
              // This makes sense when you're doing a big batch redaction,
              // but if we're doing a single document, then we probably want
              // to retain them.
              return {replacer: wsDoc._data.replacer, lock_id: wsDoc.getLockId()};
            } else {
              return {lock_id: wsDoc.getLockId()};
            }              
          }
        },
        "Redact": {
          name: "redact",
          condition: function (wsDoc) {
            var s = wsDoc.getExtraDataField("Status");
            return (s == "reconciled") || (s == "gold");
          },
          getParameters: function (wsDoc) {
            if (wsDoc._data.replacer) {
              // By default, the redacted folders are cleared.
              // This makes sense when you're doing a big batch redaction,
              // but if we're doing a single document, then we probably want
              // to retain them.
              return {replacer: wsDoc._data.replacer,
                      retain_existing: "yes"};
            } else {
              return {retain_existing: "yes"};
            }              
          }
        }
      }
    }
  };
  
  var DeidentificationClass = function () {
    DeidentificationClass.superclass.constructor.call(this);
    this.copySteps(DeidentificationSteps);
    this.copyWorkspaceFolders(DeidentificationFolders);
  };

  YAHOO.extend(DeidentificationClass, MAT.CoreTask, {

    serialize: function(metadoc) {
      var obj = DeidentificationClass.superclass.serialize(metadoc);
      // Now, update the JSON conversion. Basically, transform
      // can't be on the phasesDone list. Note that "this"
      // will be the annotated document.
      var m = obj.metadata.phasesDone;
      obj.metadata.phasesDone = [];
      for (var i = 0; i < m.length; i++) {
        if (m[i] != "transform") {
          obj.metadata.phasesDone.push(m[i]);
        }
      }
      return obj;
    },

    workflowConfigure: function(appDoc) {

      // We need to modify the appDoc so that its updateFromWorkflow()
      // method is specific to the appDoc itself, and it calls
      // populateReplacerMenu. I have to ensure that this only
      // happens ONCE, because I'm going to call configure in
      // the load completion callback, which will clean things
      // up considerably, and ensure that populateReplacerMenu
      // always has a document to work with, among other things.

      var ui = appDoc._context.ui;
      var wEntry = ui._windowHash[appDoc.docLabel];
      if (wEntry) {
        // SHIM FOR COMPATIBILITY WITH 1.3 UI. In 1.3, these three functions
        // all do the same thing - in the new UI, they're different.
        if (!wEntry.mainPanel.getControlElement) {
          wEntry.mainPanel.getControlElement = function(elt) {
            return wEntry.mainPanel.getElement(elt);
          }
        }
        if (!wEntry.mainPanel.getGlobalElement) {
          wEntry.mainPanel.getGlobalElement = function (elt) {
            return wEntry.mainPanel.getElement(elt);
          }
        }
        if (!wEntry.mainPanel.getControlElement("replacermenu")) {
          addWorkflowMenuHTML(appDoc, wEntry.mainPanel);
          addNominateBlock(wEntry.mainPanel);
          addRenderColumn(appDoc, wEntry.mainPanel);
          var coreUpdateFromWorkflow = appDoc.updateFromWorkflow;
          appDoc.updateFromWorkflow = function () {
            // Not good enough to set it to null - have to remove it.
            appDoc.clearConfiguration(["replacer"]);
            coreUpdateFromWorkflow.call(appDoc);
            var wfObj = appDoc.getCurrentWorkflow();
            var replacers = wfObj.workflowData.uiSettings.replacers;
            populateReplacerMenu(appDoc, wEntry.mainPanel, replacers);
          }
        }
      }
    },

    workspaceDocumentConfigure: function(wsDoc) {

      // We have to add the redaction menu. Where?
      // In the document. Even though our workspace
      // never changes, we have to postpone the window
      // update until the window is created.      
      
      var coreNotifyWorkspaceDocument = wsDoc.notifyWorkspaceDocument;
      wsDoc.notifyWorkspaceDocument = function () {
        coreNotifyWorkspaceDocument.call(wsDoc);
        var ui = wsDoc._context.ui;
        var wEntry = ui._windowHash[wsDoc.docLabel];
        if (wEntry) {
          if (!wEntry.mainPanel.getControlElement) {
            wEntry.mainPanel.getControlElement = function(elt) {
              return wEntry.mainPanel.getElement(elt);
            }
          }
          if (!wEntry.mainPanel.getGlobalElement) {
            wEntry.mainPanel.getGlobalElement = function (elt) {
              return wEntry.mainPanel.getElement(elt);
            }
          }
          // First, see if there's a replacer menu. If there isn't
          // see whether we're in the core folder, and
          // make sure that if we're in the core folder
          // that there's a menu AND it's visible, if the
          // document is redactable (i.e., it's gold or reconciled). Otherwise,
          // if there's a menu, set its display to none.
          var rMenu = wEntry.mainPanel.getControlElement("deidReplacerMenuSpan");
          var currentFolder = wsDoc.getFolder();
          if ((currentFolder == "core") && ((wsDoc.getExtraDataField("Status") == "gold") || (wsDoc.getExtraDataField("Status") == "reconciled"))) {
            // Make sure there's an rMenu.
            if (!rMenu) {
              addWorkspaceMenuHTML(wsDoc, wEntry.mainPanel);
              // The replacer workflow is extracted from the
              // settings for the workflow in the redact action.
              var ws = wsDoc.getWorkspace();
              var taskTableEntry = wsDoc._context.taskTable[ws.getTask()];
              var replacers = taskTableEntry.workspaceReplacers;
              populateReplacerMenu(wsDoc, wEntry.mainPanel, replacers);
            } else {
              rMenu.style.display = null;
            }
          } else if (rMenu) {
            rMenu.style.display = "none";
          }            
        }
      }
    }
  });

  MAT.TaskConfig.Deidentify = new DeidentificationClass();
  
}());
