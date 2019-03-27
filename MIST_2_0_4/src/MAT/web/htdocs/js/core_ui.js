/* Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
file LICENSE for license terms. */

/* This file serves as the proxy for whatever UI is being used in the
   annotation visualization tool. It implements a number of public
   functions. */

/* The core UI stubs the public API and contains functionality which
   is general to all UIs: add a style sheet, populate a legend, etc. */

MAT.CoreUI = function () {
  this._context = null;
  this._displayCounter = 0;
}

/*
 *
 * PUBLIC API AND STUBS
 *
 */

MAT.Extend(MAT.CoreUI, {

  getDisplayCounter: function () {
    var dp = this._displayCounter;
    this._displayCounter++;
    return dp;
  },
  
  setContext: function(context) {
    this._context = context;
  },
  
  clearPanes: function() {
    for (var i = 0; i < arguments.length; i++) {
      var o = arguments[i];
      while ( o.hasChildNodes() ) {
        o.removeChild(o.firstChild);
      }
    }
  },
  
  notifyTaskTable: function(taskTable) {
    // Here, I want to ensure that the tag table has been
    // postprocessed to reflect the new structure of the
    // tag table, which allows us to assign CSS behavior
    // to attribute sets. This is the sort of thing
    // I ought to be doing in the UI, but it's really
    // behavior associated with the task, so let's put
    // it here.

    // The code which actually adds the css classes simply
    // ensures that there are name, tag_name and css classes
    // entries for each display.

    // The final thing we should be checking here is that
    // CSS is case-insensitive, and we can't distinguish among
    // the names of labels. So let's offer a popup if there's
    // a problem.

    for (var task in taskTable) {
      var tagLabel = "tagged_" + task.replace(/\W/g, "_");
      taskTable[task].tagLabel = tagLabel;
      var caseInsensitiveHash = {};
      var atr = taskTable[task].globalAnnotationTypeRepository;
      // First, the check for the case-insensitive bug.
      for (var k in atr.typeTable) {
        if (atr.typeTable.hasOwnProperty(k)) {
          var trueLabelLower = k.toLowerCase();
          if (caseInsensitiveHash[trueLabelLower] !== undefined) {
            this.inform(null, "For task " + task + ", the labels " + caseInsensitiveHash[trueLabelLower].join(", ") + " vary only by case, and can't be distinguished by CSS. You can address this problem by ensuring that your labels vary by more than case.", "Warning");
            caseInsensitiveHash[trueLabelLower].push(k);
          } else {
            caseInsensitiveHash[trueLabelLower] = [k];
          }
        }
      }
      // Now, setting up the display info.
      atr.forEachDisplayEntry(function (trueLabel, localLabel, entry, attrObj) {
        entry.display.tag_name = trueLabel;
        // Just in case this hasn't been set.
        entry.display.name = localLabel;
        if (trueLabel != localLabel) {
          entry.display.css_classes = [tagLabel.replace(/\W/g, "_"), trueLabel.replace(/\W/g, "_"),
                                       "attr_"+entry.attr.replace(/\W/g, "_")+"_is_"+attrObj._toStringSingleValue(entry.val).replace(/\W/g, "_")];
          // I need these when I add an annotation.
          entry.display.attr = entry.attr;
          entry.display.val = entry.val;
        } else {
          entry.display.css_classes = [tagLabel.replace(/\W/g, "_"), trueLabel.replace(/\W/g, "_")];
        }        
      });      
    }
  },
  
  notifyWorkspaceAccess: function(bool) {
  },

  notifyWorkspaceOpen: function(wsLabel, userid) {
  },

  notifyOpenWorkspaceError: function(err, bool) {
  },

  notifyWorkspaceFolderContents: function(wsLabel, folderName, fileList) {
  },

  notifyOperationCompleted: function(wsLabel, docLabel, affectedFolders) {
  },
  
  notifyWorkspaceClosed: function(wsLabel) {
  },

  notifyWorkspaceDocument: function(docLabel) {
  },

  disableOperationControls: function(docLabel) {
  },

  notifyStepsUnderway: function(docLabel, steps) {
  },

  notifyStepDone: function(docLabel, stepName) {
  },

  notifyStepNotDone: function(docLabel, stepName) {
  },

  notifyNothingUnderway: function(docLabel) {
  },

  notifyNoDocumentPresent: function(docLabel) {
  },

  enableOperationControls: function(docLabel) {
  },

  tell: function(requesterId, s, title) {
    alert(s);
  },

  inform: function(requesterId, s) {
    alert(s);
  },

  popup: function(requesterId, text, pId, pHeader, buttonList /*, popupParams */) {
    alert(text);
  },

  error: function(requesterId, s) {
    alert(s);
  },

  notifyError: function(s) {
    alert(s);
  },

  ask: function(docLabel, prompt, cbList) {
  },

  notifyTasksLoaded: function() {
  },

  notifyLoggingStarted: function() {
  },

  notifyLoggingStopped: function() {
  },

  notifyStepsAvailable: function(docLabel, stepList) {
  },

  notifyHandAnnotationAvailability: function(docLabel, bool) {
  },

  notifyDocumentClosed: function(docLabel) {
  },

  notifyDocumentModified: function(doc) {
  },

  notifyDocumentUnmodified: function(doc) {
  },

  notifyDocumentPresent: function(docLabel) {
  },

  ensureDocumentPanel: function(docLabel, params) {
  },

/*
 *
 * PRIVATE UTILITIES
 *
 */

  _populateStyleSheetFromTaskTable: function(taskTable, styleSheetTitle) {
    // add the CSS rules.
    var ss = null;
    for (var i = 0; i < document.styleSheets.length; i++) {
      if (document.styleSheets[i].title == styleSheetTitle) {
        ss = document.styleSheets[i];
        break;
      }
    }
    if (ss) {
      if (MAT.isMSIE()) {
        /* MS IE8 */
        while (ss.rules.length > 0) {
          ss.removeRule(0);
        } 
        // see notifyTaskTable() above.
        for (var task in taskTable) {
          var colorTable = taskTable[task].globalAnnotationTypeRepository;
          colorTable.forEachDisplayEntry(  
            function(trueLabel, localLabel, entry, attrObj) {
              var ruleKey = "." + entry.display.css_classes.join("."); 
              ss.addRule(  ruleKey, entry.display.css, ss.rules.length);
            });
        } 
      } else {
        /* Everybody else. */
        // Clear the stylesheet first.
        while (ss.cssRules.length > 0) {
          ss.deleteRule(0);
        }
        // see notifyTaskTable() above.
        for (var task in taskTable) {
          var colorTable = taskTable[task].globalAnnotationTypeRepository;
          colorTable.forEachDisplayEntry(function(trueLabel, localLabel, entry, attrObj) {
            ss.insertRule("." + entry.display.css_classes.join(".") + " { " + entry.display.css + " }",
                          ss.cssRules.length);
          });
        }
      }
    }
  },

  // At this point, we have to worry about traversing the global type repository.
  // See _populateStyleSheetFromTaskTable.
  
  _populateTagLegend: function(task, mDiv) {

    mDiv.innerHTML = "";

    var appObj = this._context.taskTable[task];
    var colorTable = appObj.globalAnnotationTypeRepository;
    var tagOrder = null;
    if (!appObj.alphabetizeLabels) {
      tagOrder = appObj.tagOrder;
    }
    
    // And here, we display the tag legend. The colors will
    // be assigned in the CSS. We generate a table.

    // We return from each tagLegend call the table div
    // or null if there are none.

    var contentLegend = this._tagLegend(colorTable, tagOrder, function (entry) {
      return MAT.Annotation.AnnotationType.isContentType(entry.category);
    });

    var structureLegend = this._tagLegend(colorTable, tagOrder, function (entry) {
      return !MAT.Annotation.AnnotationType.isContentType(entry.category);
    });

    if (contentLegend) {
      if (structureLegend) {
        // Only generate the headers if there's at least some
        // of each.
        hNode = document.createElement("h3");
        hNode.appendChild(document.createTextNode("Content tags"));
        mDiv.appendChild(hNode);
      }
      mDiv.appendChild(contentLegend);
    }

    if (structureLegend) {
      if (contentLegend) {
        hNode = document.createElement("h3");
        hNode.appendChild(document.createTextNode("Structure tags"));
        mDiv.appendChild(hNode);
      }
      mDiv.appendChild(structureLegend);
    }
  },

  // If tagOrder is not null, use it instead of an alphabetical sort.
  
  _tagLegend: function(globalATR, tagOrder, entryFn) {
    // We need to look at all the entries in the postprocessed css_displays
    // (see core_ui.js), find THEIR names, sort them, and then
    // create the legend entries.
    var cHash = {};
    var finalCategories = [];
    globalATR.forEachDisplayEntry(function (trueLabel, localLabel, data, attrObj) {
      if (entryFn(data)) {
        var cssDisplay = data.display;
        finalCategories.push(cssDisplay.name);
        cHash[cssDisplay.name] = cssDisplay;
      }
    });
    if (finalCategories.length > 0) {
      // sort the categories.
      if (tagOrder != null) {
        finalCategories = [];
        for (var j = 0; j < tagOrder.length; j++) {
          if (cHash[tagOrder[j]] !== undefined) {
            finalCategories.push(tagOrder[j]);
          }
        }
      } else {
        finalCategories.sort();
      }
      var divNode = document.createElement("div");
      var sArray = ["<table class='dataTable'>"];
      for (var i = 0; i < finalCategories.length; i++) {
        var label = finalCategories[i];
        var cssDisplay = cHash[label];
        // Set the padding so I can set a background color
        sArray.push("<tr><td style='padding-left: 1em; padding-right: 1em'><span class='" + cssDisplay.css_classes.join(" ") + "'>xxxxx</span></td><td>" + label + "</td></tr>");
      }
      sArray.push("</table>");        
      divNode.innerHTML = sArray.join("");
      return divNode;
    } else {
      return null;
    }
  }

});
