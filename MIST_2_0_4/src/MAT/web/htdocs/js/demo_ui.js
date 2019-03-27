/* Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
file LICENSE for license terms. */

/* This file serves as the proxy for whatever UI is being used in the
   annotation visualization tool. It implements a number of public
   functions. */

/* The simple UI assumes that prototype.js has been imported.
   See http://www.prototypejs.org/. */

/* Also, it assumes that mat_utils.js has been imported. */

MAT.DemoUI = function (demoConfig, demoName) {
  MAT.CoreUI.call(this);
  this.demoConfig = demoConfig;
  this.currentConfig = null;
  this.currentData = {};
  this._currentDocLabel = null;
  this._currentInputDocument = null;
  this.demoName = demoName;
  this.tabs = null;
  // If we try to load the legend before the UI
  // is hooked up to the context, this will be set.
  // See setContext.
  this._postponedLegendLoad = false;
  this._taskTableNotified = false;
  this._demoSetup();
}

/*
 *             PUBLIC  API
 *
 * These functions are used by the context object, at least.
 * Every UI which the annotation tool uses must implement them.
 *
 */

YAHOO.extend(MAT.DemoUI, MAT.CoreUI, {
  
  // Copied directly from simple_ui.js.  
    
  notifyTaskTable: function(taskTable) {
    // First, make sure the table's been augmented appropriately.
    MAT.DemoUI.superclass.notifyTaskTable.call(this, taskTable);
    this._populateStyleSheetFromTaskTable(taskTable, "tag_styles");    
    if (this._postponedLegendLoad) {
      if (this.currentConfig) {
        this._populateTagLegend(this.currentConfig.engine_settings.task, $$$("legendDiv"));
      }
      this._postponedLegendLoad = false;
    }
    this._taskTableNotified = true;
  },

  notifyStepsUnderway: function(docLabel, steps) {
    // Show the busy element, disable the button.
    if ($$$("demoButton")) {
      $$$("demoButton").disabled = true;
    }
    $$$("busyimg").style.display = null;
  },

  notifyStepsAvailable: function () {
  },

  notifyStepDone: function () {
  },

  notifyNothingUnderway: function(docLabel) {
    if ($$$("demoButton")) {
      $$$("demoButton").disabled = false;
    }
    $$$("busyimg").style.display = "none";
    // At this point, the document should be ready for presentation.
    this._presentDocument(this._context.getDocument(docLabel).currentDocument, $$$("docOutputDiv"));
    this._selectTab(1);
  },  

/*
 *
 * PANEL UI
 *
 */

  handAnnotationUnavailable: function() {
  },

  notifyHandAnnotationAvailability: function () {
  },
  
  mouseOverAnnotations: function (params) {
  },

  cancelMouseOverAnnotations: function () {
  },

  getTaskName: function() {
    return this.currentData.task;
  },

  uiError: function(msg) {
    return this.error("doc", msg);
  },

  uiInform: function(msg) {
    return this.inform("doc", msg);
  },
  
  uiTell: function(msg, title /*, params */) {
    if (arguments.length > 2) {
      return this.tell("doc", msg, title, arguments[2]);
    } else {
      return this.tell("doc", msg, title);
    }
  },

  uiPopup: function(text, pId, pHeader, buttonList /*, popupParams */) {
    if (arguments.length > 4) {
      return this.popup("doc", text, pId, pHeader, buttonList, arguments[4]);
    } else {
      return this.popup("doc", text, pId, pHeader, buttonList);
    }
  },
  
  uiGetDisplayCounter: function() {
    return this.getDisplayCounter();
  },

  getConfigVar: function(v) {
    // See workbench_ui.js. We may be able to make some of them
    // true eventually, but for the moment, they're false. All of them.
    return false;
  },

  uiClearPane: function(div) {
    this.clearPanes(div);
  },

  notifyHandAnnotationPerformed: function() {
    this._context.handAnnotationChanged(this._currentDocLabel);
  },

  log: function(params) {
  },

  getDocument: function() {
    return this._context.getDocument(this._currentDocLabel);
  },
    
  offerAnnotationPopup: function(e, gestureBundle) {
  },
             
  offerAnnotationEditor: function(annot /*, clientInfo */) {
  },

/*
 *
 * PUBLIC, BUT SPECIFIC TO THE DEMO
 *
 */

  processDocument: function () {
    var docLabel = this._currentDocLabel;
    var doc = this._context.getDocument(docLabel);
    var inputDoc = this._currentInputDocument;
    if (this.currentData.editable) {
      var text = $$$("inputText").value;
      inputDoc.doc.signal = text;
    }
    // Set up the processing, by copying the input document
    // over to the document to be processed.
    doc.currentDocument = inputDoc.copy();
    // Don't configure. That'll pull in the task config for the actual UI,
    // which assumes it's talking to the simple UI.
    // doc.configure();
    // If there's no step defined, it'll default to the default step,
    // which does the right thing.    
    var steps = this.currentConfig.engine_settings["steps"].split(",");
    // And now, try to execute it.
    this._context.backend.stepsForward(doc, steps);
  },

  // This is essentially the callback from the document load.
  // The issue here is that we need to COPY this document, because
  // the Input pane may ultimately have something different
  // than the Output pane, and every time you press "Go",
  // you want the same thing  to happen.
  
  notifyDocumentPresent: function(docLabel) {
    // We only have one document at a time, so the only important
    // thing is to do the right thing with editable or not. 
    // The document object itself has already been updated.
    var doc = this._context.getDocument(docLabel);
    this._currentInputDocument = doc.currentDocument.copy();
    if (this.currentData.editable) {
      $$$("unEditableDocInputDiv").style.display = "none";
      $$$("inputText").style.display = null;
      // Set the signal to the signal here.
      this._populateInputText(this._currentInputDocument.doc.signal);
    } else {
      $$$("inputText").style.display = "none";
      $$$("unEditableDocInputDiv").style.display = null;
      this._presentDocument(this._currentInputDocument, $$$("unEditableDocInputDiv"));
    }
  },

/*
 *             PRIVATE FUNCTIONS
 *
 */

  _demoSetup: function () {
    // Set up the tab view.
    this.tabs = new YAHOO.widget.TabView("docPresentationDiv");
    // Grab the config div.
    var div = $$$("configDiv");
    var header = document.createElement("span");
    header.innerHTML = "<span style='font-weight: bold'>What this demo does:</span>";
    div.appendChild(header);    
    if (this.demoConfig.length == 1) {
      div.appendChild(document.createTextNode(" " + this.demoConfig[0].description));
      var newDiv = document.createElement("div");
      newDiv.id = "docSetupDiv";
      div.appendChild(newDiv);
      this.currentConfig = this.demoConfig[0];
      this._implementConfig(0);
    } else if (this.demoConfig.length > 1) {

      var ui = this;
      function configDocuments (menu) {
        ui._clearDocumentInput();
        ui._clearDocumentPresentation();
        ui.currentConfig = ui.demoConfig[menu.selectedIndex];
        ui._implementConfig(menu.selectedIndex);
      }
      
      div.appendChild(document.createTextNode(" "));
      var select = document.createElement("select");
      div.appendChild(select);
      for (var i = 0; i < this.demoConfig.length; i++) {
        var o = document.createElement("option");
        o.value = i;
        select.appendChild(o);
        o.appendChild(document.createTextNode(this.demoConfig[i].description));
      }

      var newDiv = document.createElement("div");
      newDiv.id = "docSetupDiv";
      div.appendChild(newDiv);

      select.onchange = function () { configDocuments(select); };

      configDocuments(select);
      
    }
  },

  _implementConfig: function (whichConfig) {

    var div = $$$("docSetupDiv");
    div.innerHTML = "";
    var p = div.appendChild(document.createElement("p"));
    var config = this.currentConfig;
    var ui = this;
    if (config.documents.length > 0) {
      // Create a button element.
      var menuElements = [];
      function fnFactory (index, desc) {
        return function (p_sType, p_aArgs, p_oItem) {
          ui._fetchDocumentInput(index, desc);
        }
      }
      for (var i = 0; i < config.documents.length; i++) {
        var text = config.documents[i].description;
        if (config.documents[i].editable) {
          text += " (editable)";
        }
        menuElements.push({
          text: text,
          value: i,
          onclick: {
            fn: fnFactory(whichConfig, config.documents[i].description)
          }
        });
      }
      
      if (config.enable_blank_document) {
        menuElements.push({
          text: "Blank document (editable)",
          onclick: {
            fn: function (p_sType, p_aArgs, p_oItem) {
              ui._fetchBlankDocument(whichConfig);
            }
          }
        });
      }
          
      var b = new YAHOO.widget.Button({
        type: "menu",
        label: "Choose a document",
        name: "docmenubutton",
        menu: menuElements});
      b.appendTo(p);
      p.appendChild(document.createTextNode(", or type or paste into the input pane, and "));
    } else {
      p.appendChild(document.createTextNode("Type or paste into the input pane, and "));
          
    }
    new YAHOO.widget.Button({
      label: "go!",
      id: "demoButton",
      onclick: {
        fn: ui.processDocument,
        scope: ui
      }
    }).appendTo(p);

    if (this._taskTableNotified) {
      // Load the legend.
      this._populateTagLegend(config.engine_settings.task, $$$("legendDiv"));
    } else {
      this._postponedLegendLoad = true;
    }
  },
    
  // Originally, what I did here was just call asyncRequest, but the problem
  // is that that assumes nothing about the character encoding of the document,
  // and basically only UTF-8 or ASCII works. So I need to retool the sample
  // document stuff, and use the normal load function to retrieve the doc.
  // Also, I may want to start with already annotated documents. So I need
  // to know whether it's (a) raw or mat-json, (b) if raw, editable and encoding.
  
  _fetchDocumentInput: function (whichConfig, docName) {    
    // Get the doc.
    this._clearDocumentInput();
    this._clearDocumentPresentation();
    var config = this.demoConfig[whichConfig];
    for (var i = 0; i < config.documents.length; i++) {
      if (docName == config.documents[i].description) {
        var docSpec = config.documents[i];
        this.currentData = {
          input_file: docSpec.location,
          demo: this.demoName,
          encoding: docSpec.encoding,
          file_type: docSpec.file_type,
          // This isn't in the core, but I need to carry it forward.
          editable: docSpec.editable
        };
        
        for (var key in this.currentConfig.engine_settings) {
          // steps can't be provided during load.
          if (key != "steps") {
            this.currentData[key] = [this.currentConfig.engine_settings[key]];
          }
        }
        var docLabel = this._context.newDocument(this.currentData);
        // Store the doc label for when I process the document.
        // Somehow, we have to avoid configuring in loadAndDisplayDocument, because
        // we need to avoid pulling in the actual UI modifications.
        // The easy answer is: don't use loadAndDisplayDocument, which I'm
        // removing anyway.
        // Note that here we're calling loadDocument as AJAX, and
        // CherryPy uses the presence of input_file to return different
        // headers than if it were a file upload.
        this._currentDocLabel = docLabel;
        var doc = this._context.getDocument(docLabel);
        var ui = this;
        this._context.loadDocument(docLabel, null);
      }
    }    
  },

  _fetchBlankDocument: function (whichConfig) {
    // Get the doc.
    this._clearDocumentInput();
    this._clearDocumentPresentation();
    var config = this.demoConfig[whichConfig];
    this.currentData = {
      demo: this.demoName,
      // This isn't in the core, but I need to carry it forward.
      editable: true
    };
        
    for (var key in this.currentConfig.engine_settings) {
      // steps can't be provided during load.
      if (key != "steps") {
        this.currentData[key] = [this.currentConfig.engine_settings[key]];
      }
    }

    var docLabel = this._context.newDocument(this.currentData);
    // Store the doc label for when I process the document.
    // Somehow, we have to avoid configuring in loadDocument, because
    // we need to avoid pulling in the actual UI modifications.
    this._currentDocLabel = docLabel;
    var doc = this._context.getDocument(docLabel);
    doc.configure = function () {};
    doc.currentDocument = new MAT.Annotation.AnnotatedDocWithMetadata().fromJSON({
      signal: "",
      asets: [],
      metadata: {}
    }, doc.getAnnotationTypeRepository());
    this._currentInputDocument = doc.currentDocument.copy();
  },

  _populateInputText: function(text) {
    $$$("inputText").value = text;
  },

  _clearDocumentInput: function() {
    $$$("inputText").value = "";
    $$$("unEditableDocInputDiv").innerHTML = "";
    $$$("unEditableDocInputDiv").style.display = "none";
    $$$("inputText").style.display = null;
  },

  _clearDocumentPresentation: function () {
    $$$("docOutputDiv").innerHTML = "";
    // Nothing to look at anymore; switch back to input.
    this._selectTab(0);
  },

  _selectTab: function(idx) {    
    // Not in 2.6.0. this.tabs.selectTab(1);
    this.tabs.set('activeTab', this.tabs.getTab(idx));
  },

  _presentDocument: function(annotatedDoc, div) {    
    div.innerHTML = "";
    var docDisplay = new MAT.DocDisplay.DocDisplay(this, this._context, div, {
      doc: annotatedDoc.doc,
      disableHandAnnotationFirst: true
    });
  }

});


/*
 *                    YAHOO extensions
 *
 *
 * I want to build some stuff on top of the YUI library, but the 
 * loader doesn't guarantee when it's loaded. So...
 *
 */

MAT.DemoUI.loadYUIExtensions = function () {
  MAT.YUIExtensions.loadBugFixes();
}
