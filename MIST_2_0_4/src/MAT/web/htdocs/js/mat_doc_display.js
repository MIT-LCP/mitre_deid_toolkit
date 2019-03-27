/* Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
file LICENSE for license terms. */

/* The contents of this file deal exclusively with the portion of the UI
   which handles the display of the tagged document. */

// First, we set up the namespace for everything we want.

MAT.DocDisplay = {};

/*
 *
 *                MAT.DocDisplay.AnnotationGesture 
 *
 * I want to be able to configure my popup menu more easily, so I'm going 
 * to create an annotation gesture, which contains all the information that
 * the display needs to do what it needs to do. The display is going to be
 * the clearinghouse for all the UI-originated actions, from wherever in the
 * overall UI they come from - including the annotation tables.
 * The gesture is created by the element creating the menu or whatever, and
 * any additional information required by the cb is set by the client.
 *
 */

(function () {

  // Bind the MAT.Dom constructor functions, since we can't assume
  // jQuery or anything like that.

  var B = MAT.Dom._buildElement;
  var A = MAT.Dom._appendChild;
  var E = MAT.Dom._augmentElement;
  var AC = MAT.Dom._addClasses;
  var RC = MAT.Dom._removeClasses;
  var HC = MAT.Dom._hasClasses;
  
  MAT.DocDisplay.AnnotationGesture = function(doc, affectedAnnots, cb
                                              /* {gestureDisplaySource: ..., displayInfo: ..., gestureSource: ..., gestureType: ...}, clientInfo */) {
    this.doc = doc;
    this.affectedAnnots = affectedAnnots;
    this.cb = cb;
    // If the originating element needs to store anything.
    this.clientInfo = {};
    // This is the source of the gesture, for use in forceRedisplay().
    this.gestureDisplaySource = null;
    // Filled by the client when about to create something.
    this.displayInfo = null;
    this.extraAttributeValuePairs = null;
    this.startI = null;
    this.endI = null;
    this.gestureSource = null; // menu, button, etc.
    this.gestureType = null; // should be one of kbd, mouse_click.
    this.gestureDisplaySource = null; // should be a display
    if (arguments.length > 3) {
      var params = arguments[3];
      var theseOptions = ["gestureDisplaySource", "displayInfo", "gestureSource", "gestureType",
                          "extraAttributeValuePairs"];
      for (var k = 0; k < theseOptions.length; k++) {
        if (params[theseOptions[k]] !== undefined) {
          this[theseOptions[k]] = params[theseOptions[k]];
        }
      }
      if (arguments.length > 4) {
        var clientInfo = arguments[4];
        for (var k in clientInfo) {
          if (clientInfo.hasOwnProperty(k)) {
            this.clientInfo[k] = clientInfo[k];
          }
        }
      }
    }
    // This is a list of events which have been applied. Use it
    // to force a redisplay. The gestureDisplaySource is something
    // that will take care of its own redraw.
    // So DON'T REUSE MENUS.
    this.events = [];
  };

  MAT.Extend(MAT.DocDisplay.AnnotationGesture, {

    execute: function() {
      this.cb.call(this, this.clientInfo);
    },

    // Called by the swiper if needed.
    setSpanInfo: function(startI, endI) {
      this.startI = startI;
      this.endI = endI;
    },
    
    // Called by the client if an annotation is about to be created.
    setDisplayInfo: function(cssEntry) {
      this.displayInfo = cssEntry;
    },

    // Ditto.
    setClientInfo: function(k, v) {
      this.clientInfo[k] = v;
    },

    getClientInfo: function(k) {
      return this.clientInfo[k];
    },

    gestureIsKbd: function() {
      this.gestureType = "kbd";
    },

    gestureIsMouse: function() {
      this.gestureType = "mouse_click";
    },

    copy: function() {
      var g = new MAT.DocDisplay.AnnotationGesture(this.doc, this.affectedAnnots, this.cb, {
        displayInfo: this.displayInfo,
        extraAttributeValuePairs: this.extraAttributeValuePairs,
        gestureSource: this.gestureSource,
        gestureType: this.gestureType,
        gestureDisplaySource: this.gestureDisplaySource
      }, this.clientInfo);    
      g.setSpanInfo(this.startI, this.endI);
      return g;
    }
    
  });

/*
 *
 *                 MAT.DocDisplay.MenuGesture
 *
 * I want to be able to configure my popup menu more easily, and the annotation
 * gestures are frequently overkill. But there's some stuff we need to duplicate.
 *
 */


  MAT.DocDisplay.MenuGesture = function(cb /* , clientInfo */) {
    this.cb = cb;
    // If the originating element needs to store anything.
    this.clientInfo = {};
    if (arguments.length > 1) {
      for (var k in arguments[1]) {
        if (arguments[1].hasOwnProperty(k)) {
          this.clientInfo[k] = arguments[1][k];
        }
      }
    }
  };

  MAT.Extend(MAT.DocDisplay.MenuGesture, {

    execute: function() {
      this.cb.call(this, this.clientInfo);
    },

    // Called by the client if needed.
    setClientInfo: function(k, v) {
      this.clientInfo[k] = v;
    },

    getClientInfo: function(k) {
      return this.clientInfo[k];
    },

    copy: function() {
      return new MAT.DocDisplay.MenuGesture(this.cb, this.clientInfo);
    }
    
  });

/*
 * 
 *                MAT.DocDisplay.GestureMenuBundle
 *
 * This object is going to collect a bunch of things together and encapsulate
 * the information for offering the annotation popup.
 *
 */

  // menuItems: alist of {label:..., gesture:..., accel:...} objects. accel can be either
  // a number or a string.
  // popupTree: the tree of annotations to add
  // annGesture: a MAT.DocDisplay.AnnotationGesture for adding annotations
  // lastAnnotationEntry: the last display entry which was used for adding annotations
  // repeatAccelerator: the kbd accelerator to use for the repeat entry.
  // cancelCb: what to do if the menu exits without doing anything.
  // dismissCb: what to do if the menu exits, period.
  
  MAT.DocDisplay.GestureMenuBundle = MAT.Class(function (docDisplay /*, {annotationPopupTree: ..., annGesture: ..., lastAnnotationEntry: ..., repeatAccelerator: ..., cancelCb: ..., dismissCb: ...} */) {
    this.docDisplay = docDisplay;
    this.menuItems = [];
    var params = {};
    if (arguments.length > 1) {
      params = arguments[1];
    }
    this.annotationPopupTree = params.annotationPopupTree || null;
    this.annGesture = params.annGesture || null;
    this.lastAnnotationEntry = params.lastAnnotationEntry || null;
    this.repeatAccelerator = params.repeatAccelerator || null;
    this.cancelCb = params.cancelCb || null;
    this.dismissCb = params.dismissCb || null;
  }, {

    addMenuItem: function(item) {
      this.menuItems.push(item);
    },

    addEditOrViewItem: function(annot) {
      var disp = this.docDisplay;
      var a = annot;
      // Only edit annotation if you clicked on it.
      if (this.docDisplay._handAnnotationAvailable && annot.isEditable()) {
        // The client info may be modified by the UI, believe it or not.
        // See workbench_ui.js.
        this.menuItems.push({
          // "this" is the gesture.
          label: "Edit annotation",
          gesture: new MAT.DocDisplay.MenuGesture(function() {
            disp._panel.offerAnnotationEditor(a, this.clientInfo);
          })
        });
      } else if (annot.isViewable()) {
        this.menuItems.push({
          label: "View annotation",
          gesture: new MAT.DocDisplay.MenuGesture(function() {
            disp._panel.offerAnnotationEditor(a, this.clientInfo);            
          })
        });
      }
    },

    addDeleteItem: function(doc, annots /* , {setGestureDisplaySource: ...} */) {
      var disp = this.docDisplay;
      var gestureDisplaySource = this.docDisplay;
      if (arguments.length  > 2) {
        var params = arguments[2];
        if (params.setGestureDisplaySource === false) {
          gestureDisplaySource = null;
        }
      }
      var cancelCb = this.cancelCb;
      this.menuItems.push({
        label: (annots.length > 1) ? "Delete annotations (-)" : "Delete annotation (-)",
        // This used to be <tab>, but <tab> doesn't even fire keypress everywhere.
        // Sometimes is't claimed by the browser.
        accel: "-",
        gesture: new MAT.DocDisplay.AnnotationGesture(doc, annots, function() {
          try {
            disp._deleteAnnotations(this);
          } catch (e) {
            if (e.constructor === MAT.Annotation.DocumentError) {
              disp._panel.uiError(e.msg);
            } else {
              disp._panel.uiError("deleting the annotation failed for an unknown reason");
            }
            if (cancelCb) {
              cancelCb();
            }
          }
        }, {
          gestureDisplaySource: gestureDisplaySource,
          gestureSource: "menu"
        })
      });
    },

    addScrollToItem: function(annot) {
      var disp = this.docDisplay;
      var a = annot;
      this.menuItems.push({
        label: "Scroll to annotation",
        gesture: new MAT.DocDisplay.MenuGesture(function () {
          disp.scrollToAnnotation(a);
        })
      });
    },

    // Forcible dismiss.
    dismiss: function() {
      if (this.dismissCb) {
        this.dismissCb();
      }
    }
    
  });

/*
 *                MAT.DocDisplay.CoreDocDisplay
 *
 *
 * This object contains all the code for rendering a document
 * and managing the annotations. Uses the classes MAT.DocDisplay.RegionMap
 * and MAT.DocDisplay.Region. Can be specialized, as of MAT 2.0.
 *
 */

// We do the same trick here that we do with the backend object, for
// the same reason: we're generating HTML and we want to refer to
// specific objects. It's actually much more likely here than with
// the backend, since you could imagine loading multiple objects to compare
// them for interannotator agreement, e.g.

/* The panel is a container which provides access to the UI
   functionality. It's the only access to the UI. The API to the panel is this:

   handAnnotationUnavailable(): disable hand annotation. Must notify the doc display.

   handAnnotationAvailable(): enable hand annotation. Must notify the doc display.

   getTaskName(): return the name of the task

   uiClearPane(div)

   uiError(msg)

   uiInform(msg)

   uiPopup(text, pId, pHeader, buttonList (, popupParams))

   uiTell(msg, title (, params ))

   uiGetDisplayCounter()

   notifyHandAnnotationPerformed(): notify that there's an annotation added by hand

   log(params): log a message with the context logger for this document  

   mouseOverAnnotations(params): notify that the mouse is over the listed annotations (strings)
     params is {type: "content"|"admin"|..., labels: [...]}

   cancelMouseOverAnnotations(): remove the mouse notification

   offerAnnotationPopup(...): see the call below for the arglist.

   getConfigVar(var): the vars you can ask for are "showCharOffsets", "showSegments",
    "reconciliationShowProcessedVotes", "reconciliationAutoAdvance".

   And for the reconciliation window:

   notifyReconciliationVoted(): notify that a reconciliation vote has been performed. The
     ui can use this to note that the document is dirty.

   notifySegmentReviewUnderway(): notify that a segment is being reviewed.

   notifySegmentReviewFinished(): notify that a segment is no longer being reviewed.

   enterChooseMode(), exitChooseMode(), chooseModeError(), chooseModeSuccess(): see
   the calls below for the arglist.
*/

/* For MAT 2.0, we're going to make it possible to have many different
   kinds of doc displays. */

// Next, we create the core.

  MAT.DocDisplay.CoreDocDisplay = function (panel, context, div) {
    // As an inherited prototype, it's instantiated with no arguments.
    // Note that there's a possible fourth argument controlling whether
    // it's annotatable.
    if (arguments.length > 0) {
      this._panel = panel;
      this._div = div;
      this._spanlessAnnotationsPossible = false;
      this._spanPalette = null;
      // See the resize and redraw stuff.
      this._spanPaletteStoredWidth = 0;
      this._spanlessPalette = null;
      this._annotatable = true;
      // This must be set when hand annotation is available, so that
      // when we rebuild the content of the div, we can enable the listeners.
      // Update: the listeners are ALWAYS available - it's just that they
      // may be only doing something for viewing, not annotating.
      this._handAnnotationAvailable = false;
      this._context = context;
      var task = context.taskTable[panel.getTaskName()];
      this._task = task;
      this._tagHierarchy = task.tagHierarchy;
      this._tagLabel = task.tagLabel;
      this._taskConfig = MAT.TaskConfig[task.displayConfig];
      this._taskRenderSpan = null;
      if (this._taskConfig && this._taskConfig.renderSpan) {
        this._taskRenderSpan = this._taskConfig.renderSpan;
      }
      this._tagOrder = null;
      if (!task.alphabetizeLabels) {
        this._tagOrder = task.tagOrder;
      }
      this._tokenlessAutotagDelimiters = task.tokenlessAutotagDelimiters;
      if (task.textRightToLeft) {
        this._textDir = "rtl";
      } else {
        this._textDir = "ltr";
      }
      this._lastAnnotationEntry = null;
      this._lastSpanlessAnnotationEntry = null;
      this._annotationPopupTree = this._buildAnnotationPopupTree(true);
      this._spanlessAnnotationPopupTree = this._buildAnnotationPopupTree(false);
      if (arguments.length > 3) {
        if (arguments[3].annotatable !== undefined) {
          this._annotatable = arguments[3].annotatable;
        }
      }
      var disp = this;
      this._annotateListener = function (e) {      
        disp._processAnnotationGesture(e);
      }
      this._spanlessAnnotateListener = function (e) {      
        disp._processSpanlessAnnotationGesture(e);
      }      
      // _processAnnotationGesture will call the last thing on
      // this list. Typically, it'll be a normal annotation popup offer,
      // but sometimes, it'll be a contextually restricted method
      // for selecting values for annotation-valued attributes.
      this._annotateHandlers = [this._offerAnnotationPopup];
      this.signal = null;
      this._regionMap = null;
      this.layerAssignments = {};
      // For stacking exploded annotations.
      this._explodedLayerAssignmentCache = null;
    }
  }

  MAT.Extend(MAT.DocDisplay.CoreDocDisplay, {

    DEFAULT_ANNOTATOR: "unknown human",

    // These are parameters for rendering the spans. I'm
    // going to use them in _maybeAugmentStyleSheet.

    // This is the margin between the text and the
    // over or under mark, and between the marks, in ems.
    OVER_UNDER_MARGIN: .1,
    // This is the total height of the space allocated to the
    // mark, in ems. markMarginHeight - overUnderMargin should
    // be the height of superLayer and subLayer.
    MARK_MARGIN_HEIGHT: .4,
    // This is the extra bump, in ems, assigned to the 
    // over and under layers, for padding between the lines.
    // To emphasize the association, it should be greater than
    // overUnderMargin.
    LINE_MARGIN: .2,
    
    /* 
 *                PUBLIC API
 *
 *
 * Used internally by MAT.Context and the updater steps.
 */

    setData: function(data) {
      // I'm going to leave this undefined. But every child should
      // define it.
    },

    redisplay: function() {
      // Ditto.
    },

    // This should be called when the doc display div is resized.
    onResize: function() {
      // So whenever we resize, we need to recompute the layout so that wrap
      // corresponds to a span break. The algorithm will go like this.
      // (1) If the document is tokenized, nothing needs to happen.
      // (2) If the new width is the same as the old, nothing
      // needs to happen. 
      // (3) If there's nothing rendered, nothing needs to happen.
      // (4) If something needs to happen, first go through the region map
      // and splice together all regions which are at a boundary which
      // exists only because of wrap.
      // (5) Now, process for wrap as you would normally.
      // (6) When we're done, the regions which either (a) end a newline region
      // or (b) start at a wrap break are the regions which you need
      // to line up the spanless display against.
      if (this._spanPalette && this._regionMap && (!this._regionMap._foundTokens) &&
          (this._spanPaletteStoredWidth != this._spanPalette.offsetWidth)) {
        // It's got something rendered, it's not tokenized, and the width is
        // different.
        // First, update the width.
        this._spanPaletteStoredWidth = this._spanPalette.offsetWidth;
        // Next stitch together all the elements which are split only because
        // of wrap.
        var rmap = this._regionMap;
        var region = rmap._firstRegion;
        while (region) {
          var entry = rmap.indexToIndexReason[region.end];
          entry.wrap = false;
          if (!rmap.reasonEntryHasReason(entry)) {
            // Stitch it together. DON'T ADVANCE. It has a new end.
            region.mergeWithNextAndRerender(rmap);
          } else {
            region = region.nextRegion;
          }
        }
        rmap._spanPalettePostprocessForWrap();
      }
      
      this.spanlessRedisplay();
    },

    // We should clear out all document information here.

    clear: function() {
      this.clearDisplay();
      
      this.signal = null;
      this.layerAssignments = {};
      this._explodedLayerAssignmentCache = null;
    },

    clearDisplay: function () {
      var oDiv = this._div;

      this._disableAnnotationListeners();
      this._panel.uiClearPane(oDiv);      
      this._spanPalette = this._spanlessPalette = null;
      this._spanPaletteStoredWidth = 0;
      
      this._removeRegionMap();
    },

    hideSegments: function() {
      AC(this._div, "hiddenSegments");
    },

    showSegments: function() {
      RC(this._div, "hiddenSegments");
    },

    handAnnotationUnavailable: function() {
      if (this._annotatable) {
        this._handAnnotationAvailable = false;
      }
    },

    _disableAnnotationListeners: function() {
      if (this._spanPalette) {
        this._spanPalette.removeEventListener("mouseup", this._annotateListener, false);
      }
      if (this._spanlessPalette) {
        this._spanlessPalette.removeEventListener("mouseup", this._spanlessAnnotateListener, false);
      }
    },

    handAnnotationAvailable: function() {
      // tagging is only available after zoning.
      if (this._annotatable) {
        this._handAnnotationAvailable = true;
      }
    },

    _enableAnnotationListeners: function() {
      if (this._spanPalette) {
        this._spanPalette.addEventListener("mouseup", this._annotateListener, false);
      }
      if (this._spanlessPalette) {
        this._spanlessPalette.addEventListener("mouseup", this._spanlessAnnotateListener, false);
      }
    },

    // Styling of an annotation. You can style left, middle and right,
    // or just style everything. If I were being really clever, I'd
    // set up a stack of styles, but right now it's just absolute.
    
    styleAnnotation: function(annot, params /* {all: {cssClasses: [...], styleDict: {...}}, left: ..., middle: ..., right: ..., returnUndoFn: true} */) {
      var sites = {
        left: {
          cssClasses: [],
          styleDict: null
        },
        middle: {
          cssClasses: [],
          styleDict: null
        },
        right: {
          cssClasses: [],
          styleDict: null
        },
        leftright: {
          cssClasses: [],
          styleDict: null
        },
        all: {
          cssClasses: [],
          styleDict: null
        }
      };
      var noSitesFound = false;

      function importSite(site, siteEntry) {
        if (params[site]) {
          if (siteEntry.cssClasses == []) {
            siteEntry.Classes = params.left.cssClasses || [];
          } else if (params[site].cssClasses) {
            siteEntry.cssClasses = siteEntry.cssClasses.concat(params.left.cssClasses);
          }
          if (params[site].styleDict) {
            for (var k in params[site].styleDict) {
              if (params[site].styleDict.hasOwnProperty(k)) {
                siteEntry.styleDict[k] = params[site].styleDict[k];
              }
            }
          } else {
            siteEntry.styleDict = params[site].styleDict;
          }
        }
      }
      
      if (params.all) {
        if ((!params.left) && (!params.middle) && (!params.right)) {
          noSitesFound = true;
          sites.all.cssClasses = params.all.cssClasses || [];
          sites.all.styleDict = params.all.styleDict || {};
        } else {
          importSite("all", sites.left);
          importSite("all", sites.middle);
          importSite("all", sites.right);
          importSite("all", sites.leftright);
        }
      }

      importSite("left", sites.left);
      importSite("middle", sites.middle);
      importSite("right", sites.right);
      importSite("left", sites.leftright);
      importSite("right", sites.leftright);

      undoEntries = [];

      var returnUndoFn = params.returnUndoFn || false;
      var undoFn = null;      

      // Only one location will be applied to any span.
      function applyLocation(loc, span) {
        var siteEntry = sites[loc];
        var undoEntry;
        if (returnUndoFn) {
          undoEntry = {span: span, cssClasses: [], styleDict: {}};
          undoEntries.push(undoEntry);
        }          
        if (siteEntry.cssClasses && (siteEntry.cssClasses.length > 0)) {
          if (returnUndoFn) {
            for (var j = 0; j < siteEntry.cssClasses.length; j++) {
              if (!HC(span, siteEntry.cssClasses[j])) {
                undoEntry.cssClasses.push(siteEntry.cssClasses[j]);
                AC(span, siteEntry.cssClasses[j]);
              }
            }
          } else {
            AC(span, siteEntry.cssClasses);
          }
        }
        if (siteEntry.styleDict) {
          for (var k in siteEntry.styleDict) {
            if (siteEntry.styleDict.hasOwnProperty(k)) {
              if (returnUndoFn) {
                undoEntry.styleDict[k] = span.style[k];
              }
              span.style[k] = siteEntry.styleDict[k];
            }
          }
        }
      }

      var r = this._regionMap.annIDToStartRegion[annot.id];
      var lastOne = null;
      var nthSpan = 0;
      
      while (true) {
        if (!r) {
          break;
        }
        var annotEntry = r.annotIDToAnnotLayerEntry[annot.id];
        if (!annotEntry) {
          break;
        }
        
        if (!r.inNewlineRegion) {
          var annotSpan = annotEntry.contentSpan;
          // This may be null because the annotation has no display.
          if (!annotSpan) {
            break;
          }
          // What do we apply? We can't actually use start/end, because
          // we may have spanless annotations.
          // If no sites are found, they all get the all site.
          // If we want to do undo properly, we have to figure
          // out what the proper site is. There will only be one.
          if (noSitesFound) {
            applyLocation("all", annotSpan);
          } else if (nthSpan == 1) {
            // We know we shouldn't apply leftright, because
            // we know there are at least two.
            applyLocation("left", lastOne);
          } else if (nthSpan > 1) {
            // We apply middle to the previous one, because we've passed at least two.
            applyLocation("middle", lastOne);
          }
          lastOne = annotSpan;
          nthSpan += 1;
        }
        r = r.nextRegion;
      }
      if (lastOne && !noSitesFound) {
        // We're either applying "right", if nthSpan > 1, or "leftright".
        if (nthSpan == 1) {
          applyLocation("right", lastOne);
        } else {
          applyLocation("leftright", lastOne);
        }
      }
      if (returnUndoFn) {
        undoFn = function () {
          for (var i = 0; i < undoEntries.length; i++) {
            var entry = undoEntries[i];
            var span = entry.span;
            if (entry.cssClasses.length > 0) {
              RC(span, entry.cssClasses);
            }
            for (var k in entry.styleDict) {
              if (entry.styleDict.hasOwnProperty(k)) {
                span.style[k] = entry.styleDict[k];
              }
            }
          }
        }
      }
      return undoFn;
    },

    // We're going to highlight a bunch of annotations. What this
    // means is that we loop through the region map, and then through
    // the span records, and create the highlight div and draw the appropriate
    // boundary.

    // I'm going to try to reconstruct the region access so that it
    // can get either a spanned or a spanless region. Because only the spanned
    // regions appear in the linked list of regions, I'm going to start migrating to a
    // linked list of regions, rather than indices into the regions, so
    // I can have a single region as the icon for the spanless annotations.    
    
    highlightAnnotation: function(a, cssClass, toolTip) {
      // To highlight an annotation, first we find all its regions,
      // and then find the actual span that shows it in those regions.
      // We create a child span. The CSS controls the rest of it.
      // We give it a class so we can find it again.
      // The last one helps us position the toolTip.
      var r = this._regionMap.annIDToStartRegion[a.id];
      var lastOne = null;
      while (true) {
        if (!r) {
          break;
        }
        var annotEntry = r.annotIDToAnnotLayerEntry[a.id];
        if (!annotEntry) {
          break;
        }
        
        if (!r.inNewlineRegion) {
          // It's possible for there to be an annotEntry but no contentSpan,
          // because the annotation has no CSS rendering.
          var annotSpan = annotEntry.contentSpan;
          if (!annotSpan) {
            break;
          }
          var posClass = "annotHighlight";
          if (r.start == a.start) {
            posClass += " hlStart";
            if (r.end == a.end) {
              posClass += " hlEnd";
            }
          } else if (r.end == a.end) {
            posClass += " hlEnd";
          } else {
            posClass += " hlMiddle";
          }
          A(annotSpan, B("span", {attrs: {className: cssClass + " " + posClass}}));
          lastOne = annotSpan;
        }
        r = r.nextRegion;
      }
      if (lastOne && (toolTip != null)) {
        // Where do we put it? On the right, above, unless the top
        // is too close to the top of the document view..
        // Originally, the tooltip was attached to the lastOne, but then
        // it inherited the text-decoration of the styled span (because
        // you can't cancel the inheritance of text-decoration). So then,
        // I attached it to the parent wordspan span, but THAT didn't work,
        // because it was behind things that were laid out after the parent
        // wordspan. So it really needs to go on this._div. But where?
        // We climb until we get to the _div, collecting offsetTop and
        // offsetLeft.

        var oTop = 0;
        var oLeft = 0;
        var parent = lastOne;
        // Note that the _div MUST be position != "static" in order
        // to set an offset space. See _renderText.
        while (parent != this._div) {
          oTop += parent.offsetTop;
          oLeft += parent.offsetLeft;
          parent = parent.offsetParent;
        }

        // Hideous problem. Before I attach the tooltip, I don't know how
        // tall it is. I want the bottom of the tooltip to be 5px below
        // the top of the annot, and I can do that - but if the tooltip is
        // so wide that it scrolls off the right side, and creates a
        // horizontal scrollbar, that'll change the size of the relative
        // div that's positioning the tooltip, and it'll get moved up.
        // I guess the right thing to do is to attach it, figure out where it
        // is, and THEN reset the top. 
        
        var ttip = B("span", {
          text: toolTip,
          attrs: {
            className: "hlTooltip",
            ttRef: lastOne
          },
          style: {
            // We're positioning this to overlap the right side of the final annotation.
            left: (oLeft + lastOne.offsetWidth - 5) + "px",
            // I have to measure this in pixels, although I'd prefer
            // to do it in ems. We're positioning this 5px below the top
            // of the annotation. But in order to do that, we need to
            // attach it first, and then modify the top, more than once
            // if necessary.
            top: oTop + "px"
          }
        });
        A(this._div, ttip);
        // Now it's positioned. So I know how tall it is, and I
        // can find its height. Note that clientHeight includes border,
        // but not margin. getComputedStyle() returns the literal
        // value from the hltooltip style, but if it's anything other
        // than pixels, I'm hosed. So for right now, I'm just hardcoding.
        ttip.style.top = (oTop - ttip.clientHeight + 5 - 2 /* margin size */) + "px";
        // Don't want the tooltip to run off the top.
        if (ttip.offsetTop < 0) {
          // Move the tooltip to below the element.
          ttip.style.top = (oTop + 5) + "px";
        }
        // Or off the right side, for that matter.
        if ((ttip.offsetLeft + ttip.offsetWidth) > this._div.offsetWidth) {
          ttip.style.left = (this._div.offsetWidth - ttip.offsetWidth - 5) + "px";
        }
      }
    },

    unhighlightAnnotation: function(a) {
      // If this annotation
      // was looked up in the region map to start with, then it might
      // be undefined.
      if (!a) {
        return;
      }
      // Same algorithm as highlightAnnotation, except we remove the children we added.
      var r = this._regionMap.annIDToStartRegion[a.id];
      var lastOne = null;
      while (true) {
        if (!r) {
          break;
        }
        var annotEntry = r.annotIDToAnnotLayerEntry[a.id];
        if (!annotEntry) {
          break;
        }
        if (!r.inNewlineRegion) {
          var annotSpan = annotEntry.contentSpan;
          // This may be null if the annotation has no visible display.
          if (!annotSpan) {
            break;
          }
          lastOne = annotSpan;
          for (var k = 0; k < annotSpan.childNodes.length; k++) {
            if (HC(annotSpan.childNodes[k], "annotHighlight")) {
              // Found it.
              annotSpan.removeChild(annotSpan.childNodes[k]);
              break;
            }
          }
        }
        r = r.nextRegion;
      }
      if (lastOne) {
        // Find the tooltip which has the proper ttRef, and
        // remove it.
        var k = 0;
        while (k < this._div.childNodes.length) {
          // If you remove a child, there's no need to
          // increment k; it'll just point to the next
          // thing on the list, or the list will now
          // be of size k, in which case the while loop
          // will exit.
          var child = this._div.childNodes[k];
          if (HC(child, "hlTooltip") && (child.ttRef == lastOne)) {
            this._div.removeChild(child);
          } else {
            k++;
          }
        }
      }
    },

    scrollToAnnotation: function(a) {
      // First, find the initial span.
      var r = this._regionMap.annIDToStartRegion[a.id];
      if (r) {
        var annotEntry = r.annotIDToAnnotLayerEntry[a.id];
        if (annotEntry) {
          // The container is NOT the child docview, because that's not the one that forces the scrolling.
          // I need the topNode as a fallback because the contentSpan
          // may not exist because there's no display for this annot.
          this._scrollToElement(annotEntry.contentSpan || r.topNode, this._div);
        }
      }
    },

    _scrollToElement: function(element, container) {
      // This recipe was taken from stackoverflow, of course. But modified.
      // This is the offset from the top of the container of the viewport
      var containerTop = container.scrollTop;
      // This is the bottom of the viewport. So these two together
      // tell you what portion of the container is visible. clientHeight
      // is the height of the viewport.
      var containerBottom = containerTop + container.clientHeight;
      // That is, how far below the top of the container is the element?
      var elemTop = 0;
      var parent = element;
      while (parent != container) {
        elemTop += parent.offsetTop;
        parent = parent.offsetParent;
      }
      var elemBottom = elemTop + element.offsetHeight;
      // We scroll the element to the middle of the viewport, if we can.
      if ((elemTop < containerTop) || (elemBottom > containerBottom)) {
        // The element is not completely visible. So we scroll.
        // We want the element in the middle of the viewport, if possible.
        // If the element is less than half a viewport's worth away from the
        // top or bottom edge, we scroll to the top or bottom edge.
        var halfViewport = (container.clientHeight / 2);
        if (elemTop < halfViewport) {
          // Scroll to the top.
          container.scrollTop = 0;
        } else {
          // Scrolling "too far" will just scroll to the bottom, which is fine.
          container.scrollTop = elemTop - halfViewport;
        }
      }
    },

    destroy: function() {
      this._disableAnnotationListeners();
      this._removeRegionMap();
    },
    
    // This takes an annotation set and a list of content annotations
    // and returns a mapping from the annotation IDs to
    // a CSS class "superLayer", "subLayer", "inLayer" and
    // then a number, which is interpreted differently depending
    // on whether it's super/sub (in which case it's margin multiples)
    // or inLayer (in which case it's z-indices).

    // New strategy: we're going to assign the layer for each annotation
    // as we encounter it. This will work better for stacked annotations,
    // among other things. as well as adding annotations without redraw.
    // Reconciliation will be a trick, but we'll just have to bite that off.
    assignContentAnnotLayer: function(contentAnnot) {
    },

    // Default render handling.
    // If location is null, the node is added at the end.

    renderSpan: function(region, node, location) {
      if (this._taskRenderSpan) {
        this._taskRenderSpan.call(this, region, node, location);
      } else {
        this._renderSpan(region, node, location);
      }
    },

    // This needs to return a hash of contentNode, segmentNode.
    // The idea is that this will insert the brackets, and it will
    // be the background for the annotations. Everything that can be
    // handled by styling will be.

    // I need to know if the segment has votes or not. If it has votes,
    // it's being processed.
    
    renderSegment: function(segment, node) {
      var content = B("span", {attrs: {className: "content"}});
      var cName = this._tagLabel + " SEGMENT attr_status_is_" +
        segment.getAttributeValue("status").replace(/\W/g, "_");
      var newSeg = B("span", {attrs: {className: cName}});
      node.appendChild(newSeg);    
      var segEntry = {contentNode: content, segmentNode: newSeg};
      this._renderSegment(segment, segEntry);
      return segEntry;
    },

    _renderSegment: function(segment, segEntry) {

      var content = segEntry.contentNode;
      var newSeg = segEntry.segmentNode;

      var v = this;

      var onMouseOverCb = function () {
        var prefix = "SEGMENT";
        if (v._panel.getConfigVar("showCharOffsets")) {
          prefix += "(" + segment.start + "-" + segment.end + ")";
        }
        v._panel.mouseOverAnnotations({type: "admin", labels: [prefix + " status=" + segment.getAttributeValue("status")], annots: [segment]});
      };
      var onMouseOutCb = function () {
        v._panel.cancelMouseOverAnnotations();
      };
      
      // Left.
      var segStart = B("span", {text: "[ ",
                                attrs: {className: "boundaryMarker",
                                        onmouseover: onMouseOverCb,
                                        onmouseout: onMouseOutCb},
                                untaggable: true});
      newSeg.appendChild(segStart);
      newSeg.appendChild(content);
      var segEnd = B("span", {text: " ]",
                              attrs: {className: "boundaryMarker",
                                      onmouseover: onMouseOverCb,
                                      onmouseout: onMouseOutCb},
                              untaggable: true});
      newSeg.appendChild(segEnd);
      newSeg.onmouseover = function () {
        v.hoverSegment(content);
      };
      newSeg.onmouseout = function () {
        v.unhoverSegment(content);
      };
    },

    // This is about taking the existing segment node, rescuing the content,
    // and regenerating the segment.
    
    rerenderSegment: function(segment) {
      var segEntry = this._regionMap._segmentNodes[segment.id];
      // Clear it out.
      var newSeg = segEntry.segmentNode;
      while ( newSeg.hasChildNodes() ) {
        newSeg.removeChild(newSeg.firstChild);
      }
      this._renderSegment(segment, segEntry);
    },

    hoverSegment: function (segContentNode) {    
      AC(segContentNode, "highlighted");
    },

    unhoverSegment: function (segContentNode) {    
      RC(segContentNode, "highlighted");
    },
    
    pushAnnotationGestureHandler: function (fn) {
      this._annotateHandlers.push(fn);
    },

    popAnnotationGestureHandler: function (fn) {
      this._annotateHandlers.pop();
    },

    /*
 *           INTERNAL PROPERTIES
 *
 */
    // Each child must implement this.
    
    _collectDocuments: function() {
      return [];
    },

    // Ditto.
    
    _retrieveSpanlessAnnotationPairings: function () {
      return {
        labels: [],
        pairings: []
      }
    },

    _importAnnotationsFromDocuments: function(/*, {displayParams: ..., initialDocParams: ..., noninitialDocParams: ...} */) {

      var displayParams = {};
      var docParams = {};
      var noninitialDocParams = {};
      if (arguments.length > 0) {
        displayParams = arguments[0].displayParams || {};
        docParams = arguments[0].docParams || {};
        noninitialDocParams = arguments[0].noninitialDocParams || {};
      }

      var regionMap;

      var docs = this._collectDocuments();
      
      for (var i = 0; i < docs.length; i++) {
        var aset = docs[i];
        if (i == 0) {
          this._spanlessAnnotationsPossible = aset.hasSpanlessContentAnnotationTypes();
          
          var disableHandAnnotationFirst = displayParams.disableHandAnnotationFirst;

          // Clear the text first.
          this.clearDisplay();
          regionMap = this._newRegionMap();
          
          if (disableHandAnnotationFirst) {
            this._panel.handAnnotationUnavailable();
          }
      
          this.signal = aset.signal;
          regionMap._findNewlineSpans();
        } else {
          this._spanlessAnnotationsPossible |= aset.hasSpanlessContentAnnotationTypes();
          if (this.signal != aset.signal) {
            this._panel.uiError("Signals don't match.");
            return;
          }
        }
        regionMap.addAnnotations(aset, docParams);
      }
    },

    _renderText: function () {    
      var oDiv = this._div;

      var spanlessPossible = true;
      
      if (this.signal) {
        // I'm adding an ID for this document, because there are at least two
        // different places where I want to implement stacked annotations, and I
        // need something in common between them.
        var panelCls = oDiv.id+"_stackEnv";
        var preNode = B("div", {attrs: {className: panelCls + " docView", dir: this._textDir}});
        this._regionMap.spansForRegions(this.signal, preNode, 0, this.signal.length);
        var sidebar;
        // My heavens, this is awful. Because all the children of the sidebar
        // are positioned absolutely, its height is 0 unless I set something.
        // And I can't set it to be 100%, because that's the size of the parent
        // viewport; I need it to be the same height as its (overflowing) sibling.
        // But that's kind of awful, since then I can't click. I think its minimal
        // height needs to be the height of its parent oDiv, and the actual height
        // is the height of its sibling. But it doesn't know those until its
        // sibling is attached. But that isn't even good enough, because we
        // need this to be robust against resizing. Ugh. Do I have to readjust the
        // height every time it's resized? Maybe. And that wouldn't be awful, because
        // we have to track resizing anyway.
        // Reviewing the techniques for creating equal-height columns in CSS
        // on the Web, it appears that they're all fake - they have a background
        // of equal height to create the illusion of equal height. I, unfortunately,
        // don't have that option - I REALLY need the spanless palette to be the
        // height of the sister, at least.
        
        // The spanless sidebar and the main panel have to scroll together,
        // but also take up the appropriate amount of space in the "viewport",
        // no matter whether we're in the regular, explicitly sized UI context,
        // or in the standalone context, where the containing div could be anything.
        // I'm pretty sure that the only way to do this right is to make
        // it a table. Ugh.

        // And then it gets worse. If the viewport has a size, you want to fill
        // the viewport with the spanless sidebar; otherwise, you want it to
        // be its normal height. So I need to know what's going on with the
        // container.
        
        this._spanPalette = preNode;
        
        if (spanlessPossible && this._spanlessAnnotationsPossible) {
          // The border needs to go on this, rather than the sidebar, because the sidebar
          // doesn't know how tall it's going to be.
          // This doesn't work in IE, just so you know...
          var oDivPositionType = getComputedStyle(oDiv).position;
          var useAuto;
          if ((oDivPositionType == "absolute") || (oDivPositionType == "fixed")) {
            if (oDiv.clientHeight == 0) {
              this._panel.uiError("You're trying to render a document into a fixed-height div with a height of 0.");
              return;
            }
            useAuto = false;
          } else {
            // There can't be a clientHeight of anything yet - the client height
            // is determined by the children, and the div better damn well be empty.
            useAuto = true;
            if (oDivPositionType != "relative") {
              // We really need to make the scope here relative, otherwise
              // the highlighting offset computation will be hosed. See highlightAnnotation.
              oDiv.style.position = "relative";
            }
          }

          sidebar = B("div", {
            attrs: {className: panelCls + " spanlessSidebar"}
          });
          this._spanlessPalette = sidebar;
          oDiv.appendChild(sidebar);
          A(oDiv, B("table", {
            attrs: {
              cellPadding: "0px",
              cellSpacing: "0px"
            },
            style: {
              height: useAuto ? "auto" : "100%"
            },              
            children: [B("tr", {
              style: {
                verticalAlign: "top"
              },
              children: [
                B("td", {
                  style: {
                    height: "100%"
                  },
                  children: [sidebar]
                }),
                B("td", {children: [preNode]})
              ]
            })]
          }));
        } else {
          oDiv.appendChild(preNode);
        }
        // Now that we've attached it, I can do this.
        if (!this._regionMap._foundTokens) {
          this._regionMap._spanPalettePostprocessForWrap();
        }
        this._spanPaletteStoredWidth = preNode.offsetWidth;
        // I need to have attached the main panel before I can
        // figure out where to put the associated spanless icons, and
        // figure out the height of the palette.
        if (spanlessPossible && this._spanlessAnnotationsPossible) {
          sidebar.style.height = preNode.scrollHeight;
          this._regionMap.spansForSpanlessRegions(sidebar);
        }
        this._enableAnnotationListeners();
      }
    },

    spanlessRedisplay: function() {
      if (this._spanlessPalette) {
        this._panel.uiClearPane(this._spanlessPalette);
        this._spanlessPalette.style.height = this._spanPalette.scrollHeight;
        // "re-add" the annotations. See RegionMap.addAnnotations.
        var asets = this._collectDocuments();
        var rMap = this._regionMap;
        // Let's be really clean, and clean out the caches which may
        // have spanless annotations in them.
        rMap.spanlessAnnIDToCharAnchorHash = {};
        for (var k in rMap.annIDHash) {
          var a = rMap.annIDHash[k];
          if (a.atype && !a.atype.hasSpan) {
            delete rMap.annIDHash[k];
            delete rMap.annIDToStartRegion[k];
          }
        }
        for (var j = 0; j < asets.length; j++) {
          var aset = asets[j];
          var spanlessAnnots = aset.allContentAnnotations({spanlessOnly: true});
          for (var i = 0; i < spanlessAnnots.length; i++) {
            rMap._computeSpanlessAnnotAnchor(spanlessAnnots[i]);
          }
        }
        // Clear out all the spanless spacing.
        var spanRegion = rMap._firstRegion;
        while (spanRegion) {
          if ((spanRegion.maxSpanlessSuperContentLayer > 0) ||
              (spanRegion.maxSpanlessSubContentLayer > 0)) {
            spanRegion.maxSpanlessSuperContentLayer = spanRegion.maxSpanlessSubContentLayer = 0;
            spanRegion.rerender(rMap);
          }
          spanRegion = spanRegion.nextRegion;
        }
        rMap.spansForSpanlessRegions(this._spanlessPalette);
      }
    },
    
    _newRegionMap: function () {
      this._regionMap = new MAT.DocDisplay.RegionMap(this);
      return this._regionMap;
    },

    _removeRegionMap: function () {
      if (this._regionMap) {
        this._regionMap._removeStyleSheet();
        this._regionMap = null;
      }
    },

    // Rendering.
    
    // layerAssignments is a hash from the content annotation ID
    // to a pair of the appropriate CSS class, and an integer.

    // The problem is that in order for text to be rendered the right color,
    // the CSS has to be on the same span as the text. So if I have to
    // put this directly on the text, I won't be able to use z-index.
    // Well, actually, since each span is an overlap, I can put the
    // lowest z-index one ON the text, and the others behind.

    // SAM 7/25/12: I've just realized I'm missing another layer of
    // abstraction. Previously, I'd been passing around a set of shared
    // key sets, and in the case of the "inLayer 0", I'd been redefining
    // the onmouseover several times when I had overlaps. At the same time,
    // annotations assigned to the same layer which WASN'T inLayer 0
    // were getting separate spans, rather than reusing the span,
    // which was a bug. What I really need to be doing is sorting
    // the key sets BY ASSIGNMENT, and rendering each assignment once.

    // Into every lovely algorithm some rain must fall. It turns
    // out that in reconciliation, there may be multiple assignments for 
    // a given annotation. These are stored in the otherAssignments slot in the
    // layer assignment. This is going to go away when we get rid of the
    // old reconciliation view, but we need it for the moment. I've migrated
    // the key set stuff into the region creation, so I'm going to
    // have to deal with the otherAssignments stuff somewhere between
    // creating the regions and rendering the spans. So for the reconciliation
    // document, I'm going to introduce _renderRegion and specialize it.
    
    _renderSpan: function(region, node, location) {
      var spanNode = B("span", {attrs: {matRegionTop: true, matRegionComponent: true}, untaggable: region.hasUntaggable});
      // Because the content annotation should span the entire
      // token or region, and token display has boundaries,
      // if there are content annotations, the content itself
      // has to go in a subspan, not right next to to the content spans.
      var contentSpan = spanNode;
      var contentPrefix = region.rtype;
      // We need to loop through all the key sets, and group them by assignment,
      // and that needs to be abstracted out, because of the issue with otherAssignments
      // in reconciliation. THEN, once we have all the key sets per assignment,
      // we can render each grouping.
      if ((region.contentLayerBundles.length > 0) && (!region.inNewlineRegion)) {
        contentSpan = B("span", {
          attrs: {
            matRegionComponent: true,
            matRegion: region,
            className: contentPrefix
          }
        });
        spanNode.setAttribute("class", "wordspan");
        spanNode.appendChild(contentSpan);
        
        this._positionSpanElements(region, contentPrefix, contentSpan, spanNode);
      } else {
        spanNode.setAttribute("class", contentPrefix);
      }
      spanNode.matRegion = region;
  
      // We need this to be able to get from the span records to the
      // actual text, e.g., when we build icons for the spanless annotations.
      region.textNode = document.createTextNode(region.s);
      region.topNode = spanNode;
      
      // We're going to implement wrap, which means that
      // we have to divide the slice of the signal up where we find
      // newline sequences. Unix \n, Mac \r, Windows \r\n.
      // CSS to the rescue! white-space: pre-wrap does the
      // trick (or, more to the point, the proprietary
      // equivalents, because it doesn't actually work
      // in Firefox yet).

      // But there's a special case we have to deal with, now that
      // we're placing annotations above and/or below. The wordspan
      // class is inline-block, but you can't have newlines in
      // there; they're ignored. So what I need to do in that case
      // is have multiple spanNodes, and have the newlines
      // be regular spans.

      // And ugh. If there's a newline inside a token, the
      // wrong things will happen if we split at newlines, because we don't do left/middle/right
      // with the CSS yet. But I can't help that yet.

      // This is handled above, in the creation of the region.

      contentSpan.appendChild(region.textNode);
      contentSpan.matRegionContentContainer = true;
      
      node.insertBefore(spanNode, location);
    },
    
    _positionSpanElements: function(region, contentPrefix, contentSpan, spanNode) {
      
      for (var i = 0; i < region.contentLayerBundles.length; i++) {
        this._renderSpanForAssignmentBundle(region.contentLayerBundles[i],
                                            contentSpan, spanNode, contentPrefix, 
                                            region);
      }
      
      if (region.maxSubContentLayer > 0) {
        AC(spanNode, "maxsub_" + region.maxSubContentLayer);
      }
      if (region.maxSuperContentLayer > 0) {
        AC(spanNode, "maxsuper_" + region.maxSuperContentLayer);
      }
    },

    // This is an entry in the contentLayerBundles list.
    // {layer: ..., position: margin: ..., ..., annotEntries: [{annot: ..., labels: ..., contentSpan: null}, ...], 
    // assignmentInitials: {}, allLabels: [], allAnnots: []}
    
    _renderSpanForAssignmentBundle: function(assignmentBundle, contentSpan, spanNode, contentPrefix, region) {
      var cls = assignmentBundle.layer;
      var param = assignmentBundle.position;
      var hasMargin = (assignmentBundle.margin !== false);
      var allKeysetKeys = assignmentBundle.allLabels;
      var annotsForHover = assignmentBundle.allAnnots;

      if (cls == "noLayer") {
        return;
      }
      
      var annotEntries = assignmentBundle.annotEntries;
              
      var thisChild;
      if ((cls == "inLayer") && (param == 0)) {
        // put the style directly on the content span.
        AC(contentSpan, contentPrefix);
        AC(contentSpan, allKeysetKeys);
        thisChild = contentSpan;
      } else {
        var newChild = B("span", {
          attrs: {
            matRegionComponent: true,
            matRegion: region,
            className: region.tagLabel + " " + cls + " " + allKeysetKeys.join(" ")
          }
        });
        thisChild = newChild;        
        spanNode.appendChild(newChild);
        if (cls == "inLayer") {
          newChild.style.zIndex = param;
        } else if (hasMargin) {
          AC(newChild, cls+"_"+param);
        } else {
          AC(newChild, cls+"_"+param+"_nomargin");
        }
      }

      // I need this to do highlighting, and I'm PRETTY sure
      // it's not going to screw me up.

      // NOTE: because a key set can appear in multiple assignment
      // bundles in reconciliation, currently, this will always get the
      // LAST keyset found, which is probably wrong. BUT, we're redoing
      // reconciliation ANYWAY, so the otherAssignments stuff is probably
      // going to die, so I'm not worrying about it.

      if (annotEntries.length > 0) {
        for (var j = 0; j < annotEntries.length; j++) {
          // Tell the span record which span corresponds to this child.
          annotEntries[j].contentSpan = thisChild;
        }

        // Add a hover.
        // We used to be in a loop, so this needed to be a factory, but no longer.
        var suffixList = [];
        for (var k in assignmentBundle.assignmentInitials) {
          if (assignmentBundle.assignmentInitials.hasOwnProperty(k)) {
            suffixList.push(k);
          }
        }
        
        var suffix = "";
        if (suffixList.length > 0) {
          suffix = " (" + suffixList.join(", ") + ")";
        }

        // So I need to deal with the (really special) case where two
        // of the annotations here point to the same annotation to
        // highlight. I even should be able to deal with the case where
        // both directions are modeled. Sigh.

        this._handleMouseOver(thisChild, annotsForHover, suffix);
      }
    },

    _handleMouseOver: function(span, annots, suffix) {
      var v = this;
      var highlightInventory = {};
      span.onmouseover = function () {
        var labels = [];
        var showIndices = v._panel.getConfigVar("showCharOffsets");

        for (var i = 0; i < annots.length; i++) {
          // The hover is the label + features.
          var a = annots[i];
          labels.push(a.format({showIndices: showIndices, showFeatures: true, expandEffectiveLabel: true}));

          // First, we collect all the things to be highlighted, and
          // gather the references which we want to highlight.
          
          // For this annotation, highlight its children, and its parents.
          // Parents first.
          a.doc._buildInverseIdDict();
          var parents = a.doc._inverseIdDict[a.publicID];
          if (parents && (parents.length > 0)) {
            for (var j = 0; j < parents.length; j++) {
              var entry = highlightInventory[parents[j].annot.id];
              if (!entry) {
                entry = {annot: parents[j].annot, pointsTo: {}, pointsToCount: 0, pointedToBy: {}, pointedToCount: 0};
                highlightInventory[parents[j].annot.id] = entry;
              }
              entry.pointsTo[a.id] = parents[j].attr;
              entry.pointsToCount += 1;
            }
          }
          // Now, the children.
          if (a.atype.hasAnnotationValues) {
            for (var j = 0; j < a.attrs.length; j++) {
              var attr = a.attrs[j];
              if ((a.atype.attrs[j]._typename == "annotation") && attr != null) {
                if (attr.constructor === MAT.Annotation.Annotation) {
                  // Record it.
                  var entry = highlightInventory[attr.id];
                  if (!entry) {
                    entry = {annot: attr, pointsTo: {}, pointsToCount: 0, pointedToBy: {}, pointedToByCount: 0};
                    highlightInventory[attr.id] = entry;
                  }
                  entry.pointedToBy[a.id] = a.atype.attrs[j].name;
                  entry.pointedToByCount += 1;
                } else if (attr && ((attr.constructor === MAT.Annotation.AttributeValueSet) ||
                                    (attr.constructor === MAT.Annotation.AttributeValueList)) &&
                           attr.ofAttribute && (attr.ofAttribute.constructor === MAT.Annotation.AnnotationAttributeType)) {
                  var size = attr.size();
                  for (var k = 0; k < size; k++) {
                    var subval = attr.elements[k];
                    var entry = highlightInventory[subval.id];
                    if (!entry) {
                      entry = {annot: subval, pointsTo: {}, pointsToCount: 0, pointedToBy: {}, pointedToByCount: 0};
                      highlightInventory[subval.id] = entry;
                    }
                    entry.pointedToBy[a.id] = a.atype.attrs[j].name;
                    entry.pointedToByCount += 1;
                  }
                }
              }
            }
          }
        }

        // Now that we're done collecting them, we can highlight
        // each annotation, once we compute the slug we want in the tooltip.
        
        for (var h in highlightInventory) {
          if (highlightInventory.hasOwnProperty(h)) {
            var entry = highlightInventory[h];
            var cls;
            if ((entry.pointsToCount > 0) && (entry.pointedToCount > 0)) {
              // Weird case where there are both.
              cls = "hlBoth";
            } else if (entry.pointsToCount > 0) {
              cls = "hlParent";
            } else {
              cls = "hlChild";
            }
            var slug = [];
            for (var aid in entry.pointsTo) {
              if (entry.pointsTo.hasOwnProperty(aid)) {
                if (entry.pointsToCount > 1) {
                  slug.push("in " + entry.pointsTo[aid] + " (" + v._regionMap.annIDHash[aid].format({}) + ")");
                } else {
                  slug.push("in " + entry.pointsTo[aid]);
                }
              }
            }
            for (var aid in entry.pointedToBy) {
              if (entry.pointedToBy.hasOwnProperty(aid)) {
                if (entry.pointedToByCount > 1) {
                  slug.push(entry.pointedToBy[aid] + " (" + v._regionMap.annIDHash[aid].format({}) + ")");
                } else {
                  slug.push(entry.pointedToBy[aid]);
                }
              }
            }
            v.highlightAnnotation(entry.annot, cls, slug.join("; "));
          }
        }
        v._panel.mouseOverAnnotations({type: "content", labels: labels, suffix: suffix, annots: annots, span: span});
      };
      
      span.onmouseout = function () {
        v._panel.cancelMouseOverAnnotations({span: span});
        for (var aid in highlightInventory) {
          if (highlightInventory.hasOwnProperty(aid)) {
            v.unhighlightAnnotation(v._regionMap.annIDHash[aid]);
            delete highlightInventory[aid];
          }
        }
      };
    },

    // This exists for one reason only: to provide a hook for reconciliation
    // documents to do something to the region immediately before they're rendered.
    // It's only called for spanned regions, and someday soon, it'll die.
    
    _renderRegion: function(region, node) {
      region.renderRegion(node, this._regionMap, null);
    },

    // Manipulating annotations. Note that the panel might not be annotatable,
    // in which case the gesture handler should do the right thing.

    _processAnnotationGesture: function(e) {
      // First, figure out if you have a selection. See
      // http://www.quirksmode.org/dom/range_intro.html, among
      // other places.
      var userRange = null;
      if (window.getSelection) {
        // This is the way Mozilla and Safari do it. Opera does
        // it both ways, but this API is better.
        var userSelection = window.getSelection();
        if (userSelection != "") {
          if (userSelection.getRangeAt)
            userRange = userSelection.getRangeAt(0);
          else { // Safari!
            userRange = document.createRange();
            userRange.setStart(userSelection.anchorNode,userSelection.anchorOffset);
            userRange.setEnd(userSelection.focusNode,userSelection.focusOffset);
          }
          userSelection.removeAllRanges();
        } else if (document.selection && (document.selection != "None")) {
          // should come last. This is the Microsoft way. Not sure why I'm
          // doing this, since the Microsoft way doesn't support figuring
          // out where you got it from, so it's kind of useless to me.
          userRange = document.selection.createRange();
        }
      }
      
      var handler = this._annotateHandlers[this._annotateHandlers.length - 1];
      
      if (userRange != null) {
        // OK, I know I have a swipe.
        
        // We need to be able to figure out what the start
        // and end of the spans are. If I were brave, I'd
        // just store it on the span as a property, but that
        // seems kind of risky. So I'll maintain it in the
        // annotation set.

        // The start and end containers are typically either document,
        // element or text nodes. I don't see how they could be
        // anything other than element or text nodes in this case.
        // The offset is an index into the child list if it's an
        // element, or an offset into the text if it's a text. I
        // have to do the conversion here.

        // Also, the lowest span now might be a lex node, which
        // has a parent span which is what I'm looking for.
        // That's not so much of a big deal when finding the start
        // and end indexes, but when it comes to finding the overlaps,
        // it is.

        var startSpan = userRange.startContainer;
        var startOffset = userRange.startOffset;
        var endSpan = userRange.endContainer;
        var endOffset = userRange.endOffset;

        // To expand the range to token boundaries, we climb up from
        // text nodes, or down from spans. The stacking order, currently,
        // is annotations (possibly) above lex tokens above text nodes, and taggable
        // regions above text nodes. So we go down to text nodes, and then
        // climb up to lex tokens, if the text node is directly below it.

        var redrawBoundaries = false; 
        var rmap = this._regionMap;

        function removeRange() {
          if (window.getSelection) {
            // This is the way Mozilla does it. It's the only way I'm going
            // to implement at the moment.
            var selection = window.getSelection();
            selection.removeAllRanges();
          }
        }

        // I'm going to completely rework the way I find the relevant
        // annotation span. The reason is that the span structure is
        // much more elaborate in MAT 2.0 sometimes, and the old
        // algorithm was pretty unwieldy.

        // Fundamentally, the start and end spans can be text, spans,
        // or something else. If they're something else, they can't be
        // annotated. If they're text, we may be in the middle of
        // the span, in which case we either (a) need to split it, if
        // we're not over a token, or (b) need to redraw the boundaries
        // if we are over a token. The spans are now marked for whether
        // they're part of a region structure (check the matRegionComponent boolean),
        // and what part of the region structure they are (check
        // the matRegionContentContainer and matRegionTop booleans).

        // So. If the range start span is a text node, its parent
        // must be a matRegionComponent and a matRegionContentContainer.
        // If it is, then we climb to the root and the offset is
        // in that span. What we want is the region and the offset.
        
        // SAM 3/30/10: I've been working with this for quite a while
        // under the assumption that hand annotation would always be on
        // top of tokens, but we may sometimes not want to use a 
        // tokenizer. What happens then? I think that the only
        // time I want to ensure I'm on tokens is when I HAVE tokens.
        // So we should be checking here to see if the document has been
        // tokenized. And, this seems to work, with the exception that
        // I'm using the "annotationConsidered" CSS to keep the region
        // highlighted, and that unfortunately marks the entire text span.
        // How to fix? Well, the obvious thing is to check to see if
        // there are tokens, and if there aren't, turn the swipe into
        // some spans we can manipulate. We have to be very careful,
        // though, to ensure that we get the right things out of
        // the region map, since we're going to be changing the DOM
        // structure in those cases where there are no tokens.
        
        // And we have to redraw on cancel if we add in these new
        // spans just to reinforce the highlight feedback.

        // So the first thing I need to do is make sure that each end
        // is a span, not a text node, and that the offsets are correct.
        // If we find tokens, then we move the boundaries.

        // NOTE: At least in Firefox, it's possible for the start
        // offset to be at the very end of the start element. If this
        // is the case, we need to advance to the next element. This is handled
        // differently in tokenized and untokenized.

        if (startSpan.nodeType == Node.TEXT_NODE) {
          if (!startSpan.parentNode) {
            this._panel.uiError("Couldn't find appropriate start of annotation span.");
            removeRange();
            return;
          }
          startSpan = startSpan.parentNode;
          if (!startSpan.matRegionContentContainer) {
            this._panel.uiError("Selected text is not part of known document content.");
            removeRange();
            return;
          }
          // If it's a content container, it's going to be in the right
          // structure.
          // We're swiping, so we might as well climb to the top of span stack
          // for the region, because we only want to affect the inLayer annotations.
          while (!startSpan.matRegionTop) {
            startSpan = startSpan.parentNode;
          }
        } else if (startSpan.matRegionComponent) {
          // Doesn't matter what the startOffset is; if you've managed to select
          // a child of a region component, we don't care what the order is, we're
          // still going to be 0 from the start of the region.
          // We're swiping, so we might as well climb to the top of span stack
          // for the region, because we only want to affect the inLayer annotations.
          while (!startSpan.matRegionTop) {
            startSpan = startSpan.parentNode;
          }
          startOffset = 0;
        } else {
          startSpan = startSpan.childNodes[startOffset];
          // If we're above the spans, the node we choose had
          // BETTER be a top.
          if (!startSpan.matRegionTop) {
            this._panel.uiError("Selected text is not part of known document content.");
            removeRange();
            return;
          }
          startOffset = 0;
        }

        // At this point, the startSpan is known to be the top of a region,
        // and it's a span, and its start offset is correct.

        // Now, the end span.

        if (endSpan.nodeType == Node.TEXT_NODE) {
          if (!endSpan.parentNode) {
            this._panel.uiError("Couldn't find appropriate end of annotation span.");
            removeRange();
            return;
          }
          endSpan = endSpan.parentNode;
          if (!endSpan.matRegionContentContainer) {
            this._panel.uiError("Selected text is not part of known document content.");
            removeRange();
            return;
          }
          // If it's a content container, it's going to be in the right
          // structure.
          // We're swiping, so we might as well climb to the top of span stack
          // for the region, because we only want to affect the inLayer annotations.
          while (!endSpan.matRegionTop) {
            endSpan = endSpan.parentNode;
          }
        } else if (endSpan.matRegionComponent) {
          // Doesn't matter what the startOffset is; if you've managed to select
          // a child of a region component, we don't care what the order is, we're
          // still going to be 0 from the start of the region.
          // We're swiping, so we might as well climb to the top of span stack
          // for the region, because we only want to affect the inLayer annotations.
          while (!endSpan.matRegionTop) {
            endSpan = endSpan.parentNode;
          }
          endOffset = endSpan.matRegion.end - endSpan.matRegion.start;
        } else {
          endSpan = endSpan.childNodes[endOffset];
          // If we're above the spans, the node we choose had
          // BETTER be a top.
          if (!endSpan.matRegionTop) {
            this._panel.uiError("Selected text is not part of known document content.");
            removeRange();
            return;
          }
          endOffset = endSpan.matRegion.end - endSpan.matRegion.start;
        }

        // At this point, the endspan is known to be the top of a region,
        // and it's a span, and its start offset is correct.      

        var endRegion;
        var startRegion;

        if (rmap._foundTokens) {
          if (startOffset > 0) {
            var region = startSpan.matRegion;
            if (region && region.coversToken) {
              startOffset = 0;
              redrawBoundaries = true;
            }
          }
          if (endOffset < (endSpan.matRegion.end - endSpan.matRegion.start)) {
            var region = endSpan.matRegion;
            if (region && region.coversToken) {
              endOffset = region.end - region.start;
              redrawBoundaries = true;
            }
          }

          // Now, we have to move to the left or right if we're over a token
          // but not at the token boundary.
          if (startSpan.matRegion.coversToken) {
            while (!startSpan.matRegion.startsToken) {
              startSpan = startSpan.previousSibling;
              redrawBoundaries = true;
              startOffset = 0;
            }
          }

          if (endSpan.matRegion.coversToken) {
            while (!endSpan.matRegion.endsToken) {
              endSpan = endSpan.nextSibling;
              redrawBoundaries = true;
              endOffset = endSpan.matRegion.end - endSpan.matRegion.start;
            }
          }

          // It's possible to select a region such that the
          // startRegion startOffset moves you to the end of the
          // region. For tokenized, this will just attach the
          // previous region. I'm not worried about that case. The
          // untokenized case is far more important.
          
          endRegion = endSpan.matRegion;
          startRegion = startSpan.matRegion;

          // Originally, I was redrawing the boundaries, but this
          // is actually silly - I have to remove the ranges above
          // because when I don't, if I double-click on a token at the
          // end of a line, the whole line is selected. Not sure why, but
          // I style the selected region anyway, so there's no purpose
          // for the range.
          /*
          if (redrawBoundaries) {
            // The way to redraw the boundaries differs depending on
            // your browser.
            if (window.getSelection) {
              // This is the way Mozilla does it. It's the only way I'm going
              // to implement at the moment.
              var selection = window.getSelection();
              selection.removeAllRanges();
              var r = document.createRange();
              // I have to find the text node children.
              function findTextChild(s) {
                if (s.matRegionContentContainer) {
                  return s.childNodes[0];
                } else {
                  for (var i = 0; i < s.childNodes.length; i++) {
                    var t = findTextChild(s.childNodes[i]);
                    if (t) { return t; }
                  }
                  return null;
                }
              }
              r.setStart(findTextChild(startSpan), startOffset);
              r.setEnd(findTextChild(endSpan), endOffset);
              selection.addRange(r);
            }
          }
          */
        } else {
          // In order to segment things appropriately, we need to introduce
          // a span. Because we can only do that over text, we need to
          // walk from the start and end of the range, surrounding the
          // contents wherever there's just a text node. Make sure that if
          // the start and end nodes are the same, we don't do anything
          // stupid.

          // And actually, we don't need to loop. We only need to do this
          // on the edges, if the start or end span are text nodes.

          // I've now redone the region stuff so that we can simply
          // modify the span records and rerender the region.

          // s0 and e0 are offsets INTO THE SEGMENT FOR THE SPAN RECORD. Gotta remember that when I'm
          // computing start and end.

          // Don't bother splitting them if we're not in the right place.
          
          startRegion = startSpan.matRegion;
          endRegion = endSpan.matRegion;

          // It's possible to select a region such that the
          // startRegion startOffset moves you to the end of the
          // region. For tokenized, this will just attach the
          // previous region. I'm not worried about that case. The
          // untokenized case is far more important. Here, we have
          // to move on to the next region.

          if (startOffset == startRegion.end - startRegion.start) {
            startRegion = startRegion.nextRegion;
            startOffset = 0;
            startSpan = startRegion.topNode;
          }          

          // If either the start or end region are newline regions, we should
          // adjust accordingly - we should never be starting or ending
          // in a newline region. Apparently, when you double-click in Firefox
          // in a non-tokenized window, you do, indeed, get the trailing newline.

          if (startRegion.inNewlineRegion) {
            startRegion = startRegion.nextRegion;
            startOffset = 0;
            startSpan = startRegion.topNode;
          }
          if (endRegion.inNewlineRegion) {
            endRegion = endRegion.prevRegion;
            endOffset = endRegion.end - endRegion.start;
            endSpan = endRegion.topNode;
          }

          // I'll be resetting both the start and the end spans, if they're the same.
          // I'll also be changing the start and end offsets.
          // startOffset will ALWAYS be 0; end will ALWAYS be the length of the string.
          var spansAreIdentical = (startSpan === endSpan);

          if ((startOffset > 0) && (endOffset < (endRegion.end - endRegion.start)) && spansAreIdentical) {
            startRegion.splitAndRerender(rmap, [startOffset, endOffset]);
            startRegion = endRegion = startRegion.nextRegion;
          } else {
            if (startOffset > 0) {
              startRegion = startRegion.splitAndRerender(rmap, [startOffset]);
              if (spansAreIdentical) {
                endRegion = startRegion;
              }
            }
            if (endOffset < (endRegion.end - endRegion.start)) {
              if (spansAreIdentical) {
                // Probably not necessary.
                startRegion = endRegion;
              }
              endRegion.splitAndRerender(rmap, [endOffset]);
            }
          }
          startSpan = startRegion.topNode;
          endSpan = endRegion.topNode;
        }

        // OK, at this point, the offsets should be right, the segmentation
        // should be right, and the start and end spans should be the toplevel
        // spans.
        
        // The nodes we have are spans dominating text. The spans
        // are split up according to what they cover.
        // So we need to traverse the child sequence of spans.

        // Two possibilities. Either we overlap existing annotations
        // or we don't. If we overlap, we have three options:
        // unmark; replace; cancel.
        // If we don't overlap, we have two options: new, cancel.

        // Again, we've taken care to ensure that the right things
        // happen in the tokenless case. The annotations
        // in startSpan and endSpan are the MODIFIED annotations
        // at the endpoints, if anything needed to be modified. These
        // annotations have the proper overlap properties to allow me
        // to figure out which annotations I'm trying potentially to remove
        // or replace.
        
        var idArray = [];
        var cDict = {};

        var region = startRegion;
        while (true) {
          if (region.hasUntaggable) {
            this._panel.uiError("Selected range includes untaggable region.");
            removeRange();
            return;
          }
          // get ALL the annots
          var coveredAnnots = this._getCoveredContentAnnotsForHandAnnotation(region, null);
          for (var i = 0; i < coveredAnnots.length; i++) {
            var annot = coveredAnnots[i];
            // I know these will be converted to strings,
            // but it doesn't matter.
            if (!cDict[annot.id]) {
              cDict[annot.id] = true;
              idArray.push(annot.id);
            }
          }
          if (region == endRegion) {
            break;
          }
          region = region.nextRegion;
        }

        // Can't pass in a layer slug in this case. See _swipeRegions.
        this._swipeRegions(startRegion, endRegion, null);
        
        handler.call(this, e, idArray, startRegion.start, endRegion.end, {
          isSwipe: true,
          redrawOnCancel: {
            start: startRegion.start,
            end: endRegion.end
          }
        });
      } else {
        // There's no range. See if you're over an annotation, and
        // if you are, delete it. The target will never be a text node,
        // according to the docs.

        // BUT. If you're not over a token, or an annotation, then don't
        // do anything - you don't want to take a whole zone, after all.

        // One hitch: if you select over a token in an annotation
        // you want to use the annotation as the boundaries, not the
        // token.
        
        var span = e.target;
        // Climb!
        if (!span.matRegionComponent) {
          return;
        }
        // We're NOT going to climb here, because we're clicking, and I need
        // to find EXACTLY what we clicked on. But I DO need the top span
        // in order to spread to tokens.
        var topSpan = span;
        while (!topSpan.matRegionTop) {
          topSpan = topSpan.parentNode;
        }
        var region = span.matRegion;
        var idArray = [];
        var firstStart = region.start;
        var lastEnd = region.end;
        var layerSlug = this._getLayerBundleKeyForContentSpan(region, span);
        var coveredAnnots = this._getCoveredContentAnnotsForHandAnnotation(region, layerSlug);
        var foundContent = false;
        for (var i = 0; i < coveredAnnots.length; i++) {
          var annot = coveredAnnots[i];
          foundContent = true;
          // We don't need to worry about duplicates here - we're only
          // over a single span.
          idArray.push(annot.id);
          if (annot.start < firstStart) {
            firstStart = annot.start;
          }
          if (annot.end > lastEnd) {
            lastEnd = annot.end;
          }
        }
        // At this point, we have the first start and the last end
        // of the content annotations that overlap the token that
        // was selected. What we need now is to move the boundaries
        // if the region has a token, or if it has content.

        // If the region has a token, I need to move until we have the
        // start and the end of the token, if we haven't found
        // any content (if we have found content, it'll be bigger
        // than the token anyway - or at least, it better be).

        var startRegion = region;
        var endRegion = region;
        if (region.coversToken || foundContent) {
          startSpan = topSpan;
          endSpan = topSpan;
          if (!foundContent) {
            // Grow this to the token boundaries.
            while (!startSpan.matRegion.startsToken) {
              startSpan = startSpan.previousSibling;
              startRegion = startSpan.matRegion;
            }
            while (!endSpan.matRegion.endsToken) {
              endSpan = endSpan.nextSibling;
              endRegion = endSpan.matRegion;
            }
          } else {
            // Move the endpoints as far as you can without going over.
            while (true) {
              var m = startSpan.previousSibling;
              if (!m) {
                break;
              }
              var r = m.matRegion;
              if (r.start >= firstStart) {
                startSpan = m;
                startRegion = r;
              } else {
                break;
              }
            }
            while (true) {
              var m = endSpan.nextSibling;
              if (!m) {
                break;
              }
              var r = m.matRegion;
              if (r.end <= lastEnd) {
                endSpan = m;
                endRegion = r;
              } else {
                break;
              }
            }
          }

          this._swipeRegions(startRegion, endRegion, layerSlug);

          // OK, we offer to delete them.
          handler.call(this, e, idArray, startRegion.start, endRegion.end, {
            isSwipe: false,
            redrawOnCancel: {
              start: startRegion.start,
              end: endRegion.end
            }
          });
        }
      }
    },

    // Don't forget the case where the annotation crosses
    // newline regions - these will not have any content annotation
    // to swipe.
    
    _swipeRegions: function(startRegion, endRegion, layerSlug) {
      var regionMap = this._regionMap;
      
      regionMap.indexToIndexReason[startRegion.start].swipeStart = true;
      regionMap.indexToIndexReason[endRegion.end].swipeEnd = true;

      // We're going to decorate the content span for the
      // given layer slug. What happens when we've swiped rather than
      // clicked? If we have overlapping annotations which are stacked,
      // what do we want to be gray? The whole thing, or just the
      // inline? I think the whole thing. At the very least, it has to
      // be the inline text; but if there's no annotation on layer 0,
      // but annotations elsewhere,
      // we're kinda hosed, unless we highlight everything, because
      // there's no content span. So _swipeRegions should be called
      // with null in the case of swiping.

      var region = startRegion;
      while (true) {
        if (!region.inNewlineRegion) {
          // This is the default. If there's a layer slug (e.g.,
          // if we've selected an annotation), we'll change it, maybe.
          span = region.topNode;
          if (layerSlug) {
            var bundle = region.contentLayerBundleDict[layerSlug];
            if (bundle) {
              span = bundle.annotEntries[0].contentSpan;
            }
          }
          AC(span, "annotationConsidered");
        }
        if (region == endRegion) {
          break;
        }
        region = region.nextRegion;
      }

    },

    // Remove the styling, unset the flags, maybe stitch back together.
    // It's possible that the document no longer has this region, because
    // it was redisplayed and the region vanished (e.g., if the annotation
    // was deleted). I'm passing in indices rather than regions, because
    // there may be an intervening redisplay.

    // I was going to use the saved slug to deal with unswipe, but
    // I'm pretty sure that swiping the topNode above will wreck that.
    // So I'm going to recursively remove annotationConsidered starting
    // with the top node.

    _unswipeRegions: function(redrawOnCancel) {
      var startRegionStart = redrawOnCancel.start;
      var endRegionEnd = redrawOnCancel.end;
      var regionMap = this._regionMap;
      
      var startReasons = regionMap.indexToIndexReason[startRegionStart];
      var endReasons = regionMap.indexToIndexReason[endRegionEnd];
      if (startReasons && endReasons && startReasons.swipeStart && endReasons.swipeEnd) {
        startReasons.swipeStart = false;
        endReasons.swipeEnd = false;

        var startRegion = regionMap._firstRegion;
        while (startRegion.start != startRegionStart) {
          startRegion = startRegion.nextRegion;
        }
        var endRegion = startRegion;
        
        var region = startRegion;
        while (true) {
          var span = region.topNode;
          RC(span, "annotationConsidered");
          var children = span.getElementsByTagName("span");
          for (var i = 0; i < children.length; i++) {
            RC(children[i], "annotationConsidered");
          }
          if (region.end == endRegionEnd) {
            endRegion = region;
            break;
          }
          region = region.nextRegion;
        }

        // Perhaps we should be restitching some regions.
        
        var startIsEmpty = !regionMap.reasonEntryHasReason(startReasons);
        var endIsEmpty = !regionMap.reasonEntryHasReason(endReasons);

        if (startIsEmpty && endIsEmpty && (startRegion == endRegion)) {
          startRegion.removeAndRerender(regionMap);
        } else {
          if (startIsEmpty) {
            startRegion.prevRegion.mergeWithNextAndRerender(regionMap);
          }
          if (endIsEmpty) {
            endRegion.mergeWithNextAndRerender(regionMap);
          }
        }
      }
    },

    // We use this in the special case of modifying an extent where
    // we've overlapped lots of annotations. If we encounter
    // a newline, we have to stop what we're doing and create a new box.

    _computeAnnotationBoxes: function(startRegionStart, endRegionEnd) {
      var regionMap = this._regionMap;
      
      var startRegion = regionMap._firstRegion;
      while (startRegion.start != startRegionStart) {
        startRegion = startRegion.nextRegion;
      }
      var endRegion = startRegion;
        
      var region = startRegion;
      var boxes = [];
      var curBox = null;
      while (true) {
        if (region.inNewlineRegion) {
          if (curBox) {
            curBox = null;
          }
        } else {
          if (!curBox) {
            curBox = {left: Infinity, right: 0, top: Infinity, bottom: 0};
            boxes.push(curBox);
          }
          var span = region.topNode;
          curBox.left = Math.min(curBox.left, span.offsetLeft);
          curBox.right = Math.max(curBox.right, span.offsetLeft + span.offsetWidth);
          curBox.top = Math.min(curBox.top, span.offsetTop);
          curBox.bottom = Math.max(curBox.bottom, span.offsetTop + span.offsetHeight);
          var children = span.getElementsByTagName("span");
          for (var i = 0; i < children.length; i++) {
            // Each of these needs to compute its offsets wrt the parent span.
            var childSpan = children[i];
            var trueLeft = childSpan.offsetLeft + span.offsetLeft;
            var trueRight = trueLeft + childSpan.offsetWidth;
            var trueTop = childSpan.offsetTop + span.offsetTop;
            var trueBottom = trueTop + childSpan.offsetHeight;
            curBox.left = Math.min(curBox.left, trueLeft);
            curBox.right = Math.max(curBox.right, trueRight);
            curBox.top = Math.min(curBox.top, trueTop);
            curBox.bottom = Math.min(curBox.bottom, trueBottom);
          }
          if (region.end == endRegionEnd) {
            endRegion = region;
            break;
          }
        }
        region = region.nextRegion;
      }
      return boxes;
    },

    
    // This works completely differently from the spanned one.
    _processSpanlessAnnotationGesture: function(e) {

      var handler = this._annotateHandlers[this._annotateHandlers.length - 1];
      
      // If your target is the spanless palette, there are no annotations
      // to select. If your target is NOT the spanless palette, try
      // to find the matRegionTop span.
      // There's no range. See if you're over an annotation, and
      // if you are, delete it. The target will never be a text node,
      // according to the docs.

      var idArray = [];
      var span = e.target;
      // If we've selected the palette, then we have no annotations.
      // Otherwise, we'd better find a span.
      if (span !== this._spanlessPalette) {
        // Climb!
        if (!span.matRegionComponent) {
          return;
        }
        var region = span.matRegion;
        var layerSlug = this._getLayerBundleKeyForContentSpan(region, span);
        var annots = this._getCoveredContentAnnotsForHandAnnotation(region, layerSlug);
        if (annots.length > 0) {
          idArray = [annots[0].id];
        }
      }

      handler.call(this, e, idArray, null, null, {
        isSwipe: false,
        redrawOnCancel: null
      });
      
    },

    // This innocuous little function must be overridden for reconciliation panels.
    // But it turns out that we can't go with whatever happens to be in the region -
    // we need to know which annotations are assigned to a particular layer.
    // If the slug is null, we use all the annotations. Actually, we only
    // want the annotations which are visible; so we never want to get the
    // ones which are mapped to none.
    
    _getCoveredContentAnnotsForHandAnnotation: function (region, bundleSlug) {
      if (bundleSlug) {
        var bundle = region.contentLayerBundleDict[bundleSlug];
        // All the annots in the bundle have the same content span, so
        // if we got here that way, we just return the
        if (bundle) {
          return bundle.allAnnots;
        } else {
          return [];
        }
      } else if (!region.contentLayerBundleDict.noLayer_0) {        
        return region.contentAnnots;
      } else if (region.contentAnnots.length == 0) {
        return [];
      } else {
        // There are things assigned to noLayer. So we have to remove them.
        var annots = [];
        for (var k in region.contentLayerBundleDict) {
          if (region.contentLayerBundleDict.hasOwnProperty(k) && k != "noLayer_0") {
            annots = annots.concat(region.contentLayerBundleDict[k].allAnnots);
          }
        }
        return annots;        
      }
    },

    _getLayerBundleKeyForContentSpan: function(region, span) {
      for (var i = 0; i < region.contentLayerBundles.length; i++) {
        var bundle = region.contentLayerBundles[i];
        // Look through the annot entries. If one of them
        // matches, we only need this entry.
        var annots = [];
        for (var j = 0; j < bundle.annotEntries.length; j++) {
          if (bundle.annotEntries[j].contentSpan === span) {
            return bundle.layer+"_"+bundle.position;
          }
        }
      }
      return null;      
    },
    
    // I was hoping I could abstract this and factor out some of the
    // guts, but I don't understand the alternative UIs well enough to do that.
    // So I'll have to settle for a little bit of encapsulation.

    // First, let's add a modify extent option to the popup.

    // Note that this can now be called with a startIndex and endIndex of null,
    // when we're dealing with spanless annotations.

    // Note also that this is now callable when _handAnnotationAvailable is
    // false. Make sure the right things happen.

    // And, finally, we're modifying to deal with overlapping annotations
    // in an exploded view. It will no longer be possible to click on
    // multiple annotations when hand annotation is enabled. If you've
    // done that when it's NOT enabled, you should be told that there
    // are multiple annotations selected. On click, you can edit/view, autotag,
    // delete, and replace. The code will continue to support dealing with
    // multiple annotations for deleting and for autotag, but the menus will
    // not make that available. On the spanless palette, you can still create
    // if you click on nothing.

    // Swiping in the spanned palette, on the other hand, is going to be very different.
    // You can't do anything but add and modify extent, and you can modify the extent
    // of any annotation you overlap. So this has to be dealt with up in
    // _processAnnotationGesture; on the one hand, if you click, you should look
    // at just that annotation, but if you swipe, you should look at all of them.
    
    _offerAnnotationPopup: function(e, idArray, startIndex, endIndex,
                                    params /* {isSwipe: ..., redrawOnCancel: ...} */) {
      var gestureBundle = this._constructAnnotationPopup(e, idArray, startIndex, endIndex, params);
      if (gestureBundle) {
        this._panel.offerAnnotationPopup(e, gestureBundle);
      }
    },

    // Broke this out in order to give the child classes an
    // opportunity to customize the gesture bundle here, rather than
    // relying on the presentation pane.

    _constructAnnotationPopup: function(e, idArray, startIndex, endIndex,
                                        params /* {isSwipe: ..., redrawOnCancel: ..., allowAutotag: ...} */) {
      // params are isSwipe, redrawOnCancel, allowAutotag
      var isSwipe = params.isSwipe;
      // redrawOnCancel is either null or a hash {startRegion: ..., endRegion: ...}
      var redrawOnCancel = params.redrawOnCancel;

      // First check: if hand annotation is not available,
      // but it's a swipe or we don't have exactly one annotation selected
      // (e.g., you click on empty space in the spanless sidebar), barf.
      if ((!this._handAnnotationAvailable) && (isSwipe || (idArray.length == 0))) {
        this._panel.uiError("Hand annotation is not available.");
        if (redrawOnCancel) {
          this._unswipeRegions(redrawOnCancel);
        }
        return null;
      }

      // If you're a click, and you've clicked on more than one annotation,
      // barf, no matter what. It USED to be that this could deal with
      // deleting and autotagging, but no more - and in any case,
      // this should never happen during hand annotation anyway.
      if ((!isSwipe) && (idArray.length > 1)) {
        // There isn't going to be anything to do, since we're
        // clicking on multiple annotations.
        this._panel.uiError("Ambiguous selection (multiple annotations).");
        if (redrawOnCancel) {
          this._unswipeRegions(redrawOnCancel);
        }
        return null;
      } 

      // autotag is available only for clicking, not for swiping.
      var allowAutotag;
      if (params.allowAutotag === undefined) {
        allowAutotag = this._handAnnotationAvailable && !isSwipe;
      } else {
        allowAutotag = this._handAnnotationAvailable && !isSwipe && params.allowAutotag;
      }

      // Might be spanless.
      var spanless = false;
      if ((startIndex === null) || (endIndex === null)) {
        spanless = true;
        isSwipe = false;
        allowAutotag = false;
      }

      // In case this is a swipe, let's collect the layer assignments
      // for the annotations. Originally, I thought that multiple
      // annotations on a layer would never happen, and should cause
      // that layer to be skipped; but I now realize that it can happen
      // easily, if, e.g., there are two adjacent annotations on a layer.
      // So instead, what I'll do is, if I discover multiple elements on
      // a layer, I'll abort listing individual layers and instead
      // force the user to select the annotation separately.

      var layerAssignments = {};

      var disp = this;
      var annots = [];
      var layerModificationAvailable = true;
      for (var i = 0; i < idArray.length; i++) {
        var annot = this._regionMap.annIDHash[idArray[i]];
        annots.push(annot);
        // We only need to be doing the layer assignments
        // if layered modification is still possible.
        if (isSwipe && layerModificationAvailable) {
          var assignment = this.layerAssignments[idArray[i]];
          var assignmentEntry = layerAssignments[assignment.layer];
          if (assignmentEntry === undefined) {
            assignmentEntry = {positionList: [], positionHash: {}};
            layerAssignments[assignment.layer] = assignmentEntry;
          }          
          if (assignmentEntry.positionHash[assignment.position]) {
            assignmentEntry.positionHash[assignment.position] = null;
            layerModificationAvailable = false;
          } else if (assignmentEntry.positionHash[assignment.position] == undefined) {
            assignmentEntry.positionHash[assignment.position] = annot;
            assignmentEntry.positionList.push(assignment.position);
          }
        }
      }    

      var G = MAT.DocDisplay.AnnotationGesture;
      // An AnnotationGesture, if hand annotation is available.
      // If it's a click, we can replace the annotations, but
      // otherwise, we just add.
      var annotationGesture = null;
      if (this._handAnnotationAvailable) {
        annotationGesture = new G(this._doc, isSwipe ? []  : annots, function() {
          try {
            disp._addAndRemoveAnnotations(this, !isSwipe);
          } catch (e) {
            if (e.constructor === MAT.Annotation.DocumentError) {
              disp._panel.uiError(e.msg);
            } else {
              disp._panel.uiError("adding or replacing the annotation failed for an unknown reason");
            }
            // Not sure what went wrong, but we ought to make sure
            // that the display is repaired - let's say we drew a span,
            // and the annotation creation raised an error.
            if (redrawOnCancel) {
              disp._unswipeRegions(redrawOnCancel);
            }
          }
        }, {
          gestureDisplaySource: this,
          gestureSource: "menu"
        });
        annotationGesture.setSpanInfo(startIndex, endIndex);
      }

      var dismissCb = null;
      
      if (redrawOnCancel) {
        dismissCb = function () {
          disp._unswipeRegions(redrawOnCancel);
        };
      }

      var gestureBundle = new MAT.DocDisplay.GestureMenuBundle(this, {
        annotationPopupTree: this._handAnnotationAvailable ? (spanless ? (annots.length > 0 ? null : this._spanlessAnnotationPopupTree) : this._annotationPopupTree) : null,
        annGesture: annotationGesture,
        lastAnnotationEntry: this._handAnnotationAvailable ? (spanless ? this._lastSpanlessAnnotationEntry : this._lastAnnotationEntry) : null,
        repeatAccelerator: "=",
        dismissCb: dismissCb
      });

      // By this point, if it's a swipe, hand annotation is available.

      if (isSwipe) {
        // Here is where we add all the modify gestures, if there are
        // some annotations. For "inLayer", we just say "Modify extent".
        if (annots.length > 0) {
          // We'll never get here for spanless annotations, because
          // it's not a swipe.
          function addModifyExtentItem(annot, label) {
            var ge = new G(disp._doc, [annot], function() {
              disp._modifyAnnotationExtent(this);
            }, {
              gestureDisplaySource: disp,
              gestureSource: "menu"
            });
            ge.setSpanInfo(startIndex, endIndex);
            gestureBundle.addMenuItem({
              label: label,
              gesture: ge
            });
          }

          if (layerModificationAvailable) {

            if (layerAssignments.inLayer && layerAssignments.inLayer.positionHash["0"]) {
              if (layerAssignments.superLayer || layerAssignments.subLayer) {
                addModifyExtentItem(layerAssignments.inLayer.positionHash["0"], "Modify extent (inline)");
              } else {
                addModifyExtentItem(layerAssignments.inLayer.positionHash["0"], "Modify extent");
              }
            }
            // Now, for super and sub (in the beginning, it's only going to be
            // super), order the layers, and then add menu items.

            function numberOrder(x, y) {
              return x - y;
            }

            if (layerAssignments.superLayer) {
              layerAssignments.superLayer.positionList.sort(numberOrder);
              for (var i = 0; i < layerAssignments.superLayer.positionList.length; i++) {
                var thisPos = layerAssignments.superLayer.positionList[i];
                var maybeAnnot = layerAssignments.superLayer.positionHash[thisPos];
                if (maybeAnnot) {
                  addModifyExtentItem(maybeAnnot, "Modify extent (layer " + (thisPos + 1) + " above)");
                }
              }
            }

            if (layerAssignments.subLayer) {
              layerAssignments.subLayer.positionList.sort(numberOrder);
              for (var i = 0; i < layerAssignments.subLayer.positionList.length; i++) {
                var thisPos = layerAssignments.subLayer.positionList[i];
                var maybeAnnot = layerAssignments.subLayer.positionHash[thisPos];
                if (maybeAnnot) {
                  addModifyExtentItem(maybeAnnot, "Modify extent (layer " + (thisPos + 1) + " below)");
                }
              }

            }
          } else {
            // We're in a situation where there's more than one annotation under the swipe
            // for some layer. Instead of dealing with the separate layers, we'll have
            // a single item, "Modify extent...", which requires you to select an annotation.
            var ge = new G(this._doc, [], function() {
              // So this is unduly complicated. First, I have to provide a popup
              // to inform folks that they need to choose an annotation; cancelling
              // or dismissing that popup must cancel this item.
              // Also, as I do that, I have to push an annotation
              // gesture handler which will allow selection only of one of the
              // annots listed; cancelling or completing this element has to
              // pop that gesture handler. Finally, if there's a successful completion,
              // we update the affected annots in this gesture and call
              // _modifyAnnotationExtent. Whew.
              // But there's still a problem: how do I ensure that this popup
              // gets dismissed appropriately when the window is swapped?
              // Actually, this is a bigger bug: every popup needs a dismissCb, so
              // that if the window is hidden, the popup is cancelled. I should
              // handle this very much like I handle the annotation popups.
              
              // Actually, there's yet another problem: the highlighting is
              // gone. I think what I need to do is ensure that the highlighting
              // only goes away when we're done here. But how? If I leave the gray,
              // you can't really distinguish the annotations; and if I remove the
              // gray, you can't see the extent of the swipe.
              // So I'm going to compute the box - left, right, top, bottom -
              // from the spans in the region, and add a box on a lower CSS layer.
              var boxes = disp._computeAnnotationBoxes(startIndex, endIndex);
              // Now, draw these boxes, behind everything, with a border.
              for (var w = 0; w < boxes.length; w++) {
                var box = boxes[w];
                box.element = B("div", {
                  style: {
                    position: "absolute",
                    // The top has to subtract the height of the border.
                    top: box.top - 2,
                    width: box.right - box.left,
                    height: box.bottom - box.top,
                    left: box.left,
                    border: "dotted 2px gray",
                    // This can't be in front, because then it will
                    // be selectable, and the annotation gesture processing
                    // won't have the faintest idea what to do.
                    zIndex: -1
                  }
                });
                disp._div.appendChild(box.element);
              }
              
              var popHandler = false;
              
              function cancelModifySelect() {
                if (popHandler) {
                  disp.popAnnotationGestureHandler();
                  for (var w = 0; w < boxes.length; w++) {
                    disp._div.removeChild(boxes[w].element);
                  }
                  boxes = [];
                  popHandler = false;
                }               
              }
              
              var g = this;
              var p = disp._panel.uiPopup("Please select the annotation to modify.",
                                          "modifyinstruction", "Modify", [{
                                            text: "Cancel",
                                            isDefault: true,
                                            // The closeCb doesn't get called when
                                            // the button is pressed. So do this here, too.
                                            handler: cancelModifySelect
                                          }], {
                                            icon: null,
                                            closeCb: cancelModifySelect
                                          });
              disp.pushAnnotationGestureHandler(
                function (e, idArray, startIndex, endIndex,
                          params) {
                  params.successCb = function (aVal) {
                    cancelModifySelect();
                    p.closePanel();
                    g.affectedAnnots = [aVal];
                    disp._modifyAnnotationExtent(g);
                  };
                  params.failureCb = function(errMsg) {
                    cancelModifySelect();
                    p.closePanel();
                    disp._panel.uiError(errMsg);
                  };
                  disp.chooseAnnotationForModifyExtent(
                    e, idArray, startIndex, endIndex, annots, params);
                }
              );
              // Now that we've pushed it, ensure it will be popped.
              popHandler = true;
            }, {
              gestureDisplaySource: this,
              gestureSource: "menu"
            });
            ge.setSpanInfo(startIndex, endIndex);
            gestureBundle.addMenuItem({
              label: "Modify extent...",
              gesture: ge
            });
          }
        }
      } else if (annots.length == 1) {
        // I've already barfed on clicking on multiple things.
        // Here we add edit/view, and then autotag and delete
        // if there's something there.
        gestureBundle.addEditOrViewItem(annots[0]);
        if (this._handAnnotationAvailable) {
          if (allowAutotag) {
            // We'll never get here in the case of spanless annotations,
            // because it's explicitly disallowed in _processSpanlessAnnotationGesture.
            gestureBundle.addMenuItem({
              label: "Autotag matches",
              gesture: new G(this._doc, annots, function() {
                disp._autotagAnnotations(this);
              }, {
                gestureDisplaySource: this,
                gestureSource: "menu"
              })
            });
          }
          gestureBundle.addDeleteItem(this._doc, annots);
        }
      }

      // There may still be nothing to do, in which case we shouldn't do anything, duh.
      if ((gestureBundle.menuItems.length == 0) && !annotationGesture) {
        if (redrawOnCancel) {
          this._unswipeRegions(redrawOnCancel);
        }
        return null;
      }
        

      this._panel.log({"gesture_type": isSwipe ? "mouse_swipe" : "mouse_click",
                       action: "summon_annotation_popup"});

      // Special case of spanless annotation: when we've selected a spanless annotation,
      // don't offer the "Replace" options.

      return gestureBundle;
    },

    // This method is called when the doc display is created. It takes
    // either the tag table or the tag hierarchy and constructs a
    // sorted tree of elements which can be traversed to create the
    // annotation popup.

    // Now that we're going to have a column on the left for spanless
    // annotations, we need to build a popup tree for spanned and for spanless.
    
    _buildAnnotationPopupTree: function(spanValue) {
      // If there's a tag hierarchy, we should use that to construct the
      // menu hierarchy, rather than building it from the tag table itself.

      var popupTree = [];

      // We have to go through the tag table, and collect just those things
      // which are content annotations, and then collect the names of all
      // the CSS displays. See, e.g., _tagLegend in core_ui.js.
      // We ALSO need to ensure in the popup that we're only presenting
      // spanned annotations.
      var labels = [];
      var labelHash = {};
      var accelHash = {};
      this._task.globalAnnotationTypeRepository.forEachDisplayEntry(function(trueLabel, localLabel, data, attrObj) {
        // this is the annotation type.
        if ((this.hasSpan === spanValue) && MAT.Annotation.AnnotationType.isContentType(data.category)) {
          var cssDisplay = data.display;
          labels.push(cssDisplay.name);
          labelHash[cssDisplay.name] = cssDisplay;
          if (cssDisplay.accelerator) {
            accelHash[cssDisplay.accelerator] = cssDisplay;
          }
        }
      });
      if (this._tagHierarchy == null) {
        if (this._tagOrder != null) {
          for (var k = 0; k < this._tagOrder.length; k++) {
            var l = this._tagOrder[k];
            if (labelHash[l] !== undefined) {
              popupTree.push({virtual: false,
                              children: [],
                              contents: labelHash[l]});
            }
          }
        } else {
          labels.sort();
          for (var k = 0; k < labels.length; k++) {
            popupTree.push({virtual: false,
                            children: [],
                            contents: labelHash[labels[k]]});
          }
        }
      } else {
        // If we have a tag hierarchy, we build a similar structure.
        function _doPopupLevel(hLevel, tOrder) {
          var hLabels = [];
          if (tOrder != null) {
            for (var k = 0; k < tOrder.length; k++) {
              var l = tOrder[k];
              if (hLevel[l] !== undefined) {
                hLabels.push(l);
              }
            }
          } else {
            for (var hLabel in hLevel) {
              hLabels.push(hLabel);          
            }
            hLabels.sort();
          }
          var hList = [];
          for (var k = 0; k < hLabels.length; k++) {
            var virtualData = hLevel[hLabels[k]];
            // For each element, first figure out whether it's
            // a known content annotation.
            var d = {}
            var contentAnnotContents = labelHash[hLabels[k]];
            if (contentAnnotContents !== undefined) {
              d.virtual = false;
              d.contents = contentAnnotContents;
            } else {
              d.virtual = true;
              // Make it look like a css display entry. Why not?
              var css = null;
              if (virtualData.css) {
                css = virtualData.css;
              }
              d.contents = {
                name: hLabels[k],
                tag_name: hLabels[k],
                css_classes: [],
                css: css,
                accelerator: null
              };                          
            }
            if (virtualData.children) {
              d.children = _doPopupLevel(virtualData.children, tOrder);            
            } else {
              d.children = [];
            }
            hList.push(d);
          }
          return hList;
        }
        popupTree = _doPopupLevel(this._tagHierarchy, this._tagOrder);
      }
      return {tree: popupTree, accelHash: accelHash, labelHash: labelHash};
    },
    
    _deleteAnnotations: function(g) {
      this._addAndRemoveAnnotations(g, false);
    },

    // If there are token boundaries, use the token boundaries.
    // Otherwise, use whitespace or zone boundaries, along with possibly
    // punctuation. I need to expand to the nearest token boundary on each side,
    // if tokens are involved. How? 

    // Note the references to this, while g has a document in it. Perhaps
    // we have to clean this up eventually...
    
    _autotagAnnotations: function(g) {
      // I may have swiped multiple annotations. That's OK.
      // Don't change the last annotation.
      var signal = this._doc.signal;
      // Events are a list of things that are done to annotations.
      // From the events, log entries are created by removing the affected annotation.
      // Some of the events are shipped to the log, some are shipped to the redisplay
      // component.
      var gestureType = "mouse_click";
      // On the first iteration, the contentBlankRegions are
      // the regions I search. On subsequent iterations, I assemble
      // my own.
      var rMap = this._regionMap;
      var blankRegions = rMap.contentBlankRegions;
      // Respect the tokenless autotag delimiters.
      var delims = this._tokenlessAutotagDelimiters;
      // The three characters you have to look out for in 
      // this set are backslash, caret, and right bracket. If a backslash
      // occurs in the set, I'm going to assume that it's there
      // correctly. So eliminate that. I need to see if caret and right
      // bracket are there, and if so, escape them.
      if (delims) {
        delims = delims.replace(/\]/, "\\]");
        delims = "\\s" + delims.replace(/\^/, "\\^");      
      } else {
        delims = "\\s";
      }
      var total = 0;
      for (var i = 0; i < g.affectedAnnots.length; i++) {
        // Mark the autotag. The annotations are logged separately.
        var annot = g.affectedAnnots[i];
        g.events.push({label: annot.getEffectiveLabel(),
                       gesture_type: "mouse_click",
                       gesture_source: g.gestureSource,
                       event_name: "autotag"});
        
        var cssDisplayEntry = annot.getEffectiveDisplayEntry();

        if (!cssDisplayEntry) {
          this._panel.uiError("Couldn't find appropriate label description for the selected annotation.");
          return;
        }
        
        // Next, we find all the matches in the document which
        // don't overlap existing annotations (and we have to recalculate 
        // this on each loop iteration, because we have to make sure that
        // the annotations don't overlap each other).
        // So I'm collecting the contentBlankRegions in the
        // region map. But that doesn't help me on subsequent
        // iterations. There, I'll just need to keep track
        // of the regions I haven't annotated.
        var nextBlankRegions = [];
        var s = signal.substring(annot.start, annot.end);
        // console.debug("seed is " + annot.start + " to " + annot.end);
        // I need to replace all whitespace sequences with
        // the whitespace sequence match.
        s = s.split(/\s+/).join("\\s+");
        // The matching case is going to differ slightly between
        // token and tokenless. For tokens, just look for the string and
        // keep the ones whose ends are on a token boundary. For tokenless,
        // you need to use a bunch of delimiters: whitespace, zone boundary,
        // plus whatever other punctuation you specify in the task.xml file.
        var re;
        var reFlags = "g";
        if (!this._panel.getConfigVar("autotagIsCaseSensitive")) {
          reFlags += "i";
        }
        if (rMap._foundTokens) {
          re = new RegExp(s, reFlags);
        } else {
          re = new RegExp("(^|[ "+ delims + "])(" + s + ")($|[" + delims + "])", reFlags);
        }
        for (var j = 0; j < blankRegions.length; j++) {
          var curBlankRegion = blankRegions[j];
          var startIndex = curBlankRegion[0];
          re.lastIndex = startIndex;
          while (true) {
            var m = re.exec(signal);
            if ((m == null) || ((m.index + m[0].length) > curBlankRegion[1])) {
              // It's null, or it ends after the region ends - not kosher.
              nextBlankRegions.push([startIndex, curBlankRegion[1]]);
              break;
            } else {
              var sIndex;
              var eIndex;
              // If we have tokens, we reject any pattern which doesn't
              // fall on token boundaries.
              if (rMap._foundTokens) {
                sIndex = m.index;
                eIndex = m.index + m[0].length;
                // If I'm auto-marking, we may not even have an entry
                // at sIndex or eIndex.
                var startReasons = rMap.indexToIndexReason[sIndex];
                var endReasons = rMap.indexToIndexReason[eIndex];
                var startAnnots = (startReasons !== undefined ? startReasons.annotStart : undefined);
                var endAnnots = (endReasons !== undefined ? endReasons.annotEnd : undefined);
                var startOK = false;
                var endOK = false;
                if ((startAnnots !== undefined) && (endAnnots !== undefined)) {
                  for (var k = 0; k < startAnnots.length; k++) {
                    if (startAnnots[k].atype.category == "token") {
                      startOK = true;
                      for (var q = 0; q < endAnnots.length; q++) {
                        if (endAnnots[q].atype.category == "token") {
                          endOK = true;
                          break;
                        }
                      }
                      break;
                    }
                  }
                }
                if (!(startOK && endOK)) {
                  continue;
                }
              } else {
                // The start index is the index plus the length of the first segment.
                var mString = m[2];
                var mPrefix = m[1];
                sIndex = m.index + mPrefix.length;
                eIndex = sIndex + mString.length;
              }
              this._copyAnnotation(this._doc, sIndex, eIndex, annot,
                                   cssDisplayEntry, "auto", g, {keepAnnotationValuedAttributes: false});
              
              total += 1;
              // console.debug("Adding " + annot.atype.label + " over '" + mString + "' from " + sIndex + " to " + eIndex);
              nextBlankRegions.push([startIndex, sIndex]);
              startIndex = eIndex;
            }
          }        
        }
        blankRegions = nextBlankRegions;
      }    

      // No need to notify that hand annotation has changed, since autotagging
      // can only happen if there's an annotation there already.
      // We also want to report what happened. 
      this._reportAnnotationResults(g);
      var msg;
      if (total == 0) {
        msg = "Nothing autotagged.";
      } else if (total == 1) {
        msg = "Added 1 tag.";
      } else {
        msg = "Added " + total + " tags.";
      }
      this._panel.uiInform(msg);
    },

    // The add gesture might be spanless.
    // Also, there's a special case where there's one affected annotation and
    // a CSS entry, and the gesture is a click. In this case, if the CSS
    // entry is an effective label, and the true label is the same as the
    // current affected annotation, it's a modify-attribute rather than
    // a replace.
    
    _addAndRemoveAnnotations: function(g, considerClick) { // annArray, startIndex, endIndex, cssDisplayEntry, isAccel) {
      // Remove menu.
      // this._annotationCleanup();
      // Delete annotations.
      var doc = this._doc;
      // This one is kind of complicated.
      var gestureType = g.gestureType;
      var annotsRemoved = g.affectedAnnots;
      var cssDisplayEntry = g.displayInfo;

      if (considerClick && (annotsRemoved.length == 1) &&
          cssDisplayEntry && cssDisplayEntry.attr &&
          (annotsRemoved[0].atype.label == cssDisplayEntry.tag_name)) {
        // This is the special case where we've clicked, and we've
        // selected an effective label, and its true label is the same as
        // the true label of the annotation. Modify rather than replace.
        annotsRemoved[0].setAttributeValue(cssDisplayEntry.attr, cssDisplayEntry.val);
        g.events.push({
          annot: annotsRemoved[0],
          gesture_type: gestureType,
          gesture_source: g.gestureSource,
          event_name: "modify_annotation",
          attr_name: cssDisplayEntry.attr,
          label: annotsRemoved[0].getEffectiveLabel()
        });
        g.cssDisplayEntry = null;
      } else {
        
        // Let's remove all the annotations at once, just in case they
        // point to each other.
        for (var i = 0; i < annotsRemoved.length; i++) {
          // Kill the annotations.
          var annot = annotsRemoved[i];
          g.events.push({label: annot.atype.label,
                         gesture_type: gestureType,
                         gesture_source: g.gestureSource,
                         event_name: "remove_annotation",
                         annot: annot});
        }
        if (annotsRemoved.length > 0) {
          // This may not be possible, if there's one in the set
          // which is referenced.
          try {
            doc.removeAnnotationGroupViaUI(annotsRemoved, g.events);
          } catch (e) {
            var msg;
            if (e.constructor === MAT.Annotation.DocumentError) {
              msg = e.msg;
            } else {
              msg = "removing the annotation(s) failed for an unknown reason";
            }
            // What do we log?
            this._panel.log([{gesture_type: gestureType,
                              gesture_source: g.gestureSource,
                              action: "remove_annotation_failed",
                              reason: msg}]);
            throw e;
          }
        }
        if (cssDisplayEntry != null) {
          this._addAnnotation(g);
          // Mark this as the last annotation, and add '=' to the accelerator.
          if ((g.startI == null) || (g.endI === null)) {
            this._lastSpanlessAnnotationEntry = cssDisplayEntry;
            this._spanlessAnnotationPopupTree.accelHash["="] = cssDisplayEntry;
          } else {
            this._lastAnnotationEntry = cssDisplayEntry;
            this._annotationPopupTree.accelHash["="] = cssDisplayEntry;
          }
        }
      }

      this._reportAnnotationResults(g);

      // I don't think it's possible to show the tags without
      // zones being shown, since zoning is a prerequisite for
      // hand tagging.
    },  

    // This may have to do some fancy dancing eventually to get it
    // to interact with the segments appropriately.
    
    _modifyAnnotationExtent: function(g) {
      var annot = g.affectedAnnots[0];
      var oldStart = annot.start;
      var oldEnd = annot.end;
      annot.modifyExtent(g.startI, g.endI);
      g.events.push({
        label: annot.atype.label,
        gesture_type: "mouse_click",
        gesture_source: g.gestureSource,
        event_name: "modify_extent",
        annot: annot,
        old_start: oldStart,
        old_end: oldEnd,
        start: g.startI,
        end: g.endI
      });
      this._reportAnnotationResults(g);
    },

    // This will be overridden in the reconciliation document.
    // Modified EXTENSIVELY to handle more general reporting of a set of
    // events, so that the system redisplay can be synchronized.
    
    _reportAnnotationResults: function (g) {

      this._reportAnnotationResultsCore(g.events, g.gestureDisplaySource, {
        markHandAnnotated: true,
        displayInfo: g.displayInfo,
        maybeOfferPopup: true,
        reportHandAnnotationPerformed: true,
        log: true,
        redisplay: true
      });
    },

    // If the display entry says to edit immediately, then
    // we should edit immediately.
    
    _addAnnotation: function(g) {
      var doc = this._doc;
      var gestureType = g.gestureType;
      var gestureSource = g.gestureSource;
      var cssDisplayEntry = g.displayInfo;
      var extraPairs = g.extraAttributeValuePairs;
      var startIndex = g.startI;
      var endIndex = g.endI;
      var spanned = false;
      if ((startIndex != null) && (endIndex != null)) {
        spanned = true;
      }
      
      // add a new annotation.
      // Grab the type. We may be annotating before
      // the type is defined in the annotation space, so
      // we might need to define it.
      var t = doc.annotTypes.findAnnotationType(cssDisplayEntry.tag_name, spanned);
      var annot = new MAT.Annotation.Annotation(doc, t, startIndex, endIndex, null, []);
      if (cssDisplayEntry.attr) {
        annot.setAttributeValue(cssDisplayEntry.attr, cssDisplayEntry.val);
      }
      if (extraPairs) {
        for (var i = 0; i < extraPairs.length; i++) {
          annot.setAttributeValue(extraPairs[i][0],
                                  extraPairs[i][1]);
        }
      }
      doc.addAnnotation(annot);
      g.events.push({label: cssDisplayEntry.name,
                     gesture_type: gestureType,
                     gesture_source: gestureSource,
                     event_name: "add_annotation",
                     annot: annot});
    },

    _copyAnnotation: function(doc, startIndex, endIndex, oldAnnot,
                              cssDisplayEntry, gestureType, gesture /* , {keepAnnotationValuedAttributes: true/false} */
                             ) {

      var params;
      if (arguments.length > 7) {
        params = arguments[7];
      } else {
        params = {};
      }
      
      // add a new annotation.
      // Grab the type. We may be annotating before
      // the type is defined in the annotation space, so
      // we might need to define it.
      var annot = doc.copyAnnotation(oldAnnot, params);
      if (annot.atype.hasSpan) {
        annot.start = startIndex;
        annot.end = endIndex;
      }
      doc.addAnnotation(annot);
      
      gesture.events.push({label: cssDisplayEntry.name,
                           gesture_type: gestureType,
                           gesture_source: gesture.gestureSource,
                           event_name: "add_annotation",
                           annot: annot});
    },
    
    
    // Next family of functions: choose mode.

    // attrObj may be a "fake" object created for parent selection.

    enterChooseMode: function(attrObj, outerParams) {
      // The params contain a exitCb, with no arguments, and a successCb, which accepts a
      // single annotation as its argument. 
      // The exitCb should be called when we cancel choose mode, or when we succeed. We actually
      // relay the global handling of this to this._panel, which manages the
      // UI reflex of choose mode. In the case of the standard workbench UI, the
      // error that selectOrCreateContextuallyRestrictedAnnotation might generate
      // calls the failureCb in the params which are passed to it, but that may
      // or may not cancel out of choose mode. 
      var disp = this;
      
      this.pushAnnotationGestureHandler(
        function (e, idArray, startIndex, endIndex,
                  params) {
          params.successCb = function (aVal) {
            disp._panel.chooseModeSuccess(aVal);
          };
          params.failureCb = function(errMsg) {
            disp._panel.chooseModeError(errMsg);
          };
          disp.selectOrCreateContextuallyRestrictedAnnotation(
            e, idArray, startIndex, endIndex, attrObj, params);
        }
      );

      // The exitCb will be called immediately before successCb, or
      // whenever the panel decides that chooseMode should be exited.
      
      this._panel.enterChooseMode({
        successCb: outerParams.successCb,
        exitCb: function() {
          disp.popAnnotationGestureHandler();
          if (outerParams.exitCb) {
            outerParams.exitCb();
          }
        }
      });
    },

    exitChooseMode: function() {
      this._panel.exitChooseMode();
    },

    // The restricted context operation. Currently only used in choose mode.
    // This should be publicly available.

    selectOrCreateContextuallyRestrictedAnnotation: function (e, idArray, startIndex, endIndex,
                                                              attrObj, params) {

      // attrObj may be a "fake" object created for parent selection.
      // So the only attributes you should access are:
      // atomicLabelRestrictions
      // digestedComplexLabelRestrictions
      // _choicesSatisfyRestrictions
      
      // These params are different than the ones passed to _offerAnnotationPopup.
      // We want the following to happen.
      // If it's not a swipe, but a single annotation is selected, return it.
      // If it is a swipe, but there's only one possible label, just
      // create the annotation.
      // Otherwise, we have to create the annotation popup. Overlapping 
      // annotations should be supported.

      // params are isSwipe, redrawOnCancel, allowAutotag, successCb (for when
      // an annotation is chosen), failureCb.
      
      var isSwipe = params.isSwipe;
      var redrawOnCancel = params.redrawOnCancel;
      var successCb = params.successCb;
      var legalEffectiveLabels = params.legalSpannedEffectiveLabels;
      var failureCb = params.failureCb;
      var disp = this;
      var dismissCb = null;
            
      if (redrawOnCancel) {
        dismissCb = function () {
          disp._unswipeRegions(redrawOnCancel);
        }
        failureCb = function(msg) {
          disp._unswipeRegions(redrawOnCancel);
          params.failureCb(msg);
        }
      }
      
      params.allowAutotag = false;
      var spanless = false;
      var sourcePopupTree = this._annotationPopupTree;
      // If it's spanless, I have to make sure that I pick the right
      // sourcePopupTree.
      if ((startIndex == null) || (endIndex == null)) {
        spanless = true;
        sourcePopupTree = this._spanlessAnnotationPopupTree;
      }
      var G = MAT.DocDisplay.AnnotationGesture;

      // This is the tail portion of adding an annotation.
      // And if something goes wrong, I need to catch it.
      function doSuccess() {
        // The gesture calls the gesture as "this".
        var g = this;
        disp._addAnnotation(g);

        disp._reportAnnotationResults(g);

        // I don't think it's possible to show the tags without
        // zones being shown, since zoning is a prerequisite for
        // hand tagging.
        
        successCb(g.events[0].annot);
      }

      // Since you can only use choose mode in the context of hand
      // annotation, we know hand annotation is enabled. A swipe
      // is just a create - don't pass any annotations down (just
      // like in _offerAnnotationPopup). No modifies are supported.
      // A click must select a single annotation, I think, except
      // in spanless mode, where we're creating an annotation.
      
      var annots = [];
      for (var i = 0; i < idArray.length; i++) {
        annots.push(this._regionMap.annIDHash[idArray[i]]);
      }

      // We have to be sensitive to the situation where the restrictions
      // refer to true labels which have no display info of their own,
      // because they're ENAMEX-style labels. So if the task uses
      // the true label as a shorthand for all the things that can fill
      // this slot, I have to make sure I expand them. That can be tricky;
      // in the case where there are creation attrs PLUS it's an effective
      // label, I have to do something clever.

      if ((spanless && (annots.length == 0)) || isSwipe) {
        // Time to create an annotation. The first thing I need
        // to do is figure out which annotations to present, and how.

        var labelHash = sourcePopupTree.labelHash;
        var trueLabelToBareEffectiveLabels = {};
        // Create a map for the effective labels, just in case.
        for (var k in labelHash) {
          var v = labelHash[k];
          if (v.attr) {
            // It's an effective label.
            if (trueLabelToBareEffectiveLabels[v.tag_name] === undefined) {
              trueLabelToBareEffectiveLabels[v.tag_name] = [k];
            } else {
              trueLabelToBareEffectiveLabels[v.tag_name].push(k);
            }
          }
        }
        var doc = this._doc;
        var legalEntries = [];
        if (attrObj.atomicLabelRestrictions) {
          for (var k in attrObj.atomicLabelRestrictions) {
            // These will all be true labels.
            if (attrObj.atomicLabelRestrictions.hasOwnProperty(k)) {
              var atype = doc.annotTypes.typeTable[k] || doc.annotTypes.globalATR.typeTable[k];
              if (spanless == !atype.hasSpan) {
                if (labelHash[k]) {
                  // The easy case. 
                  legalEntries.push({
                    label: k
                  });
                } else if (trueLabelToBareEffectiveLabels[k]) {
                  // This is the case where we used, e.g., ENAMEX
                  // to substitute for all its effective labels.
                  // I have to create the proper entry.
                  var subk = trueLabelToBareEffectiveLabels[k];
                  for (var w = 0; w < subk.length; w++) {
                    var subEntry = labelHash[subk[w]];
                    legalEntries.push({
                      label: k,
                      fromEffectiveLabel: subk[w],
                      creationAttrs: [],
                      effectiveLabelAttr: subEntry.attr,
                      attrBitMask: atype._generateChoiceBitsFromAttrs([[subEntry.attr, subEntry.val]])
                    });
                  }
                }
              }
            }
          }
        }
        if (attrObj.digestedComplexLabelRestrictions) {
          for (var k in attrObj.digestedComplexLabelRestrictions) {
            if (attrObj.digestedComplexLabelRestrictions.hasOwnProperty(k)) {
              var entries = attrObj.digestedComplexLabelRestrictions[k];
              for (var q = 0; q < entries.length; q++) {
                var entry = entries[q];
                // see digestLabelRestrictions in mat_core.js for structure.
                var atype = doc.annotTypes.typeTable[entry.label] || doc.annotTypes.globalATR.typeTable[entry.label];
                if (spanless == !atype.hasSpan) {
                  if (labelHash[entry.fromEffectiveLabel || entry.label]) {
                    // This is the easy case. Just add the entry.
                    legalEntries.push(entry);
                  } else if ((!entry.fromEffectiveLabel) && trueLabelToBareEffectiveLabels[entry.label]) {
                    // The harder case is when the entry isn't from
                    // an effective label but its true label has entries
                    // in trueLabelToBareEffectiveLabels. In this case, we
                    // have to create a new, combined entry from each of
                    // the effective entries.
                    var subk = trueLabelToBareEffectiveLabels[entry.label];
                    for (var w = 0; w < subk.length; w++) {
                      var subEntry = labelHash[subk[w]];
                      var attrsForChoiceBits = entry.creationAttrs.slice(0);
                      attrsForChoiceBits.push([subEntry.attr, subEntry.val]);
                      legalEntries.push({
                        label: entry.label,
                        fromEffectiveLabel: subk[w],
                        creationAttrs: entry.creationAttrs,
                        effectiveLabelAttr: subEntry.attr,
                        attrBitMask: atype._generateChoiceBitsFromAttrs(attrsForChoiceBits)
                      });
                    }
                  }
                }
              }
            }
          }
        }

        if (legalEntries.length == 0) {
          failureCb("Can't create annotation; no legal candidates.");
        } else if (legalEntries.length == 1) {
          // Create an annotation of this effective label.
          var legalEntry = legalEntries[0];
          var cssEntry = sourcePopupTree.labelHash[legalEntry.fromEffectiveLabel || legalEntry.label];
          var g = new G(this._doc, null, doSuccess, {
            gestureDisplaySource: this,
            displayInfo: cssEntry,
            extraAttributeValuePairs: legalEntry.creationAttrs
          });
          g.setSpanInfo(startIndex, endIndex);
          g.gestureIsMouse();
          g.execute();
        } else {
          var labelHash = sourcePopupTree.labelHash;
          // There could be multiple elements for any
          // label here.
          var effectiveLabelHash = {};
          var effectiveLabels = [];
          for (var j = 0; j < legalEntries.length; j++) {
            var effectiveLabel = legalEntries[j].fromEffectiveLabel || legalEntries[j].label;
            var eLabel = effectiveLabelHash[effectiveLabel];
            if (eLabel === undefined) {
              eLabel = [];
              effectiveLabelHash[effectiveLabel] = eLabel;
              effectiveLabels.push(effectiveLabel);
            }
            eLabel.push(legalEntries[j]);
          }
          var popupElements = [];
          if (this._tagOrder != null) {
            for (var k = 0; k < this._tagOrder.length; k++) {
              var l = this._tagOrder[k];
              if ((labelHash[l] !== undefined) && (effectiveLabelHash[l])) {
                var elEntry = effectiveLabelHash[l];
                for (var w = 0; w < elEntry.length; w++) {
                  popupElements.push({virtual: false,
                                      children: [],
                                      contents: labelHash[l],
                                      extraAttributeValuePairs: elEntry[w].creationAttrs
                                     });
                }
              }
            }
          } else {
            effectiveLabels.sort();
            for (var k = 0; k < effectiveLabels.length; k++) {
              var elEntry = effectiveLabelHash[effectiveLabels[k]];
              for (var w = 0; w < elEntry.length; w++) {
                popupElements.push({virtual: false,
                                    children: [],
                                    contents: labelHash[effectiveLabels[k]],
                                    extraAttributeValuePairs: elEntry[w].creationAttrs
                                   });
              }
            }
          }
          var popupTree = {tree: popupElements,
                           accelHash: sourcePopupTree.accelHash,
                           labelHash: labelHash};

          // An AnnotationGesture. Don't pass in the existing annots,
          // if any.
          var annotationGesture = new G(this._doc, null, function() {
            try {
              doSuccess.call(this);
            } catch (e) {
              if (e.constructor === MAT.Annotation.DocumentError) {
                failureCb(e.msg);
              } else {
                failureCb("Got an unknown error.");
              }
            }
          }, {
            gestureDisplaySource: this,
            gestureSource: "menu"
          });
          annotationGesture.setSpanInfo(startIndex, endIndex);

          var cancelCb = function () {
            params.failureCb("Annotation creation cancelled.");
          }

          // offerAnnotationPopup arguments:
          // e: mouse event
          // menuItems: a list of {label:...., gesture:...} items
          // popupTree: the tree of annotations to add
          // addAnnotationGesture: a gesture for adding annotations
          // lastAnnotationEntry: the last display entry which was used for adding annotations
          // repeatAccelerator: the kbd accelerator to use for the repeat entry.
          // cancelCb: what to do if the menu exits without doing anything.

          this._panel.offerAnnotationPopup(e, new MAT.DocDisplay.GestureMenuBundle(this, {
            annotationPopupTree: popupTree,
            annGesture: annotationGesture,
            cancelCb: cancelCb,
            dismissCb: dismissCb
          }));
        }
      } else {
        // This is the case where we clicked (except the spanless empty case).
        if (annots.length == 0) {
          // If we found no annotations (remember,
          // we've already dealt with the spanless case and no annotations), we barf.
          failureCb("Click, but no annotations selected.");
        } else {
          // This is the case where we clicked on one or more annotations.
          // I can't see how we can get to the case where we're clicking on
          // more than one if we're in exploded mode already,
          // but just to be safe.
          // For each candidate, ask the attribute obj if it's kosher.
          var legal = [];
          for (var i = 0; i < annots.length; i++) {
            var annot = annots[i];
            var bits = annot.atype._generateChoiceBitsFromAnnot(annot) || 0;
            if (attrObj._choicesSatisfyRestrictions(annot.atype.label, bits)) {
              legal.push(annot);
            }
          }
          if (legal.length == 0) {
            failureCb("Incorrect annotation type.");
          } else if (legal.length > 1) {
            failureCb("Too many overlapping legal annotations.");
          } else {
            // And the third bowl of porridge...
            if (dismissCb) {
              dismissCb();
            }
            successCb(legal[0]);
          }
        }
      }      
    },

    // This chooser is used exclusively in modify extent with too
    // many things overlapping on a given layer. It forces you to choose one
    // of the selected items or give up.
    
    chooseAnnotationForModifyExtent: function (e, idArray, startIndex, endIndex,
                                               annotChoices, params) {

      // These params are different than the ones passed to _offerAnnotationPopup.
      // We want the following to happen.
      // If it's not a swipe, but a single annotation is selected
      // which is among the listed annotations, return it.
      // If it is a swipe, barf.

      // params are isSwipe, redrawOnCancel, allowAutotag, successCb (for when
      // an annotation is chosen), failureCb.
      
      var isSwipe = params.isSwipe;
      var redrawOnCancel = params.redrawOnCancel;
      var successCb = params.successCb;
      var failureCb = params.failureCb;
      var disp = this;
      var dismissCb = null;
            
      if (redrawOnCancel) {
        dismissCb = function () {
          disp._unswipeRegions(redrawOnCancel);
        }
        failureCb = function(msg) {
          disp._unswipeRegions(redrawOnCancel);
          params.failureCb(msg);
        }
      }
      
      if ((startIndex == null) || (endIndex == null)) {
        // Spanless. Can't possibly be the solution.
        failureCb("Can't choose a spanless annotation.");
        return;
      }

      if (idArray.length == 0) {
        failureCb("No annotations selected.");
      }

      if (idArray.length != 1) {
        failureCb("Can't choose more than one annotation.");
        return;
      }

      var annot = this._regionMap.annIDHash[idArray[0]];
      var found = false;
      for (var i = 0; i < annotChoices.length; i++) {
        if (annotChoices[i] === annot) {
          found = true;
          break;
        }
      }
      
      if (!found) {
        failureCb("The selected annotation does not overlap with your extent swipe.");
        return;
      }

      // At this point, we can force the selection of the annot.
      
      if (dismissCb) {
        dismissCb();
      }
      successCb(annot);
    }

  });

/*
 *                    MAT.DocDisplay.DocDisplay
 *
 *
 * This object maps between the annotation object and the regions in
 * the doc display.
 *
 */

  MAT.DocDisplay.DocDisplay = function (panel, context, div) {
    if (arguments.length > 0) {
      MAT.DocDisplay.CoreDocDisplay.apply(this, arguments);
      this.hideSegments();
      this._doc = null;
      this._reviewer = this.DEFAULT_ANNOTATOR;
      // Add "fileDisplay" to the taglabel.
      this._tagLabel = "fileDisplay " + this._tagLabel;
      if (arguments.length > 3) {
        if (arguments[3].doc) {
          this.setData(arguments[3].doc, arguments[3]);
        }
        if (arguments[3].reviewer) {
          this._reviewer = arguments[3].reviewer;
        }
      }
    }
  };

  MAT.Extend(MAT.DocDisplay.DocDisplay, MAT.DocDisplay.CoreDocDisplay, {  

    setData: function(doc) {
      // Make sure to remove any old display.
      if (this._doc) {
        this._doc.removeVisualDisplay(this);
      }
      this._doc = doc;
      // This has to have a displayId, and implement forceRedisplayResponse.
      this.displayId = this._panel.uiGetDisplayCounter();
      this._doc.addVisualDisplay(this);
      var params = {};
      if (arguments.length > 1) {
        params = arguments[1];
      }
      this.redisplay(params);
    },

    // If this is called, it just calls redisplay on itself.
    // This must be implemented if addVisualDisplay is used.
    // And if there's a spanless annotation, we have to redraw the side panel
    // alone.
    
    forceRedisplayResponse: function(events) {
      var redisplayAll = false;
      var redisplaySpanless = false;
      for (var i = 0; i < events.length; i++) {        
        if (events[i].annot) {
          if (events[i].annot.atype.hasSpan) {
            redisplayAll = true;
            break;
          } else {
            // Make sure we at least redisplay the spanless pane, and continue.
            redisplaySpanless = true;
          }
        }
      }
      if (redisplayAll) {
        // There's at least one spanned annotation affected; redraw.
        this.redisplay();
      } else {
        this.spanlessRedisplay();
      }
    },

    // We need this in a bunch of places. Note that we
    // need to ask each annotation to redisplay - but the problem is
    // that we need to ensure that the document only redisplays once.
    // I think the only solution is to have the document ask the annotations,
    // instead of the other way around.

    // I've refactored this so that it does everything the original
    // _reportAnnotationResults does, but can be controlled. I did this because
    // when I edit attributes, I need just about everything done EXCEPT
    // the redisplay.
    
    _reportAnnotationResultsCore: function(events, gestureDisplaySource, params /* {markHandAnnotation: true/false, maybeOfferPopup: true/false, displayInfo: ..., reportHandAnnotationPerformed: true/false, log: true/false, redisplay: true/false} */) {

      var markHandAnnotation = params.markHandAnnotated;
      var maybeOfferPopup = params.maybeOfferPopup;
      var displayInfo = params.displayInfo;
      var reportHandAnnotationPerformed = params.reportHandAnnotationPerformed;
      var log = params.log;
      var redisplay = params.redisplay;      
      
      // Everything goes to the log, without the annot. The following
      // events are preserved for processing: add_annotation, modify_extent, remove_annotation.
      var logEntries = [];
      // Some of these events don't have an annot, like autotag. Only
      // add to the redisplayEntries if it has annot.
      var redisplayEvents = [];
      var doc = this._doc;
      var performed = false;
      var popupOffer = null;
      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        if ((event.event_name == "add_annotation") || (event.event_name == "remove_annotation") ||
            (event.event_name == "modify_extent") || (event.event_name == "modify_annotation") ||
            (event.event_name == "attach_child") || (event.event_name == "attach_to_parent") ||
            (event.event_name == "detach_child") || (event.event_name == "detach_from_parent")) {
          performed = true;
          if (markHandAnnotation) {
            if (event.event_name == "modify_extent") {
              // Mark the whole affected region.
              doc.markHandAnnotated(Math.min(event.annot.start, event.old_start), Math.max(event.annot.end, event.old_end), this._reviewer);
            } else {
              doc.markHandAnnotated(event.annot.start, event.annot.end, this._reviewer);
            }
          }
          if ((event.event_name == "add_annotation") && (event.gesture_type != "auto") &&
              ((!event.annot.atype.hasSpan) ||
               (displayInfo && displayInfo.edit_immediately) ||
               (event.annot.atype.display && event.annot.atype.display.edit_immediately)) &&
              event.annot.isEditable()) {
            // Exclude "auto", because that's autotag.
            popupOffer = event.annot;
          }
        }
        var d = {action: event.event_name};
        for (var k in event) {
          if (event.hasOwnProperty(k) &&
              (k != "annot") &&
              (k != "parent_annot") &&
              (k != "child_annot") &&
              (k != "event_name")) {
            d[k] = event[k];
          }
        }
        logEntries.push(d);
        if (event.annot) {
          redisplayEvents.push(event);
        }
      }

      if (performed && reportHandAnnotationPerformed) {
        // Make sure the "tag" step is added to the phases, no matter
        // what. Actually, what we should do is tell the backend application
        // that a hand annotation was added, and let it figure things out
        // from there.
        this._panel.notifyHandAnnotationPerformed();
      }
      
      // If this was set up from here, in offerAnnotationPopup, we've
      // passed it in as the display source, and we should redisplay.
      
      // Some of these events don't have an annot, like autotag.

      if (log) {
        this._panel.log(logEntries);
      }

      if (redisplay) {
        if (gestureDisplaySource == this) {
          this.forceRedisplayResponse(redisplayEvents);
        }
        if (redisplayEvents.length > 0) {
          doc.forceRedisplay(gestureDisplaySource, redisplayEvents);
        }
      }
      
      if (popupOffer && maybeOfferPopup) {
        this._panel.offerAnnotationEditor(popupOffer);
      }

    },  

    destroy: function() {
      if (this._doc) {
        this._doc.removeVisualDisplay(this);
      }
      MAT.DocDisplay.CoreDocDisplay.prototype.destroy.call(this);
    },

    redisplay: function() {    
      var params = {};
      
      if (arguments.length > 0) {
        params = arguments[0];
      }

      // It turns out that when there's a spanless sidebar,
      // redisplaying returns the document to the top. So
      // we should capture scrollTop and reset it.

      var scrollTop = this._div.scrollTop;

      this.layerAssignments = {};
      this._explodedLayerAssignmentCache = null;
      this._importAnnotationsFromDocuments({
        displayParams: params
      });
      this._renderText();
      
      this._div.scrollTop = scrollTop;
    },

    clear: function () {
      MAT.DocDisplay.CoreDocDisplay.prototype.clear.call(this);
      this._doc = null;
    },

    _collectDocuments: function () {
      return [this._doc];
    },

    // Perhaps I should cache this. If I do, I'll have to
    // remember to update it when I add a remove a spanless annotation.

    _retrieveSpanlessAnnotationPairings: function () {
      var entry = {
        labels: ["doc"],
        pairings: []
      };
      // Every annotation is a pivotAnnot.
      var spanlessAnnots = this._doc.allContentAnnotations({spanlessOnly: true});
      for (var i = 0; i < spanlessAnnots.length; i++) {
        entry.pairings.push({match: true, entries: {doc: {annot: spanlessAnnots[i], pivot: true}}});
      }
      return entry;
    },
    
    // This takes an annotation set and a list of content annotations
    // and returns a mapping from the annotation IDs to
    // a CSS class "superLayer", "subLayer", "inLayer" and
    // then a number, which is interpreted differently depending
    // on whether it's super/sub (in which case it's margin multiples)
    // or inLayer (in which case it's z-indices).

    // The standard doc display just has all annotations as inline
    // at the same z-index. inlayer 0 is a special case where the
    // annotations go on the text span itself.
    
    // New strategy: we're going to assign the layer for each annotation
    // as we encounter it. This will work better for stacked annotations,
    // among other things. as well as adding annotations without redraw.
    // Reconciliation will be a trick, but we'll just have to bite that off.

    // If we're exploding, things will be a little trickier.

    // Actually, there's a bug here where annotations which have no
    // display CSS are still creating stacking space, which is wrong.
    // I have the "nolayer" option, which I should be using.
    
    assignContentAnnotLayer: function(contentAnnot) {
      if (this._handAnnotationAvailable) {
        var entry = contentAnnot.getEffectiveDisplayEntry();
        if (!contentAnnot.atype.hasSpan) {
          if (entry && entry.css) {
            this.layerAssignments[contentAnnot.id] = {layer: "inLayer", position: 0};
          } else {
            this.layerAssignments[contentAnnot.id] = {layer: "noLayer", position: 0};
          }
        } else {
          // Let's keep a tally of what layer we're on, and when we decrement.
          if (!this._explodedLayerAssignmentCache) {
            // This is a mapping from layer indices to the next index they're
            // free at. Layer 0 is behind, layer 1 is superLayer 0, etc.
            this._explodedLayerAssignmentCache = {};
          }
          if (!(entry && entry.css)) {
            // If there's no entry, we should assign the layer to be "nolayer".
            this.layerAssignments[contentAnnot.id] = {layer: "noLayer", position: 0};
          } else {
            var i = 0;
            while (true) {
              var thisLayerTaken = this._explodedLayerAssignmentCache[i];
              if ((thisLayerTaken === undefined) || (contentAnnot.start >= thisLayerTaken)) {
                // Found it.
                if (i == 0) {
                  this.layerAssignments[contentAnnot.id] = {layer: "inLayer", position: 0};
                } else {
                  this.layerAssignments[contentAnnot.id] = {layer: "superLayer", position: i - 1, margin: false};
                }
                this._explodedLayerAssignmentCache[i] = contentAnnot.end;
                break;
              }
              i += 1;
            }
          }
        }
      } else {
        var entry = contentAnnot.getEffectiveDisplayEntry();
        if (!entry) {
          // If there's no entry, we should assign the layer to be "nolayer".
          this.layerAssignments[contentAnnot.id] = {layer: "noLayer", position: 0};
        } else {
          this.layerAssignments[contentAnnot.id] = {layer: "inLayer", position: 0};
        }
      }
    }

  });

/*
 *                    MAT.DocDisplay.ComparisonDocDisplay
 *
 *
 * This object displays a comparison of multiple documents. It
 * supports no callbacks.
 *
 */


  MAT.DocDisplay.ComparisonDocDisplay = function (panel, context, div) {
    MAT.DocDisplay.CoreDocDisplay.apply(this, arguments);
    this.hideSegments();
    this.compEntries = null;
    this._tagLabel = "compDisplay " + this._tagLabel;
    if ((arguments.length > 3) && arguments[3].compEntries) {
      this.setData(arguments[3].compEntries, arguments[3]);
    }
  };

  MAT.Extend(MAT.DocDisplay.ComparisonDocDisplay, MAT.DocDisplay.CoreDocDisplay, {

    setData: function(compEntries) {
      if (this.compEntries) {
        for (var i = 0; i < this.compEntries.length; i++) {
          this.compEntries[i].doc.removeVisualDisplay(this);
        }
      }
      this.compEntries = [];
      this._annotatable = false;
      // Because we're going to show this document only once, and it can't
      // refresh or anything, I'm just going to load the documents here.
      // I should probably do something a little more clever in assignContentAnnotLayer
      // than just looking for the doc through the compEntries, but again,
      // I'll fix that later.

      // So the logic goes like this. Each entry in compEntries is this:
      // {doc: ..., position: ..., initial: ...}    

      // This has to have a displayId, and implement forceRedisplayResponse.
      this.displayId = this._panel.uiGetDisplayCounter();

      var whereParams = {above: [], behind: null, below: []};
      var compD = {};
      for (var i = 0; i < compEntries.length; i++) {
        var compEntry = compEntries[i];
        var newCompEntry = {doc: compEntry.doc, initial: compEntry.initial};
        this.compEntries.push(newCompEntry);
        compEntry.doc.addVisualDisplay(this);
        if (compEntry.position == "behind") {
          if (whereParams[compEntry.position] != null) {
            panel.uiError("Can't have two 'behind' positions");
            return;
          } else {
            whereParams[compEntry.position] = i;
          }
        } else if ((compEntry.position == "above") || (compEntry.position == "below")) {
          whereParams[compEntry.position].push(i);
        }
      }
      // OK, we've collected everything. Now, compute the positions.
      if (whereParams.behind != null) {
        this.compEntries[whereParams.behind].layer = {layer: "inLayer", position: 0, initial: this.compEntries[whereParams.behind].initial};
      }
      for (var i = 0; i < whereParams.above.length; i++) {
        this.compEntries[whereParams.above[i]].layer = {layer: "superLayer", position: whereParams.above.length - i - 1,
                                                        initial: this.compEntries[whereParams.above[i]].initial};
      }
      for (var i = 0; i < whereParams.below.length; i++) {
        this.compEntries[whereParams.below[i]].layer = {layer: "subLayer", position: i, initial: this.compEntries[whereParams.below[i]].initial};
      }
      this.redisplay();
    },

    // This must be implemented if addVisualDisplay is used.
    forceRedisplayResponse: function(events) {
      for (var i = 0; i < events.length; i++) {
        if (events.annot && events.annot.atype.hasSpan) {
          // There's at least one spanned annotation affected; redraw.
          this.redisplay();
          break;
        }
      }
    },

    // And this must be specialized.
    destroy: function() {
      if (this.compEntries) {
        for (var i = 0; i < this.compEntries.length; i++) {
          this.compEntries[i].doc.removeVisualDisplay(this);
        }
      }
      MAT.DocDisplay.CoreDocDisplay.prototype.destroy.call(this);
    },

    
    // Comparison windows should not have segments, and should only
    // get other noncontent categories from the first element. It
    // should really get the first ones it finds, but that could
    // introduce zone/token inconsistencies.
    
    redisplay: function() {
      this._importAnnotationsFromDocuments({
        docParams: {
          skipAdminCategory: true
        },
        noninitialDocParams: {
          skipNonContentCategories: true
        }
      });
      this._renderText();
    },

    _collectDocuments: function () {
      var docs = [];
      for (var i = 0; i < this.compEntries.length; i++) {
        docs.push(this.compEntries[i].doc);
      }
      return docs;
    },
    
    clear: function () {
      MAT.DocDisplay.CoreDocDisplay.prototype.clear.call(this);
      this.compEntries = [];
    },
    
    // This takes an annotation set and a list of content annotations
    // and returns a mapping from the annotation IDs to
    // a CSS class "superLayer", "subLayer", "inLayer" and
    // then a number, which is interpreted differently depending
    // on whether it's super/sub (in which case it's margin multiples)
    // or inLayer (in which case it's z-indices).

    // The standard doc display just has all annotations as inline
    // at the same z-index. inlayer 0 is a special case where the
    // annotations go on the text span itself.
    
    // New strategy: we're going to assign the layer for each annotation
    // as we encounter it. This will work better for stacked annotations,
    // among other things. as well as adding annotations without redraw.
    // Reconciliation will be a trick, but we'll just have to bite that off.
    assignContentAnnotLayer: function(contentAnnot) {
      // Not really efficient, but we don't redraw this very often.
      var assignments = this.layerAssignments;

      for (var i = 0; i < this.compEntries.length; i++) {
        if (this.compEntries[i].doc == contentAnnot.doc) {
          var layerAssignment = this.compEntries[i].layer;
          assignments[contentAnnot.id] = layerAssignment;
          break;
        }
      }
    }


  });

/*
 *                    MAT.DocDisplay.NewComparisonDocDisplay
 *
 * This object displays a comparison of multiple documents. It
 * supports no callbacks.
 *
 */


  MAT.DocDisplay.NewComparisonDocDisplay = function (panel, context, div) {
    // this.hideSegments();

    this.compEntries = null;
    this._detailsDiv = null;
    if (arguments.length > 3) {
      if (arguments[3].compEntries) {
        this.compEntries = arguments[3].compEntries;
      }
      if (arguments[3].detailsDiv) {
        this._detailsDiv = arguments[3].detailsDiv;
      }
    }
    // Mapping from public ID -> document label, to
    // feed to _labelToPosition when computing assignment layers.
    this._docLabelDict = {};
    // List of document labels, in order as determined by the
    // order of pairs in the document. Pivot will always be first.
    this._docLabelOrder = [];
    // Mapping from document label -> position entry.
    this._labelToPosition = {};
    // SAM 11/6/12: next attempt at converting the pairs
    // in the comparison table into something that's useful for
    // the UI. Originally, we had a structure like this:
    // {<id>: {pivotAnnot: <annot>, match: true|false, others: [<annot>, ...]}, ...}
    // plus a list of spurious ones. But that's not useful for displaying
    // the comparison table: you need these elements in order (otherwise,
    // you have to do some awful fancy dancing), and you need to know which
    // elements match and which don't. So let's do this again.
    // A list of hashes of {match: true|false, entries: {document label -> {annot: <annot>, pivot: true|false, match: true|false} | null}
    // for each document label in the docLabelOrder. If pivot is true, match will not be present.
    this._globalPairings = [];
    // When there's a detailsDiv, this maps the annot IDs to the
    // TR that shows them.
    this._annotIDsToTRs = {};
    MAT.DocDisplay.DocDisplay.apply(this, arguments);
    this._tagLabel = "compDisplay " + this._tagLabel;

  };

  MAT.Extend(MAT.DocDisplay.NewComparisonDocDisplay, MAT.DocDisplay.DocDisplay, {

    setData: function(doc) {
      this._annotatable = false;

      // set up _docLabelDict to map from annotation id to doc label
      // Also, construct the pivot pairings.
      var pairs = doc.metadata.comparison.pairs;
      
      if (pairs.length > 0) {
        var pivot = pairs[0].pivot;
        this._docLabelOrder = [pivot];
        this._globalPairings = [];

        // Local hash to keep track of the pivots
        // as we assemble the global pairings.
        var pivotDict = {};
        
        for (var i = 0; i<pairs.length; i++) {
          var other = pairs[i].other;
          this._docLabelOrder.push(other);
          
          var pairslist = pairs[i].pairs;
          // Note that the entries in the incoming pairs
          // are PUBLIC ids, which we need to dereference and then
          // use private IDs.
          // A pairing matches if it has a pivot
          // and every other element is a match.
          for (var j = 0; j<pairslist.length; j++) {
            var p = pairslist[j];
            var pivotEntry;
            if (p.pivot) {
              // Find the entry, or create it.
              var pivotAnnot = doc.getAnnotationByID(p.pivot);
              pivotEntry = pivotDict[pivotAnnot.id];
              if (pivotEntry === undefined) {
                pivotEntry = {
                  match: true,
                  entries: {}             
                };
                pivotEntry.entries[pivot] = {
                  annot: pivotAnnot,
                  pivot: true
                };
                pivotDict[pivotAnnot.id] = pivotEntry;
                this._globalPairings.push(pivotEntry);
              }
              this._docLabelDict[p.pivot] = pivot;
            } else {
              // Spurious. So no entry in pivotDict.
              pivotEntry = {
                match: false,
                entries: {}
              };
              this._globalPairings.push(pivotEntry);
            }
            // p.match will be false if the pair has no comparison,
            // or if it has no pivot, or if it doesn't match.
            pivotEntry.match = pivotEntry.match && p.match;
            if (p.comparison) {
              this._docLabelDict[p.comparison] = other;
              pivotEntry.entries[other] = {
                annot: doc.getAnnotationByID(p.comparison),
                match: p.match
              };
            }
          }
        }
      }

      // create whereParams in terms of doc label (appdoc1, etc.) from
      // compEntries.

      // SAM 11/6/12: _labelToInitialDict is only used locally. Eliminated.
      
      var whereParams = {above: [], behind: null, below: []};
      
      for (var i = 0; i < this.compEntries.length; i++) {
        var entry = this.compEntries[i];
        if (entry.position == "behind") {
          if (whereParams["behind"] != null) {
            panel.uiError("Can't have two 'behind' positions");
            return; 
          } else {            
            whereParams["behind"] = entry;
          }
        } else if ((entry.position == "above") || (entry.position == "below")) {
          whereParams[entry.position].push(entry);
        }
      }

      // create labelToPosition map from doc label to an object containing
      // a CSS layer name and a stacking order index and an initial
      
      this._labelToPosition = {};
      if (whereParams.behind != null) {
        this._labelToPosition[whereParams.behind.label] = {
          layer: "inLayer",
          position: 0,
          initial: whereParams.behind.initial
        };
      }
      for (var i = 0; i< whereParams.above.length; i++) {
        this._labelToPosition[whereParams.above[i].label] = {
          layer: "superLayer",
          position: whereParams.above.length - i - 1,
          initial: whereParams.above[i].initial
        };
      }
      for (var i = 0; i< whereParams.below.length; i++) {
        this._labelToPosition[whereParams.below[i].label] = {
          layer: "subLayer",
          position: i,
          initial: whereParams.below[i].initial
        };
      }

      MAT.DocDisplay.DocDisplay.prototype.setData.apply(this, arguments);
    },

    // This takes an annotation set and a list of content annotations
    // and returns a mapping from the annotation IDs to
    // a CSS class "superLayer", "subLayer", "inLayer" and
    // then a number, which is interpreted differently depending
    // on whether it's super/sub (in which case it's margin multiples)
    // or inLayer (in which case it's z-indices).

    // The standard doc display just has all annotations as inline
    // at the same z-index. inlayer 0 is a special case where the
    // annotations go on the text span itself.

    // Note that this will be called for spanless annotations as
    // well as spanned annotations.
    
    // New strategy: we're going to assign the layer for each annotation
    // as we encounter it. This will work better for stacked annotations,
    // among other things. as well as adding annotations without redraw.
    // Reconciliation will be a trick, but we'll just have to bite that off.    
    
    assignContentAnnotLayer: function(contentAnnot) {
      var docLabel = this._docLabelDict[contentAnnot.publicID];
      var entry = contentAnnot.getEffectiveDisplayEntry();
      if (entry && entry.css) {
        this.layerAssignments[contentAnnot.id] = this._labelToPosition[docLabel];
      } else {
        this.layerAssignments[contentAnnot.id] = {layer: "noLayer", position: 0};
      }        
    },

    // We filter out the pairings which are spanned and
    // return. I'd probably want to collect these when the
    // display is initially populated, but if I do, I have to make
    // very sure that when we make these writeable, these
    // tables get updated as well.
    
    _retrieveSpanlessAnnotationPairings: function () {
      var pairEntry = {
        labels: this._docLabelOrder,
        pairings: []
      };
      for (var k = 0; k < this._globalPairings.length; k++) {
        // If any of the annotations in the entry doesn't have a span,
        // then return it. You can't pair spanned and spanless annotations.
        // We can't just check the pivot entry, because some of these
        // are spurious and there won't be a pivot.
        var entry = this._globalPairings[k];
        for (var j in entry.entries) {
          // Only look at the first one.
          if (entry.entries.hasOwnProperty(j)) {
            if (entry.entries[j] && (!entry.entries[j].annot.atype.hasSpan)) {
              pairEntry.pairings.push(entry);            
            }
            break;
          }
        }
      }
      return pairEntry;
    },

    // We need to augment _renderSpan to deal with the fact that the anchors
    // may need additional space if the spanless annotations have stacked elements
    // and nothing in the row of the anchor has stacking as high. Only in the
    // case of comparisons will it be possible for this to happen.
    
    _renderSpan: function(region, node, location) {
      MAT.DocDisplay.DocDisplay.prototype._renderSpan.call(this, region, node, location);
      if (region.maxSpanlessSubContentLayer > region.maxSubContentLayer) {
        RC(region.topNode, "maxsub_" + region.maxSubContentLayer);
        AC(region.topNode, "maxsub_" + region.maxSpanlessSubContentLayer);
      }
      if (region.maxSpanlessSuperContentLayer > region.maxSuperContentLayer) {
        RC(region.topNode, "maxsuper_" + region.maxSuperContentLayer);
        AC(region.topNode, "maxsuper_" + region.maxSpanlessSuperContentLayer);
      }
    },

    // augment _renderText to fill in the detailsDiv with the pairs
    _renderText: function() {
      MAT.DocDisplay.DocDisplay.prototype._renderText.call(this);
      this._renderDetailsDiv();
    },

    _renderDetailsDiv: function () {
      var docDisplay = this;

      if (this._detailsDiv) {
        var divPositionType = getComputedStyle(this._detailsDiv).position;
        if ((divPositionType == "static") || (!divPositionType)) {
          this._detailsDiv.style.position = "relative";
        }

        this._detailsDiv.innerHTML = "";
        var tableContainer = B("div");

        // Let's start by rendering the menu. But
        // we should also analyze the data in the globalPairings,
        // so we can filter quickly, AND display the counts in
        // the menu.

        var filterData = [];
        var matchCounts = 0;
        var nonmatchCounts = 0;
        var spannedCounts = 0;
        var spanlessCounts = 0;
        var labCounts = {};
        for (var k = 0; k < this._globalPairings.length; k++) {
          var pivotEntry = this._globalPairings[k];
          var filterEntry = {
            spanned: false,
            spanless: false,
            match: pivotEntry.match,
            labels: {
            }
          };
          filterData.push(filterEntry);
          if (pivotEntry.match) {
            matchCounts++;
          } else {
            nonmatchCounts++;
          }
          for (var key in pivotEntry.entries) {
            if (pivotEntry.entries.hasOwnProperty(key)) {
              var e = pivotEntry.entries[key];
              if (e.annot.atype.hasSpan) {
                if (!filterEntry.spanned) {
                  filterEntry.spanned = true;
                  spannedCounts++;
                }
              } else {
                if (!filterEntry.spanless) {
                  filterEntry.spanless = true;
                  spanlessCounts++;
                }
              }
              var lab = e.annot.atype.label;
              if (!filterEntry.labels[lab]) {
                filterEntry.labels[lab] = true;
                if (labCounts[lab] === undefined) {
                  labCounts[lab] = 1;
                } else {
                  labCounts[lab]++;
                }
              }
            }
          }
        }


        var menu = B("select", {
          attrs: {
            onchange: function () {
              var op = menu.options[menu.selectedIndex].pairOp;
              docDisplay._renderPairingTable(tableContainer, op, filterData);
            }
          },
          children: [{
            label: "option",
            attrs: {
              pairOp: null,
              selected: true
            },
            text: "Show all (" + filterData.length + ")"
          }, {
            label: "option",
            attrs: {
              pairOp: {match: true}
            },
            text: "Show matches (" + matchCounts + ")"
          }, {
            label: "option",
            attrs: {
              pairOp: {match: false}
            },
            text: "Show non-matches (" + nonmatchCounts + ")"
          }, {
            label: "option",
            attrs: {
              pairOp: {spanned: true}
            },
            text: "Show spanned (" + spannedCounts + ")"
          }, {
            label: "option",
            attrs: {
              pairOp: {spanned: false}
            },
            text: "Show spanless (" + spanlessCounts + ")"
          }]
        });

        if (this._doc.annotTypes.globalATR) {
          // Limit to each label.
          var globalATR = this._doc.annotTypes.globalATR;
          for (var lab in globalATR.typeTable) {
            if (globalATR.typeTable.hasOwnProperty(lab)) {
              var atype = globalATR.typeTable[lab];
              if (MAT.Annotation.AnnotationType.isContentType(atype.category)) {
                menu.options.add(B("option", {
                  attrs: {
                    pairOp: {label: lab}
                  },
                  text: "Show entries comparing " + lab + " (" + (labCounts[lab] || "0") + ")"
                }));
              }
            }
          }
        }
        this._detailsDiv.appendChild(menu);
        this._detailsDiv.appendChild(tableContainer);
        this._renderPairingTable(tableContainer, null, filterData);
      }
    },

    _renderPairingTable: function(tableContainer, op, filterData) {
      
      var docDisplay = this;
      tableContainer.innerHTML = "";
      this._annotIDsToTRs = {};
      this._panel._detailsTab.nameDisplays = [];
      
      // create functions that highlight / unhighlight all the annots
      // in a given list
      function mouseoverFactory(annotList) {
        return function () {
          for (var i = 0; i < annotList.length; i++) {
            docDisplay.highlightAnnotation(annotList[i], "hlNeither", null);
          }
        }
      }
      function mouseoutFactory(annotList) {
        return function() {
          for (var i = 0; i < annotList.length; i++) {
            docDisplay.unhighlightAnnotation(annotList[i]);
          }
        }
      }

      function clickFactory(annot) { // might need to pass in annotList too for the row details
        return function(event) {
          // build the bundle, add scroll-to, offer annot popup, show row details
          var bundle = new MAT.DocDisplay.GestureMenuBundle(docDisplay);
          bundle.addScrollToItem(annot);
          bundle.addEditOrViewItem(annot);
          docDisplay._panel.offerAnnotationPopup(event, bundle);
        }
      }
      
      /*****
      this._scrollDiv = B("div", {style: {top: "0", bottom: "0", left: "0", width: "30%", position: "absolute", overflow: "auto"}});
      this._expandDiv = B("div", {style: {top: "0", bottom: "0", left: "30%", right: "0", position: "absolute"}});
      this._detailsDiv.appendChild(B("div", {
        style: {
          width: "100%",
          height: "100%",
          position: "relative"
        },
        children: [this._scrollDiv, this._expandDiv]
      }));
      *****/

      var pairsTable = B("table", {attrs: {border: "1"}});

      function displayAnnot(td, annot) {
        var nd = new MAT.DocDisplay.AnnotationNameDisplay(annot, docDisplay._panel,
                                                          {formatParams: {showIndices: true,
                                                                          showFormattedName: true,
                                                                          showFeatures: true}});
        docDisplay._panel._detailsTab.nameDisplays.push(nd);
        td.appendChild(nd.span);
        td.onclick = clickFactory(annot);
      }

      // Robyn had a nice suggestion, that the iconography
      // in the tables match the iconography in the sidebar. So.
      // Actually, let's make the squares a little bigger.

      var iconDimension = (2 * (docDisplay.MARK_MARGIN_HEIGHT - docDisplay.OVER_UNDER_MARGIN)).toFixed(1) + "em";

      function displayRow(k, pivotEntry) {

        // Let's make sure that the row is showable.
        // The op will be {spanned: true|false} or
        // {match: true|false} or {label: <lab>}.
        if (op !== null) {
          var filterEntry = filterData[k];
          if (op.match === true) {
            if (!filterEntry.match) {
              return false;
            }
          } else if (op.match === false) {
            if (filterEntry.match) {
              return false;
            }
          } else if (op.spanned === true) {
            if (!filterEntry.spanned) {
              return false;
            }
          } else if (op.spanned === false) {
            if (!filterEntry.spanless) {
              return false;
            }
          } else if (op.label !== undefined) {
            if (!filterEntry.labels[op.label]) {
              return false;
            }
          }
        }
        
        var newRow = B("tr", {
          attrs: {
            // We'll use this for identification
            // when we highlight.
            trIndex: k
          }
        });

        pairsTable.appendChild(newRow);
        
        // Now, we can just loop through the doc label order.

        var rowAnnotList = [];
        
        var nonMatchStr = "\u2717";
        var nonMatchColor = "orangered"; // "red";

        var matchStr = "\u2713";
        var matchColor = "limegreen"; // "green";

        // Check vs. X for overall row.
        newRow.appendChild(B("td", {
          text: pivotEntry.match ? matchStr : nonMatchStr,
          style: {
            color: pivotEntry.match ? matchColor : nonMatchColor
          }
        }));
        // Each row will have the same iconography as the
        // sidebar: a little green square for match, a little
        // red square for not.
        
        for (var w = 0; w < docDisplay._docLabelOrder.length; w++) {
          var labelEntry = pivotEntry.entries[docDisplay._docLabelOrder[w]];
          if (!labelEntry) {
            // No square here.
            newRow.appendChild(B("td", {
              text: "\u00a0",
              attrs: {
                onmouseover: mouseoverFactory(rowAnnotList),
                onmouseout:  mouseoutFactory(rowAnnotList)
              }
            }));
          } else {
            rowAnnotList.push(labelEntry.annot);
            docDisplay._annotIDsToTRs[labelEntry.annot.id] = newRow;
            var td = B("td", {
              attrs: {
                onmouseover: mouseoverFactory(rowAnnotList),
                onmouseout:  mouseoutFactory(rowAnnotList)
              }
            });
            // We want to center the check or X vertically
            // in the box. What a mess.
            var annotContainer = td;
            if (w > 0) {
              annotContainer = B("div", {
                style: {
                  paddingLeft: "1em"
                }
              });
              var thisColor;
              var thisMatchStr;                    
              if (labelEntry.match) {
                thisColor = matchColor;
                thisMatchStr = matchStr;
              } else {
                thisColor = nonMatchColor;
                thisMatchStr = nonMatchStr;
              }
              td.appendChild(B("div", {
                // Set the context for absolute positioning.
                style: {
                  position: "relative"
                },
                children: [{
                  label: "span",
                  // This should center this vertically
                  // in the space left by the annotContainer padding.
                  style: {
                    backgroundColor: thisColor,
                    position: "absolute",
                    top: "0px",
                    bottom: "0px",
                    margin: "auto",
                    width: iconDimension,
                    height: iconDimension
                  }
                }, annotContainer]
              }));                    
            }
            newRow.appendChild(td);
            displayAnnot(annotContainer, labelEntry.annot);
          }
        }
        return true;
      }

      // loop through the parings, creating a row for each. But
      // the call to displayRow has to be first in the OR,  otherwise
      // the first successful row will terminate...
      var rowFound = false;
      for (var k = 0; k < this._globalPairings.length; k++) {
        rowFound = displayRow(k, this._globalPairings[k]) || rowFound;
      }

      // ONLY if we've added at least one row should I add the table
      // to its parent. But first, I need a header row.

      if (rowFound) {
        
        // create header row with first column with a nonbreaking space to ensure that the
        // boundary appears.
        var _headersRow = B("tr", {
          children: [{
            label: "td",
            text: "\u00a0"
          }]
        });

        // table headers -- initials of each document
        for (var i = 0; i < this._docLabelOrder.length; i++) {
          var init = this._labelToPosition[this._docLabelOrder[i]].initial;
          _headersRow.appendChild(B("th", {
            text: i == 0 ? init + " (reference)" : init
          }));
        }

        pairsTable.insertBefore(_headersRow, pairsTable.firstChild);
        tableContainer.appendChild(pairsTable);
      }

    },

    // We're going to do the normal thing, and then augment it.
    _handleMouseOver: function(span, annotsForHover, suffix) {
      MAT.DocDisplay.DocDisplay.prototype._handleMouseOver.call(this, span, annotsForHover, suffix);
      // Now, on the span, we want to handle highlighting the row
      // that we're over, in the table.
      if (this._detailsDiv) {
        var oldMouseOver = span.onmouseover;
        var oldMouseOut = span.onmouseout;
        var v = this;
        span.onmouseover = function () {
          var res = oldMouseOver();
          v._highlightTRs(annotsForHover);
          return res;
        }
        span.onmouseout = function () {
          var res = oldMouseOut();
          v._unhighlightTRs(annotsForHover);
          return res;
        }
      }
    },

    _highlightTRs: function(annotsForHover) {
      var trHash = {};
      for (var i = 0; i < annotsForHover.length; i++) {
        var tr = this._annotIDsToTRs[annotsForHover[i].id];
        if (tr && !trHash[tr.trIndex]) {
          tr.style.backgroundColor = "lightgrey";
          trHash[tr.trIndex] = true;
        }
      }
    },

    _unhighlightTRs: function(annotsForHover) {
      var trHash = {};
      for (var i = 0; i < annotsForHover.length; i++) {
        var tr = this._annotIDsToTRs[annotsForHover[i].id];
        if (tr && !trHash[tr.trIndex]) {
          tr.style.backgroundColor = null;
          trHash[tr.trIndex] = true;
        }
      }
    },

    _scrollToTR: function(annot) {
      var tr = this._annotIDsToTRs[annot.id];
      if (tr) {
        this._scrollToElement(tr, this._detailsDiv);
      }
    },

    // This is tricky. If there's no reason to present a popup (e.g.,
    // it's not editable and there's nothing to view), the gestureBundle
    // will be null. But we still want to present one.
    _constructAnnotationPopup: function(e, idArray, startIndex, endIndex,
                                        params) {
      var gestureBundle = MAT.DocDisplay.DocDisplay.prototype._constructAnnotationPopup.call(
        this, e, idArray, startIndex, endIndex, params);
      // We want to add a gesture to scroll to the proper TR.
      // Unfortunately, we have to reconstruct the idArray -> annots mapping.
      if (this._detailsDiv && (idArray.length > 0)) {
        if (!gestureBundle) {
          gestureBundle = new MAT.DocDisplay.GestureMenuBundle(this);
        }
        // Grab the first element of the idArray.
        var a = this._regionMap.annIDHash[idArray[0]];
        var disp = this;
        gestureBundle.addMenuItem({
          label: "Scroll to pairing",
          gesture: new MAT.DocDisplay.MenuGesture(function () {
            disp._scrollToTR(a);
          })
        });
      }

      return gestureBundle;
    },
    
    clear: function () {
      MAT.DocDisplay.DocDisplay.prototype.clear.call(this);
      this._docLabelDict = {};
      this._labelToPosition = {};
      this._docLabelOrder = [];
      this._globalPairings = [];
      this._annotIDsToTRs = {};
    }

  });

/*
 *                    MAT.DocDisplay.ReconciliationDocDisplay
 *
 *
 * This object displays a comparison of multiple documents. It
 * supports no callbacks.
 *
 */

  // A little utility.

  MAT.DocDisplay.AttributeValueSet = function(s) {
    if (s.length > 0) {
      this.elements = s.split(",");
    } else {
      this.elements = [];
    }
    this.keySet = {};
    for (var i = 0; i < this.elements.length; i++) {
      this.keySet[this.elements[i]] = i;
    }
  }

  MAT.Extend(MAT.DocDisplay.AttributeValueSet, {

    // I want these rendered in a canonical order,
    // so I can compare them.
    render: function () {
      this.elements.sort();
      return this.elements.join(",");
    },

    size: function() {
      return this.elements.length;
    },

    add: function(elt) {
      if (this.keySet[elt] === undefined) {
        this.keySet[elt] = this.elements.length;
        this.elements.push(elt);
      }
    },

    addMany: function(elts) {
      for (var i = 0; i < elts.length; i++) {
        if (this.keySet[elts[i]] == undefined) {
          this.keySet[elts[i]] = this.elements.length;
          this.elements.push(elts[i]);
        }
      }
    },

    contains: function(elt) {
      return this.keySet[elt] !== undefined;
    },

    remove: function(elt) {
      if (this.keySet[elt] !== undefined) {
        var i = this.keySet[elt];
        this.elements.splice(i, 1);
        // Now, update all the indices.
        for (j = i; j < this.elements.length; j++) {
          this.keySet[this.elements[j]] = j;
        }
      }
    },

    removeMany: function(elts) {
      var removed = false;
      for (var i = 0; i < elts.length; i++) {
        if (this.keySet[elts[i]] !== undefined) {
          removed = true;
          delete this.keySet[elts[i]];
        }
      }
      if (removed) {
        // Refresh the key set from the elts.
        var i = 0;
        this.elements = [];
        for (var k in this.keySet) {
          if (this.keySet.hasOwnProperty(k)) {
            this.keySet[k] = this.elements.length;
            this.elements.push(k);
          }
        }
      }
    },

    union: function(elts) {
      if (elts.constructor == MAT.DocDisplay.AttributeValueSet) {
        elts = elts.elements;
      }
      // Start with yourself, and then add.
      var newSet = new MAT.DocDisplay.AttributeValueSet("");
      newSet.addMany(this.elements);
      newSet.addMany(elts);
      return newSet;
    },

    intersection: function(elts) {
      if (elts.constructor == MAT.DocDisplay.AttributeValueSet) {
        elts = elts.elements;
      }
      var newSet = new MAT.DocDisplay.AttributeValueSet("");
      // If it's in this set, add it to the new set.    
      for (var i = 0; i < elts.length; i++) {
        if (this.keySet[elts[i]] !== undefined) {
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

  MAT.DocDisplay.ReconciliationDocDisplay = function (panel, context, div) {
    // These must be set first.
    this._votingState = null;
    this._voteMap = null;
    MAT.DocDisplay.DocDisplay.apply(this, arguments);
    this._tagLabel = this._tagLabel.replace(/fileDisplay/, "reconciliationDisplay");
    this._voteReviewDiv = null;
    this._moveableBoundaries = false;
    this._reconciliationPhase = "human_decision";
    this._inWorkspace = false;
    if (arguments.length > 3) {
      if (arguments[3].voteReviewDiv) {
        this._voteReviewDiv = arguments[3].voteReviewDiv;
      }
      if (arguments[3].workspaceReconciliationPhase) {
        this._inWorkspace = true;
        this._reconciliationPhase = arguments[3].workspaceReconciliationPhase;
      }      
    }
    if (this._reconciliationPhase == "human_decision") {
      this._moveableBoundaries = true;
    }
  };

  MAT.Extend(MAT.DocDisplay.ReconciliationDocDisplay, MAT.DocDisplay.DocDisplay, {

    // These two are overrides. I really need to redo the
    // notification system, but right now isn't the time.
    // These are called by the UI when the UI is notified
    // about hand annotation availability.
    
    handAnnotationUnavailable: function() {
    },

    _enableAnnotationListeners: function() {
    },

    _disableAnnotationListeners: function() {
    },

    handAnnotationAvailable: function() {
    },

    // Oh boy. The reconciliation display needs to assign labels to the
    // content annotations based on what vote they're in. So I get the votes
    // for each segment, and then get the content of each vote, and that
    // gives me a hierarchy. It's all subLayer. If the content annotation
    // isn't in a vote, it's behind.

    // Or, if one of the votes is chosen.

    // Actually, if one of the votes is chosen, then, if we're in human_decision
    // mode, you don't want to show the other votes at all. So I've added a
    // new noLayer layer. But I think I don't want to use it; I want to be
    // able to control showing the history from a single CSS property.

    // Oops, that ain't gonna work. Because the bottom margin value is set in code for the
    // total number of annots, you can't collapse it via CSS without leaving the space.
    // So we have to decide on whether to use noLayer or subLayer based on whether
    // history visibility is enabled or not.

    // And into every lovely algorithm some rain must fall. The basic
    // version of this algorithm assumes that each annotation is rendered
    // exactly once. This is NOT necessarily true in reconciliation, since
    // multiple votes can point to the SAME ANNOTATION.

    // Fortunately, I'm doing this by vote, so I can collect the
    // relevant information for the assignment, and if there's ALREADY
    // an assignment, I can add more. _renderSpan, of course, needs to
    // deal with this.

    // This is called both for spanned and for spanless annotations. This 
    // can ONLY be applied to the contentAnnots. We're going through the
    // votes now - we have to make sure that the only annots we
    // update assignments for is the contentAnnots.

    // And now that I'm changing my model so that the layers are assigned
    // one at a time, as these annotations are encountered, I need to do some
    // initial setup, in ADDITION to customizing the bundle generation (see _renderRegion
    // below). For now, we're going to do MOST of the work here, but if we
    // ever do an exploded view, it'll have to shift some of the work around.

    // What makes things a little trickier, at this point, is that I
    // only want the exploded view when you're annotating, and when you're
    // creating the vote patterns when you're actually performing a vote. The
    // sublayer representations of the votes, however, I do NOT want to
    // be exploded. 

    _renderText: function() {
      // Save it, because we need it later.
      var aset = this._doc;
      this._voteMap = aset.getVoteMap();
      this._annotToVotePos = {};
      var assignments = this._annotToVotePos;
      this._voteAnnotsUnderConsideration = {};
      var segs = aset.annotTypes.getAnnotations("SEGMENT");
      // There are two circumstances under which I assign inLayer.
      // The first is if it's a chosen vote. The second is if
      // we're in the middle of voting, and this vote is the
      // new annotation pattern vote in the current segment.
      // See below.
      var voteUnderConsideration = null;
      if (this._votingState && (this._votingState.currentState == "new annotation pattern")) {
        voteUnderConsideration = this._votingState.radioMap["new annotation pattern"].vote;
      }
      for (var i = 0; i < segs.length; i++) {
        var seg = segs[i];
        var votes = this._voteMap[seg.id];
        if (votes) {
          var layerI = 0;
          // If the vote is chosen, put it inLayer. And the others shouldn't
          // be there at all. So I need to check first.
          var unChosenLayer = "subLayer";
          // I'd love to do this with CSS alone, but I don't know how yet.
          if (!this._panel.getConfigVar("reconciliationShowProcessedVotes")) {
            if (this._reconciliationPhase == "human_decision") {
              for (var j = 0; j < votes.length; j++) {
                if (votes[j].getAttributeValue("chosen") == "yes") {
                  unChosenLayer = "noLayer";
                  break;
                }
              }
            }
          }
          for (var j = 0; j < votes.length; j++) {
            var content = votes[j].getAttributeValue("content");
            if ((content !== "ignore") && (content !== "bad boundaries") && (content !== "")) {
              // Only the votes I can render.            
              var ids = content.split(",");
              var layer = unChosenLayer;
              var layerPos = layerI;
              // The only case where I directly assign inLayer is if
              // the vote is chosen. If we're in the middle of voting, and this vote is the
              // new annotation pattern vote in the current segment,
              // we mark the IDs in the _voteAnnotsUnderConsideration and
              // deal with them specially.
              if (votes[j] === voteUnderConsideration) {
                for (var k = 0; k < ids.length; k++) {
                  this._voteAnnotsUnderConsideration[aset.getAnnotationByID(ids[k]).id] = true;
                }
              } else {
                if (votes[j].getAttributeValue("chosen") == "yes") {
                  layer = "inLayer";
                  layerPos = 0;
                } else if (unChosenLayer == "noLayer") {
                  layerPos = 0;
                } else {
                  layerI += 1;
                }
                for (var k = 0; k < ids.length; k++) {
                  // That is, each annotation in this vote is
                  // in the j-th vote, so we'll use subLayer j. Well, no.
                  // I need to generate a layer index only if it's a vote
                  // I can render. But the vote index will be different.
                  var newAssignment = {layer: layer, position: layerPos, voteIndex: j};
                  var localID = aset.getAnnotationByID(ids[k]).id;
                  if (assignments[localID] === undefined) {
                    assignments[localID] = newAssignment;
                  } else if (assignments[localID].otherAssignments) {
                    // This is the case where there are multiple assignments for
                    // the same annotation.
                    assignments[localID].otherAssignments.push(newAssignment);
                  } else {
                    assignments[localID].otherAssignments = [newAssignment];
                  }
                }
              }
            }
          }
        }
      }
      MAT.DocDisplay.DocDisplay.prototype._renderText.call(this);
    },

    // So the idea is this. First, we look at the stored annotation. If we
    // don't find anything, or we find something that's "inLayer", we apply
    // the default, which will handle the stacking for hand annotation.
    // Otherwise, we use the stored assignment.

    // Nope, not good enough. The problem is that we only want this to
    // happen for the annotations in the vote under consideration.

    assignContentAnnotLayer: function(contentAnnot) {
      var storedAssignment = this._annotToVotePos[contentAnnot.id];
      var isUnderConsideration = this._voteAnnotsUnderConsideration[contentAnnot.id];
      // If it's under consideration, we call the parent. Then, if there's a stored
      // assignment, we add it to the result. Otherwise, we just use the stored
      // assignment, if it exists.
      if (isUnderConsideration) {
        MAT.DocDisplay.DocDisplay.prototype.assignContentAnnotLayer.call(this, contentAnnot);
        if (storedAssignment) {
          var otherAssignments = storedAssignment.otherAssignments;
          if (otherAssignments) {
            // Turn the primary assignment into just another stored assignment.
            delete storedAssignment.otherAssignments;
            otherAssignments.push(storedAssignment);
          } else {
            otherAssignments = [storedAssignment];
          }
          this.layerAssignments[contentAnnot.id].otherAssignments = otherAssignments;
        }
      } else if (storedAssignment) {
        this.layerAssignments[contentAnnot.id] = storedAssignment;
      } else {
        this.layerAssignments[contentAnnot.id] = {layer: "inLayer", position: 0};
      }
    },

    // Into every lovely algorithm some rain must fall. It turns
    // out that in reconciliation, there may be multiple assignments for 
    // a given annotation. These are stored in the otherAssignments slot in the
    // layer assignment. This is going to go away when we get rid of the
    // old reconciliation view, but we need it for the moment. I've migrated
    // the key set stuff into the region creation, so I'm going to
    // have to deal with the otherAssignments stuff somewhere between
    // creating the regions and rendering the spans. So for the reconciliation
    // document, I'm going to introduce _renderRegion and specialize it.

    _renderRegion: function(region, node) {
      
      for (var i = 0; i < region.contentAnnots.length; i++) {
        var assignment = this.layerAssignments[region.contentAnnots[i].id];
        if (assignment.otherAssignments) {
          for (var j = 0; j < assignment.otherAssignments.length; j++) {
            // This is stolen directly from _computeCoveredContent. But we're
            // going to get rid of the reconciliation view soon, so I don't care.
            var annot = region.contentAnnots[i];
            var labels = annot._computeCSSLabels();
            var otherAssignment = assignment.otherAssignments[j];
            var cls = otherAssignment.layer;
            var param = otherAssignment.position;
            var init = otherAssignment.initial;
            var slug = cls+"_"+param;
            var entry = region.contentLayerBundleDict[slug];
            // This is all the information we're going to need for
            // rendering the span in the proper place, with
            // the appropriate styling, etc.
            if (entry === undefined) {
              entry = {
                layer: cls,
                position: param,
                margin: otherAssignment.margin,
                annotEntries: [],
                assignmentInitials: {},
                allLabels: [],
                allAnnots: []
              }
              region.contentLayerBundleDict[slug] = entry;
              region.contentLayerBundles.push(entry);
              if (cls == "subLayer") {
                region.maxSubContentLayer = Math.max(param + 1, region.maxSubContentLayer);
              } else if (cls == "superLayer") {
                region.maxSuperContentLayer = Math.max(param + 1, region.maxSuperContentLayer);
              }
            }
            var annotEntry = {
              annot: annot,
              labels: labels.slice(0),
              // This is filled in by the renderer.
              contentSpan: null
            }
            if (init) {
              entry.assignmentInitials[init] = true;
            }
            entry.annotEntries.push(annotEntry);
            // Do NOT set annotIDToAnnotLayerEntry.
            entry.allLabels = entry.allLabels.concat(labels);
            entry.allAnnots.push(annot);
          }
        }
      }
      this._regionMap._maybeAugmentStyleSheet(region);
      MAT.DocDisplay.DocDisplay.prototype._renderRegion.call(this, region, node);
    },
    
    // And now, special vote handling for segments.
    
    _renderSegment: function(segment, r) {
      // r is a hash of contentNode, contentNodeLocation, segmentNode.
      MAT.DocDisplay.DocDisplay.prototype._renderSegment.call(this, segment, r);
      if (this._voteMap[segment.id] != null) {
        AC(r.segmentNode, "votedOn");
      }
      // We want to decorate this further. First, we want to give the segmentNode
      // an onclick which will allow the user to vote for the segment. As long as there's
      // a vote review div. And it's reviewable.
      if (this._voteReviewDiv && (segment.getAttributeValue("status") == "human gold")) {
        if (segment.getAttributeValue("to_review") == "yes") {
          // Add the appropriate class to the segment node, since only the status
          // is added in the main renderSegment.
          AC(r.segmentNode, "attr_to_review_is_yes");
          var v = this;
          r.segmentNode.onclick = function () {
            v.reviewSegment(segment, null);
          }
        }
      }
      var reviewers = new MAT.DocDisplay.AttributeValueSet(segment.getAttributeValue("reviewed_by"));
      if (reviewers.contains(this._reviewer)) {
        // Check mark. Add it to the right bracket, so if that bracket is invisible, so
        // is the checkmark.
        r.segmentNode.lastChild.appendChild(B("span", {
          text: "\u2713",
          style: {
            verticalAlign: "super",
            fontSize: "50%",
            color: "black"
          }}));
      }
    },

    reviewSegment: function(segment, currentState) {
      // currentState is for when we're redisplaying.
      if (!currentState) {
        // Log if you're not redisplaying.
        this._panel.log({"action": "reconciliation_review_segment", "segment": segment.getID()});
      }
      if (!this._votingState) {
        if (currentState == null) {
          this._panel.notifySegmentReviewUnderway();
        }
        var v = this;
        var segEntry = this._regionMap._segmentNodes[segment.id];
        // I don't want to have highlighted. If I'm highlighting
        // the region I'm looking at, I'll probably still have highlighted
        // if I clicked on it directly. So I have to make sure I DON'T have it.
        //AC(segEntry.contentNode, "highlighted");
        RC(segEntry.contentNode, "highlighted");
        AC(this._div, "segmentBeingReviewed");
        AC(segEntry.contentNode, "segmentUnderReview");
        this._voteReviewDiv.appendChild(B("h3", {text: "Votes"}));

        var vState;

        // These are the votes which are represented by patterns. The new pattern is NOT
        // represented this way.
        var votePatterns = [];

        if (currentState) {
          this._votingState = currentState;
          vState = this._votingState;
          // We want to use the previous voting state,  if possible,
          // because it knows all about which is the new annotation, etc.
          // We have to recreate the votePatterns list.
          for (var i = 0; i < vState.radioList.length; i++) {
            var vName = vState.radioList[i];
            var vote = vState.radioMap[vName].vote;
            if (vName.substr(0, 4) == "vote") {
              // Rebuild it.
              var voteNode = B("span");
              vState.radioMap[vName].voteNode = voteNode;
              votePatterns.push(voteNode);
            }
          }
          if (vState.currentState == "new annotation pattern") {
            this._enableVoteAnnotation();
          }
        } else {
          // If we don't have a voting state already, here's how we create one.
          this._votingState = {
            segment: segment,
            currentState: null,
            radioList: ["new annotation pattern", "no annotations"],
            radioMap: {"new annotation pattern": {voteName: "new annotation pattern"},
                       "no annotations": {voteName: "no annotations", voteContent: ""}}
          };
          var vState = this._votingState;
          
          // Augment the votes, if appropriate.
          if (this._inWorkspace) {
            vState.radioList.push("ignore");
            vState.radioMap["ignore"] = {voteName: "ignore"};
          }
          if (!this._moveableBoundaries) {
            vState.radioList.push("bad boundaries");
            vState.radioMap["bad boundaries"] = {voteName: "bad boundaries"};
          }        

          var votes = this._voteMap[segment.id];

          // For each vote, we gather the appropriate information. Later, we order
          // the votes as follows: first, all the votePatterns; then "new annotation pattern", "no annotations", "ignore", "bad boundaries".

          // I have to worry about the following bizarre case: the user selects "new annotation pattern",
          // but DOES NOT MAKE ANY ANNOTATIONS. This vote is now indistinguishable from "no annotations".
          // Then she pressed done. Then, she selects the segment AGAIN. Now, her selection will appear
          // as the "no annotations" option. But then, she selects "new annotation pattern"
          // a SECOND time, and again, DOES NOT MAKE ANY ANNOTATIONS, and presses "done". In this case,
          // it should be recognized as a new annotation pattern. This is the one case where
          // an empty new annotation pattern will be recognized as a new annotation pattern. If
          // the user deselects that option, the second new annotation will be removed, just like
          // any new annotation pattern would be removed.

          // There's a bit of further trickiness here. Let's say we're redisplaying
          // a segment as we're moving a boundary, and there's a new, still blank vote, and none of the
          // other annotators contributed a blank vote to this segment.
          // Then the new blank vote is ambiguous between an empty
          // vote and a new pattern. In this case, we DON'T want the above logic
          // to apply. We only want the new vote to look like no annotations if
          // we're RE-ENTERING segment review, not redisplaying. So in the above
          // case, we need to check the initialStatus.

          // Actually, I probably ought to head this all off at the pass by
          // making sure that if a user creates a "no annotations" vote, and then
          // selects something else, that vote should go away JUST LIKE THE NEW ANNOTATION
          // PATTERN VOTE.

          // And it appears that I've sidestepped a good deal of this by reinstating the
          // current vote data after rerendering, and I can fix the rest of it by
          // removing new "no annotations" votes when we move away.
          
          for (var i = 0; i < votes.length; i++) {
            var content = votes[i].getAttributeValue("content");
            if ((content == "ignore") || (content == "bad boundaries")) {
              vState.radioMap[content].vote = votes[i];
            } else if ((content == "") && (vState.radioMap["no annotations"].vote == null)) {
              // EVEN IF this was a new vote created by selecting new annotation pattern
              // and then not annotating anything, this is what we should do with it. UNLESS
              // we're in the bizarre case where there are two empty votes, as described immediately
              // above. In that case, the second one is recognized as a new annotation.
              vState.radioMap["no annotations"].vote = votes[i];
            } else if (votes[i].getAttributeValue("new") == "yes") {
              // It's a new non-special vote, and we're redisplaying.
              // Do NOT display this vote. But set things up as if
              // the most recent state was new annotation pattern. _votingState is also
              // checked when the new vote option is created.
              vState.currentState = "new annotation pattern";
              // Should I be doing this, or not?
              vState.radioMap["new annotation pattern"].vote = votes[i];
              this._enableVoteAnnotation();
            } else {
              var voteValue = "vote"+i;
              var voteNode = B("span");
              vState.radioMap[voteValue] = {voteNode: voteNode, voteValue: voteValue, vote: votes[i]};
              vState.radioList.splice(votePatterns.length, 0, voteValue);
              votePatterns.push(voteNode);          
            }
          }
        }
        

        // Now, we populate the votePatterns.
        // Note that, again, we can have the same annotation assigned to multiple votes,
        // and we've cheated on this in _renderKeySetForSpan and assignContentAnnotLayer above.
        // We have to do the same here. Note that we want to show the exploded
        // assignments in the vote patterns, so we don't want to assign it all to inLayer.

        // Start with the first region, end with the last.
        // I want to trim the whitespace on each end, so let's first look
        // through the seg entries to find the start and end indices.
        // The result here is that when you merge segments, you'll
        // suddenly get medial space, which will NOT be trimmed. But the
        // chances of the annotator getting to this point over large
        // regions are zero.
        var startRegion = segEntry.firstRegion;
        var endRegion = segEntry.lastRegion;
        var foundContent = false;
        var region = startRegion;
        while (true) {
          if (!foundContent) {
            startRegion = region;
          }
          if (region.contentAnnots.length > 0) {
            // Stop updating the left index, already.            
            foundContent = true;
            // And you must get at LEAST this far.
            endRegion = region;
          }
          if ((region == segEntry.lastRegion) || (!region.nextRegion)) {
            break;
          }
          region = region.nextRegion;
        }
        var region = startRegion;

        // For each vote pattern, we need to figure out how to distribute
        // the annotations on multiple layers.

        // If I want the layer assignments to be exploded, I'm going to have to recreate
        // the algorithm that's in assignContentAnnotLayer for the default DocDisplay.
        // I can't reuse it, because it relies on document-level caches, and this display
        // is going to die eventually anyway, so...
        // I'm also going to have to keep this separated by vote, because we're
        // looping through regions, and THEN through votes.

        
        // This is a list of {explodedLayerAssignmentCache: ..., layerAssignments:...}
        var globalVoteCache = {};
                  
        while (true) {
          // I'd like to just pad the span I'm rendering, but I can't do that
          // because there's no hook to grab it.
          var signal = [];
          // In Python, this is (region.end - region.start) * [" "]. Grrr.
          for (k = region.start; k < region.end; k++) {
            signal.push("\u00a0");
          }
          signal = signal.join("");
          // For this region, I'm going to render a span onto each element
          // of the votePatterns. I need to get the layer assignments for the content,
          // and then sort the label bundles appropriately.
          // But remember, we've already taken into account inLayer vs. subLayer
          // when we computed the assignment layers. Anything that's inLayer
          // (or superLayer, because we're dealing with exploded annotation for
          // new annotation patterns) should be ignored here.
          // We cache things by assignment.position because when we generated
          // the assignments, each vote matches a particular position.
          var contentCache = [];

          // This is happening after _renderText, so the contentLayerBundles have
          // been enhanced with the additional assignments already. So unlike
          // most documents, an annot may turn up in more than one bundle. But the
          // annot ENTRY will be different.

          // Each bundle:
          // {layer: ..., position: ..., margin: ..., annotEntries: [{annot: ..., labels: ..., contentSpan: null}, ...], 
          // assignmentInitials: {}, allLabels: [], allAnnots: []}
          
          for (var j = 0; j < region.contentLayerBundles.length; j++) {
            var bundle = region.contentLayerBundles[j];
            if ((bundle.layer != "inLayer") && (bundle.layer != "superLayer")) {
              var thisVoteCache = globalVoteCache[bundle.position];
              if (thisVoteCache === undefined) {
                thisVoteCache = {
                  explodedLayerAssignmentCache: {},
                  layerAssignments: {}
                }
                globalVoteCache[bundle.position] = thisVoteCache;
              }
              var explodedLayerAssignmentCache = thisVoteCache.explodedLayerAssignmentCache;
              var layerAssignments = thisVoteCache.layerAssignments;
              // Pick a layer for each annot, if it's not already chosen.
              for (var k = 0; k < bundle.annotEntries.length; k++) {
                var bundleEntry = bundle.annotEntries[k];
                var bundleAnnot = bundleEntry.annot;
                var bundleLabels = bundleEntry.labels;
                // First, we have to pick a layer for each annot, if it's
                // the first time we're encountering it.
                if (bundleAnnot.start == region.start) {
                  var l = 0;
                  while (true) {
                    var thisLayerTaken = explodedLayerAssignmentCache[l];
                    if ((thisLayerTaken === undefined) || (bundleAnnot.start >= thisLayerTaken)) {
                      // Found it.
                      if (l == 0) {
                        layerAssignments[bundleAnnot.id] = {layer: "inLayer", position: 0};
                      } else {
                        layerAssignments[bundleAnnot.id] = {layer: "superLayer", position: l - 1, margin: false};
                      }
                      explodedLayerAssignmentCache[l] = bundleAnnot.end;
                      break;
                    }
                    l += 1;
                  }
                }
                // So now, the layer assignment for this annot is selected.
                var thisLayerAssignment = layerAssignments[bundleAnnot.id];
                // Get the cache for this region for this vote.
                var cache = contentCache[bundle.position];
                // Every annotation is going to be on a different layer,
                // so we don't need to worry about adding an annotation to
                // an existing layer.
                if (cache === undefined) {
                  cache = [];
                  contentCache[bundle.position] = cache;
                }
                var thisCacheEntry = {
                  layer: thisLayerAssignment.layer,
                  position: thisLayerAssignment.position,
                  margin: (thisLayerAssignment.margin === false) ? false : true,
                  annotEntries: [{
                    annot: bundleAnnot,
                    labels: bundleLabels,
                    contentSpan: null
                  }],
                  allLabels: bundleLabels,
                  allAnnots: [bundleAnnot],
                  assignmentInitials: {}
                };
                cache.push(thisCacheEntry);
                for (var k in bundle.assignmentInitials) {
                  if (bundle.assignmentInitials.hasOwnProperty(k)) {
                    thisCacheEntry.assignmentInitials[k] = true;
                  }
                }
              }              
            }
          }
          
          for (var j = 0; j < votePatterns.length; j++) {
            var cache = contentCache[j];
            var contentLayerBundles;
            var maxSuperContentLayer = 0;
            if (cache === undefined) {
              contentLayerBundles = [];
            } else {
              contentLayerBundles = cache;
              for (var k = 0; k < cache.length; k++) {
                if (cache[k].layer == "superLayer") {
                  maxSuperContentLayer = Math.max(cache[k].position + 1, maxSuperContentLayer);
                }
              }
              // Cheating, just like in renderSpan below...
              this._regionMap._maybeAugmentStyleSheet({
                maxSuperContentLayer: maxSuperContentLayer,
                maxSubContentLayer: 0
              });
            }
            var node = votePatterns[j];
            // Need this to make the stacking work right.
            AC(node, this._div.id+"_stackEnv");
            this._renderSpan({
              nextRegion: null,
              prevRegion: null,
              hasZone: false,
              coversToken: false,
              startsToken: false,
              endsToken: false,
              inSegment: null,
              hasUntaggable: false,
              // Ignore the structural stuff.
              rtype: region.tagLabel,
              tagLabel: region.tagLabel,
              contentLayerBundles: contentLayerBundles,
              maxSubContentLayer: 0,
              maxSuperContentLayer: maxSuperContentLayer,
              maxSpanlessSuperContentLayer: 0,
              maxSpanlessSubContentLayer: 0,
              inNewlineRegion: false,
              // non-breaking space. Ideally, I'd just
              // insert padding for the span, but there's no
              // real way to do that here.
              s: signal
              // Also has start, end, contentAnnots, noncontentAnnts, id
            }, node, null, {});
          }
          if (region == segEntry.lastRegion) {
            break;
          }
          region = region.nextRegion;
        }

        // I need to write votes. The first few will be the annotation patterns.
        // The others will be empty, ignore, bad boundaries. We'll have radio
        // buttons.
        var radioName = "reviewRadio";
        
        // I've got to add something for each region (or span) that's covered
        // by this segment, for each non-empty vote. So we establish a span entry
        // for each non-empty vote, and then loop through the spans and
        // put each annotation in the right element. I can use the
        // layer assignments above to figure that out. Well, maybe I shouldn't
        // bother with that. Actually, I should - and I should use _renderSpan
        // to do it, since I want all the things that happen in the span
        // to work out. The idea should be that for every region, for every
        // span, for each non-empty vote, we produce a region which contains
        // just the contentKeySets for the elements in that vote. The one twist
        // is that I'll end up with tokenization, since inLayer just whomps
        // the entire label list in. Well, fixed that by setting up the span records
        // to support blocking noncontent.

        // So the algorithm is: for each non-empty vote, create a span.
        // Remember that in the layer assignments above, the subLayer corresponds
        // to the vote number. Then, for each region, 
        // call _renderSpan FOR EACH VOTE, but apportioning the content key info
        // among the appropriate entries, as well as building a layer assignment
        // list. I need to call it for each vote, because I'm generating the
        // text that way.

        // Also, all the radio buttons have to have an onclick which deals with
        // the new vote possibility.

        // And, if it's a new annotation pattern, we want to add to the
        // visible brackets 

        function checkNewVote() {        
          // If you're CHANGING A VOTE, you must REMOVE the current voter
          // from the annotator slot of the votes. This will not be an issue
          // unless the voter is returning to this segment, but it's still
          // something we need to do.
          if (vState.currentState != null) {
            var vote = vState.radioMap[vState.currentState].vote;
            if (vote) {
              // There's already a vote. Add the reviewer.
              var voters = new MAT.DocDisplay.AttributeValueSet(vote.getAttributeValue("annotator"));
              voters.remove(v._reviewer);
              vote.setAttributeValue("annotator", voters.render());
            }
          }

          // If we're moving away from the new annotation pattern to
          // something else, we need to redisplay at the end of this.

          var redisplay = false;

          if (this.value != vState.currentState) {
            v._panel.log({"action": "reconciliation_cast_vote", "segment": segment.getID(), "vote": this.value});
            if (vState.currentState == "new annotation pattern") {
              v._disableVoteAnnotation();
              v._removeNewVotePattern();
              delete vState.radioMap["new annotation pattern"].vote;
              redisplay = true;
            } else if (vState.currentState == "no annotations") {
              var vote = vState.radioMap["no annotations"].vote;
              if (vote.getAttributeValue("new") == "yes") {
                // It's a new no annotations vote. remove it.
                // I use _removeNewVotePattern() because it also updates the voteMap.
                v._removeNewVotePattern();
                delete vState.radioMap["no annotations"].vote;
                // There's no need to redisplay, because nothing has
                // really changed.
              }
            }
          }              
          
          // "this" will be the input element. The two cases I care about are
          // where we're creating a vote, or we're moving away from creating a vote.
          // We'll use a lexical closure over lastState to determine what's what.
          if (this.value == "new annotation pattern") {
            // Add the new vote immediately, and activate hand annotation,
            // FOR THIS SEGMENT ONLY.
            // Make sure the new vote is stored in the radio items, so I have
            // it later.
            vState.radioMap["new annotation pattern"].vote = v._newVote(segment, "");
            v._enableVoteAnnotation();
          }
          vState.currentState = this.value;

          if (redisplay) {
            v.redisplay();
          }
        }
        
        // Now, we render everything.

        for (var i = 0; i < vState.radioList.length; i++) {
          var vEntry = vState.radioMap[vState.radioList[i]];
          // Separate each element by a break.
          if (i > 0) {
            this._voteReviewDiv.appendChild(B("br"));
          }
          var radio = B("input", {
            attrs: {
              type: "radio",
              name: radioName,
              value: vEntry.voteValue || vEntry.voteName,
              onclick: checkNewVote
            }
          });
          vEntry.radio = radio;
          var valNode = vEntry.voteNode || B("span", {text: vEntry.voteName});
          E(this._voteReviewDiv, {
            children: [
              radio, valNode
            ]});
          // Now, the checking.
          if (vState.currentState == radio.value) {
            // This is the case for when we're redisplaying.
            radio.checked = true;
          } else if (vEntry.voteValue) {
            // Pattern vote.
            if ((new MAT.DocDisplay.AttributeValueSet(vEntry.vote.getAttributeValue("annotator"))).contains(this._reviewer)) {
              radio.checked = true;
              // Make sure that the current state is synchronized, so checkNewVote does the right thing.
              vState.currentState = vState.radioList[i];
            }
          } else if (vEntry.voteName != "new annotation pattern") {
            var thisVote = vEntry.vote;
            if (thisVote && (new MAT.DocDisplay.AttributeValueSet(thisVote.getAttributeValue("annotator"))).contains(this._reviewer)) {
              radio.checked = true;
              // Make sure that the current state is synchronized, so checkNewVote does the right thing.
              vState.currentState = vState.radioList[i];
            }
          }
        }

        // And finally, the done button.
        E(this._voteReviewDiv, {
          children: [
            B("p", {
              children: [
                B("input", {
                  attrs: {
                    type: "button",
                    value: "Done",
                    onclick: function () {
                      v.segmentReviewDone(segment);
                    }
                  }
                }),
                B("span", {
                  text: " "
                }),
                B("input", {
                  attrs: {
                    type: "button",
                    value: "Clear vote",
                    onclick: function() {
                      v.segmentReviewUndone(segment);
                    }
                  }
                })
              ]
            })
          ]
        });
      }
    },

    segmentReviewUndone: function(segment) {
      // This undoes a vote. We can only use this before the votes
      // are processed. It's almost identical to what you do when the
      // vote is done, except you clear everything.

      // Should you auto-advance? You can't get here via auto-advance;
      // you can only get here by opening a reviewed segment by hand, and
      // then you can activate auto-advance. Auto-advance should plop
      // you right back in this segment, of course. But if you go to the
      // trouble of activating auto-advance while you're in this segment,
      // clearly you want to auto-advance FROM this segment. So yes.
      this._panel.log({"action": "reconciliation_review_segment_cancelled", "segment": segment.getID()});
      this._segmentReviewCompleted(segment, true);
    },

    segmentReviewDone: function(segment) {
      this._panel.log({"action": "reconciliation_review_segment_done", "segment": segment.getID()});
      this._segmentReviewCompleted(segment, false);
    },

    _segmentReviewCompleted: function(segment, undo) {
      if (this._votingState) {
        this._disableVoteAnnotation();
        var selectedItem = this._findSelectedItem();
        var redraw = null;
        if (selectedItem) {
          this._panel.notifyReconciliationVoted();
          if (undo) {
            redraw = this._undoSegmentVote(segment, selectedItem);
          } else {
            redraw = this._doSegmentVote(segment, selectedItem);
          }
        }
        this._terminateSegmentReview(segment, redraw);
      }
    },

    _findSelectedItem: function() {
      var radioItems = this._votingState.radioList;
      // See if anything was selected.
      var selectedItem = null;
      for (var i = 0; i < radioItems.length; i++) {
        var vEntry = this._votingState.radioMap[radioItems[i]];
        if (vEntry.radio.checked) {
          return vEntry;
        }
      }
      return null;
    },

    _doSegmentVote: function(segment, selectedItem) {
      // Only redraw the main panel if the reviewer was added.
      var redraw = false;
      var reviewers = new MAT.DocDisplay.AttributeValueSet(segment.getAttributeValue("reviewed_by"));
      if (!reviewers.contains(this._reviewer)) {
        var v = this;
        redraw = function () {
          v.rerenderSegment(segment);
        }
        reviewers.add(this._reviewer);
        segment.setAttributeValue("reviewed_by", reviewers.render());
      }
      if (selectedItem.vote) {
        // There's already a vote. Add the reviewer.
        // IF IT'S A NEW ANNOTATION, AND IT'S EMPTY, AND "no annotations"
        // HAS A VOTE, USE THAT ONE INSTEAD.
        var content = selectedItem.vote.getAttributeValue("content");
        if ((selectedItem.voteName == "new annotation pattern") &&
            (content == "") && (this._votingState.radioMap["no annotations"].vote)) {
          // I use _removeNewVotePattern because it updates the voteMap for me.
          this._removeNewVotePattern();
          delete selectedItem.vote;
          selectedItem = this._votingState.radioMap["no annotations"];
        }
        var voters = new MAT.DocDisplay.AttributeValueSet(selectedItem.vote.getAttributeValue("annotator"));
        voters.add(this._reviewer);
        selectedItem.vote.setAttributeValue("annotator", voters.render());
      } else {
        // Create a vote.
        var content = null;
        if (selectedItem.voteName == "no annotations") {
          content = "";
        } else if ((selectedItem.voteName == "ignore") || (selectedItem.voteName == "bad boundaries")) {
          content = selectedItem.voteName;
        }
        this._newVote(segment, content);
      }
      return redraw;
    },

    _undoSegmentVote: function(segment, selectedItem) {
      // Ugh. If there's a selected vote, we need to (a)
      // undo it, and (b) if it's new, remove it. Do I need
      // to redraw? Almost certainly yes.
      var reviewers = new MAT.DocDisplay.AttributeValueSet(segment.getAttributeValue("reviewed_by"));
      if (reviewers.contains(this._reviewer)) {
        reviewers.remove(this._reviewer);
        segment.setAttributeValue("reviewed_by", reviewers.render());
      }
      // If we have a new annotation pattern which is new and has content,
      // then we have to redisplay the whole document, because the layerAssignments need to get
      // recomputed and the regions too. And for now, I'm going to be lazy.
      // But the segment should always be redrawn.
      var redraw = null;
      var v = this;
      if (selectedItem.vote) {
        // There's already a vote. If the vote is new, remove it. Otherwise, remove
        // the reviewer from the annotators.
        if (selectedItem.vote.getAttributeValue("new") == "yes") {
          if ((selectedItem.voteName == "new annotation pattern") &&
              (selectedItem.vote.getAttributeValue("content") != "")) {
            redraw = function() {
              v.redisplay();
            }
          }
          this._removeNewVotePattern();
          delete selectedItem.vote;
        } else {
          var voters = new MAT.DocDisplay.AttributeValueSet(selectedItem.vote.getAttributeValue("annotator"));
          if (voters.contains(this._reviewer)) {
            voters.remove(this._reviewer);
            selectedItem.vote.setAttributeValue("annotator", voters.render());
          }
        }
      }
      if (!redraw) {
        redraw = function () {
          v.rerenderSegment(segment);
        }
      }
      return redraw;
    },

    _terminateSegmentReview: function(segment, redraw) {
      var segEntry = this._regionMap._segmentNodes[segment.id];
      // RC(segEntry.contentNode, "highlighted");
      RC(this._div, "segmentBeingReviewed");
      RC(segEntry.contentNode, "segmentUnderReview");
      this._votingState = null;
      this._panel.uiClearPane(this._voteReviewDiv);
      this._panel.notifySegmentReviewFinished();
      if (redraw) {
        redraw();
      }
      if (this._panel.getConfigVar("reconciliationAutoAdvance")) {
        // Find the next segment. If it exists, and it hasn't been reviewed yet, scroll to it and review it.
        if (segEntry.lastRegion.nextRegion) {
          this._advanceToNextSegment(segEntry.lastRegion.nextRegion);
        } else {
          this._advanceToNextSegment(this._regionMap._firstRegion);
        }          
      }
    },

    // If we reach the end, and we haven't found anything, GO BACK TO THE BEGINNING!
    // If you get to the index you started at, you're done then. And you should
    // probably pop up a window saying you're done.
    
    _advanceToNextSegment: function(regionOrigStart) {

      var regionStart = regionOrigStart;
      while (true) {
        // If you haven't barfed by now, see if this is a region you should
        // review.
        var region = regionStart;
        if (region.inSegment && (region.inSegment.getAttributeValue("status") == "human gold") &&
            !new MAT.DocDisplay.AttributeValueSet(region.inSegment.getAttributeValue("reviewed_by")).contains(this._reviewer)) {
          // NOT the child docview, because that's not the one that forces the scrolling.
          var container = this._div; 
          var nextSegEntry = this._regionMap._segmentNodes[region.inSegment.id];
          var element = nextSegEntry.segmentNode;
          // This recipe was taken from stackoverflow, of course. But modified.
          // This is the offset from the top of the container of the viewport
          var containerTop = container.scrollTop;
          // This is the bottom of the viewport. So these two together
          // tell you what portion of the container is visible. clientHeight
          // is the height of the viewport.
          var containerBottom = containerTop + container.clientHeight;
          // That is, how far below the top of the container is the element?
          var elemTop = element.offsetTop - container.offsetTop;
          var elemBottom = elemTop + element.offsetHeight;
          // We scroll the element to the middle of the viewport, if we can.
          if ((elemTop < containerTop) || (elemBottom > containerBottom)) {
            // The element is not completely visible. So we scroll.
            // We want the element in the middle of the viewport, if possible.
            // If the element is less than half a viewport's worth away from the
            // top or bottom edge, we scroll to the top or bottom edge.
            var halfViewport = (container.clientHeight / 2);
            if (elemTop < halfViewport) {
              // Scroll to the top.
              container.scrollTop = 0;
            } else {
              // Scrolling "too far" will just scroll to the bottom, which is fine.
              container.scrollTop = elemTop - halfViewport;
            }
          }
          // End stackoverflow recipe.
          this.reviewSegment(region.inSegment, null);
          break;
        }

        // Now, advance.
        regionStart = regionStart.nextRegion;
        
        // If you advance to the end of the list, start over.
        if (!regionStart) {
          regionStart = this._regionMap._firstRegion;
        }
        // If you get back to where you started, barf.
        if (regionStart == regionOrigStart) {
          // We're done. And if there's only one item
          // in the region list, this case will still work.
          this._panel.notifyAutoAdvanceExhausted();
          break;
        }
      }
    },

    _addVote: function(segment, content, attrs) {
      var newVote = new MAT.Annotation.Annotation(this._doc, this._doc.annotTypes.typeTable.VOTE, null, null, null, []);
      // Add it to the document.
      this._doc.addAnnotation(newVote);
      // Add it to the voteMap. The map will already exist.
      if (this._voteMap[segment.id] !== undefined) {
        this._voteMap[segment.id].push(newVote);
      } else {
        this._voteMap[segment.id] = [newVote];
      }
      newVote.setAttributeValue("segment", segment);
      newVote.setAttributeValue("content", content);
      for (var k in attrs) {
        if (attrs.hasOwnProperty(k)) {
          newVote.setAttributeValue(k, attrs[k]);
        }
      }
      return newVote;
    },

    _newVote: function(segment, content) {
      return this._addVote(segment, content, {"annotator": this._reviewer, "new": "yes"});
    },

    _enableVoteAnnotation: function() {
      var vState = this._votingState;
      var segment = vState.segment;
      var segEntry = this._regionMap._segmentNodes[segment.id];
      // First, figure out if you can enable the boundaries. The
      // three conditions are: the very next segment is
      // reconciled and is blank space at the relevant edge; the very next segment
      // is reconciled and is not blank at the relevant edge; the very next
      // segment is human gold. Check it on each side.
      var leftAction = null;
      var leftActionMenuEntry = null;
      var rightAction = null;
      var rightActionMenuEntry = null;
      var v = this;
      segEntry.contentNode.addEventListener("mouseup", this._annotateListener, false);
      this._handAnnotationAvailable = true;
      segEntry.contentNode.onmouseover = function () {
        v._panel.handAnnotationAvailable();
      };
      segEntry.contentNode.onmouseout = function () {
        v._panel.handAnnotationUnavailable();
      };
      // First, on the left.
      if (segEntry.firstRegion.prevRegion) {
        var prevRegion = segEntry.firstRegion.prevRegion;
        if (prevRegion.inSegment) {
          var prevSegment = prevRegion.inSegment;
          if (prevSegment.getAttributeValue("status") == "human gold") {
            leftActionMenuEntry = "Merge with previous segment";
          } else if (prevSegment.getAttributeValue("status") == "reconciled") {
            leftActionMenuEntry = "Move left";
          }
        }
        if (leftActionMenuEntry) {
          leftAction = function () {
            // Everything else it can rededuce.
            v._annexAdjacent("left");
          }
        }
      }
      if (segEntry.lastRegion.nextRegion) {
        var nextRegion = segEntry.lastRegion.nextRegion;
        if (nextRegion.inSegment) {
          var nextSegment = nextRegion.inSegment;
          if (nextSegment.getAttributeValue("status") == "human gold") {
            rightActionMenuEntry = "Merge with following segment";
          } else if (nextSegment.getAttributeValue("status") == "reconciled") {
            rightActionMenuEntry = "Move right";
          }
          if (rightActionMenuEntry) {
            rightAction = function () {
              v._annexAdjacent("right");
            }
          }
        }
      }

      if (leftAction || rightAction) {
        vState.boundaryActions = {};
        var mouseOverFn = function (e) {
          var prefix = "SEGMENT";
          if (v._panel.getConfigVar("showCharOffsets")) {
            prefix += "(" + segment.start + "-" + segment.end + ")";
          }
          v._panel.mouseOverAnnotations({
            type: "admin", labels: [prefix + " status=" + segment.getAttributeValue("status") + " (click to move boundary)"], annots: [segment]
          });
          AC(e.target, "segmentBoundaryMenuHover");
        };
        var mouseOutFn = function (e) {
          v._panel.cancelMouseOverAnnotations();
          RC(e.target, "segmentBoundaryMenuHover");
        };
        if (leftAction) {
          vState.boundaryActions.left = {
            action: leftAction,
            oldMouseover: segEntry.segmentNode.firstChild.onmouseover,
            eventListener: function (e) {
              v._panel.offerBoundaryRelocationPopup(e, leftActionMenuEntry, leftAction);
            }
          };
          segEntry.segmentNode.firstChild.addEventListener("mouseup", vState.boundaryActions.left.eventListener, false);
          segEntry.segmentNode.firstChild.onmouseover = mouseOverFn;
          segEntry.segmentNode.firstChild.onmouseout = mouseOutFn;
        }
        if (rightAction) {
          vState.boundaryActions.right = {
            action: rightAction,
            oldMouseover: segEntry.segmentNode.lastChild.onmouseover,
            eventListener: function (e) {
              v._panel.offerBoundaryRelocationPopup(e, rightActionMenuEntry, rightAction);
            }
          };
          segEntry.segmentNode.lastChild.addEventListener("mouseup", vState.boundaryActions.right.eventListener, false);
          segEntry.segmentNode.lastChild.onmouseover = mouseOverFn;
          segEntry.segmentNode.lastChild.onmouseout = mouseOutFn;
        }
      }
    },

    _annexAdjacent: function (dir) {
      var vState = this._votingState;
      var segment = vState.segment;
      var segEntry = this._regionMap._segmentNodes[segment.id];
      if (dir == "left") {
        var prevRegion = segEntry.firstRegion.prevRegion;
        if (prevRegion.inSegment) {
          var prevSegment = prevRegion.inSegment;
          if (prevSegment.getAttributeValue("status") == "human gold") {
            this._mergeWithAdjacentSegment(segment, prevSegment, "start");
            this.redisplay();
          } else if (prevSegment.getAttributeValue("status") == "reconciled") {
            if (prevRegion.contentAnnots.length == 0) {
              this._annexAdjacentBlankSpace(prevRegion, segment, "start", "end", "prevRegion", "firstRegion");    
            } else {
              this._annexAdjacentAnnotation(prevRegion, segment, "start", "end", "prevRegion", Math.min);
            }
            this.redisplay();
          }
        }
      } else if (dir == "right") {
        var nextRegion = segEntry.lastRegion.nextRegion;
        if (nextRegion.inSegment) {
          var nextSegment = nextRegion.inSegment;
          if (nextSegment.getAttributeValue("status") == "human gold") {
            // Merge with next segment.
            this._mergeWithAdjacentSegment(segment, nextSegment, "end");
            this.redisplay();
          } else if (nextSegment.getAttributeValue("status") == "reconciled") {
            if (nextRegion.contentAnnots.length == 0) {
              this._annexAdjacentBlankSpace(nextRegion, segment, "end", "start", "nextRegion", "lastRegion");
            } else {
              // Annex adjacent annotation.
              this._annexAdjacentAnnotation(nextRegion, segment, "end", "start", "nextRegion", Math.max);
            }
            this.redisplay();
          }
        }
      }
    },

    _annexAdjacentBlankSpace: function(adjacentRegion, segment, updateAttr, adjacentUpdateAttr,
                                       regionIncr, regionBorderAttr) {
      
      // Annex adjacent blank space.
      // Work your way forward or backward, as long as you have a region. You're going
      // to expand the segment you currently have, and delete segments 
      // (and their votes, if they exist; that might happen if the document
      // votes have been processed) which you completely pass by. If you
      // land in the middle of a segment, change the adjacent boundary.
      // Don't go too far on each iteration; typically, the annotator just needs a few
      // characters. And don't leave the adjacent segment.
      var toRemove = [];
      var newBorderIndex = segment[updateAttr];
      var inSegment = null;
      var adjacentSegment = adjacentRegion.inSegment;
      
      while ((adjacentRegion.contentAnnots.length == 0) && (adjacentRegion.inSegment == adjacentSegment)) {
        if (Math.abs(newBorderIndex - segment[updateAttr]) >= 10) {
          // Don't go TOO far.
          break;
        }
        if (!adjacentRegion.inSegment) {
          // Can't traverse this.
          break;
        }
        newBorderIndex = adjacentRegion[updateAttr];
        inSegment = adjacentRegion.inSegment;
        if (this._regionMap._segmentNodes[adjacentRegion.inSegment.id][regionBorderAttr] == adjacentRegion) {
          inSegment = null;
          if (adjacentRegion.inSegment != segment) {
            // If the last region of the segment entry is this region (that is, we've
            // traversed the whole segment) AND the 
            // region's segment is not the one we started with, remove this segment
            // and all its votes.
            toRemove.push(adjacentRegion.inSegment);
            var votes = this._voteMap[adjacentRegion.inSegment.id];
            if (votes) {
              for (var k = 0; k < votes.length; k++) {
                toRemove.push(votes[k]);
              }
            }
          }                
        }
        adjacentRegion = adjacentRegion[regionIncr];
        if (!adjacentRegion) {
          // Stop. You've reached one end or the other.
          break;
        }
      }
      // OK, we've gotten as far as we can get.
      if (toRemove.length > 0) {
        this._doc.removeAnnotationGroup(toRemove);
      }
      segment[updateAttr] = newBorderIndex;
      if (inSegment) {
        inSegment[adjacentUpdateAttr] = newBorderIndex;
      }
    },

    _mergeWithAdjacentSegment: function(segment, adjacentSegment, updateAttr) {
      var annotatorMap = {};
      var prevVotes = this._voteMap[adjacentSegment.id];
      var toRemove = [adjacentSegment];
      for (var i = 0; i < prevVotes.length; i++) {
        var vote = prevVotes[i];
        toRemove.push(vote);
        var content = vote.getAttributeValue("content");
        if ((content != "ignore") && (content != "bad boundaries") && (content != "")) {
          annotatorMap[vote.getAttributeValue("annotator")] = content;
        }
      }
      this._updateFromAdjacentSegment(segment, adjacentSegment[updateAttr], annotatorMap, updateAttr);
      this._doc.removeAnnotationGroup(toRemove);
    },

    _annexAdjacentAnnotation: function(adjacentRegion, segment, updateAttr, adjacentUpdateAttr,
                                       regionIncr, comp) {
      // prevRegion, "start", "end", -1);
      // Annex adjacent annotation. To do this, we need to find the end of the 
      // annotations that are covered, and work our way back through the
      // regions until we find a boundary where the annotations we're currently
      // tracing are done, and nothing else crosses. Then, we take all the
      // annotations we've found, and we add them to all the non-empty
      // current votes. 
      // We should (a) remove it from any vote in which it appears in that
      // segment (remember, it MIGHT be in a vote, if we've just processed
      // the votes but not regenerated the document), (b) add  each non-empty
      // existing vote. But DON'T add it to the current new vote - you're
      // clearly annexing it in order to vote AGAINST it, otherwise you
      // wouldn't be annexing it, right?
      // And, of course, if you've completely traversed any segments, then
      // remove them and all their votes. There will be no more than one segment
      // for this; in fact, you must remain within the segment associated with
      // the previous region, because content annotations can't cross segment
      // boundaries.
      // If the previous segment has votes, we want to treat it as if
      // we're annexing a portion of a non-reconciled segment: the annotations
      // are assigned to votes based on the annotators. If it DOESN'T
      // have votes, it should be based on the annotators assigned to the
      // SEGMENT. Add the annotation to each specified vote, and either (a)
      // remove it from the votes it's in in the adjacent segment, or (b)
      // if we've completely traversed, just remove the adjacent votes.
      // Essentially, if the adjacent segment has votes, and you've reached
      // the end of it, it's just like merging with the adjacent segment.
      // Otherwise, you have to do something a bit more complicated.
      var adjacentSegment = adjacentRegion.inSegment;
      var farthestIndex = adjacentSegment[adjacentUpdateAttr];
      var annotsFound = {};
      
      while (adjacentRegion.inSegment == adjacentSegment) {
        for (var i = 0; i < adjacentRegion.contentAnnots.length; i++) {
          var annot = adjacentRegion.contentAnnots[i];
          annotsFound[annot.id] = annot;
          farthestIndex = comp(farthestIndex, annot[updateAttr]);
        }
        while (adjacentRegion[updateAttr] != farthestIndex) {
          // Find that region.
          // We might cross some annotations. It's OK to do some extra work here,
          // it's not much.
          for (var i = 0; i < adjacentRegion.contentAnnots.length; i++) {
            var annot = adjacentRegion.contentAnnots[i];
            annotsFound[annot.id] = annot;
          }
          adjacentRegion = adjacentRegion[regionIncr];
        }
        // Any content annotations which are in this new region MUST
        // have left indices which are this index. Otherwise, we repeat.
        var mustContinue = false;
        for (var i = 0; i < adjacentRegion.contentAnnots.length; i++) {
          if (adjacentRegion.contentAnnots[i][updateAttr] != farthestIndex) {
            mustContinue = true;
          }
        }
        if (!mustContinue) {
          break;
        }
      }

      // OK, we're there. Three cases: if we're at the outer edge,
      // then if it has votes, just merge with the adjacent segment.
      // This will erase the chosenness, but that's fine. If it
      // DOESN'T have votes, then it's really reconciled, and you
      // just need to add the annotations you've crossed to each of the
      // actual votes. If we haven't reached the outer edge,
      // if there are votes, we need to remove the annotations we
      // found from each vote; otherwise, we just need to move
      // the segment boundary.

      var segVotes = this._voteMap[adjacentSegment.id];
      if (segVotes) {
        if (farthestIndex == adjacentSegment[updateAttr]) {
          // We're removing the adjacent segment.
          this._mergeWithAdjacentSegment(segment, adjacentSegment, updateAttr);
        } else {
          // In this case, we need to remove the annotations we've found
          // from every vote, and adjust the segment boundary. And, if we end
          // up creating a duplicate pattern when we do this, we
          // have to collapse them, preserving the ones which
          // are chosen.
          var annotatorMap = {};
          var foundList = [];
          for (var id in annotsFound) {
            if (annotsFound.hasOwnProperty(id)) {
              var annot = annotsFound[id];
              foundList.push(annot.getID());
            }
          }
          var voteContents = {};
          for (var i = 0; i < segVotes.length; i++) {
            var vote = segVotes[i];
            var content = vote.getAttributeValue("content");
            if ((content != "bad boundaries") && (content != "ignore") && (content != "")) {
              var voteContent = MAT.DocDisplay.AttributeValueSet(content);
              var toTransfer = voteContent.intersection(foundList);
              if (toTransfer.size() > 0) {
                // Found some things.
                voteContent.removeMany(toTransfer.elements);
                annotatorMap[vote.getAttributeValue("annotator")] = toTransfer.render();
              }
              // Always rerender it, because I want to make sure that it's
              // in order when I come back to compare the votes.
              var cString = voteContent.render();
              if (voteContents[cString] !== undefined) {
                // We've got it already.
                if (vote.getAttributeValue("chosen") == "yes") {
                  // If the vote we're holding is chosen, swap it
                  // with the vote we've already seen.
                  var tmp = voteContents[cString];
                  voteContents[cString] = vote;
                  vote = tmp;
                }
                // Delete it.
                this._doc.removeAnnotation(vote);
              } else {
                vote.setAttributeValue("content", cString);
              }
            }
          }
          this._updateFromAdjacentSegment(segment, farthestIndex, annotatorMap, updateAttr);
          // Finally, update the segment.
          adjacentSegment[adjacentUpdateAttr] = farthestIndex;
        }
      } else {
        // We construct the voters directly from the segment. For consistency
        // with what's happening in the ones with votes, I should add the
        // current reviewer to the list of annotators, if I want this annotation
        // to show up in the current vote. But I don't think I want it.
        var annotatorMap = {};
        var content = [];
        for (var id in annotsFound) {
          if (annotsFound.hasOwnProperty(id)) {
            var annot = annotsFound[id];
            content.push(annot.getID());
          }
        }
        annotatorMap[adjacentSegment.getAttributeValue("annotator")] = content.join(",");
        this._updateFromAdjacentSegment(segment, farthestIndex, annotatorMap, updateAttr);
        // If we've traversed the entire segment, remove it.
        if (farthestIndex == adjacentSegment[updateAttr]) {
          this._doc.removeAnnotation(adjacentSegment);
        } else {
          adjacentSegment[adjacentUpdateAttr] = farthestIndex;
        }
      }            
    },

    _updateFromAdjacentSegment: function(segment, newEdge, annotatorMap, updateAttr) {

      // Merge with adjacent segment. To do this, examine all the
      // votes the adjacent segment, and add the contents to the appropriate
      // vote(s) in this segment (namely, the one(s) that have the
      // same ANNOTATOR). Then, remove the adjacent segment and the
      // votes, and extend the current segment.
      // The adjacent votes are scratched, so any of the special
      // votes in the adjacent segment are discarded. A vote
      // that's been newly created should be attributed to the
      // annotator that contributed it - if none exists in the current
      // segment, create a new vote.

      // We've now generalized this to work with any map from annotator sets to content sets.

      // Start by categorizing the votes you have.
      var votes = this._voteMap[segment.id];
      var annotatorsToVote = {};
      for (var i = 0; i < votes.length; i++) {
        var vote = votes[i];
        var content = vote.getAttributeValue("content");
        // Actually, we have to make sure that if we're dealing with the vote that's
        // currently selected (the new one, which is the only way we'd ever
        // be here), we include it, even if it's empty.
        if ((content != "ignore") && (content != "bad boundaries") &&
            ((vote == this._votingState.radioMap["new annotation pattern"].vote) || (content != ""))) {
          var voters = new MAT.DocDisplay.AttributeValueSet(vote.getAttributeValue("annotator")).elements;
          for (var j = 0; j < voters.length; j++) {
            annotatorsToVote[voters[j]] = vote;
          }
        }            
      }
      
      // Now, loop at the votes in the previous segment.
      for (var annotators in annotatorMap) {
        if (annotatorMap.hasOwnProperty(annotators)) {
          var content = annotatorMap[annotators];
          var voters = new MAT.DocDisplay.AttributeValueSet(annotators).elements;
          var unrepresentedVoters = [];
          
          for (var j = 0; j < voters.length; j++) {
            // The content values in each case will be a sequence of
            // annotations. They'll be distinct, so I can just append
            // them with a comma, rather than having to digest them both into
            // sets and merging them. But I do have to check to see if the
            // previous content is empty.
            var curVote = annotatorsToVote[voters[j]];
            if (curVote) {
              var oldContent = curVote.getAttributeValue("content");
              if (oldContent == "") {
                curVote.setAttributeValue("content", content);
              } else {
                curVote.setAttributeValue("content", oldContent + "," + content);
              }
            } else {
              unrepresentedVoters.push(voters[j]);
            }
          }
          if (unrepresentedVoters.length > 0) {
            // No current vote for these voters. Create a new vote. IF YOU ADD A VOTE
            // DURING BOUNDARY MOVEMENT, YOU MUST UPDATE THE VOTINGSTATE, BECAUSE
            // IT WILL BE REUSED DURING REDISPLAY. It goes at the end of the radioList,
            // and those will always be at the beginning.
            var newVote = this._addVote(segment, content, {"annotator":  unrepresentedVoters.join(",")});
            var vState = this._votingState;
            for (var k = 0; k < vState.radioList.length; k++) {
              var vName = vState.radioList[k];
              if (vName.substr(0, 4) != "vote") {
                // Here's where to insert it.
                var voteValue = "vote"+k;
                vState.radioMap[voteValue] = {voteValue: voteValue, vote: newVote};
                vState.radioList.splice(k, 0, voteValue);
                break;
              }
            }
          }
        }
      }

      segment[updateAttr] = newEdge;
    },
    
    _disableVoteAnnotation: function() {
      var vState = this._votingState;
      var segment = vState.segment;
      var segEntry = this._regionMap._segmentNodes[segment.id];
      segEntry.contentNode.removeEventListener("mouseup", this._annotateListener, false);
      this._handAnnotationAvailable = false;
      segEntry.contentNode.onmouseover = null;
      segEntry.contentNode.onmouseout = null;
      if (vState.boundaryActions) {
        if (vState.boundaryActions.left) {
          segEntry.segmentNode.firstChild.onmouseover = vState.boundaryActions.left.oldMouseover;
          segEntry.segmentNode.firstChild.onmouseout = vState.boundaryActions.left.oldMouseout;
          segEntry.segmentNode.firstChild.removeEventListener("mouseup", vState.boundaryActions.left.eventListener, false);
        }
        if (vState.boundaryActions.right) {
          segEntry.segmentNode.lastChild.onmouseover = vState.boundaryActions.right.oldMouseover;
          segEntry.segmentNode.lastChild.onmouseout = vState.boundaryActions.right.oldMouseout;
          segEntry.segmentNode.lastChild.removeEventListener("mouseup", vState.boundaryActions.right.eventListener, false);
        }
        delete vState.boundaryActions;
      }    
    },

    // And here, we override the offer of the popup. This differs from the parent
    // in a few crucial ways. First, there's no autotag. I also have to make
    // hand annotation available IN THIS SEGMENT. I also need to capture the
    // annotations added or removed, and add them to the vote. This happens in
    // _reportAnnotationResults. Note that I also can block things like
    // notifying the document that annotation was performed, or marking the ownership
    // of segments.

    // This function takes care of the filtering for this vote.
    _getCoveredContentAnnotsForHandAnnotation: function (region, ignore) {
      
      var coveredAnnots = [];
      var vState = this._votingState;
      var thisVote = vState.radioMap["new annotation pattern"].vote;
      var voteContent = new MAT.DocDisplay.AttributeValueSet(thisVote.getAttributeValue("content"));
      
      for (var i = 0; i < region.contentAnnots.length; i++) {
        var annot = region.contentAnnots[i];
        if (annot.publicID && voteContent.contains(annot.publicID)) {
          coveredAnnots.push(annot);
        }
      }
      return coveredAnnots;
    },

    _constructAnnotationPopup: function(e, idArray, startIndex, endIndex,
                                    params) {
      // This version is identical to the parent, except that you can't do autotag.
      
      // The idArray has to be pruned to eliminate those annotations
      // which are NOT IN THE CURRENT VOTE. This will have been taken
      // care of in _getCoveredContentAnnotsForHandAnnotation above.

      params.allowAutotag = false;
      return MAT.DocDisplay.DocDisplay.prototype._constructAnnotationPopup.call(
        this, e, idArray, startIndex, endIndex, params);
    },

    // Ultimately, this may call removeAnnotations, but first I have to
    // eliminate the annotations which are in more than one vote. Those are NOT
    // deleted; just removed from the vote (see _reportAnnotationResults below).
    // Actually, I'm moving the remove handling to here, because if I filter
    // out those things which are in other votes, _reportAnnotationResults
    // will never see them.

    _addAndRemoveAnnotations: function(g, considerClick) { // annArray, startIndex, endIndex, cssDisplayEntry, isAccel) {
      var finalAnnArray = [];
      var vState = this._votingState;
      var thisVote = vState.radioMap["new annotation pattern"].vote;
      var votes = this._voteMap[vState.segment.id];
      var otherVotes = [];
      var voteContent = new MAT.DocDisplay.AttributeValueSet(thisVote.getAttributeValue("content"));
      
      for (var i = 0; i < votes.length; i++) {
        if (votes[i] !== thisVote) {
          otherVotes.push(votes[i]);
        }
      }

      var otherCSet = this._collectContentAnnotationsFromVotes(otherVotes);        
      
      for (var i = 0; i < g.affectedAnnots.length; i++) {
        // Keep ONLY those which are in this vote and no others.
        // The elements in the annArray list are the INTERNAL ids, not
        // the IDs in the votes.
        var annot = g.affectedAnnots[i];
        // If it's got an ID, remove it from the vote content.
        if (annot.publicID) {
          voteContent.remove(annot.publicID);
        }
        if ((!annot.publicID) ||  (!otherCSet.contains(annot.publicID))) {
          // Really delete it.
          finalAnnArray.push(annot);
        }
      }
      g.affectedAnnots = finalAnnArray;
      thisVote.setAttributeValue("content", voteContent.render());
      MAT.DocDisplay.DocDisplay.prototype._addAndRemoveAnnotations.call(this, g, considerClick);
    },

    // This does COMPLETELY different things than the parent document.
    
    _reportAnnotationResults: function (g) {
      
      var vState = this._votingState;
      var thisVote = vState.radioMap["new annotation pattern"].vote;
      // Now, we get the ID for the annotations removed, and
      // remove them from the attribute set, and then get the ones added,
      // and add them.
      var voteContent = new MAT.DocDisplay.AttributeValueSet(thisVote.getAttributeValue("content"));
      // Removal processing is now handled in advance.
      for (var i = 0; i < g.events.length; i++) {
        var event = g.events[i];
        if (event.event_name == "add_annotation") {
          voteContent.add(event.annot.getID());
        }
      }
      thisVote.setAttributeValue("content", voteContent.render());
      // But I HAVE to do this.      
      this._reportAnnotationResultsCore(g.events, g.gestureDisplaySource, {
        log: true,
        redisplay: true
      });
    },
    
    // This doesn't store the property locally; that's
    // taken care of by the UI. A little odd, but they should
    // never be out of sync.
    showProcessedVotes: function() {
      AC(this._div, "showProcessedVotes");
      this.redisplay();
    },

    hideProcessedVotes: function () {
      RC(this._div, "showProcessedVotes");
      this.redisplay();
    },

    // We don't keep the autoadvance setting locally.
    maybeStartAutoAdvance: function () {
      // If you're currently not voting, vote.
      if (!this._votingState) {
        // Find the next segment. If it exists, and it hasn't been reviewed yet, scroll to it and review it.
        this._advanceToNextSegment(this._regionMap._firstRegion);
      }
    },

    disableAutoAdvance: function() {
    },

    // Overrides.
    
    hoverSegment: function (segContentNode) {
      if (!this._votingState) {
        MAT.DocDisplay.DocDisplay.prototype.hoverSegment.call(this, segContentNode);
      }
    },

    unhoverSegment: function (segContentNode) {
      if (!this._votingState) {
        MAT.DocDisplay.DocDisplay.prototype.unhoverSegment.call(this, segContentNode);
      }
    },

    clearDisplay: function() {
      MAT.DocDisplay.DocDisplay.prototype.clearDisplay.call(this);
      // And clear the review pane. But DON'T clear the voting state,
      // just in case this is only a redisplay.
      if (this._voteReviewDiv) {
        this._panel.uiClearPane(this._voteReviewDiv);
      }
    },

    redisplay: function() {
      MAT.DocDisplay.DocDisplay.prototype.redisplay.apply(this, arguments);
      // If we're in the middle of reviewing a segment, then reapply the
      // segment review.
      if (this._votingState) {
        var seg = this._votingState.segment;
        var currentState = this._votingState;
        this._votingState = null;
        this.reviewSegment(seg, currentState);
      }    
    },

    setData: function(doc) {
      // Clear out everything. Abandon the current state. This happens when
      // we update, among other things. If the current voting state is
      // new annotation pattern, we need to cancel it out in the same
      // way we'd do if we selected a different option. Ditto a new no annotations vote.
      if (this._votingState &&
          ((this._votingState.currentState == "new annotation pattern") ||
           (this._votingState.currentState == "no annotations"))) {
        this._removeNewVotePattern();
      }
      this._votingState = null;
      MAT.DocDisplay.DocDisplay.prototype.setData.apply(this, arguments);
    },

    // The problem here is that I want to remove all the annotations which
    // ONLY this vote refers to.

    // Actually, I have to do this when I delete an annotation when I do hand
    // annotation, too.
    
    _removeNewVotePattern: function() {    
      // Find the new vote and remove it and all the annotations it uniquely refers to.
      var segment = this._votingState.segment;
      var votes = this._voteMap[segment.id];
      // We're going to collect the contents of the other votes.
      var newVoteIndex = -1
      var otherVotes = [];
      for (var i = 0; i < votes.length; i++) {
        var vote = votes[i];
        if (vote.getAttributeValue("new") == "yes") {
          newVoteIndex = i;
        } else {
          otherVotes.push(vote);
        }
      }

      if (newVoteIndex > -1) {
        var vote = votes[newVoteIndex];
        // Remove it from the vote map.
        votes.splice(newVoteIndex, 1);
        // Remove it and the annotations it uniquely points to from the
        // document.
        var toRemove = [vote];
        var content = vote.getAttributeValue("content");
        if ((content != "ignore") && (content != "bad boundaries") && (content != "")) {        
          if ((otherVotes.length > 0)) {
            var otherCSet = this._collectContentAnnotationsFromVotes(otherVotes);
            // Now, otherCSet contains all the references from the OTHER votes.
            // Now, we can check them.
            var ids = content.split(",");
            for (var k = 0; k < ids.length; k++) {
              if (!otherCSet.contains(ids[k])) {
                toRemove.push(this._doc.getAnnotationByID(ids[k]));
              }
            }
          } else {
            // No need to check. Just remove the annotations this vote refers to.
            var ids = content.split(",");
            for (var k = 0; k < ids.length; k++) {
              toRemove.push(this._doc.getAnnotationByID(ids[k]));
            }
          }
        }
        this._doc.removeAnnotationGroup(toRemove);
      }
    },

    _collectContentAnnotationsFromVotes: function(otherVotes) {    
      // We're about to TRY to remove the annotations pointed to in a vote.
      // So first, we need to collect the OTHER references so we make sure
      // not to delete something that another vote points to.
      // The reason for this check is that currently, it's possible to merge
      // a segment with an adjacent segment that you've already voted on,
      // and then the vote appears in the new vote. Even if we change this, there
      // are probably situations where this can happen.
      var otherCSet = new MAT.DocDisplay.AttributeValueSet("")
      for (var j = 0; j < otherVotes.length; j++) {
        var otherContent = otherVotes[j].getAttributeValue("content");
        if ((otherContent != "ignore") && (otherContent != "bad boundaries") && (otherContent != "")) {
          otherCSet.addMany(otherContent.split(","));
        }
      }
      return otherCSet;
    }
  });


/*
 *                    MAT.DocDisplay.RegionMap
 *
 *
 * This object maps between the annotation object and the regions in
 * the doc display.
 *
 */

  // Region map. The idea is that we can generate an ordered
  // sequence of regions (annotations, untaggable regions, taggable
  // regions), assign an ID to each element, and then use that ID
  // in the span generation. Well, you don't need the IDs - you can
  // save the region on the span directly. What does this mean about
  // whether I need these objects in the future?

  // The list of regions is not, repeat, NOT ordered.

  MAT.DocDisplay.RegionMap = function(docDisplay) {
    // Careful = this object also serves as its own hash table.
    this._docDisplay = docDisplay;
    this._tagLabel = this._docDisplay._tagLabel;
    this.maxSubContentLayer = 0;
    this.maxSuperContentLayer = 0;
    this._reset();
    this._createStyleSheet();
  }

  // It's a real mess to try to update the region map when
  // we get a new annotation bundle for the current document.
  // So I'm just blowing it away and starting over.

  // The region map is where we assign the annotations.

  MAT.Extend(MAT.DocDisplay.RegionMap, {

    _reset: function () {
      this.indexToIndexReason = {};
      // Need this for autotagging.
      this.contentBlankRegions = [];
      this.annIDHash = {};
      this._foundTokens = false;
      this._segmentNodes = {};
      this._firstRegion = null;
      // We're going to have a linked list of regions,
      // and also spanlessRegions which support both highlighting and
      // above/below stacking (see _renderSpan).
      this.annIDToStartRegion = {};
      // Need this for figuring out where to put
      // spanless annotation anchors. The charAnchorHash
      // is a hash {start: ..., end:..., anchor: ...}.
      this.spanlessAnnIDToCharAnchorHash = {};
      // This is a hash from annotation IDs to computed CSS labels.
      this.annIDToCSSLabels = {};
      this.styleSheet = null;
    },

    _createStyleSheet: function() {
      var docDisplay = this._docDisplay;
      // Just rebuild the damn thing.
      if (this.styleSheet) {
        this._removeStyleSheet();
      }
      this.styleSheet = MAT.CSS.createOrRetrieveStyleSheet("mat_doc_display_" + docDisplay._div.id);
    },

    _maybeAugmentStyleSheet: function(region) {
      if ((region.maxSubContentLayer > this.maxSubContentLayer) ||
          (region.maxSuperContentLayer > this.maxSuperContentLayer)) {
        var docDisplay = this._docDisplay;
        var ss = this.styleSheet;
        // OK, we've created the style sheet. Now, we want to create the styles for
        // subLayer, superLayer.
        
        // This is the margin between the text and the
        // over or under mark, and between the marks, in ems.
        var overUnderMargin = docDisplay.OVER_UNDER_MARGIN;
        
        // This is the total height of the space allocated to the
        // mark, in ems. markMarginHeight - overUnderMargin should
        // be the height of superLayer and subLayer.
        var markMarginHeight = docDisplay.MARK_MARGIN_HEIGHT;
        
        // This is the extra bump, in ems, assigned to the 
        // over and under layers, for padding between the lines.
        // To emphasize the association, it should be greater than
        // overUnderMargin.
        var lineMargin = docDisplay.LINE_MARGIN;
        var panelCls = "."+docDisplay._div.id+"_stackEnv";
        // Let's create rules for the enclosing spans and for the individual spans.
        for (var i = this.maxSubContentLayer; i < region.maxSubContentLayer; i++) {
          // The enclosing span gets a margin only in the doc view. The margin
          // only works if it's an inline block. This is always true for annotated
          // spanned regions, but we need it to be true for unannotated spanned regions
          // which are getting a little extra "kick" because of spanless annotations
          // (see _renderSpan for the comparison window).
          ss.insertRule(panelCls + " span.maxsub_" + (i + 1) +
                        " { display: inline-block; margin-bottom: " + (lineMargin + ((i + 1) * markMarginHeight)).toFixed(1) + "em; }",
                        ss.cssRules.length);
          // We do NOT want to set the margin-bottom in the spanless sidebar.
          // Or, more to the point, we have to make sure we override the rule above.
          ss.insertRule(panelCls + ".spanlessSidebar span.maxsub_" + (i + 1) +
                        " { display: inline-block; margin-bottom: 0em; }",
                        ss.cssRules.length);
          // Set the top margin. We're going to give these
          // a little space, so there's a gap between the
          // behind and over/under, but MORE of a gap between
          // the lines.
          ss.insertRule(panelCls + " span.subLayer_" + i +
                        " { height: " + (markMarginHeight - overUnderMargin).toFixed(1) + "em; margin-top: " + (overUnderMargin + (i * markMarginHeight)).toFixed(1) + "em; }",
                        ss.cssRules.length);
          ss.insertRule(panelCls + " span.subLayer_" + i + "_nomargin " + 
                        " { height: " + markMarginHeight + "em; margin-top: " + (i * markMarginHeight).toFixed(1) + "em; }",
                        ss.cssRules.length);
        }
        for (var i = this.maxSuperContentLayer; i < region.maxSuperContentLayer; i++) {
          // The enclosing span gets a margin only in the doc view.
          ss.insertRule(panelCls + " span.maxsuper_" + (i + 1) +
                        " { display: inline-block; margin-top: " + (lineMargin + ((i + 1) * markMarginHeight)).toFixed(1) + "em; }",
                        ss.cssRules.length);
          ss.insertRule(panelCls + ".spanlessSidebar span.maxsuper_" + (i + 1) +
                        " { display: inline-block; margin-top: 0em; }",
                        ss.cssRules.length);
          ss.insertRule(panelCls + " span.superLayer_" + i +
                        " { height: " + (markMarginHeight - overUnderMargin).toFixed(1) + "em; margin-bottom: " + (overUnderMargin + (i * markMarginHeight)).toFixed(1) + "em; }",
                        ss.cssRules.length);
          ss.insertRule(panelCls + " span.superLayer_" + i + "_nomargin " +
                        " { height: " + markMarginHeight + "em; margin-bottom: " + (i * markMarginHeight).toFixed(1) + "em; }",
                        ss.cssRules.length);
        }
        this.maxSubContentLayer = region.maxSubContentLayer;
        this.maxSuperContentLayer = region.maxSuperContentLayer;
      }
    },

    _removeStyleSheet: function() {
      MAT.CSS.deleteStyleSheet(this.styleSheet);
      this.styleSheet = null;
    },

    addAnnotations: function(aset) {

      var docParams = {};

      if (arguments.length > 1) {
        docParams = arguments[1];
      }

      // We always add content annotations. However, we might
      // skip the admin annotations, or the administrative annotations in general. 

      // Find the untaggable, zone and lex tags, and add them
      // to the internal table of starts and ends.
      // We don't calculate actual spans until spansForRegions is called.

      for (var label in aset.annotTypes.typeTable) {
        var atype = aset.annotTypes.typeTable[label];
        if ((atype.category == "untaggable") ||
            (atype.category == "token") ||
            (atype.category == "zone") ||
            (atype.category == "admin")) {
          if (docParams.skipNonContentCategories) {
            continue;
          }
          if ((atype.category == "admin") && docParams.skipAdminCategory) {
            continue;
          }
          // It can't be spanless.
          if (atype.hasSpan) {
            var theseAnnots = aset.annotTypes.getAnnotations(label);
            this._addAnnotList(theseAnnots);
            if ((atype.category == "token") && (theseAnnots.length > 0)) {
              this._foundTokens = true;
            }
          }
        }
      }

      // Do the same for all the content annotations. Don't worry about
      // ordering or overlaps, yet. Optimize/integrate with the above loop later.

      var contentAnnots = aset.allContentAnnotations({spannedOnly: true});
      this._addAnnotList(contentAnnots);
      // Now, for the spanless annotations, we first need to figure out where they
      // belong.      
      var spanlessAnnots = aset.allContentAnnotations({spanlessOnly: true});
      // We need to assign layers to them, too.
      for (var i = 0; i < spanlessAnnots.length; i++) {
        this._computeSpanlessAnnotAnchor(spanlessAnnots[i]);
      }
    },

    // This will break if there's a cycle.
    // This also does extra work; in comparison documents, it positions
    // things which are paired with a pivot, and thus positioned with the
    // pivot and not with its own character "anchor".

    _computeSpanlessAnnotAnchor: function(a) {
      // This happens in _addAnnotList, so we have to do it here too.
      this.annIDHash[a.id] = a;
      // The anchor is halfway between the start and end of the annot.
      var entry = this.spanlessAnnIDToCharAnchorHash[a.id];
      if (entry === undefined) {
        entry = {start: null, end: null, anchor: null};
        // Adding it immediately, so we can detect recursion.
        this.spanlessAnnIDToCharAnchorHash[a.id] = entry;
        var start = Infinity;
        var end = 0;
        var found = false;
        // Now, the children. I have this code in a number of places,
        // but I don't want to turn it into a function because of the
        // function call overhead in Javascript. That may be stupid...
        if (a.atype.hasAnnotationValues) {
          for (var j = 0; j < a.attrs.length; j++) {
            var attr = a.attrs[j];
            if ((a.atype.attrs[j]._typename == "annotation") && attr != null) {
              if (attr.constructor === MAT.Annotation.Annotation) {
                // We found an annotation.
                found = true;
                var subEntry;
                if (attr.atype.hasSpan) {
                  subEntry = attr;
                } else {
                  subEntry = this._computeSpanlessAnnotAnchor(attr);
                }
                // subEntry can be null in the case of reentrancy.
                if (subEntry) {
                  start = Math.min(start, subEntry.start);
                  end = Math.max(end, subEntry.end);
                }
              } else if (attr && ((attr.constructor === MAT.Annotation.AttributeValueSet) ||
                                  (attr.constructor === MAT.Annotation.AttributeValueList)) &&
                         attr.ofAttribute && (attr.ofAttribute.constructor === MAT.Annotation.AnnotationAttributeType)) {
                var size = attr.size();
                for (var k = 0; k < size; k++) {
                  // We found an annotation. This should not be set if the
                  // list is of size 0.
                  found = true;
                  var subval = attr.elements[k];
                  var subEntry;
                  if (subval.atype.hasSpan) {
                    subEntry = subval;
                  } else {
                    subEntry = this._computeSpanlessAnnotAnchor(subval);
                  }
                  // subEntry can be null in the case of reentrancy.
                  if (subEntry) {
                    start = Math.min(start, subEntry.start);
                    end = Math.max(end, subEntry.end);
                  }
                }
              }
            }
          }
        }
        if (!found) {
          // There are no children whose span can be computed. We have no idea where to put it.
          start = end = anchor = 0;
        } else {
          anchor = start + Math.floor((end - start) / 2);
        }
        entry.start = start;
        entry.end = end;
        entry.anchor = anchor;
        return entry;
      } else  if (entry.start === null) {
        // We've detected a reentrant case. Return null.
        return null;
      }
      return entry;
    },

    // SAM 8/14/12: We're going to generalize and simplify the way we deal with
    // these indices. We're going to keep track of the REASONS that an interval
    // exists, and use it to deal with local redraws. I should probably
    // turn the index lookup into a function, but calling functions in JS is
    // still relatively expensive.

    _addAnnotList: function(annots) {      
      for (var i = 0; i < annots.length; i++) {
        var a = annots[i];
        this.annIDHash[a.id] = a;
        if (this.indexToIndexReason[a.start]) {
          this.indexToIndexReason[a.start].annotStart.push(a);
        } else {
          this.indexToIndexReason[a.start] = {
            annotStart: [a],
            annotEnd: [],
            swipeStart: false,
            swipeEnd: false,
            newlineRegionStart: false,
            newlineRegionEnd: false,
            wrap: false,
            docStart: false,
            docEnd: false
          };
        }

        if (this.indexToIndexReason[a.end]) {
          this.indexToIndexReason[a.end].annotEnd.push(a);
        } else {
          this.indexToIndexReason[a.end] = {
            annotStart: [],
            annotEnd: [a],
            swipeStart: false,
            swipeEnd: false,
            newlineRegionStart: false,
            newlineRegionEnd: false,
            wrap: false,
            docStart: false,
            docEnd: false
          };
        }
      }
    },

    _findNewlineSpans: function() {
      var signal = this._docDisplay.signal;
      // We need to know where the newline boundaries are, because we're wrapping
      // at each newline, and the over/under annotation drawing doesn't work at
      // all across wrap, so we need to break at every newline interval.
      var p = /[\n\r]+/g;
      var reMatch = p.exec(signal);
      while (reMatch != null) {
        var startNewline = reMatch.index;
        var endNewline = reMatch.index + reMatch[0].length;
        if (this.indexToIndexReason[startNewline]) {
          this.indexToIndexReason[startNewline].newlineRegionStart = true;
        } else {
          this.indexToIndexReason[startNewline] = {
            annotStart: [],
            annotEnd: [],
            swipeStart: false,
            swipeEnd: false,
            newlineRegionStart: true,
            newlineRegionEnd: false,
            wrap: false,
            docStart: false,
            docEnd: false
          };
        }

        if (this.indexToIndexReason[endNewline]) {
          this.indexToIndexReason[endNewline].newlineRegionEnd = true;
        } else {
          this.indexToIndexReason[endNewline] = {
            annotStart: [],
            annotEnd: [],
            swipeStart: false,
            swipeEnd: false,
            newlineRegionStart: false,
            newlineRegionEnd: true,
            wrap: false,
            docStart: false,
            docEnd: false
          };
        }
        reMatch = p.exec(signal);
      } 
    },

    indexHasReason: function(idx) {
      return this.reasonEntryHasReason(this.indexToIndexReason[idx]);
    },

    reasonEntryHasReason: function(entry) {
      return ((entry.annotStart.length > 0) || (entry.annotEnd.length > 0) ||
              entry.swipeStart || entry.swipeEnd || entry.newlineRegionStart ||
              entry.newlineRegionEnd || entry.wrap || entry.docStart || entry.docEnd);
    },

    // I'd rather not slice in both the region generation and the span
    // generation, but at the moment, I don't want to refactor the
    // region customization, just yet.
    
    spansForRegions: function(signal, node, indexStart, indexEnd) {
      var docDisplay = this._docDisplay;
      // This calls docDisplay._renderRegion for ONE REASON ONLY: because
      // at the moment, the reconciliation documents have to add something to the
      // region structure immediately before the region is rendered. What a waste.
      this._generateRegions(signal, indexStart, indexEnd, function (r) { docDisplay._renderRegion(r, node); });
    },

    // Note that this gets an optional argument to generate the span.

    _generateRegions: function(signal, indexStart, indexEnd) {

      var spanFn = null;
      if (arguments.length > 3) {
        spanFn = arguments[3];
      }

      // We want spans for each of the regions defined by the
      // start and end table indices. The idea is that each span
      // will have CSS attributes corresponding to the types
      // of the annotations it's overlapping.

      var allIndices = [];
      for (var index in this.indexToIndexReason) {
        // This had BETTER be an integer. It's a string when
        // it's a hash key.
        if (this.indexToIndexReason.hasOwnProperty(index)) {
          allIndices.push(parseInt(index));
        }
      }

      // Now I have all the indexes. Order them numerically.
      // There should be no duplicates.

      function numberOrder(x, y) {
        return x - y;
      }

      allIndices.sort(numberOrder);

      // We start at indexStart, go to indexEnd. At each index, we examine
      // the interval between the previous index and this one, making sure
      // that we don't duplicate indices at either the start or the end.
      // (Actually, we can just check for duplicates at each point.)
      // Add all the elements which started at the start index, subtract
      // all the ones which ended at the start index (do it in that order so 
      // that zero-length annotations (perverse case, yes, but we might as well
      // cover it) are removed appropriately. We create an ID for each interval,
      // and enter it into the interval hash table.

      var curAnnots = {};

      // How do we do this efficiently? You can't use objects as hash
      // keys in Javascript. There's no efficient find() method
      // for Arrays, either. If there were a unique string name for
      // each annotation, that would help, but do I want to do that just
      // for this operation? Yes.

      var lastIndex = indexStart;
      // Add entries to the index reason array for doc start and end.
      // These really need to be recorded; we never want to remove
      // these indices. They may already exist, but they may not.
      if (this.indexToIndexReason[indexStart] === undefined) {
        this.indexToIndexReason[indexStart] = {
          annotStart: [],
          annotEnd: [],
          swipeStart: false,
          swipeEnd: false,
          newlineRegionStart: false,
          newlineRegionEnd: false,
          wrap: false,
          docStart: true,
          docEnd: false
        };
      }
      if (this.indexToIndexReason[indexEnd] === undefined) {
        this.indexToIndexReason[indexEnd] = {
          annotStart: [],
          annotEnd: [],
          swipeStart: false,
          swipeEnd: false,
          newlineRegionStart: false,
          newlineRegionEnd: false,
          wrap: false,
          docStart: false,
          docEnd: true
        };
      }

      var r = null;

      for (var i = 0; i < allIndices.length; i++) {
        var curIndex = allIndices[i];
        if (curIndex == lastIndex) {
          continue;
        }
        if (curIndex > indexEnd) {
          break;
        }
        
        r = this._addRegion(signal, lastIndex, curIndex, curAnnots, r, spanFn);
        
        lastIndex = curIndex;      
      }
      
      if (lastIndex < indexEnd) {
        this._addRegion(signal, lastIndex, indexEnd, curAnnots, r, spanFn);
      }
    },

    // Adding a region depends on what's there, and what's changed.

    _addRegion: function(signal, lastIndex, curIndex, curAnnots, prevRegion, spanFn) {

      var annotsChanged = false;
      var inNewlineRegion = ((prevRegion && prevRegion.inNewlineRegion) || false);

      var reasonEntry = this.indexToIndexReason[lastIndex];
      if (reasonEntry) {
        // First, let's see if we're entering or leaving a newline region.
        if (reasonEntry.newlineRegionStart) {
          inNewlineRegion = true;
        } else if (reasonEntry.newlineRegionEnd) {
          inNewlineRegion = false;
        }

        // Now, let's see what annotations are starting and ending.
        // If any annotations are added or removed, update annotsChanged.
        var startAnnots = reasonEntry.annotStart;
        if (startAnnots && (startAnnots.length > 0)) {
          for (var j = 0; j < startAnnots.length; j++) {
            annotsChanged = true;
            curAnnots[startAnnots[j].id] = startAnnots[j];
          }
        }
        var endAnnots = reasonEntry.annotEnd;
        if (endAnnots && (endAnnots.length > 0)) {
          for (var j = 0; j < endAnnots.length; j++) {
            annotsChanged = true;
            delete curAnnots[endAnnots[j].id];
          }
        }
      }

      // If no annots have changed, we should just inherit the
      // annotation information from prevRegion, if it exists. Otherwise, we
      // calculate it anew.

      var start = lastIndex;
      var end = curIndex;

      var r = new MAT.DocDisplay.Region(this, signal, start, end, this._tagLabel,
                                        inNewlineRegion, prevRegion);

      // Careful! We want to make sure that the default stuff happens with
      // the rtype, etc., whether or not there are any annotations. So because
      // we either populate it explicitly or inherit it from a previous region,
      // if the first region has no annotations, we have to make sure that
      // the right things happen. So let's make sure that if this is the first
      // region, we populate.
      if (annotsChanged || !prevRegion) {
        r._populateAnnotationData(curAnnots);
      } else {
        r._inheritAnnotationDataFromPreviousRegion();
      }
      
      // Originally, I was looking to see if the document has a zone.
      // But if the document isn't zoned, no blank regions will be found
      // as a result. So instead, I should look for !hasUntaggable.
      if ((!r.hasUntaggable) && (r.contentAnnots.length == 0)) {
        if ((this.contentBlankRegions.length > 0) &&
            (this.contentBlankRegions[this.contentBlankRegions.length - 1][1] == start)) {
          // If we're starting exactly where the last one finished, extend the last one.
          this.contentBlankRegions[this.contentBlankRegions.length - 1][1] = end;
        } else {
          this.contentBlankRegions.push([start, end]);
        }      
      }
      
      if (!prevRegion) {
        this._firstRegion = r;
      }

      // And so we can find the region for the content annots, when we highlight.
      // But be careful: only record it the FIRST TIME YOU ENCOUNTER IT.
      for (var j = 0; j < r.contentAnnots.length; j++) {
        if (this.annIDToStartRegion[r.contentAnnots[j].id] === undefined) {
          this.annIDToStartRegion[r.contentAnnots[j].id] = r;
        }
      }
      
      if (spanFn) {
        spanFn(r);
      }
      return r;
    },

    // This method looks at all the regions - it's only called if
    // there are no tokens - and splits a region for wrap at all the
    // points it needs to be split.

    // It's NOT enough
    // to look only at the maximum length regions; if forced wrap happens at word
    // boundaries, a line can be wrapped but still not the maximum width.
    // Is it enough to look at the height of the text node? Perhaps - 
    // we add margin for over/under rather than padding, and 
    // offsetWidth does not include margin - but it does include
    // border, and border can change the text height.
    // I can't even sort the widths by their length - sometimes narrower
    // elements will have more lines than wider elements, again because
    // of word-level wrap.
      
    // So for each region which is not a newline region, find the characters for which
    // the offset height increases, and insert a wrap break between them.
    // The most efficient way is probably to do a binary search and stop,
    // for any segment, when its last character's offset height is the same
    // as its first's. I'm not sure there's a faster way.
    
    _spanPalettePostprocessForWrap: function() {
      var region = this._firstRegion;
      var r = document.createRange();

      // The indices I want to collect must be offsets from the original start.
      function findSplits(tNode, sIndex, eIndex, sTop, eTop, indices) {
        // In either case, either or both of sTop and eTop are already known.
        // The question I'm posing is: should I split at eIndex? I can
        // only determine this for certain if sIndex - eIndex = 1.
        var segLength = eIndex - sIndex;
        if (sTop === null) {
          r.setStart(tNode, sIndex);
          r.setEnd(tNode, sIndex + 1);
          sTop = r.getBoundingClientRect().top;
        }
        if (eTop === null) {
          r.setStart(tNode, eIndex);
          r.setEnd(tNode, eIndex + 1);
          eTop = r.getBoundingClientRect().top;
        }
        if (sTop < eTop) {
          // We need to proceed. If the length of the segment is 1,
          // we've found the split.
          if (segLength == 1) {
            indices.push(eIndex);
          } else {
            // We need to split in half, and recurse. Make sure we
            // understand what the right thing to do is when segLength
            // is odd.
            var midpoint = sIndex + Math.floor(segLength/2);
            findSplits(tNode, sIndex, midpoint, sTop, null, indices);
            findSplits(tNode, midpoint, eIndex, null, eTop, indices);
          }
        }
      }
                  
      function numberOrder(x, y) {
        return x - y;
      }

      while (region) {
        // Don't bother doing anything special if we
        // have a newline region, or a region that's 1 character long.
        if ((!region.inNewlineRegion) && ((region.end - region.start) > 1)){
          // Do the binary search.
          var indices = [];
          findSplits(region.textNode, 0, region.end - region.start - 1, null, null, indices);
          if (indices.length > 0) {
            // I know this needs wrap. How much? Do the binary search.
            // Sort the indices.
            indices.sort(numberOrder);
            var endRegion = region.splitAndRerender(this, indices);
            for (var j = 0; j < indices.length; j++) {
              // Remember, the indices are wrt the start of the region.
              this.indexToIndexReason[indices[j] + region.start].wrap = true;
            }
            region = endRegion;            
          }
        }
        region = region.nextRegion;
      }
    },

    // So this function should always be called after the spans are rendered.
    // It should look at the spanlessAnnIDToCharAnchorHash, sort it, and
    // then run through the regions, finding the span record which contains
    // the region and locating the position relative to the _div parent.

    // We also want to construct a region for the span we build. Ultimately,
    // it should have enough parallel structure to allow _renderSpan to
    // do the over/under spacing.

    // The annots we need to position are the pivots, and then everything
    // in the others lists in the spurious. Everything else gets positioned
    // relative to the pivots.

    spansForSpanlessRegions: function(sidebar) {
      var pairings = this._docDisplay._retrieveSpanlessAnnotationPairings();
      var charAnchorToAnnotIDs = {};
      var charAnchors = [];
      // Originally, I was going through the spanlessAnnIDToCharAnchorHash
      // directly, but we really need to start with the pairings.
      // The pairings are {labels: [...], pairings: []}
      // where each entry in the pairings is
      // {<doclabel>: {annot: <annot>, pivot: true|false, match: true|false} | null, ...}
      // where the doclabels are drawn from the list of labels.
      // WE should present matchVsNonmatch if the labels is length > 1.
      var presentMatchVsNonmatch = (pairings.labels.length > 1);
      var pivotDocLabel = pairings.labels[0];
      
      // We want to anchor the pairing with the first
      // annotation it finds. Loop through the labels.
      // The first one is always the pivot.
      for (var w = 0; w < pairings.pairings.length; w++) {
        var topPairEntry = pairings.pairings[w];
        var pairHash = topPairEntry.entries;
        var anchorEntry = null;
        var allPairEntries = [];
        for (var y = 0; y < pairings.labels.length; y++) {
          var pairEntry = pairHash[pairings.labels[y]];
          if (pairEntry) {
            this._docDisplay.assignContentAnnotLayer(pairEntry.annot);
            if (!anchorEntry) {
              var aid = pairEntry.annot.id;
              var anchor = this.spanlessAnnIDToCharAnchorHash[aid].anchor;
              anchorEntry = charAnchorToAnnotIDs[anchor];
              if (anchorEntry === undefined) {
                anchorEntry = [];
                charAnchorToAnnotIDs[anchor] = anchorEntry;
                charAnchors.push(anchor);
              }
              anchorEntry.push(topPairEntry);
            }
          }
        }
      }
      
      // Now we're done collecting the indexable things.

      // If we don't have any, bail.
      if (charAnchors.length == 0) {
        return;
      }

      // Now we have a reverse map, with the char anchors as the key. We 
      // sort the anchors.
      
      function numberOrder(x, y) {
        return x - y;
      }
      charAnchors.sort(numberOrder);
      
      // Now, loop through the regions. Each char anchor has to be in
      // some index. The document either has tokens or has been split
      // for wrapping, so we know that if we find a region that contains the
      // current character anchor (as long as it's not a newline region),
      // it'll be in the same "line" as where we want to put the
      // icon. So I can keep an inventory of the slot counts.

      // Originally, I was just rendering the icons as I found them.
      // But if I have to adjust the height of the anchor to give
      // the spanless annotation room, I'd just have to regenerate everything
      // I drew. So let's flush that buffer every time we advance to
      // another region, and then at the end.

      // Actually, even THAT isn't good enough. Multiple regions correspond
      // to the same vertical slot, but what we want to know is whether
      // a particular vertical slot has been rerendered, unfortunately. 

      var curRegion = this._firstRegion;
      var SLOT_MAX = 4;
      var curVerticalSlotRegions = [];
      var verticalSlotRegionsFilled = {};
      var curRegionRerender = false;
      var curRegionBBox = null;
      var curSlotBBox = null;
      var range = document.createRange();
      var docDisplay = this._docDisplay;
      var annIDToStartRegion = this.annIDToStartRegion;
      
      // UGH. We can't use just the top of the bounding box; we have to
      // know how far it's scrolled.
      var divTop = this._docDisplay._div.getBoundingClientRect().top - this._docDisplay._div.scrollTop;
      var rMap = this;

      var iconDimension = (docDisplay.MARK_MARGIN_HEIGHT - docDisplay.OVER_UNDER_MARGIN).toFixed(1) + "em";
      
      function advanceRegion(curRegion) {
        if (curRegionRerender) {
          curRegionRerender = false;
          curRegion.rerender(rMap);
          // If we redraw, and the current region bbox is the same top as the cur slot bbox,
          // update the cur slot bbox.
          if ((curSlotBBox != null) && (curRegionBBox != null) && (curSlotBBox.top == curRegionBBox.top)) {
            range.selectNode(curRegion.textNode);
            curSlotBBox = range.getBoundingClientRect();
          }
        }
        curRegionBBox = null;
        return curRegion.nextRegion;
      }

      function flushCurrentSlot() {        
        if (curVerticalSlotRegions.length > 0) {
          var bbox = curSlotBBox;
          verticalSlotRegionsFilled[bbox.top] = true;
          // Bounding box is relative to the VIEWPORT.
          var currentYSlot = bbox.top - divTop;
          for (var i = 0; i < curVerticalSlotRegions.length; i++) {
            var newREntry = curVerticalSlotRegions[i];
            var newR = newREntry.region;
            // This is an entry from the global pairings list.
            var pivotEntry = newREntry.pivotEntry;
            var match = pivotEntry.match;
            var annots = [];
            var annotIDsToEntry = {};
            for (var w in pivotEntry.entries) {
              if (pivotEntry.entries.hasOwnProperty(w)) {
                annots.push(pivotEntry.entries[w].annot);
                annotIDsToEntry[pivotEntry.entries[w].annot.id] = pivotEntry.entries[w];
              }
            }
            
            // Next, we draw the icons. They'll be stacked within the toplevel element,
            // which is positioned relative to the slot we've set up. Originally, I was going to
            // use the span itself to host the in-line element, and the others as its
            // children, as opposed to the spanned case, where the in-line span is a child.
            // But if I do that, it turns out that when I hover over one of the others, I'm
            // also hovering over the in-line element, and I don't want that.
            // What's also different is that if I let the outermost box get the margin
            // top and bottom, it's displaced from where it "should" be, because I can't position
            // the box without the margin being the outer edge. But on the other hand,
            // I don't actually need the margin set; I need it set on the ANCHOR.
            var sp = B("span", {
              attrs: {
                matRegionComponent: true,
                matRegionTop: true
              },
              style: {
                position: "absolute",
                top: currentYSlot,
                right: (i + ((i + 1)* .2)) + "em",
                // Because this is absolutely positioned, it STILL needs width and height.
                width: "1em",
                height: bbox.height + "px"
              }
            });
            var contentSpan;
            if (annots.length > 1) {
              contentSpan = B("span", {
                attrs: {
                  matRegionComponent: true,
                  matRegion: newR,
                  className: newR.rtype
                },
                style: {
                  width: "1em",
                  height: bbox.height + "px",
                  // Apparently, this also needs to be set.
                  position: "absolute"
                }
              });
              E(sp, {
                children: [
                  contentSpan                        
                ]
              });
            } else {
              // If there isn't going to be anything else, just add those
              // features to sp.
              E(sp, {
                attrs: {
                  className: newR.rtype
                }
              });
              contentSpan = sp;
            }

            newR.topNode = sp;
            
            docDisplay._positionSpanElements(newR, newR.rtype, contentSpan, sp);

            for (var w = 0; w < annots.length; w++) {
              annIDToStartRegion[annots[w].id] = newR;
            }

            // If we're presenting match vs. nonmatch, we're going to try to
            // enhance the non-main spans with check marks and Xs. Well, I tried
            // to do that, but they're too small. So I added a little square.
            
            if (presentMatchVsNonmatch) {

              // Some of the things you're comparing it
              // to don't have any rendering. If there's
              // no pivot display, and the displayed
              // count is 0, don't print out the check or X.
              
              var displayedCount = 0;
              var foundPivot = false;

              for (var w = 0; w < annots.length; w++) {
                var entry = annotIDsToEntry[annots[w].id];
                // The layer entry might have no content span,
                // because there's no rendering for the element.
                var subEntry = newR.annotIDToAnnotLayerEntry[annots[w].id];
                if (subEntry.contentSpan) {
                  if (entry.pivot) {
                    foundPivot = true;
                  } else {
                    displayedCount += 1;
                    E(subEntry.contentSpan, {
                      children: [{
                        label: "span",
                        style: {
                          width: iconDimension,
                          backgroundColor: entry.match ? "limegreen" : "orangered",
                          height: iconDimension,
                          position: "absolute",
                          left: "0px",
                          top: "0px",
                          borderRight: "1px solid white"
                        }
                      }]
                    });
                  }
                }
              }

              // We should add a check mark or an X to indicate
              // if the match is good or not. \u2713 (check) \u2717 (ballot X).
              // But only in the comparison case.
              // Colors match the colors in the table.
              if (foundPivot || (displayedCount > 0)) {
                E(contentSpan, {
                  text: pivotEntry.match ? "\u2713" : "\u2717",
                  style: {
                    textAlign: "center",
                    color: pivotEntry.match ? "limegreen" : "orangered"
                  }
                });
              }

              
            }

            // See _renderSpan and _processSpanlessAnnotationGesture. Works
            // by analogy with the spanned annotations.
            sp.matRegion = newR;
            A(sidebar, sp);
          }
          curVerticalSlotRegions = [];
        }
        curSlotBBox = null;
      }

      // So what we do is use the advanceRegion() function to create the
      // spans.
      
      for (var i = 0; i < charAnchors.length; i++) {
        var anchor = charAnchors[i];
        var entry = charAnchorToAnnotIDs[anchor];
        // Move past all the regions which end before this anchor.
        while (curRegion && curRegion.end <= anchor) {
          curRegion = advanceRegion(curRegion);
        }
        if (!curRegion) {
          // We should NEVER be here...
          break;
        }
        // At this point, the current region should contain the charAnchor.
        // If the region is only a newline region, find the next one.
        if ((curRegion.start <= anchor) && (curRegion.end >= anchor)) {
          // We'll never run out, because we're in between
          // various anchors. What happens if we run off the bottom?
          // We start adding our own rows, I guess. At this point, now
          // that I'm here, I need to loop through the annots, and place
          // them as we can.
          var bbox = null;
          for (var j = 0; j < entry.length; j++) {
            if (!curRegion) {
              this._docDisplay._panel.uiError("Ran out of space for rendering the relation icons.");
              break;
            }
            while (curRegion) {
              if (curRegion.inNewlineRegion) {
                curRegion = advanceRegion(curRegion);
              } else {                
                // We may not have just moved on; we may be here because
                // of the next iteration of j.
                if (curRegionBBox == null) {
                  // In this case, this is the first thing we're anchoring to this
                  // region.
                  range.selectNode(curRegion.textNode);
                  curRegionBBox = range.getBoundingClientRect();
                }
                if (verticalSlotRegionsFilled[curRegionBBox.top]) {
                  // Keep going. We've already used this slot.
                  curRegion = advanceRegion(curRegion);
                } else if ((curSlotBBox != null) && (curSlotBBox.top == curRegionBBox.top) &&
                    (curVerticalSlotRegions.length == SLOT_MAX)) {
                  // It's trying to fit into the current slot, but we've run out of
                  // positions. Advance and flush. You MUST advance first,
                  // because that's what redraws the region.
                  curRegion = advanceRegion(curRegion);
                  flushCurrentSlot();
                } else {
                  if ((curSlotBBox != null) && (curSlotBBox.top != curRegionBBox.top)) {
                    // If there's a current slot, but the tops aren't equal, then
                    // flush.
                    flushCurrentSlot();
                  }
                  curSlotBBox = curRegionBBox;
                  // entry[j] is an element of the global pairings list. So
                  // it's got a match, and then entries.
                  var entryAnnots = [];
                  for (var k in entry[j].entries) {
                    if (entry[j].entries.hasOwnProperty(k)) {
                      entryAnnots.push(entry[j].entries[k].annot);
                    }
                  }
                  var newR = new MAT.DocDisplay.SpanlessRegion(this, this._tagLabel, entryAnnots);
                  curVerticalSlotRegions.push({pivotEntry: entry[j], region: newR});
                  // If the maxsub or maxsuper for the new region is greater than that
                  // the region of its anchor, boost the region of its anchor and rerender it.
                  // Make sure you recompute the bbox. Hell, that means that I'm going to need
                  // to redraw everybody at this slot. So I think I need to postpone rendering
                  // the slot until all the regions for that slot have been computed.
                  if (((curRegion.maxSuperContentLayer < newR.maxSuperContentLayer) &&
                       (curRegion.maxSpanlessSuperContentLayer < newR.maxSuperContentLayer)) ||
                      ((curRegion.maxSubContentLayer < newR.maxSubContentLayer) &&
                       (curRegion.maxSpanlessSubContentLayer < newR.maxSubContentLayer))) {
                    // The overall region map will already have the greater layers registered
                    // in its style sheet. We just need to rerender this region.
                    // How will we handle what happens when things are redrawn? If
                    // the whole document is redrawn, we don't care; but if the
                    // span palette is redrawn without redrawing the spanless palette,
                    // ever, strange things might happen. But if we record the
                    // spanless "increment" on the spanned region, when do we clear
                    // it out? Probably whenever we redraw the spanless palette.
                    curRegion.maxSpanlessSuperContentLayer = newR.maxSuperContentLayer;
                    curRegion.maxSpanlessSubContentLayer = newR.maxSubContentLayer;
                    // We don't rerender it here; we just mark it for rerendering.
                    curRegionRerender = true;
                  }
                  break;
                }
              }
            }
          }
        }
      }
      // And at the end.
      if (curRegion) {
        advanceRegion(curRegion);
      }
      flushCurrentSlot();
    }
    
  });


/*
 *                    MAT.DocDisplay.Region
 *
 *
 * This object provides a common interface to annotations and other
 * regions of the signal as seen by the region  map.
 *
 */
  
  // Regions. This is the encapsulation of the functionality
  // for a set of annotations which cover a region of text.

  // Now that we're using separate spans for separate content annotations,
  // I have to compute the elements in the tag differently.

  // Note, too, that each region can be split into subspans, in the situation
  // where, e.g., I need to split a region because it has annotations and
  // it crosses a newline, or I've split it in the process of selecting
  // text for possible annotation in tokenless mode. Both of these uses
  // are implementational, rather than relevant to the actual document content.
  // But still, I'm going to make sure I break them out. I'm not going 
  // to have a separate object, but I am going to keep a list of span 
  // structures when I render.

  // I need to update this version to reflect the ability to update
  // the covered content, as in 1.3. The covered content mouseovers work
  // very differently in 2.0, though.

  // SAM 8/14/12: It's time to get rid of the subspan splits, and promote
  // everything to the region.

  MAT.DocDisplay.Region = function(rMap, signal, start, end, tagLabel, inNewlineRegion, prevRegion) {
    this._regionMap = rMap;
    // See _generateRegions for setup. 
    this.nextRegion = null;
    this.prevRegion = prevRegion;
    if (prevRegion) {
      prevRegion.nextRegion = this;
    }
    this.start = start;
    this.end = end;
    this.s = signal.slice(start, end);    
    this.tagLabel = tagLabel;
    this.inNewlineRegion = inNewlineRegion;

    // These will be initialized in a moment. See _populateAnnotationData
    // or _inheritAnnotationDataFromPreviousRegion.
    
    this.hasZone = false;
    this.coversToken = false;
    this.startsToken = false;
    this.endsToken = false;
    this.hasUntaggable = false;
    this.inSegment = null;
    this.contentAnnots = null;
    this.rtype = null;
    this.id = null;
    this.noncontentAnnots = null;
    // In _populateAnnotationData, these are dealt with in _computeCoveredContent.
    this.contentLayerBundles = [];
    this.contentLayerBundleDict = {};
    this.maxSuperContentLayer = 0;
    this.maxSubContentLayer = 0;
    // These are only present on spanned annotations. They don't
    // need to be inherited; they're only here to "boost" the height of the anchor to
    // leave enough room for the spanless content.
    this.maxSpanlessSuperContentLayer = 0;
    this.maxSpanlessSubContentLayer = 0;
    this.annotIDToAnnotLayerEntry = {};

    // These are set by _renderSpan.
    this.textNode = null;
    this.topNode = null;

  };

  // So now, the problem is that this.rtype isn't the classes for the
  // span alone anymore - I'm generating spans which contain other spans
  // so I can place the content annotations above, below, etc.

  // Because I need to split things up when annotations cross newlines,
  // I'm going to try to be much more explicit with the spans. Each one
  // will be part of an annotation, and perhaps also the content host,
  // and perhaps also the toplevel sequence span. Actually, the problem
  // is that when we split, we probably need to adjust and clone the
  // region, since we might need to figure out the offsets. That is, the 
  // extent of each region MUST be the text of its content host.

  MAT.Extend(MAT.DocDisplay.Region, {

    _populateAnnotationData: function (curAnnots) {

      // We've added the starting elements, removed the ending elements.
      // What we have left is the annotations which cover this interval.
      // Create a span.
      // Perhaps we should just encapsulate all that into a Region object.
      // That's what I originally created them for, anyway.
      
      var annots = [];
      for (var k in curAnnots) {
        if (curAnnots.hasOwnProperty(k)) {
          annots.push(curAnnots[k]);
        }
      }
      
      var start = this.start;
      var end = this.end;
      
      // So let's sort the annotations.
      var noncontentAnnots = [];
      var contentAnnots = [];

      var docDisplay = this._regionMap._docDisplay;
      
      for (var i = 0; i < annots.length; i++) {
        var annot = annots[i];
        var aCat = annot.atype.category;
        if (MAT.Annotation.AnnotationType.isContentType(aCat)) {
          contentAnnots.push(annot);
          // For the annotations which start here, we have to compute the
          // annotation layer BEFORE we call _computeCoveredContent. This is the
          // only place where we can do this correctly.
          if (annot.start == start) {
            docDisplay.assignContentAnnotLayer(annot);
          }
        } else if (aCat == "admin") {
          // We don't want the segment to be marked on
          // every annotation span. We'll construct them separately.
          if (annot.atype.label == "SEGMENT") {
            this.inSegment = annot;
          }
        } else {
          noncontentAnnots.push(annot);
          if (aCat == "untaggable") {
            this.hasUntaggable = true;
          } else if (aCat == "token") {
            this.coversToken = true;
            if (annot.start == start) {
              this.startsToken = true;
            }
            if (annot.end == end) {
              this.endsToken = true;
            }
          } else if (aCat == "zone") {
            this.hasZone = true;
          }
        }
      }
        
      // The rtype is an alphabetized list of all the
      // type names which are present (no need to have multiple
      // ones, because it's just what goes into the CSS processing).
      // In Python, I'd get an ordered list of unique keys by
      // using a dictionary. I'm trying to figure out whether this
      // is the fastest thing in Javascript, or whether I should
      // sort and then remove duplicates. A timing test
      // suggested that the latter is faster, at least in
      // Firefox on MacOS X.
      // But because this has gotten kind of complicated,
      // and I have to remove duplicates from the overall keys
      // AND the noncontentKeys, I'm going to do this differently.

      // The contentLayerBundles should NEVER be updated outside _computeCoveredContent().
      // Furthermore, the hover code should ONLY refer to the ids, not to the
      // keySet objects themselves, because it's possible to update the hover
      // without otherwise modifying the regions. The only thing constant will be
      // the annot ID.

      this.contentAnnots = contentAnnots;
      var akeys = this._computeCoveredContent();

      for (var i = 0; i < noncontentAnnots.length; i++) {
        var annot = noncontentAnnots[i];
        var labels = annot._computeCSSLabels();
        for (var j = 0; j < labels.length; j++) {
          akeys[labels[j]] = false;
        }
      }

      // Now, I want to get all the keys which are in akeys, and first
      // create a label for the base annotation span. And THEN I want to
      // get ALL the keys and create an ID.

      var labList = [];
      var allLabList = [];
      if ((contentAnnots.length > 0) || (noncontentAnnots.length > 0)) {
        // There's a key.
        for (var k in akeys) {
          if (akeys.hasOwnProperty(k)) {
            allLabList.push(k);
            if (akeys[k] == false) {
              labList.push(k);
            }
          }
        }
      }
      
      if (labList.length > 0) {
        labList.sort();
        this.rtype = this.tagLabel + " " + labList.join(" ");
      } else {
        this.rtype = this.tagLabel;
      }  

      var idInput = null;
      if (allLabList.length > 0) {
        allLabList.sort();
        idInput = this.tagLabel + " " + allLabList.join(" ");
      } else {
        idInput = this.tagLabel;
      }
      this.id = idInput.replace(/ /g, "_") + start + "_" + end;

      this.noncontentAnnots = noncontentAnnots;
    },

    // There may be no previous segment.
    
    _inheritAnnotationDataFromPreviousRegion: function () {
      if (this.prevRegion) {
        var r = this.prevRegion;
        this.hasZone = r.hasZone;
        this.coversToken = r.coversToken;
        this.startsToken = r.startsToken;
        this.endsToken = r.endsToken;
        this.hasUntaggable = r.hasUntaggable;
        this.inSegment = r.inSegment;
        this.contentAnnots = r.contentAnnots.slice(0);
        this.rtype = r.rtype;
        this.id = r.id;
        this.noncontentAnnots = r.noncontentAnnots.slice(0);
        // Copy the layer bundles.
        this.contentLayerBundles = [];
        this.contentLayerBundleDict = {};
        this.annotIDToAnnotLayerEntry = {};
        this.maxSuperContentLayer = r.maxSuperContentLayer;
        this.maxSubContentLayer = r.maxSubContentLayer;
        for (var i = 0; i < r.contentLayerBundles.length; i++) {
          var oldBundle = r.contentLayerBundles[i];
          var newBundle = {
            layer: oldBundle.layer,
            position: oldBundle.position,
            margin: oldBundle.margin,
            allLabels: oldBundle.allLabels.slice(0),
            allAnnots: oldBundle.allAnnots.slice(0),
            annotEntries: [],
            assignmentInitials: {}
          };
          var slug = oldBundle.layer+"_"+oldBundle.position;
          this.contentLayerBundleDict[slug] = newBundle;
          this.contentLayerBundles.push(newBundle);
          for (var k in oldBundle.assignmentInitials) {
            if (oldBundle.assignmentInitials.hasOwnProperty(k)) {
              newBundle.assignmentInitials[k] = true;
            }
          }
          for (var k = 0; k < oldBundle.annotEntries.length; k++) {
            var oldEntry = oldBundle.annotEntries[k];
            var newEntry = {
              annot: oldEntry.annot,
              labels: oldEntry.labels.slice(0),
              contentSpan: null
            };
            newBundle.annotEntries.push(newEntry);
            this.annotIDToAnnotLayerEntry[oldEntry.annot.id] = newEntry;
          }
        }
      } else {
        this.contentAnnots = [];
        this.noncontentAnnots = [];
        this.contentLayerBundles = [];
        this.contentLayerBundleDict = {};
        this.annotIDToAnnotLayerEntry = {};
        this.maxSuperContentLayer = 0;
        this.maxSubContentLayer = 0;
      }
    },

    _computeCoveredContent: function () {
      this.contentLayerBundles = [];
      this.contentLayerBundleDict = {};
      this.annotIDToAnnotLayerEntry = {};
      this.maxSuperContentLayer = 0;
      this.maxSubContentLayer = 0;
      var layerAssignments = this._regionMap._docDisplay.layerAssignments;
      
      var akeys = {};
      
      for (var i = 0; i < this.contentAnnots.length; i++) {
        var annot = this.contentAnnots[i];
        var labels = annot._computeCSSLabels();
        var assignment = layerAssignments[annot.id];
        var cls = assignment.layer;
        var param = assignment.position;
        var init = assignment.initial;
        var slug = cls+"_"+param;
        var entry = this.contentLayerBundleDict[slug];
        // This is all the information we're going to need for
        // rendering the span in the proper place, with
        // the appropriate styling, etc.
        if (entry === undefined) {
          entry = {
            layer: cls,
            position: param,
            margin: assignment.margin,
            annotEntries: [],
            assignmentInitials: {},
            allLabels: [],
            allAnnots: []
          }
          this.contentLayerBundleDict[slug] = entry;
          this.contentLayerBundles.push(entry);
          if (cls == "subLayer") {
            this.maxSubContentLayer = Math.max(param + 1, this.maxSubContentLayer);
          } else if (cls == "superLayer") {
            this.maxSuperContentLayer = Math.max(param + 1, this.maxSuperContentLayer);
          }
        }
        var annotEntry = {
          annot: annot,
          labels: labels.slice(0),
          // This is filled in by the renderer.
          contentSpan: null
        }
        if (init) {
          entry.assignmentInitials[init] = true;
        }
        entry.annotEntries.push(annotEntry);
        this.annotIDToAnnotLayerEntry[annot.id] = annotEntry;
        entry.allLabels = entry.allLabels.concat(labels);
        entry.allAnnots.push(annot);
        for (var j = 0; j < labels.length; j++) {
          akeys[labels[j]] = true;
        }
      }
      this._regionMap._maybeAugmentStyleSheet(this);
      return akeys;
    },

    // renderRegion is the entry point for the rendering of all the
    // document content. The regions are the smallest slice of annotation-segmented
    // material (or uncovered material). They are marked with the segment they're
    // in, and each region has a sequence of span records which which corresponds
    // to the actual content. If a region is in a segment, we first make sure
    // the segment has been rendered, and render it if it isn't rendered. The
    // renderSegment method inserts a span marked as a segment at the the node
    // specified. You'll always insert a region at the end of the node.
    // renderSegment also creates a content node and inserts it in the segment node
    // at the appropriate place. Finally, it prepares the segment entry, which
    // stores the content node and the segment node, and (for some reason)
    // stores the contentNodeLocation as well, but it's currently always null.

    // Once the segment that the region is in is created and rendered, we
    // now adopt the contentNode as the new node
    // to render the span into (so if there's no segment, it doesn't change, but
    // if there is a segment, it does).

    // beforeWhat will be null whenever segNodeEntry is undefined,
    // because that will happen only on the initial render. 

    renderRegion: function(node, regionMap, beforeWhat) {
      var displ = regionMap._docDisplay;
      // For each region map, ask the doc display to render
      // a segment and use it as the subsequent parent.
      // Otherwise, just use the node as the parent.
      if (this.inSegment) {
        var segNodeEntry = regionMap._segmentNodes[this.inSegment.id];
        if (segNodeEntry === undefined) {
          // This is a hash of contentNode, segmentNode.
          segNodeEntry = displ.renderSegment(this.inSegment, node);
          regionMap._segmentNodes[this.inSegment.id] = segNodeEntry;
        }
        // If this region starts the segment, then we mark it.
        if (this.start == this.inSegment.start) {
          segNodeEntry.firstRegion = this;
        }
        // Ditto the end. They may be the same!
        if (this.end == this.inSegment.end) {
          segNodeEntry.lastRegion = this;
        }
        node = segNodeEntry.contentNode;
      }
      displ.renderSpan(this, node, beforeWhat);
    },

    rerender: function(regionMap) {
      var location = this._removeSpan();
      this.renderRegion(location.parentNode, regionMap, location.nextSibling);
    },
    
    // We're going to split the region, by creating perhaps
    // several new ones. The offsets are offset INTO THE SPAN. We're going to
    // assume that it's less than the length of the span.
    // We also rerender the result.
    
    // Note that this
    // doesn't redefine the first region in the map, ever, so we
    // never have to update _firstRegion.
    
    splitAndRerender: function(regionMap, offsetList) {
      if (offsetList.length == 0) {
        return this;
      }
      // Rescue this, because it'll be updated in a second.
      // The final region will get this as its next region.
      var nextRegion = this.nextRegion;
      // Also, we want to remove the current text node, and
      // rescue the location.

      var location = this._removeSpan();
      
      var origStart = this.start;
      var origEnd = this.end;
      var origS = this.s;

      // Now the node is gone. Now, we create new regions and
      // render them.
      var displ = regionMap._docDisplay;
      var previousRegion = this;

      for (var i = 0; i < offsetList.length; i++) {
        var offset = offsetList[i];
        // This index won't exist in the index map yet. Or, at
        // least, it BETTER not. The REASON for the
        // index entry will be added by the caller.
        regionMap.indexToIndexReason[origStart + offset] = {
          annotStart: [],
          annotEnd: [],
          swipeStart: false,
          swipeEnd: false,
          newlineRegionStart: false,
          newlineRegionEnd: false,
          wrap: false,
          docStart: false,
          docEnd: false
        };
        var nextOffset;
        // Initially, we're going to use odd offsets, 
        // so s gets segmented appropriately.
        if (i < (offsetList.length - 1)) {
          nextOffset = offsetList[i + 1];
        } else {
          nextOffset = origEnd - origStart; // i.e., the end of "this signal"
        }
        var newR = new MAT.DocDisplay.Region(regionMap, origS, offset, nextOffset,
                                             this.tagLabel, this.inNewlineRegion, previousRegion);
        newR.start = origStart + offset;
        newR.end = origStart + nextOffset;
        if (i == 0) {
          // On the first round, change this.
          this.end = newR.start;
          this.s = this.s.slice(0, offset);
          // Render me.
          this.renderRegion(location.parentNode, regionMap, location.nextSibling);
        }
        // The newR has no textNode. It will be redrawn in a moment.
        newR._inheritAnnotationDataFromPreviousRegion();
        newR.renderRegion(location.parentNode, regionMap, location.nextSibling);
        previousRegion = newR;        
      }
      previousRegion.nextRegion = nextRegion;
      if (nextRegion) {
        nextRegion.prevRegion = previousRegion;
      }
      return previousRegion;
    },

    _removeSpan: function() {
      var span = this.topNode;
      var parentNode = span.parentNode;
      var location = span.nextSibling;
      parentNode.removeChild(span);
      return {parentNode: parentNode, nextSibling: location};
    },

    // With this one, we delete both indices in the region map,
    // and sew the previous to the next of the next. Note that this
    // doesn't redefine the first region in the map, ever, so we
    // never have to update _firstRegion.
    removeAndRerender: function(regionMap) {
      
      var prevRegion = this.prevRegion;
      var nextRegion = this.nextRegion;
      
      var location = nextRegion._removeSpan();
      this._removeSpan();
      prevRegion._removeSpan();

      prevRegion.end = nextRegion.end;
      prevRegion.s = prevRegion.s + this.s + nextRegion.s;
      prevRegion.nextRegion = nextRegion.nextRegion;
      if (nextRegion.nextRegion) {
        nextRegion.nextRegion.prevRegion = prevRegion;
      }
      prevRegion.renderRegion(location.parentNode, regionMap, location.nextSibling);
      delete regionMap.indexToIndexReason[this.start];
      delete regionMap.indexToIndexReason[this.end];
    },

    // Note that this
    // doesn't redefine the first region in the map, ever, so we
    // never have to update _firstRegion.
    
    mergeWithNextAndRerender: function(regionMap) {
            
      var nextRegion = this.nextRegion;

      var location = nextRegion._removeSpan();
      this._removeSpan();
      var origEnd = this.end;
      this.end = nextRegion.end;
      this.s = this.s + nextRegion.s;
      this.nextRegion = nextRegion.nextRegion;
      if (nextRegion.nextRegion) {
        nextRegion.nextRegion.prevRegion = this;
      }
      this.renderRegion(location.parentNode, regionMap, location.nextSibling);
      delete regionMap.indexToIndexReason[origEnd];
    }

  });

/*
 *                    MAT.DocDisplay.SpanlessRegion
 *
 *
 * This object mimics the contents of Region above, for highlighting
 * and above/below span placement.
 *
 */
  
  MAT.DocDisplay.SpanlessRegion = function(rMap, tagLabel, contentAnnots) {
    
    this._regionMap = rMap;
    // For parallelism with the Region. We'll follow this linked list
    // when we highlight.

    this.nextRegion = null;
    this.prevRegion = null;
    // No start or end.
    this.tagLabel = tagLabel;

    // For compatibility with the spanned regions.
    this.inNewlineRegion = false;    
    this.hasZone = false;
    this.coversToken = false;
    this.startsToken = false;
    this.endsToken = false;
    this.hasUntaggable = false;
    this.inSegment = null;

    // Copy the array.
    this.contentAnnots = [];
    for (var i = 0; i < contentAnnots.length; i++) {
      this.contentAnnots.push(contentAnnots[i]);
    }

    // No noncontentAnnots.
    
    this.noncontentAnnots = [];

    // This is set by _renderSpan.
    this.textNode = null;
    this.topNode = null;

    // In _populateAnnotationData, these are dealt with in _computeCoveredContent.
    this.contentLayerBundles = [];
    this.contentLayerBundleDict = {};
    this.annotIDToAnnotLayerEntry = {};
    this.maxSuperContentLayer = 0;
    this.maxSubContentLayer = 0;
    // These two are never used, except to satisfy _positionSpanElements.
    this.maxSpanlessSuperContentLayer = 0;
    this.maxSpanlessSubContentLayer = 0;

    // Now, the annotation updates.

    this._populateAnnotationData();
  }

  MAT.Extend(MAT.DocDisplay.SpanlessRegion, {

    // I've structured this like the Region, just because.
    
    _populateAnnotationData: function () {
      
      var allLabList = this._computeCoveredContent();

      this.rtype = this.tagLabel;

      var idInput = null;
      if (allLabList.length > 0) {
        allLabList.sort();
        idInput = this.tagLabel + " " + allLabList.join(" ");
      } else {
        idInput = this.tagLabel;
      }
      // Use the typeCounter.
      this.id = idInput.replace(/ /g, "_") + this.contentAnnots[0].typeCounter;
    },
    
    _computeCoveredContent: function () {
      this.contentLayerBundles = [];
      this.contentLayerBundleDict = {};
      this.annotIDToAnnotLayerEntry = {};
      this.maxSuperContentLayer = 0;
      this.maxSubContentLayer = 0;
      var layerAssignments = this._regionMap._docDisplay.layerAssignments;
      
      var allLabList = [];
      var akeys = {};
      
      for (var i = 0; i < this.contentAnnots.length; i++) {
        var annot = this.contentAnnots[i];
        var labels = annot._computeCSSLabels();
        var assignment = layerAssignments[annot.id];
        var cls = assignment.layer;
        var param = assignment.position;
        var init = assignment.initial;
        var slug = cls+"_"+param;
        var entry = this.contentLayerBundleDict[slug];
        // This is all the information we're going to need for
        // rendering the span in the proper place, with
        // the appropriate styling, etc.
        if (entry === undefined) {
          entry = {
            layer: cls,
            position: param,
            margin: assignment.margin,
            annotEntries: [],
            assignmentInitials: {},
            allLabels: [],
            allAnnots: []
          }
          this.contentLayerBundleDict[slug] = entry;
          this.contentLayerBundles.push(entry);
          if (cls == "subLayer") {
            this.maxSubContentLayer = Math.max(param + 1, this.maxSubContentLayer);
          } else if (cls == "superLayer") {
            this.maxSuperContentLayer = Math.max(param + 1, this.maxSuperContentLayer);
          }
        }
        var annotEntry = {
          annot: annot,
          labels: labels.slice(0),
          // This is filled in by the renderer.
          contentSpan: null
        }
        if (init) {
          entry.assignmentInitials[init] = true;
        }
        entry.annotEntries.push(annotEntry);
        this.annotIDToAnnotLayerEntry[annot.id] = annotEntry;
        entry.allLabels = entry.allLabels.concat(labels);
        entry.allAnnots.push(annot);
        for (var j = 0; j < labels.length; j++) {
          if (!akeys[labels[j]]) {
            allLabList.push(labels[j]);
            akeys[labels[j]] = true;
          }
        }
      }
      this._regionMap._maybeAugmentStyleSheet(this);
      return allLabList;
    }

  });

/*
 *             MAT.DocDisplay.AnnotationNameDisplay
 *
 * The point of this utility class is to encapsulate a registered
 * display of an annotation. The formatted name of an annotation may contain
 * a reference to the span, or some of the features, or even the parent.
 * I've set up the format() method to provide the option of collecting all
 * the redisplay-relevant information in the formatted name, so I can
 * create a registerable display. This element is created with an annot
 * and a pointer to the UI (to get the display counter from),
 * then an optional params object containing formatParams (to be passed to format()),
 * menuActions (to be added as a popup menu), and span (if the caller wants to
 * provided a span).
 */

  MAT.DocDisplay.AnnotationNameDisplay = MAT.Class(function(annot, docPanel
                                                            /*, {formatParams: ..., menuActionCb: ...,
                                                               span: ..., displayStyle: ..., redisplayCb: ...} */) {
    this.docPanel = docPanel;
    this.displayId = docPanel.uiGetDisplayCounter();
    this.annot = annot;
    this.formatParams = null;
    this.menuActionCb = null;
    this.redisplayCb = null;
    this.span = null;
    // either "parentheses" or "linebreak"
    this.displayStyle = "parentheses";
    if (arguments.length == 3) {
      var params = arguments[2];
      if (params.formatParams) {
        this.formatParams = params.formatParams;
      }
      if (params.menuActionCb) {
        this.menuActionCb = params.menuActionCb;
      }
      if (params.span) {
        this.span = span;
      }
      if (params.displayStyle) {
        this.displayStyle = params.displayStyle;
      }
      if (params.redisplayCb) {
        this.redisplayCb = params.redisplayCb;
      }
    }
    if (!this.span) {
      this.span = MAT.Dom._buildElement("span");
    }

    var disp = this;
    
    this.span.onmouseover = function () {
      disp.docPanel.docDisplay.highlightAnnotation(disp.annot, "hlNeither", null);
      if (disp.menuActionCb) {
        MAT.Dom._addClasses(disp.span, "annotNameHover");
      }
    };

    this.span.onmouseout = function () {
      disp.docPanel.docDisplay.unhighlightAnnotation(disp.annot);
      if (disp.menuActionCb) {
        MAT.Dom._removeClasses(disp.span, "annotNameHover");
      }
    };

    if (this.menuActionCb) {
      // We only change color on hover if there's a menu to be raised.
      this.span.onclick = function (e) {
        var gestureBundle = disp.menuActionCb.call(disp);
        if (gestureBundle) {
          disp.docPanel.offerAnnotationPopup(e, gestureBundle);
        }      
      }
    }
    // I better not have annotContext in the parent formatParams.
    // You can't do this recursively.
    if (!this.formatParams) {
      this.formatParams = {};
    }
    if (this.displayStyle == "linebreak") {
      this.formatParams.returnPair = true;
    }

    this.draw();
    
  }, {

    draw: function() {
      // Do I unregister all the existing events for this display?
      // Probably. That's the easy way to do this - perhaps slow,
      // but otherwise I'll have to fiddle with callbacks that
      // register new events for other annotations. I don't
      // foresee that this will slow the system down unduly.
      this.annot.doc.rd.unregisterDisplay(this);
      this.formatParams.annotContext = {};
      // Format it, set it as the contents of the span.
      // If displayStyle is linebreak, this will be a pair.
      var s = this.annot.format(this.formatParams);
      this.span.innerHTML = "";
      if (this.displayStyle == "linebreak") {
        var children = [];
        if (s[1]) {
          // Let's put the name first.
          children.push(s[1]);
          if (s[0]) {
            children.push(MAT.Dom._buildElement("br"));
          }
        }
        if (s[0]) {
          children.push(s[0]);
        }
        MAT.Dom._augmentElement(this.span, {
          children: children
        });
      } else {
        MAT.Dom._augmentElement(this.span, {
          text: s
        });
      }
      var annotContext = this.formatParams.annotContext;
      for (var aId in annotContext) {
        if (annotContext.hasOwnProperty(aId)) {
          var events = [];
          var thisContext = annotContext[aId];
          if (thisContext.annot === this.annot) {
            // Toplevel.
            events.push({
              event_name: "remove_annotation",
              action: "remove"
            });
          }  else {
            // Not toplevel. When this annotation is
            // removed, what should we do? "redisplay" is always a good answer...
            events.push({
              event_name: "remove_annotation",
              action: "redisplay"
            });
          }
          if (thisContext.spanDisplayed || thisContext.textDisplayed) {
            events.push({
              event_name: "modify_extent",
              action: "redisplay"
            });
          }
          if (thisContext.attrsDisplayed) {
            events.push({
              event_name: "modify_annotation",
              action: "redisplay"
            });
          }
          if (thisContext.annotAttrsDisplayed) {
            events.push({
              event_name: "attach_child",
              action: "redisplay"
            });
            events.push({
              event_name: "detach_child",
              action: "redisplay"
            });
          }
          if (thisContext.parentDisplayed) {
            events.push({
              event_name: "attach_to_parent",
              action: "redisplay"
            });
            events.push({
              event_name: "detach_from_parent",
              action: "redisplay"
            });
          }

          this.annot.doc.rd.registerEvents(thisContext.annot, this, events);
        }
      }
    },

    // This is what we do to redraw.
    forceRedisplayResponse: function(events) {
      this.draw();
      if (this.redisplayCb) {
        this.redisplayCb.call(this);
      }
    },
    
    forceRemoveRedisplayResponse: function() {
      // Nothing needs to happen - the display is removed
      // when "remove" is executed.
    },

    unregister: function() {
      this.annot.doc.rd.unregisterDisplay(this);
    }
  });

/*
 *           MAT.DocDisplay.AnnotationNameDisplayCollection
 *
 * This class tracks a number of name displays as a function of the attribute
 * they fill in a larger annotation, and creates a span which appends this 
 * collection together. It's also used to point UPWARD, and create a collection
 * of descriptions of REFERENCES to the focal annotation.
 */

  MAT.DocDisplay.AnnotationNameDisplayCollection = MAT.Class(function (annot, docPanel, params) {
    if (arguments.length > 0) {
      this.annot = annot;
      this._docPanel = docPanel;
      this.displaySpan = null;
      // This cache is annotation IDs when pointing to an attribute of annot,
      // <id>_<attr> when pointing to a parent.
      this.nameDisplayCache = {};
      // What's in the params? All sorts of things, like child separators, etc.
      this.nameDisplayParams = {
        formatParams: {
          showFormattedName: true,
          showIndices: true
        }
      };
      if (params.nameDisplayParams) {
        for (var k in params.nameDisplayParams) {
          if (params.nameDisplayParams.hasOwnProperty(k)) {
            var v = params.nameDisplayParams[k];
            if (k == "formatParams") {
              for (var w in v.formatParams) {
                if (v.formatParams.hasOwnProperty(w)) {
                  this.nameDisplayParams.formatParams[w] = v.formatParams[w];
                }
              }
            } else {
              this.nameDisplayParams[k] = params.nameDisplayParams[k];
            }
          }
        }
      }
      this.multiplePrefix = params.multiplePrefix || null;
      this.multiplePostfix = params.multiplePostfix || null;
      this.multipleSeparator = params.multipleSeparator || null;
      this.nullOutput = null;

      this.attrObj = null;
      this.isParent = false;

      // Originally, I set prepareSpan directly to one or the other
      // of its options, but unfortunately, when you call a parent, its
      // methods aren't available at this point.
      if (params.attrObj) {
        this.attrObj = params.attrObj;
        this.nullOutput = params.nullOutput || null;
      } else if (params.isParent) {
        this.isParent = true;
      }
      this.enclosingSpan = params.enclosingSpan || null;
    }
  }, {

    prepareSpan: function (curVal) {
      if (this.isParent) {
        this.prepareParentSpan(curVal);
      } else if (this.attrObj) {
        this.prepareAttributeSpan(curVal);
      } else {
        this.displaySpan = null;
      }
      if (this.enclosingSpan) {
        this.enclosingSpan.innerHTML = "";
        this.enclosingSpan.appendChild(this.displaySpan);
      }
      return this.displaySpan;
    },

    // curValue is a list of references, where a reference looks like
    // {attr: aName, annot: annot}, as defined in _buildInverseIdDict() in mat_core. It
    // can also be null or an empty list. Very subtly different from prepareAttributeSpan.
    
    prepareParentSpan: function(curValue) {
      var docPanel = this._docPanel;
      var params = this.nameDisplayParams;
      
      var M = MAT.Dom._buildElement;

      var presentationChildren = [];
      // And again, we're going to have a problem
      // with the same element occurring multiple times in a list.
      var localAnnotHash = {};
      var origAnnotHash = this.nameDisplayCache;
      
      var a = this.annot;

      function addAnnotToChildren(ref) {
        var annot = ref.annot;
        var attr = ref.attr;
        var idx = annot.id + "_" + attr;
        var nameDisplay = origAnnotHash[idx];
        if (nameDisplay === undefined) {
          nameDisplay = new MAT.DocDisplay.AnnotationNameDisplay(annot, docPanel, params);
          nameDisplay.attrName = attr;
        }
        localAnnotHash[idx] = nameDisplay;
        presentationChildren.push("in " + attr + " of ");
        presentationChildren.push(nameDisplay.span);
      }
      
      this.displaySpan = null;
      if ((curValue == null) || ((curValue.constructor == Array) && (curValue.length == 0))) {
        // There's nothing. Do nothing.
      } else {
        if ((curValue.length > 1) && this.multiplePrefix) {
          presentationChildren.push(this.multiplePrefix);
        }
        for (var i = 0; i < curValue.length; i++) {
          if ((i > 0) && this.multipleSeparator) {
            presentationChildren.push(this.multipleSeparator);
          }          
          var ref = curValue[i];
          addAnnotToChildren(ref);
        }
        if ((curValue.length > 1) && this.multiplePostfix) {
          presentationChildren.push(this.multiplePostfix);
        }
        this.displaySpan = M("span", {children: presentationChildren});
      }       
      
      for (var k in this.nameDisplayCache) {
        if (this.nameDisplayCache.hasOwnProperty(k)) {
          if (localAnnotHash[k] === undefined) {
            // It's in the old one, but not in the new one. Kill it.
            this.nameDisplayCache[k].unregister();
          }
        }
      }
      // And now, update the local hash.
      this.nameDisplayCache = localAnnotHash;
      return this.displaySpan;
    },

    // The curValue is null, or an annotation, or an AttributeValueList or AttributeValueSet.

    // This has to do the right thing for aggregations.
    // Note that I can't use convertToString, because that looks at the attrObj
    // for guidance, and the attrObj will then try to render an element of the
    // attr value as a sequence rather than an annotation.

    // The first thing this method does is update the internal mapping
    // from annotation IDs to name displays, as it's assembling its children.

    prepareAttributeSpan: function(curValue) {
      var attrObj = this.attrObj;
      var docPanel = this._docPanel;
      var params = this.nameDisplayParams;
      
      var M = MAT.Dom._buildElement;

      var presentationChildren = [];
      // And again, we're going to have a problem
      // with the same element occurring multiple times in a list.
      var localAnnotHash = {};
      var origAnnotHash = this.nameDisplayCache;
      
      var a = this.annot;

      function addAnnotToChildren(annot) {
        var nameDisplay = origAnnotHash[annot.id];
        if (nameDisplay === undefined) {
          nameDisplay = new MAT.DocDisplay.AnnotationNameDisplay(annot, docPanel, params);
        }
        localAnnotHash[annot.id] = nameDisplay;
        presentationChildren.push(nameDisplay.span);
      }
      
      if (curValue == null) {
        if (this.nullOutput) {
          presentationChildren.push(this.nullOutput);
        }
      } else if (!attrObj.aggregation) {
        addAnnotToChildren(curValue);
      } else {
        var size = curValue.size();
        if (this.multiplePrefix) {
          presentationChildren.push(this.multiplePrefix);
        }
        for (var i = 0; i < size; i++) {
          var subVal = curValue.elements[i];
          if ((i > 0) && this.multipleSeparator) {
            presentationChildren.push(this.multipleSeparator);
          }
          addAnnotToChildren(subVal);
        }
        if (this.multiplePostfix) {
          presentationChildren.push(this.multiplePostfix);
        }
      }
      for (var k in this.nameDisplayCache) {
        if (this.nameDisplayCache.hasOwnProperty(k)) {
          if (localAnnotHash[k] === undefined) {
            // It's in the old one, but not in the new one. Kill it.
            this.nameDisplayCache[k].unregister();
          }
        }
      }
      // And now, update the local hash.
      this.nameDisplayCache = localAnnotHash;
      this.displaySpan = M("span", {children: presentationChildren});
      return this.displaySpan;
    },

    clear: function() {
      for (var k in this.nameDisplayCache) {
        if (this.nameDisplayCache.hasOwnProperty(k)) {
          this.nameDisplayCache[k].unregister();
        }
      }
      this.nameDisplayCache = {};
    }
    
  });

/*
 *                    MAT.DocDisplay.CellDisplay
 *
 *
 * So we need control over our own cell display. I thought about torturing
 * YUI into doing this right, but I think I need more versatility than that -
 * I may want to embed this under a different window toolkit. We're already
 * halfway there, so let's do this anyway.
 *
 */

  MAT.DocDisplay.CellDisplay = {
    
    selectCellDisplay: function (attrObj) {

      var n = "ReadOnlyCellDisplay";

      if (attrObj.display && attrObj.display.read_only) {
        n = "ReadOnlyCellDisplay";
      } else if (attrObj.aggregation && (attrObj._typename != "annotation") && !(attrObj.choices && (attrObj.aggregation == "set"))) {
        // Can't do these yet. We're going to make an exception for annotations.
        // We're going to migrate all this to the DataTable implementation anyway,
        // so I don't mind special-casing this for right now.
        n = "ReadOnlyCellDisplay";
      } else if (attrObj._typename == "boolean") {
        n = "BooleanCellDisplay";
      } else if (attrObj._typename == "int") {
        if (attrObj.display && attrObj.display.custom_editor) {
          n = "IntCustomEditorCellDisplay";
        } else {
          n = "IntCellDisplay";
        }
      } else if (attrObj._typename == "float") {
        if (attrObj.display && attrObj.display.custom_editor) {
          n = "FloatCustomEditorCellDisplay";
        } else {
          n = "FloatCellDisplay";
        }
      } else if (attrObj._typename == "string") {
        if (attrObj.choices) {
          n = "StringMenuCellDisplay";
        } else if (attrObj.display && attrObj.display.custom_editor) {
          n = "StringCustomEditorCellDisplay";
        } else {
          n = "StringCellDisplay";
        }          
      } else if (attrObj._typename == "annotation") {
        n = "AnnotationCellDisplay";
      } else {
        n = "ReadOnlyCellDisplay";
      }
      return MAT.DocDisplay.CellDisplay[n];
    }
  };

  var CD = MAT.DocDisplay.CellDisplay;

  CD.formatURLLink = function (nameSpec, annot, anchorChildren) {
    var pat = new RegExp("[$][(]([^)]+)[)]", "g");
    var result;
    var sList = [];      
    var lastI = 0;
    while ((result = pat.exec(nameSpec)) != null) {
      sList.push(nameSpec.substring(lastI, result.index));          
      var m = result[1];
      if (m == "_text") {
        if (annot.atype.hasSpan) {
          var spanned = annot.doc.signal.substring(annot.start, annot.end);
          sList.push(encodeURI(spanned));
        } else {
          sList.push(encodeURI("(spanless text)"));
        }
      } else {
        var v = annot.getAttributeValue(m);
        var attrObj = annot.atype.attrs[annot.atype.attrTable[m]];
        if (v === undefined) {
          sList.push(encodeURI("(undefined)"));
        } else if (attrObj._typename == "annotation") {
          sList.push(encodeURI("(unrenderable annotation)"));
        } else {
          sList.push(encodeURI(attrObj.convertToString(v)));
        }
      }
      lastI = pat.lastIndex;
    }
    sList.push(nameSpec.substring(lastI));
    return B("A", {attrs: {target: "_blank", href: sList.join("")}, children: anchorChildren});
  };

  // I'll definitely need a backpointer to the doc display, for
  // choose mode.
  
  // Here's an issue: the cell might enter choose mode, but we may
  // need to know HOW it entered choose mode; e.g., the popup
  // may need to cancel choose mode when it's closed, or the
  // table might need to cancel choose mode when a different table
  // is selected.    

  CD.BaseCellDisplay = MAT.Class(function (attrObj, mgr /*, {docPanel: ..., editable: ..., eventSource: ..., editSuccessCb: ...} */) {
    if (arguments.length > 0) {
      this.attrObj = attrObj;
      // This is a popup manager.
      this.mgr = mgr;
      this.convertor = null;
      this.editable = true;
      this.eventSource = null;
      this.editSuccessCb = null;
      this.docPanel = null;
      if (arguments.length > 2) {
        var params = arguments[2];
        if (params.editable !== undefined) {
          this.editable = params.editable;
        }
        this.eventSource = params.eventSource;
        this.editSuccessCb = params.editSuccessCb;
        this.docPanel = params.docPanel;
      }
    }
  }, {
    // The idea is that what comes back is a list which will be
    // rendered into a particular location. The children may be
    // strings or elements.
    getTypeDescriptionChildren: function (/* {break: false} */) {
      var breakIt = false;
      if (arguments.length > 0) {
        breakIt = arguments[0]['break'] || false;
      }
      var tString = this.attrObj._typename;
      if (this.attrObj.aggregation) {
        tString = this.attrObj.aggregation + " of " + tString + "s";
      }
      var descrSuffixDescriptor = this.getDescriptionSuffix();
      if (!descrSuffixDescriptor) {
        return [tString];
      } else {
        // surgically alter it.
        if (breakIt && descrSuffixDescriptor.breakable) {
          descrSuffixDescriptor.elementList.splice(0, 0, tString, ":", B("br"));
        } else {
          descrSuffixDescriptor.elementList.splice(0, 0, tString, ": ");
        }
        return descrSuffixDescriptor.elementList;
      }
    },

    valToDisplayChildren: function(annot, val) {
      if ((val === null) || (val === undefined)) {
        return ["(null)"];
      } else if (this.attrObj.display && this.attrObj.display.url_link) {
        return [CD.formatURLLink(this.attrObj.display.url_link, annot, [this.attrObj.convertToString(val)])];
      } else {
        return [this.attrObj.convertToString(val)];
      }
    },

    getDescriptionSuffix: function() {
      return null;
    },

    annotToDisplayChildren: function(annot) {
      return this.valToDisplayChildren(annot, annot.getAttributeValue(this.attrObj.name));
    },

    // This returns a list of child elements which can support modifying
    // this attribute of the annotation.
    
    valToEditChildren: function(annot, val) {
      return ["not editable"];
    },

    annotToEditChildren: function(annot) {
      return this.valToEditChildren(annot, annot.getAttributeValue(this.attrObj.name));
    },

    // This is called whenever the edit is cancelled, through whatever means.
    // Note that this does NOT necessarily mean that it should revert to its display.
    // The judgment of when to do that is left to the caller.
    cancelEdit: function (annot) {
    },

    // Called whenever the parent container is hidden.
    hide: function () {
    },

    // General cleanup for when the element holding the cell is destroyed.
    close: function() {
    },

    // Private

    // This must know what to do with aggregations. It will never
    // be given an aggregation directly; it'll only be given
    // elements of it. v can be null.

    // All sorts of things can happen in response to a modification.  
    // The question is, how much do they all need to be distinguished?
    // So first, the redisplay function is for event firing. Different
    // calls may provide different redisplay functions. And the problem
    // is that this function is called from the used-in list, too.
  
    _maybeSetAttributeValue: function(annot, v) {
      if (this.convertor && (v !== null)) {
        v = this.convertor(v);
      }
      var events = annot.addAttributeValueViaUI(this.attrObj.name, v, this.eventSource, this.mgr);
      if (events) {
        this.docPanel.docDisplay._reportAnnotationResultsCore(events, null, {
          markHandAnnotated: true,
          reportHandAnnotationPerformed: true,
          log: true
        });
        if (this.editSuccessCb) {
          this.editSuccessCb();
        }
        return true;
      } else {
        return false;
      }
    },

    _maybeSetAttributeValuesWithoutEventSource: function(annot, hash) {
      // I don't want the event source here, because I want to force the
      // redraw of the source. This is used in multi-attribute custom editors.
      var events = annot.addAttributeValuesViaUI(hash, null, this.mgr);
      if (events) {
        this.docPanel.docDisplay._reportAnnotationResultsCore(events, null, {
          markHandAnnotated: true,
          reportHandAnnotationPerformed: true,
          log: true
        });
        if (this.editSuccessCb) {
          this.editSuccessCb();
        }
        return true;
      } else {
        return false;
      }
    },

    _maybeRemoveAttributeValue: function(annot, v) {
      if (this.convertor && (v !== null)) {
        v = this.convertor(v);
      }
      var events = annot.removeAttributeValueViaUI(this.attrObj.name, v, this.eventSource, this.mgr);
      if (events) {
        this.docPanel.docDisplay._reportAnnotationResultsCore(events, null, {
          markHandAnnotated: true,
          reportHandAnnotationPerformed: true,
          log: true
        });
        if (this.editSuccessCb) {
          this.editSuccessCb();
        }
        return true;
      } else {
        return false;
      }
    },

    // I think that the only useful way of doing this for multi-selects
    // is to just replace the entire value.
    
    _genericMenuCb: function(annot, menu) {
      if (menu.multiple) {
        var vals = [];
        for (var i = 0; i < menu.options.length; i++) {
          if (menu.options[i].selected) {
            var val = menu.options[i].value;
            if (this.convertor) {
              val = this.convertor(val);
            }
            vals.push(val);
          }
        }
        var v;
        if (this.attrObj.aggregation == "set") {
          v = new MAT.Annotation.AttributeValueSet(vals);
        } else {
          v = new MAT.Annotation.AttributeValueList(vals);
        }
        // We've already converted.
        this._maybeSetAttributeValue(annot, v);
      } else {
        if (menu.selectedIndex == 0) {
          this._maybeSetAttributeValue(annot, null);
        } else {
          var v = menu.options[menu.selectedIndex].value;
          this._maybeSetAttributeValue(annot, v);
        }
      }
    }
    
  });
    
  CD.ReadOnlyCellDisplay = MAT.Class(function (attrObj) {
    CD.BaseCellDisplay.call(this, attrObj);
    this.editable = false;
  }, CD.BaseCellDisplay, {

    getDescriptionSuffix: function() {
      return {breakable: true, elementList: ["not editable"]}
    }
  });

  CD.BooleanCellDisplay = MAT.Class(function (/* arguments */) {
    CD.BaseCellDisplay.apply(this, arguments);
  }, CD.BaseCellDisplay, {

    valToEditChildren: function (annot, curValue) {

      var radioID = "mat_radio_" + this.constructor.prototype.radioCounter;
      this.constructor.prototype.radioCounter++;

      var v = this;
      var radioYes = B("input", {attrs: {checked: curValue === true, type: "radio",
                                         name: radioID, value: "yes",
                                         onchange: function () {
                                           v._setCb(annot, this);
                                         }}});
      
      var radioNo = B("input", {attrs: {checked: curValue === false, type: "radio",
                                        name: radioID, value: "no",
                                        onchange: function () {
                                          v._setCb(annot, this);
                                        }}});
      return {
        children: [radioYes, " yes ", radioNo, " no ",
                   B("input", {attrs: {type: "button", value: "Unset",
                                       onclick: function () {
                                         v._clearCb(annot, radioYes, radioNo);
                                       }
                                      }
                              })
                  ],
        firstFocusableElement: radioYes
      };
      
    },

    // Private
    
    _radioCounter: 0,

    _setCb: function (annot, radio) {
      var v = radio.value;
      if (v == "yes") {
        v = true;
      } else if (v == "no") {
        v = false;
      }
      this._maybeSetAttributeValue(annot, v);
    },

    _clearCb: function (annot, radioY, radioN) {
      if (this._maybeSetAttributeValue(annot, null)) {
        radioY.checked = false;
        radioN.checked = false;
      }
    }

  });
    

  CD.IntCellDisplay = MAT.Class(function (attrObj, mgr /*, parentParams */) {
    var parentParams = {};
    if (arguments.length > 2) {
      parentParams = arguments[2];
      this.permittedChoiceAttributes = parentParams.permittedChoiceAttributes;
    }
    CD.BaseCellDisplay.call(this, attrObj, mgr, parentParams);
    this.convertor = function (v) {
      if (v == null) {
        return null;
      } else if (v.constructor === String) {
        if (v.length == 0) {
          return null;
        } else {
          return parseInt(v);
        }
      } else {
        return v;
      }
    }
  }, CD.BaseCellDisplay, {

    valToEditChildren: function (annot, curValue) {
      if (this.attrObj.choices) {
        var menu;
        if (this.attrObj.aggregation) {
          var children = [];
          for (var k in this.attrObj.choices) {
            if (this.attrObj.choices.hasOwnProperty(k)) {
              var w = parseInt(k);
              children.push({label: "option",
                             text: k,
                             attrs: {selected: curValue ? curValue.contains(w) : false}});
            }
          }
          menu = B("select", {
            attrs: {multiple: true, size: children.length},
            children: children
          });
        } else {
          // Show a menu. NOTE: certain options should be disabled if
          // you're attached to other annotations. permittedChoiceAttributes
          // should be set.
          var attrEntry;
          if (this.permittedChoiceAttributes) {
            attrEntry = this.permittedChoiceAttributes[this.attrObj.name];
          }
          menu = B("select", {
            children: [{label: "option",
                        attrs: {
                          disabled: attrEntry ? (!attrEntry.nullCandidate) : false
                        },
                        text: "(null)"}]
          });
          for (var k in this.attrObj.choices) {
            if (this.attrObj.choices.hasOwnProperty(k)) {
              var w = parseInt(k);
              A(menu, B("option", {
                text: k,
                attrs: {
                  selected: w == curValue,
                  disabled: attrEntry ? (!attrEntry.valCandidates[k]) : false
                }
              }));
            }
          }
        }
        var v = this;
        menu.onchange = function () {
          v._genericMenuCb(annot, menu);
        }
        return {
          children: [menu],
          firstFocusableElement: menu
        }
      } else {
        var v = this;
        var input = B("input", {attrs: {type: "text", value: curValue || "",
                                        onchange: function () {
                                          if (!v._maybeSetAttributeValue(annot, this.value)) {
                                            // Set it back to what it was.
                                            this.value = curValue || "";
                                          }  
                                        }
                                       }
                               }
                     );
        
        // No need for a clear button.
        return {
          children: [input],
          firstFocusableElement: input
        }
      }
    },

    getDescriptionSuffix: function() {
      if (this.attrObj.minval != null) {
        if (this.attrObj.maxval != null) {
          return {elementList: [this.attrObj.minval + " <= i <= " + this.attrObj.maxval]};
        } else {
          return {elementList: ["i >= " + this.attrObj.minval]};
        }
      } else if (this.attrObj.maxval != null) {
        return {elementList: ["i <= " + this.attrObj.maxval]};
      }
    }
  });
     
  CD.FloatCellDisplay = MAT.Class(function (/* arguments */) {
    CD.BaseCellDisplay.apply(this, arguments);
    this.convertor = function (v) {
      if (v == null) {
        return null;
      } else if (v.constructor === String) {
        if (v.length == 0) {
          return null;
        } else {
          return parseFloat(v);
        }
      } else {
        return v;
      }
    }     
  }, CD.BaseCellDisplay, {

    valToEditChildren: function (annot, curValue) {
      var v = this;
      var input = B("input", {attrs: {type: "text", value: curValue || "",
                                      onchange: function () {
                                        if (!v._maybeSetAttributeValue(annot, this.value)) {
                                          // Set it back to what it was.
                                          this.value = curValue || "";
                                        }
                                      }
                                     }
                             }
                   );
      // No need for a clear button.
      return {
        children: [input],
        firstFocusableElement: input
      }
    },

    getDescriptionSuffix: function() {
      if (this.attrObj.minval != null) {
        if (this.attrObj.maxval != null) {
          return {elementList: [this.attrObj.minval + " <= i <= " + this.attrObj.maxval]};
        } else {
          return {elementList: ["i >= " + this.attrObj.minval]};
        }
      } else if (this.attrObj.maxval != null) {
        return {elementList: ["i <= " + this.attrObj.maxval]};
      }
    }
  });

  CD.StringMenuCellDisplay = MAT.Class(function (attrObj, mgr /*, parentParams */) {
    var parentParams = {};
    if (arguments.length > 2) {
      parentParams = arguments[2];
      this.permittedChoiceAttributes = parentParams.permittedChoiceAttributes;
    }
    CD.BaseCellDisplay.call(this, attrObj, mgr, parentParams);
  }, CD.BaseCellDisplay, {

    valToEditChildren: function (annot, curValue) {
      var menu;
      if (this.attrObj.aggregation) {
        var children = [];
        for (var k in this.attrObj.choices) {
          if (this.attrObj.choices.hasOwnProperty(k)) {
            children.push({label: "option",
                           text: k,
                           attrs: {selected: curValue ? curValue.contains(k) : false}});
          }
        }
        menu = B("select", {
          attrs: {multiple: true, size: children.length},
          children: children
        });
      } else {
        // Show a menu. NOTE: certain options should be disabled if
        // you're attached to other annotations. permittedChoiceAttributes
        // should be set.
        var attrEntry;
        if (this.permittedChoiceAttributes) {
          attrEntry = this.permittedChoiceAttributes[this.attrObj.name];
        }
        menu = B("select", {
          children: [{label: "option",
                      attrs: {
                        disabled: attrEntry ? (!attrEntry.nullCandidate) : false
                      },
                      text: "(null)"}]
        });
        for (var k in this.attrObj.choices) {
          if (this.attrObj.choices.hasOwnProperty(k)) {
            A(menu, B("option", {
              text: k,
              attrs: {
                selected: k == curValue,
                disabled: attrEntry ? (!attrEntry.valCandidates[k]) : false
              }
            }));
          }
        }
      }
      var v = this;
      menu.onchange = function () {
        v._genericMenuCb(annot, menu);
      }
      return {
        children: [menu],
        firstFocusableElement: menu
      }
    }
  });

  // If the custom editor function can't be found, we should barf, but
  // when? The problem is, you'd need to create a warning. 
  
  CD.CustomEditorCellDisplay = MAT.Class(function (/* arguments */) {
    if (arguments.length > 0) {
      CD.BaseCellDisplay.apply(this, arguments);
      this._annotIDToCustomEditor = {}
      // Only for strings, right now. If there's a custom editor, make sure it exists first.          
      this.eFn = undefined;
      try {
        this.eFn = eval(this.attrObj.display.custom_editor);
        if (this.eFn === undefined) {
          this.editable = false;
        }
      } catch (e) {
        // This may be a TypeError (if the toplevel element exists
        // but is the wrong type) or a ReferenceError (if the toplevel
        // element does not exist.
        this.editable = false;
      }
      if (this.attrObj.custom_editor_is_multiattribute) {
        // We don't want an event source in this case - just
        // have forceRedisplay redraw everything.
        this.eventSource = null;
      }
    }
  }, CD.BaseCellDisplay, {

    getDescriptionSuffix: function() {
      if (this.eFn === undefined) {
        return {breakable: true, elementList: ["not editable; custom editor not found"]}
      } else {
        return null;
      }
    },
    
    valToEditChildren: function (annot, curValue) {
      // If we get this far, this.editable is true.
      var txtSpan = B("span", {children: [this._formatValue(curValue || null)]});
      // Embed this one level down to make it easier to update.
      var v = this;
      // Put a button below, and make sure when the window is hidden, or
      // anything, the function that's returned by eFn is called (it's
      // the destroy function for the edit widget).
      var label = "Edit";
      if (this.attrObj.display && this.attrObj.display.custom_editor_button_label) {
        label = this.attrObj.display.custom_editor_button_label;
      }
      return {
        children: [txtSpan, B("br"),
                   B("input", {attrs: {type: "button", value: label,
                                       onclick: function () {
                                         v._editCb(annot, txtSpan);
                                       }
                                      }
                              }), " ",
                   B("input", {attrs: {type: "button", value: "Unset",
                                       onclick: function () {
                                         v._unsetCb(annot, txtSpan);
                                       }
                                      }
                              })]
      }
    },

    cancelEdit: function (annot) {
      // What's stashed here is the cancel function.
      if (this._annotIDToCustomEditor[annot.id]) {
        this._annotIDToCustomerEditor[annot.id]();
        delete this._annotIDToCustomEditor[annot.id];
      }
      CD.BaseCellDisplay.prototype.cancelEdit.call(this);
    },

    close: function () {
      for (var k in this._annotIDToCustomEditor) {
        if (this._annotIDToCustomEditor.hasOwnProperty(k)) {
          this._annotIDToCustomEditor[k]();
        }
      }
      this._annotIDToCustomEditor = {};
      CD.BaseCellDisplay.prototype.close.call(this);
    },

    // When we hide the container, we want to cancel the
    // custom edit.
    hide: function () {
      for (var k in this._annotIDToCustomEditor) {
        if (this._annotIDToCustomEditor.hasOwnProperty(k)) {
          this._annotIDToCustomEditor[k]();
        }
      }
      this._annotIDToCustomEditor = {};
      CD.BaseCellDisplay.prototype.hide.call(this);
    },

    // I don't think anything will be using this.
    _formatValue: function (txt) {
      return txt;
    },
    
    // We need to make sure that for this annotation and column, we can only
    // bring up one editor at a time; and if the edit is cancelled,
    // we make sure that the window (which we may not have the ability
    // to close) doesn't change anything later.

    // the eFn returns a closing function, which will forcibly close
    // the custom editor.

    _editCb: function (annot, txtSpan) {
      // inputV is the current value of the attribute.
      // If it's multiattribute, the value returned is a hash. Otherwise
      // it's just a value.
      var attrObj = this.attrObj;
      var disp = this;
      if (!this._annotIDToCustomEditor[annot.id]) {
        // So custom editors don't need to be interactive - they can just
        // do some computation in the backend. What this means is that I
        // have to know that eFn is guaranteed to return before any
        // failure is registered, because I use the presence of the
        // cancellation element as a reason to process the result.
        // So the first thing I should do is set a hack: an empty function.
        this._annotIDToCustomEditor[annot.id] = function () {};
        // Now, it's present, and it can be called if it has to be.
        this._annotIDToCustomEditor[annot.id] = this.eFn(annot, attrObj.name, function (r) {
          // If it hasn't been deleted due to a cancel or close...
          if (disp._annotIDToCustomEditor[annot.id]) {
            delete disp._annotIDToCustomEditor[annot.id];            
            if (attrObj.display.custom_editor_is_multiattribute) {              
              // r is a hash. Redraw of the entire widget will
              // happen here. Or not. I think the plumbing should be
              // such that if we have a null event source (see initializer above),
              // forceRedisplay will take care of everything.
              disp._maybeSetAttributeValuesWithoutEventSource(annot, r);
            } else {
              // r is a value. We're responsible for redraw of this value.
              if (disp._maybeSetAttributeValue(annot, r)) {
                // Redraw here. If the value is null or an empty string,
                // use that, otherwise, use r.                
                // There should only be one.
                txtSpan.removeChild(txtSpan.firstChild);
                txtSpan.appendChild(disp._formatValue(r));
              }
            }
          }
        }, function () {
          // This is the cancel callback.
          if (disp._annotIDToCustomEditor[annot.id]) {
            delete disp._annotIDToCustomEditor[annot.id];
          }
        });
      }
    },

    _unsetCb: function (annot, txtSpan) {
      if (this._maybeSetAttributeValue(annot, null)) {
        // There should only be one.
        txtSpan.removeChild(txtSpan.firstChild);
        txtSpan.appendChild(B("span", {text: "(null)", style: {color: "gray"}}));
      }
    }

  });

  CD.StringCustomEditorCellDisplay = MAT.Class(function(/* arguments */) {
    CD.CustomEditorCellDisplay.apply(this, arguments);
  }, CD.CustomEditorCellDisplay, {
        
    _formatValue: function (txt) {
      var bg = null;
      if (txt == "") {
        bg = "gray";
        txt = "(zero-length string)";
      } else if (txt === null) {
        bg = "gray";
        txt = "(null)";
      }
      return B("span", {text: txt, style: {color: bg}}); 
    }

  });

  CD.IntCustomEditorCellDisplay = MAT.Class(function(/* arguments */) {
    CD.CustomEditorCellDisplay.apply(this, arguments);
  }, CD.CustomEditorCellDisplay, {
        
    _formatValue: function (v) {
      var bg = null;
      var txt;
      if (v === null) {
        bg = "gray";
        txt = "(null)";
      } else {
        txt = "" + v;
      }
      return B("span", {text: txt, style: {color: bg}}); 
    }

  });

  CD.FloatCustomEditorCellDisplay = MAT.Class(function(/* arguments */) {
    CD.CustomEditorCellDisplay.apply(this, arguments);
  }, CD.CustomEditorCellDisplay, {
        
    _formatValue: function (v) {
      var txt;
      var bg = null;
      if (v === null) {
        bg = "gray";
        txt = "(null)";
      } else {
        txt = "" + v;
        if ((Math.floor(v) === v) && (txt.indexOf(".") == -1)) {
          txt += ".0";
        }
      }
      return B("span", {text: txt, style: {color: bg}}); 
    }

  });

  CD.StringCellDisplay = MAT.Class(function (/* arguments */) {
    CD.BaseCellDisplay.apply(this, arguments);
  }, CD.BaseCellDisplay, {

    valToEditChildren: function (annot, curValue) {
      var input;
      var attrObj = this.attrObj;
      if (attrObj.display && (attrObj.display.editor_style == "long_string")) {
        // Add a textarea.
        input = B("textarea", {attrs: {rows: "3", columns: "20"}});
      } else {
        // Add a typein.
        input = B("input", {attrs: {type: "text"}});
      } 
      var v = this;
      this._setStringInput(input, curValue);          
      input.onchange = function () { v._setCb(annot, input); };
      input.onblur = function () { v._blurCb(annot, input); };
      return {
        children: [input, B("br"),
                   B("input", {attrs: {type: "button", value: "Use zero-length string",
                                       onclick: function () {
                                         v._emptyStringCb(annot, input);
                                       }
                                      }
                              }), " ",
                   B("input", {attrs: {type: "button", value: "Unset",
                                       onclick: function () {
                                         v._clearCb(annot, input);
                                       }
                                      }
                              })],
        firstFocusableElement: input
      };
    },

    // Private
    
    _setStringInput: function(input, curValue) {
      if (curValue == "") {
        input.value = "(zero-length string)";
        input.style.color = "gray";
        input.onfocus = function() {
          input.value = "";
          input.onfocus = null;
          input.style.color = null;
        }
      } else if (curValue == null) {
        input.value = "(null)";
        input.style.color = "gray";
        input.onfocus = function() {
          input.value = "";
          input.onfocus = null;
          input.style.color = null;
        }
      } else {
        input.value = curValue;
        input.onfocus = null;
        input.style.color = null;
      }
    },

    _setCb: function (annot, input) {
      this._maybeSetAttributeValue(annot, input.value);
    },

    _blurCb: function(annot, input) {
      var curValue = annot.getAttributeValue(this.attrObj.name);
      if ((curValue == null) || (curValue == "")) {
        this._setStringInput(input, curValue);
      }
    },
    
    _clearCb: function (annot, input) {
      if (this._maybeSetAttributeValue(annot, null)) {
        this._setStringInput(input, null);
      }
    },
      
    _emptyStringCb: function(annot, input) {
      if (this._maybeSetAttributeValue(annot, "")) {
        this._setStringInput(input, "");
      }
    }
    
  });

  // The annotation display is an issue, because choose mode needs to know
  // what the choose mode source is, which is the popup, not the cell.

  CD.AnnotationCellDisplay = MAT.Class(function (attrObj, mgr /*, parentParams */) {
    // There better damn well be parent params.
    var parentParams = {};
    if (arguments.length > 2) {
      parentParams = arguments[2];
      // And the choose mode host. This element must support a
      // version of the choose mode API.
      this.chooseModeHost = parentParams.chooseModeHost;
      delete parentParams.chooseModeHost;
    }
    CD.BaseCellDisplay.call(this, attrObj, mgr, parentParams);
    this.annotDisplays = {};
  }, CD.BaseCellDisplay, {

    valToDisplayChildren: function(annot, curValue) {
      return [this._getAnnotDisplay(annot).prepareAnnotationPresentation(curValue)];
    },

    valToEditChildren: function (annot, curValue) {
      
      // I'm pretty sure that we handle aggregations in the _prepareAnnotationPresentation
      // and _prepareAnnotationPresentationChildren methods.
        
      // Hm. What do we do here? First, we need to present the existing filler. Then, we need
      // a button to change it. The button should enable annotation, and the annotation selector
      // should present only those permitted possibilities for labeling, if the user has swiped.
             
      var annotDisplay = this._getAnnotDisplay(annot);
      
      return {
        children: [annotDisplay.prepareAnnotationPresentation(curValue)],
        firstFocusableElement: annotDisplay.focusElement
      }
    },

    getDescriptionSuffix: function() {

      if (this.editable) {

        var descrSuffix = [];
        // At the moment, until I make the popups resizeable, I don't want this list
        // to force the popup to be horribly long.
        var attrObj = this.attrObj;
        var stringRestrictions = [];
        var j = 0;
        if (attrObj.atomicLabelRestrictions) {
          for (var w in attrObj.atomicLabelRestrictions) {
            if (attrObj.atomicLabelRestrictions.hasOwnProperty(w)) {
              if (j > 0) {
                stringRestrictions.push(", ");
                if ((j % 3) == 0) {
                  stringRestrictions.push(B("br"));
                }
              }
              j += 1;
              stringRestrictions.push(w);
            }
          }
        }
        if (attrObj.digestedComplexLabelRestrictions) {
          for (var k in attrObj.digestedComplexLabelRestrictions) {
            if (attrObj.digestedComplexLabelRestrictions.hasOwnProperty(k)) {
              var entries = attrObj.digestedComplexLabelRestrictions[k];
              for (var q = 0; q < entries.length; q++) {
                if (j > 0) {
                  stringRestrictions.push(", ");
                  if ((j % 3) == 0) {
                    stringRestrictions.push(B("br"));
                  }
                }
                var entry = entries[q];
                // see digestLabelRestrictions in mat_core.js for structure.
                var lab = entry.fromEffectiveLabel || entry.label;
                var displayAttrs = entry.creationAttrs;
                if (displayAttrs && (displayAttrs.length > 0)) {
                  var sList = [lab];
                  for (var w = 0; w < displayAttrs.length; w++) {
                    sList.push(displayAttrs[w][0] + "=" + displayAttrs[w][1]);
                  }
                  // This should always go on a new line. So force
                  // j = 3.
                  stringRestrictions.push(sList.join(" "));
                  j = 3;
                } else {
                  // Increment the way you would otherwise.
                  stringRestrictions.push(lab);
                  j += 1;
                }
              }
            }
          }
        }

        if (stringRestrictions.length > 1) {
          descrSuffix = ["one of "].concat(stringRestrictions);
        } else if (stringRestrictions.length > 0) {
          descrSuffix = [stringRestrictions[0]];
        }
  
        return {
          breakable: true,
          elementList: descrSuffix
        }
      } else {
        return {elementList: ["not editable"]};
      }
    },

    close: function() {
      for (var k in this.annotDisplays) {
        if (this.annotDisplays.hasOwnProperty(k)) {
          this.annotDisplays[k].clear();
        }
      }
      CD.BaseCellDisplay.prototype.close.call(this);
    },

    // Private

    // These are cached for redraw. They're only cleared when the display
    // is closed.
    
    _getAnnotDisplay: function(annot) {
      var annotDisplay = this.annotDisplays[annot.id];
      if (annotDisplay === undefined) {
        annotDisplay = new this._attributeDisplayCls(annot, this);
        this.annotDisplays[annot.id] = annotDisplay;
      }
      return annotDisplay;
    },

    // This display is the display for the rendering of the annotation value
    // of the annotation-valued attributes. The register/unregister
    // for this is handled when initial display is created, and when
    // the values are added or removed.
    
    // I'm going to implement forceRemoveRedisplayResponse,
    // but it's not clear to me that it's useful, since it can't happen
    // unless the parent annotation was already deleted.

    // This display works in tandem with the annotation name displays -
    // the name displays do the work of updating the individual annotations,
    // and this display takes care of when annotations are added or removed.

    // The annotation editor view redraws itself every time something
    // changes - it completely ignores the details. This includes when a
    // child is attached and detached. But it doesn't have to register/unregister
    // this display, and it shouldn't. So this display should be cacheing
    // a map from its attrObj values to the name displays, and redrawing
    // from that cache.
    
    _attributeDisplayCls: MAT.Class(function (annot, cellDisplay) {
      this.annot = annot;
      this.cellDisplay = cellDisplay;
      var disp = this;
      MAT.DocDisplay.AnnotationNameDisplayCollection.call(this, annot, this.cellDisplay.docPanel, {
        attrObj: this.cellDisplay.attrObj,
        multiplePrefix: "{ ",
        multiplePostfix: " }",
        multipleSeparator: {label: "br"},
        nameDisplayParams: {
          displayStyle: "linebreak",
          // Called with "this" as the name display.
          menuActionCb: function() {
            var bundle = new MAT.DocDisplay.GestureMenuBundle(disp.cellDisplay.docPanel.docDisplay);
            bundle.addEditOrViewItem(this.annot)
            bundle.addScrollToItem(this.annot);
            if (disp.cellDisplay.editable && disp.cellDisplay.docPanel.docDisplay._handAnnotationAvailable) {
              var v = this;
              bundle.addMenuItem({
                label: "Detach annotation",
                gesture: new MAT.DocDisplay.AnnotationGesture(this.annot.doc, [this.annot], function() {
                  if (disp.cellDisplay._maybeRemoveAttributeValue(disp.annot, v.annot)) {
                    disp.draw();
                  }
                }, {
                  // No gestureDisplaySource here.
                  gestureSource: "menu"                
                })
              })
            }
            return bundle
          }
        },
        nullOutput: "(null)"
      });
      this.aSpan = B("span");
      this.focusElement = null;
      
    }, MAT.DocDisplay.AnnotationNameDisplayCollection, {

      draw: function() {
        this.prepareAnnotationPresentation(this.annot.getAttributeValue(this.cellDisplay.attrObj.name));
      },

      // This has to do the right thing for aggregations.
      // When setCb is called, we enter "choose mode". Choose mode
      // is pretty special: you can get a contextually restricted annotation,
      // or you should be able to create or select from one of the
      // elements in the annotation table, but only those which are
      // among the legal labels. You can't enter choose mode unless
      // the interface is not currently in choose mode.

      // The problem is that "choose mode" involves the annotation table
      // if it's visible, but the docDisplay doesn't know anything about
      // the annotation table. We have to be able to talk to the panel.
      // Which means it'll be dealt with by the standalone widget, which is
      // fine.

      _setCb: function (cancelCb) {
        var attrObj = this.cellDisplay.attrObj;
        var a = this.annot;
        var docDisplay = this.cellDisplay.docDisplay;
        var disp = this;
        this.cellDisplay.chooseModeHost.enterChooseMode(attrObj, {
          successCb: function(aVal) {
            // _maybeSetAttributeValue will know what to do with
            // aggregations. And if it does, we need to use the current value.
            // We also need to make sure that if we've succeeded in setting
            // the new value, we detach the old value and attach the new value.
            // The current value may be an aggregation, in which case
            // we have to be careful that when we unregister, we make sure
            // we're unregistering the right thing.
            // We should NOT unregister; just fire a detach for anything
            // that's being overwritten. And that will ONLY happen if
            // the attrObj isn't an aggregation and curVal is not null.
            if (disp.cellDisplay._maybeSetAttributeValue(a, aVal)) {
              disp.draw();
            };
          },
          exitCb: cancelCb
        });
      },
    
      _cancelCb: function() {
        this.cellDisplay.docPanel.exitChooseMode();
      },

      _clearCb: function () {
        // See the above comments about registering and unregistering.
        if (this.cellDisplay._maybeSetAttributeValue(this.annot, null)) {
          this.draw();
        };
      },
      
      prepareAnnotationPresentation: function(curValue) {

        var aSpan = this.aSpan;
        var attrObj = this.cellDisplay.attrObj;
        
        aSpan.innerHTML = "";
        
        var vSpan = this.prepareSpan(curValue);
        
        A(aSpan, vSpan);

        if (this.cellDisplay.editable) {
          var label;
          if (attrObj.aggregation) {
            label = "Add";
          } else if (curValue == null) {
            label = "Choose";
          } else {
            label = "Replace";
          }

          // Add a line break to insert the buttons.
          A(aSpan, B("br"));
          
          // The callback must push an annotation handler, then add some callbacks
          // that ensure that it'll be removed.
          // Because we want to change the button during choose mode, we're going to
          // use the YUI button. Using <input type="button"> results in the shape
          // changing in Firefox when you add a background color. Sigh. See
          // http://www.webreference.com/programming/css_stylish/index.html

          // Adding compact will reduce the line height. I can't change the minimum em
          // without adding a style to the button that's built. Not gonna bother.

          // Next, I need choose mode feedback. When I press the button, the label should
          // change to "Cancel", and the background color should change to a light red.
          // The setCb should be invoked with a cancelCb, which changes the label back.
          // Pressing the button should force a cancel, which should change the label
          // back, because the cancelCb is registered.
          
          var btnContainer = B("span", {attrs: {className: "compact"}, style: {fontSize: "75%"}});
          A(aSpan, btnContainer);          
          var v = this;
          // This doesn't NEED to be the same button type, since it's not going
          // to be restyled, but it's nice to ensure that it's the same style.
          // I need to create it first, because it needs to be disabled when we
          // enter choose mode.
          var unsetButton = this.cellDisplay.docPanel.getStyledButton(null, "Unset", function () {
            v._clearCb();
          });
          var b = this.cellDisplay.docPanel.getStyledButton(btnContainer, label, function () {
            if (this.getLabel() == "Choosing (press to cancel)") {
              // We're in choose mode.
              v._cancelCb();
            } else {
              unsetButton.disable();
              this.setLabel("Choosing (press to cancel)");
              // I'd style the element directly, but the element
              // isn't the button I want to style.
              this.addClass("duringChoose");
              var btn = this;
              v._setCb(function () {
                btn.removeClass("duringChoose");
                btn.setLabel(label);
                unsetButton.enable();
              });
            }
          });
          unsetButton.attachTo(btnContainer);
          this.focusElement = b.getButton();
        } else {
          this.focusElement = null;
        }
        return aSpan;
      }
      
    })
  });

/*
 *                    MAT.DocDisplay.ChooseModeManager
 *
 *
 * Because I need choose mode in the standalone editor, I need the choose mode
 * container to be available. Coincidentally, it doesn't require anything from YUI.
 *
 */

  MAT.DocDisplay.ChooseModeManager = MAT.Class(function (panel) {
    this._chooseMode = null;
    var disp = this;
    this._chooseModeStatusButton = B("span", {
      children: [B("span", {
        text: "Choose mode: inactive",
        style: {
          cursor: "help",
          color: "gray"
        },
        attrs: {
          onclick: function () {
            disp.aboutChooseMode();
          }
        }
      })]
    });
    this._panel = panel;
  }, {

    getStatusButton: function () {
      return this._chooseModeStatusButton;
    },
    
    // Choose mode.

    // params are successCb (one argument), exitCb (called when it's
    // time to cancel, or right before successCb), labels (a list of
    // permitted labels).
    
    enterChooseMode: function(params) {
      if (this._chooseMode) {
        this._panel.uiError("Already in choose mode.");
        if (params.exitCb) {
          params.exitCb();
        }
      } else {
        this._chooseMode = params;
        this._chooseModeStatusButton.innerHTML = "";
        var buttonContainer = B("span");
        var v = this;
        E(this._chooseModeStatusButton, {
          children: [
            B("span", {
              children: ["Choose mode: ", B("span", {text: "active", style: {fontWeight: "bold"}})],
              style: {
                cursor: "help"
              },
              attrs: {
                onclick: function () {
                  v.aboutChooseMode();
                }
              }
            }), " ",
            B("span", {
              text: "Cancel",
              attrs: {
                className: "duringChoose",
                onclick: function () {
                  v.exitChooseMode();
                }
              },
              style: {
                cursor: "pointer",
                paddingLeft: "2px",
                paddingRight: "2px"
              }
            })
          ]
        });
      }
    },

    // An annotation has been chosen, somehow.
    chooseModeSuccess: function(annot) {
      if (this._chooseMode) {
        var sCb = this._chooseMode.successCb;
        this.exitChooseMode();
        sCb(annot);
      }
    },

    // An error is encountered.
    chooseModeError: function(errMsg) {
      if (this._chooseMode) {
        var disp = this;
        // We'll either retry, or fail.
        this._panel.uiPopup(errMsg, "choosemodeerror", "Choose mode error", [{
          text: "Try again",
          handler: function () {
          }
        }, {
          text: "Cancel",
          isDefault: true,
          handler: function () {
            disp.exitChooseMode();
          }
        }]);
      }
    },

    // We're done with choose mode.
    exitChooseMode: function() {
      var disp = this;
      if (this._chooseMode) {
        var E = MAT.Dom._augmentElement;
        var B = MAT.Dom._buildElement;
        this._chooseModeStatusButton.innerHTML = "";
        var ui = this._ui;
        E(this._chooseModeStatusButton, {
          children: [B("span", {
            text: "Choose mode: inactive",
            style: {
              cursor: "help",
              color: "gray"
            },
            attrs: {
              onclick: function () {
                disp.aboutChooseMode();
              }
            }
          })]
        });
        if (this._chooseMode.exitCb) {
          this._chooseMode.exitCb();
        }
        this._chooseMode = null;
      }
    },

    inChooseMode: function() {
      return (this._chooseMode != null);
    },
    
    aboutChooseMode: function () {
      this._panel.uiTell(
        "<p>Choose mode is activated when you are connecting two annotations together. You may be attaching an annotation to a parent, or filling in an attribute value. <p>Like hand annotation mode, you can create new annotations by swiping annotation text or (if your task contains spanless annotations) clicking in the left sidebar, or select existing annotations by left-clicking. <p>Unlike hand annotation mode, however, your choices will be limited to just those annotations that are eligible for the position you're filling. In fact, if there's only one eligible annotation type, and you, e.g., swipe some text, you won't even be presented with an annotation menu; a new annotation of that type will be created immediately.",
        "About choose mode",
        {width: "400px"});
    }

  });
})();
