/* Copyright (C) 2011 The MITRE Corporation. See the toplevel
file LICENSE for license terms. */

/* This file provides a wrapper around a standalone document
   viewer which you can use independently of the rest of MAT. The only
   requirement is that your documents be a Javascript object which
   has the format of a MAT-JSON document. There are no external
   Javascript library dependencies such as jQuery. You must include
   the following files (assuming that this was delivered to you
   with a directory which contains js and css subdirectories):

<script type="text/javascript" src="<matdocdisplayroot>js/mat_utils.js"></script>
<script type="text/javascript" src="<matdocdisplayroot>js/mat_core.js"></script>
<script type="text/javascript" src="<matdocdisplayroot>/js/core_ui.js"></script>
<script type="text/javascript" src="<matdocdisplayroot>/js/mat_doc_display.js"></script>
<link rel="stylesheet" type="text/css" href="<matdocdisplayroot>/css/mat_core.css">

(If you want the viewer to be able to annotate as well, you'll need to add the following
three files. These must appear BEFORE mat_standalone_doc_viewer.js appears.

<script type="text/javascript" src="<yui260distroot>/build/yuiloader/yuiloader.js" ></script>
<script type="text/javascript" src="<matdocdisplayroot>/js/workbench_ui_popup_mgr.js"></script>
<link href="<matdocdisplayroot>/css/workbench_ui_annotation.css" rel="stylesheet" type="text/css">)

<script type="text/javascript" src="<matdocdisplayroot>/js/mat_standalone_doc_viewer.js"></script>

If you load YUI, you'll need to wrap any code that creates a document viewer
in the MAT.DocDisplay.StandaloneViewer.waitForYUI function.

NOTE: There is a bug in Firefox 9 where if the first element of the document body
is a block whose default style has a top margin, such as <p>, the annotation 
popup will insert an invisible monitor element which causes the top margin of the
first block element to no longer collapse. You can get around this by enclosing the
entire body of the document in a <div>.

You use the viewer as follows:

*/

(function () {

  var yuiAvailable = true;
  var yuiLoaded = false;
  
  // First, check to see if we've loaded the YUI loader.
  if ((typeof(YAHOO) === "undefined") || (typeof(YAHOO.util) === "undefined") || (typeof(YAHOO.util.YUILoader) === "undefined")) {
    yuiAvailable = false;
  }

  /* params are:

  tags: An ordered list of Javascript objects, with the following values:
        css, label. The elements will be listed in the legend in the order given. The CSS
        will apply to every subspan of the marked text (the text may be divided into subspans
        if annotations overlap), so using left and right borders is not recommended.

        Example:
        [{label: "PERSON", css: "background-color: blue"}]

        Optionally, if you have ENAMEX-style tags and you want them to have a "pretty name",
        you can also have attrs, which is a list of 2-element pairs of 
        attributes and values, and effectiveLabel, which is the "pretty name", e.g.:
        [{label: "EXAMEX", attrs: [["TYPE", "PER"]], effectiveLabel: "PERSON", css: "background-color: blue"}]

        Either tags or atr or taskATRFragment must be provided.
  atr: A more elaborate format for annotation sets, which allows you to specify attributes and other elements.
    Either tags or atr or taskATRFragment must be provided.
  taskATRFragment: The most elaborate format for annotation sets, which allows you to specify
    hierarchies for tagging, etc. See the documentation. Either tags or atr or taskATRFragment
    must be provided.
  div: Required. An HTML element in which the document display can be rendered.
  legendDiv: Optional. An HTML element in which the legend can be rendered.
  editorDiv: Optional. An HTML element in which any annotation editors/viewers can be rendered. They will
    be popped up otherwise.
  editorContainer: Optional. A Javascript object which manages an editor div. You might want this
    if, e.g., you want the object to do something when the annotation is changed or deleted. This
    object should implement the methods getAnnotationDisplayDiv(), which should return a div
    into which the display is rendered, and notifyVisualDisplay(annot, disp), which notifies the container
    that a display is available. The container is now responsible for implementing the display
    API, namely calling annot.addVisualDisplay(disp) and annot.removeVisualDisplay(disp) at the
    appropriate times, and also forceDisplayResponse() and forceRemoveRedisplayResponse(), which
    should at least call those same methods on the disp. Only one of editorDiv and editorContainer
    can be specified.
  taskName: Optional. The name of your tagging task. This may not be used visibly anywhere.
            Default is "ThisTask".
  annotatable: Optional. Set to true if you want the option of annotating this document.
               Default is false. Once this option is set, you can use the enableHandAnnotation()
               and disableHandAnnotation() methods to enable and disable hand annotation, respectively.
  textRightToLeft: Optional. A boolean. Set it if you're in a right-to-left language, e.g., Arabic.
  callbacks: Optional. A Javascript object optionally defining a number of callbacks. These
             are:

    uiError(msg) : a function which will report an error message to your UI. If not defined,
                  alert() will be used.

    uiInform(msg) : a function which will report an status message to your UI. If not defined,
                  alert() will be used.

    uiclearPane(div): a function which will clear a div. By default, every child of the
                      div is removed.

    mouseOverAnnotations(params): called when the mouse hovers over an annotation.
                                  params is an object with attributes type, labels (a list) and suffix.

    cancelMouseOverAnnotations(): called when the mouse exits hovering over an annotation.
                                  Default is to do nothing.

    There are three other possible callbacks, which involve providing user feedback for
    hand annotation, when it's enabled. You can inspect the source code here and in mat_doc_display.js to
    see what's going on (but you'll really need the full MAT distribution and the workbench_ui.js
    UI example to see how to use them, really). There's a fourth callback
    which reports log information (again, not documented here).
  
  */
  
  MAT.DocDisplay.StandaloneViewer = function(params) {
    // Let's make sure this can be specialized. In order to do that,
    // there has to be an option so we can create a prototype.
    if (arguments.length == 0) {
      // Only for a prototype.
      return;
    }
    if ((!params.tags) && (!params.atr) && (!params.taskATRFragment)) {
      throw "No tags or atr or taskATRFragment parameter for standalone viewer";
    }
    MAT.CoreUI.call(this);
    this.taskName = params.taskName || "ThisTask";
    
    // Let's get the DIV here, because if we're going to
    // make things annotatable, we need to change this.
    if (!params.div) {
      throw "No main div for standalone viewer";
    }
    if (params.div.children.length > 0) {
      throw "Main div has children";
    }
    this.div = params.div;
    this.chooseModeMgr = null; 
    this.annotatable = false;
    this.handAnnotationEnabled = false;
    this.popupMgr = null;
    var displayConfig = null;
    this.docDisplay = null;
    this.yuiExtensionsAvailable = false;
    // So the logic is: if YUI is present, I should be able to build a
    // popup manager. If annotatable is true, but YUI is NOT present,
    // warn.
    if (yuiLoaded) {
      if (!MAT.YUIExtensions) {
        alert("You've loaded YUI, but not the MAT YUI extensions. Be sure to include workbench_ui_popup_mgr.js");
      } else {
        this.yuiExtensionsAvailable = true;
        MAT.YUIExtensions.loadBugFixes();
        // Build a div to hang the popup off of.
        var newDiv = document.createElement("div");
        
        newDiv.className = "yui-skin-sam";
        // I need this set because the appended popups should have
        // that font, and I don't want to use the .docView class,
        // because it's just for the actual document display.
        newDiv.style.fontFamily = "sans-serif";
        this.div.appendChild(newDiv);
        
        // Very, very subtle issue: we have a popup mgr which uses the same
        // div as the viewer; but that means when the viewer is cleared, the
        // popups are also cleared - and that's all wrong. So we have to make
        // sure that the PARENT div is passed to the popup mgr.
        // That means that in order for the new div to have the proper skin,
        // but NOT be clearable, we need yet another div for this.div.

        this.overlayMgr = new YAHOO.widget.OverlayManager();
        this.popupMgr = new MAT.YUIPopupManager(newDiv, this.overlayMgr);
        var newerDiv = document.createElement("div");
        newDiv.appendChild(newerDiv);        
        this.div = newerDiv;
        if (params.annotatable) {
          this.annotatable = true;
        }
        this.chooseModeMgr = new MAT.DocDisplay.ChooseModeManager(this);
      }
    } else if (params.annotatable) {
      if (yuiAvailable) {
        alert("Can't make the standalone viewer annotatable - YUI appears not to have finished loading. Try using MAT.DocDisplay.StandaloneViewer.waitForYUI.");
      } else {
        alert("Can't make the standalone viewer annotatable - YUI is not available. Make sure you've included it.");
      }
    }

    // Make sure this.div has an ID. If it doesn't, make one.
    // This is important for setting up the stacking annotation environment.
    // If you end up with two standalone displays, you probably want them separate.
    if (!this.div.id) {
      var i = 0;
      while (document.getElementById("mat_standalone_dv_" + i)) {
        i += 1;
      }
      this.div.id = "mat_standalone_dv_" + i;
    }

    // Set up resize handling. So first, there's debouncing to deal with:
    
    // http://unscriptable.com/2009/03/20/debouncing-javascript-methods/

    // I've looked
    // at this on Firefox and Safari on the Mac; it's 200ms on FF and 50ms on Safari for
    // resize intervals when the resize is smooth.

    this._resizeTimeout = null;
    var panel = this;

    var currentResizeHandler = window.onresize;
    
    window.onresize = function () {
      if (currentResizeHandler) {
        currentResizeHandler();
      }
      if (panel._resizeTimeout) {
        clearTimeout(panel._resizeTimeout);
      }
      panel._resizeTimeout = setTimeout(function () {
        panel._resizeTimeout = null;
        panel._doResize();
      }, 400);
    };
        
    // Set up the tag table. We have three choices, in increasing order of complexity.
    // params.tags, params.atr, params.taskATRFragment.
    var annotationSetRepository = null;
    var tagOrder = [];
    var alphabetizeLabels = false;
    var tagHierarchy = null;

    if (params.taskATRFragment) {
      annotationSetRepository = params.taskATRFragment.annotationSetRepository;
      tagOrder = params.taskATRFragment.tagOrder || [];
      alphabetizeLabels = params.taskATRFragment.alphabetizeLabels || false;
      tagHierarchy = params.taskATRFragment.tagHierarchy || null;
    } else if (params.atr) {
      var atrJSON = {};
      annotationSetRepository = {allAnnotationsKnown: false, types: atrJSON};
      // an ordered list of types. Convert to a dictionary.
      for (var i = 0; i < params.atr.length; i++) {
        var thisAD = params.atr[i];
        atrJSON[thisAD.type] = thisAD;
        // If the elements have effective labels, then
        // push the effective labels, otherwise, push the
        // type.
        var foundEffectiveLabels = false;
        if (thisAD.effective_labels) {
          for (var el in thisAD.effective_labels) {
            if (thisAD.effective_labels.hasOwnProperty(el)) {
              foundEffectiveLabels = true;
              tagOrder.push(el);
            }
          }
        }
        if (!foundEffectiveLabels) {
          tagOrder.push(thisAD.type);
        }
      }
    } else {
      var atrJSON = {};
      annotationSetRepository = {allAnnotationsKnown: false, types: atrJSON};
      for (var i = 0; i < params.tags.length; i++) {
        var tag = params.tags[i];
        if (tag.effectiveLabel) {
          tagOrder.push(tag.effectiveLabel);
          var entry = atrJSON[tag.label];
          if (!entry) {
            entry = {
              type: tag.label,
	      attrs: []
            };
            atrJSON[tag.label] = entry;
          }
          if (!entry.effective_labels) {
            entry.effective_labels = {};
          }
          if (tag.attrs.length > 1) {
            this.uiError("only one attribute-value pair permitted for effective label " + tag.effectiveLabel);
            return;
          }
          var effAttr = null;
	  for (var j = 0; j < entry.attrs.length; j++) {
	    if (entry.attrs[j].name == tag.attrs[0][0]) {
              effAttr = entry.attrs[j];
              break;
            }
          }
          if (!effAttr) {
            effAttr = {
              name: tag.attrs[0][0],
              choices: []
            };
            entry.attrs.push(effAttr);
          }
          effAttr.choices.push(tag.attrs[0][1]);
          entry.effective_labels[tag.effectiveLabel] = {
            attr: tag.attrs[0][0],
            val: tag.attrs[0][1],
            display: {
              css: tag.css
            }
          }
        } else {
          tagOrder.push(tag.label);
          var entry = atrJSON[tag.label];
          if (!entry) {
            entry = {
              type: tag.label,
              attrs: []
            }
            atrJSON[tag.label] = entry;
          }
          entry.display = {
            css: tag.css
          }
        }
      }
    }

    this.callbacks = params.callbacks || {};
    this.legendDiv = params.legendDiv || null;
    this.editorContainer = params.editorContainer || null;
    if ((this.editorContainer == null) && params.editorDiv) {
      this.editorContainer = new this._editorContainerCls(params.editorDiv);
    };

    annotationSetRepository.types = this._addRedundantInfo(annotationSetRepository.types);
        
    this._configureTask(tagOrder, annotationSetRepository,
                        alphabetizeLabels, params.textRightToLeft || false,
                        displayConfig, tagHierarchy);
    
  };

  MAT.Extend(MAT.DocDisplay.StandaloneViewer, MAT.CoreUI, {

    _editorContainerCls: MAT.Class(function (editorDiv) {
      this.annot = null;
      this.disp = null;
      this.editorDiv = editorDiv;
    }, {
      // This has to implement: getAnnotationDisplayDiv, notifyVisualDisplay,
      // forceRedisplayResponse, forceRemoveRedisplayResponse.
      getAnnotationDisplayDiv: function() {
        return this.editorDiv;
      },
      
      notifyVisualDisplay: function(annot, disp) {
        // This may be being used by another annotation. Call this first.
        if (this.annot) {
          this.annot.removeVisualDisplay(this);
        }
        this.forceRemoveRedisplayResponse();
        this.annot = annot;
        this.disp = disp;
        // This class must have an ID, and also implement forceRedisplayResponse
        // and forceRemoveRedisplayResponse.
        this.displayId = disp._docPanel.uiGetDisplayCounter();
        annot.addVisualDisplay(this);
      },

      forceRedisplayResponse: function(events) {
        if (this.disp) {
          this.disp.forceRedisplayResponse(events);
        }
      },
      
      forceRemoveRedisplayResponse: function() {
        // The display is removed automatically by the caller.
        if (this.disp) {
          this.disp.forceRemoveRedisplayResponse();
        }
        this.disp = null;
        this.annot = null;
        this.editorDiv.innerHTML = "";
      }        
    }),

    _configureTask: function(tagOrder, asr, alphabetizeLabels, textRightToLeft, 
                             displayConfig, tagHierarchy) {
      this.task = {
        tagOrder: tagOrder,
        annotationSetRepository: asr,
        alphabetizeLabels: alphabetizeLabels,
        textRightToLeft: textRightToLeft,
        displayConfig: displayConfig,
        tagHierarchy: tagHierarchy
      };
    
      this.taskTable = {};
      this.taskTable[this.taskName] = this.task;

      // Now, configure a context.
      new MAT.Context(this, null, null, null);
      this._context.setTaskTable(this.taskTable);
    },

    // The typeD is something that should ultimately be feedable to the
    // global type repository constructor in the types: field. It comes across
    // the wire populated with all sorts of extra information, which we ought
    // to flesh out here if it's not present.
    
    _addRedundantInfo: function(typeD) {      
      for (var k in typeD) {
        if (typeD.hasOwnProperty(k)) {
          var typeEntry = typeD[k];
          // The format of each type entry looks like this:
          // category: <string> - make it "content" if not present
          // set_name: <string> - make it "content" if not present
          // hasSpan: boolean, default is true
          // type: the label. It had better damn well be set,
          //   but we'll check anyway.          
          // allAttributesKnown: boolean, default is false/undefined.
          // attrs: a list of attribute elements. See the
          //   inner loop below.
          // display: optional. See the inner loop below.
          // effective_labels: optional hash. See the inner loop below.
          if (typeEntry.category === undefined) {
            typeEntry.category = "content";
          }
          if (typeEntry.set_name === undefined) {
            typeEntry.set_name = "content";
          }
          if (typeEntry.hasSpan === undefined) {
            typeEntry.hasSpan = true;
          }
          if (typeEntry.type === undefined) {
            typeEntry.type = k;
          }
          if (typeEntry.attrs === undefined) {
            typeEntry.attrs = [];
          } else {
            // Loop through the attrs.
            for (var w = 0; w < typeEntry.attrs.length; w++) {
              var attrEntry = typeEntry.attrs[w];
              // Each attribute entry looks like this:
              // category: <string> - make it "content" if not present.
              // set_name: <string> - make it "content" if not present
              // name: string. Must be present.
              // type: one of string, boolean, int, float, annotation. Default is string.
              // aggregation: one of null, "set", "list". Default is null/undefined.
              // choices: a list of relevant values. Optional.
              // display: hash. Default is null/undefined. Slots are:
              //   editor_style: long_string, short_string
              if (attrEntry.category === undefined) {
                attrEntry.category = "content";
              }
              if (attrEntry.set_name === undefined) {
                attrEntry.set_name = "content";
              }
              if (attrEntry.type === undefined) {
                attrEntry.type = "string";
              }
            }
          }
          // The display entry can have:
          // presented_name: string
          // accelerator: string
          // name: string - flesh this out if not present.
          // css: string
          // edit_immediately: true/false, default is false.
          if (typeEntry.display !== undefined) {
            if (typeEntry.display.name === undefined) {
              typeEntry.display.name = k;
            }            
          }
          // The effective labels entry is a hash from effective
          // label to an entry.
          if (typeEntry.effective_labels !== undefined) {
            for (var j in typeEntry.effective_labels) {
              if (typeEntry.effective_labels.hasOwnProperty(j)) {
                var effectiveLabelEntry = typeEntry.effective_labels[j];
                // The entry looks like this.
                // category: <string> - make it "content" if not present.
                // set_name: <string> - make it "content" if not present
                // attr: a string.
                // val: a string.
                // display: an optional hash. See inner loop below.
                if (effectiveLabelEntry.category === undefined) {
                  effectiveLabelEntry.category = "content";
                }
                if (effectiveLabelEntry.set_name === undefined) {
                  effectiveLabelEntry.set_name = "content";
                }
                if (effectiveLabelEntry.display !== undefined) {
                  // This has:
                  // presented_name: string
                  // accelerator: string
                  // name: provide it if not present.
                  // css: a string.
                  // edit_immediately: boolean.
                  if (effectiveLabelEntry.display.name === undefined) {
                    effectiveLabelEntry.display.name = j;
                  }
                }
              }
            }
          }
        }
      }
      // In case specializations want to muck with this.
      return typeD;
    },

    _doResize: function() {
      var cachedSize = this._cachedSize;
      this._cachedSize = [this.div.offsetHeight, this.div.offsetWidth];
      // Only fire on width changes.
      if (this.docDisplay && cachedSize && (cachedSize[1] != this.div.offsetWidth)) {
        this.docDisplay.onResize();
      }
    },

    newDocument: function(signal) {
      var asets = [];
      /*
      for (var k in this.task.globalAnnotationTypeRepository.typeTable) {
        if (this.task.globalAnnotationTypeRepository.typeTable.hasOwnProperty(k)) {
          // Seed it with the existing types. But make sure you
          // seed it with the right types.
          asets.push({type: k, attrs: [], annots: []});
        }        
      }
      */
      return new MAT.Annotation.AnnotatedDoc().fromJSON({
        signal: signal,
        metadata: {},
        asets: asets
      }, this.task.globalAnnotationTypeRepository);
    },

    // By now, if you swipe, the code which processes the
    // popup request will be the code that generates the
    // "hand annotation is not available" error. What we want
    // to do is disable that even earlier.

    _maybeDisableAnnotationPopup: function(docDisplay) {
      if (!this.annotatable) {
        docDisplay._annotateHandlers = [function (e, idArray, startIndex, endIndex, params) {
          if (params.redrawOnCancel) {
            docDisplay._unswipeRegions(params.redrawOnCancel);
          }
        }];
      }
    },
    
    renderSingleDocument: function(doc) {
      this._reset();
      this.docDisplay = new MAT.DocDisplay.DocDisplay(this, this._context, this.div);
      this._maybeDisableAnnotationPopup(this.docDisplay);
      // Hand annotation availability has to be managed before the document
      // is displayed; otherwise, things that are triggered by hand annotation
      // (e.g., stacking) won't happen on initial display.
      if (this.handAnnotationEnabled) {
        this.docDisplay.handAnnotationAvailable();
      }
      try {
        this.docDisplay.setData(this._ensureDocument(doc));
      } catch (e) {
        this.uiError("Error while digesting document: " + MAT.Annotation.errorToString(e));
      }
    },

    getDocument: function() {
      if (this.docDisplay && (this.docDisplay.constructor == MAT.DocDisplay.DocDisplay)) {
        return this.docDisplay._doc;
      }
    },

    // compEntries is a list of Javascript objects of the
    // form
    // {doc: ..., position: ..., initial: ...}
    // where doc is a Javascript object which is in the form of a MAT-JSON document;
    // position is one of "above", "behind" or "below"; and initial (optional) is a single-character
    // string which is an identifying initial for the annotation set. The order
    // of "above" and "below" objects is determined by the order in the compEntries
    // list. There can be arbitrarily many above and below elements, but only
    // one "behind" element.
    
    renderDocumentAlignment: function(compEntries) {
      this._reset();
      this.docDisplay = new MAT.DocDisplay.ComparisonDocDisplay(this, this._context, this.div);
      this._maybeDisableAnnotationPopup(this.docDisplay);
      
      try {
        var newEntries = [];
        for (var i = 0; i < compEntries.length; i++) {
          newEntries.push({
            position: compEntries[i].position,
            initial: compEntries[i].initial || null,
            doc: this._ensureDocument(compEntries[i].doc)
          });
        }
        this.docDisplay.setData(newEntries);
      } catch (e) {
        this.uiError("Error while digesting document: " + MAT.Annotation.errorToString(e));
      }
    },

    // The comparisonDoc here is a document produced by
    // generateComparisonDocument in Python.
    
    renderDocumentComparison: function(comparisonDoc /* , {pivot: {docName: ..., initial: ...}, others: [{docName: ..., initial: ..., position: ...}]} */) {
      comparisonDoc = this._ensureDocument(comparisonDoc);
      this._reset();
      // As we do in the core, we have to compute
      // the compEntries.
      var _compEntries = [];
      var docData = null;      
      if (arguments.length > 1) {
        docData = arguments[1];
      }
      
      var pairs = comparisonDoc.metadata.comparison.pairs;
      for (var i = 0; i < pairs.length; i++) {
        if (i == 0) {
          _compEntries.push({label: pairs[i].pivot, position: "behind",
                             initial: (docData && docData.pivot && docData.pivot.initial) || null,
                             docname: (docData && docData.pivot && docData.pivot.docName) || pairs[i].pivotDocName || pairs[i].pivot});
        }
        var posEntry = (docData && docData.others && docData.others[i]) || null;
        _compEntries.push({label: pairs[i].other,
                           position: (posEntry && posEntry.position) || "above",
                           initial: (posEntry && posEntry.initial) || null,
                           docname: (posEntry && posEntry.docName) || pairs[i].otherDocName || pairs[i].other});
      }
      
      this.docDisplay = new MAT.DocDisplay.NewComparisonDocDisplay(
        this, this._context, this.div, {
          compEntries: _compEntries
          // detailsDiv: ...
        });
      this._maybeDisableAnnotationPopup(this.docDisplay);
      
      try {
        this.docDisplay.setData(comparisonDoc);
      } catch (e) {
        this.uiError("Error while digesting document: " + MAT.Annotation.errorToString(e));
      }
    },

    // Toggles for hand annotation.
    
    enableHandAnnotation: function () {
      if (this.annotatable) {
        if (this.docDisplay && (this.docDisplay.constructor == MAT.DocDisplay.DocDisplay)) {
          this.docDisplay.handAnnotationAvailable();
        }
        this.handAnnotationEnabled = true;
      }
    },

    disableHandAnnotation: function() {
      if (this.docDisplay) {
        this.docDisplay.handAnnotationUnavailable();
      }
      this.handAnnotationEnabled = false;
    },

    // Implementing the panel API.
    handAnnotationUnavailable: function() {
      if (this.callbacks.handAnnotationUnavailable) {
        this.callbacks.handAnnotationUnavailable();
      }
    },

    getTaskName: function(div) {
      return this.taskName;
    },

    uiClearPane: function(div) {
      // This inherits from CoreUI, so if there's anything
      // fancy, you can override, otherwise, use the default.
      if (this.callbacks.uiClearPane) {
        this.callbacks.uiClearPane(div);
      } else {
        this.clearPanes(div);
      }
    },

    uiError: function(msg) {
      if (this.callbacks.uiError) {
        this.callbacks.uiError(msg);
      } else if (this.popupMgr) {
        this.popupMgr.error("doc", msg);
      } else {
        alert(msg);
      }
    },

    uiInform: function(msg) {
      if (this.callbacks.uiInform) {
        this.callbacks.uiInform(msg);
      } else if (this.popupMgr) {
        this.popupMgr.inform("doc", msg);
      } else {
        alert(msg);
      }
    },

    uiTell: function(msg, title /*, params */) {
      if (this.callbacks.uiTell) {
        this.callbacks.uiTell.apply(null, arguments);
      } else if (this.popupMgr) {
        if (arguments.length > 2) {
          return this.popupMgr.tell("doc", msg, title, arguments[2]);
        } else {
          return this.popupMgr.tell("doc", msg, title);
        }
      } else {
        alert(msg);
        return null;
      }
    },

    uiPopup: function(text, pId, pHeader, buttonList /* , popupParams */) {
      if (this.callbacks.uiPopup) {
        return this.callbacks.uiPopup.apply(null, arguments);
      } else if (this.popupMgr) {
        if (arguments.length > 4) {
          return this.popupMgr.popup("doc", text, pId, pHeader, buttonList, arguments[4]);
        } else {
          return this.popupMgr.popup("doc", text, pId, pHeader, buttonList);
        }
      } else {
        alert(text);
        return null;
      }
    },
    
    // Choose mode.

    // params are successCb (one argument), exitCb (called when it's
    // time to cancel, or right before successCb), labels (a list of
    // permitted labels).
    
    enterChooseMode: function(params) {
      this.chooseModeMgr.enterChooseMode(params);
    },

    // An annotation has been chosen, somehow.
    chooseModeSuccess: function(annot) {
      this.chooseModeMgr.chooseModeSuccess(annot);
    },

    // An error is encountered.
    chooseModeError: function(errMsg) {
      this.chooseModeMgr.chooseModeError(errMsg);
    },

    // We're done with choose mode.
    exitChooseMode: function() {
      this.chooseModeMgr.exitChooseMode();
    },

    inChooseMode: function() {
      return this.chooseModeMgr.inChooseMode();
    },
    
    uiGetDisplayCounter: function() {
      return this.getDisplayCounter();
    },

    notifyHandAnnotationPerformed: function() {
      if (this.callbacks.notifyHandAnnotationPerformed) {
        this.callbacks.notifyHandAnnotationPerformed();
      }
    },

    // This doesn't work for hand annotation yet. I'd have to instantiate
    // a logger, etc.
    
    log: function(p) {
      if (this.callbacks.log) {
        this.callbacks.log(p);
      }
    },

    mouseOverAnnotations: function(params) {
      if (this.callbacks.mouseOverAnnotations) {
        this.callbacks.mouseOverAnnotations(params);
      }
    },

    cancelMouseOverAnnotations: function() {
      if (this.callbacks.cancelMouseOverAnnotations) {
        this.callbacks.cancelMouseOverAnnotations();
      }
    },

    // offerAnnotationPopup arguments:
    // e: mouse event
    // gestureBundle: a MAT.DocDisplay.GestureMenuBundle
    
    offerAnnotationPopup: function(e, gestureBundle) {
      if (this.yuiExtensionsAvailable) {
        var id = "annotateMenu_" + this.taskName;
        this.popupMgr.offerAnnotationPopup(function () {}, "doc", id, e, gestureBundle);
      } else {
        // I have to unhighlight.
        gestureBundle.dismiss();
      }
    },

    markDirty: function() {
      if (this.callbacks.markDirty) {
        this.callbacks.markDirty(this.docDisplay._doc);
      }
    },

    offerAnnotationEditor: function(annot /* clientInfo */) {
      if (this.yuiExtensionsAvailable) {
        var panel = this;
        var container = this.editorContainer;
        if (!container) {
          container = this.popupMgr._constructPopupAnnotationEditorContainer(annot, null);
        }
        this.popupMgr.offerAnnotationEditor(function () {}, this, container, function () {
          panel.markDirty();
        }, annot);
      }
    },

    getConfigVar: function(v) {
      // See workbench_ui.js. We may be able to make some of them
      // true eventually, but for the moment, they're false. All of them.
      return false;
    },

    // private methods

    _ensureStyleSheet: function() {
      var styleSheetTitle = "tag_styles";
      for (var i = 0; i < document.styleSheets.length; i++) {
        if (document.styleSheets[i].title == styleSheetTitle) {
          return;
        }
      }
      // We're still here.
      var cssNode = document.createElement('style');
      cssNode.type = 'text/css';
      cssNode.rel = 'stylesheet';
      cssNode.media = 'screen';
      cssNode.title = styleSheetTitle;
      document.getElementsByTagName("head")[0].appendChild(cssNode);
      // If the style sheet exists already, then we don't need to repopulate,
      // since we only have the one task.
      this._populateStyleSheetFromTaskTable(this._context.taskTable, styleSheetTitle);
    },

    _reset: function () {      
      this.uiClearPane(this.div);
      if (this.docDisplay) {
        this.docDisplay.destroy();
        this.docDisplay = null;
      }
      if (this.legendDiv) {
        this.uiClearPane(this.legendDiv);
        // Inherited from CoreUI.
        this._populateTagLegend(this.taskName, this.legendDiv);
      }
      this._ensureStyleSheet();
    },

    // doc is a Javascript object or string which is in the format of a MAT-JSON document,
    // or an annotated doc.

    _ensureDocument: function(doc) {
      if (doc.constructor != MAT.Annotation.AnnotatedDoc) {
        if (typeof(doc) == "string") {
          doc = JSON.parse(doc);
        }
        if (doc.constructor == Object) {
          doc = new MAT.Annotation.AnnotatedDoc().fromJSON(doc, this.task.globalAnnotationTypeRepository);
        }
      } else if (doc.annotTypes.globalATR !== this.task.globalAnnotationTypeRepository) {
        // If the document doesn't yet have a global annotation type repository,
        // I need to add one. Well, that won't quite work, now, will it?
        // I really need to serialize and deserialize if the global ATR
        // isn't this global ATR.
        doc = new MAT.Annotation.AnnotatedDoc().fromJSON(doc.toJSON(), this.task.globalAnnotationTypeRepository);
      }
      return doc;
    },

    styleAnnotation: function(annot, params) {
      if (this.docDisplay) {
        return this.docDisplay.styleAnnotation(annot, params);
      } else {
        return null;
      }
    },
    
    // For the annotation cell editor.

    getStyledButton: function(container, label, onclick) {
      if (this.yuiExtensionsAvailable) {
        return new MAT.YUIExtensions.StyledButton(container, label, onclick);
      } else {
        // When would we be here?
        return new this._justAButton(container, label, onclick);
      }
    },

    _justAButton: MAT.Class(function (container, label, onclick) {
      var b = this;
      this.label = label;
      this.b = MAT.Dom._buildElement("button", {
        attrs: {
          type: "button",
          onclick: function () {
            onclick.call(b);
          }
        },
        children: [label]
      });
      if (container) {
        container.appendChild(this.b);
      }
    }, {
      attachTo: function(container) {
        container.appendChild(this.b);
      },

      
      enable: function() {
        this.b.disabled = false;
      },

      disable: function() {
        this.b.disabled = true;
      },

      setLabel: function(lab) {
        this.b.innerHTML = "";
        this.label = lab;
        MAT.Dom._augmentElement(b, {
          children: [lab]
        });
      },
      getLabel: function () {
        return this.label;
      },
      addClass: function(cls) {
      },
      removeClass: function(cls) {
      },
      getButton: function() {
        return this.b;
      }
    })
    
  });

  MAT.DocDisplay.StandaloneViewer.waitForYUI = function(cb) {
    if (!yuiAvailable) {
      cb();
    } else {
      // We don't need to worry about any initializations, because we don't
      // have any YUI extensions which need to be dealt with at load time.
      // But we have to find the base. So let's look for the script
      // link which has the appropriate source.
      var base = null;
      var scripts = document.getElementsByTagName("script");
      for (var j = 0; j < scripts.length; j++) {
        if (scripts[j].src.substr(-12) == "yuiloader.js") {
          // If this ends with yuiloader.js, then:
          var loaderDir = scripts[j].src.substring(0, scripts[j].src.length - 13);
          // If this doesn't end with "yuiloader", add a "/../". Otherwise,
          // remove "yuiloader".
          if (loaderDir.substr(-9) == "yuiloader") {
            base = loaderDir.substring(0, loaderDir.length - 9);
          } else {
            base = loaderDir + "/../";
          }
          break;
        }
      }
      MAT.setYUILoaderBase(base);
      MAT.withYUILoaded(["event", "menu", "container", "dom", "yahoo", "button", "resize"], 
                        function () {
                          yuiLoaded = true;
                          cb();
                        });
    }
  }

})();