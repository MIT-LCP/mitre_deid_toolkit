/* Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
file LICENSE for license terms. */

/* This file serves as the proxy for whatever UI is being used in the
   annotation visualization tool. It implements a number of public
   functions. */

/* It assumes that mat_utils.js has been imported. */

/* This document is paired with workbench_tpl.html. */

MAT.WorkbenchUI = function (loggerAvailable) {
  MAT.CoreUI.call(this);
  this._loggerAvailable = false;
  if (loggerAvailable) {
    this.loggerAvailable();
  }
  this._loggerStarted = false;
  this._workspaceAccess = false;
  this._menuBar = null;
  // This is going to be everybody: open, compare, reconcile, maybe more.
  this._fileNewDialogs = {};
  this._multiFileDialogs = {};
  this._comparisonCache = null;
  this._workspaceNewDialog = null;
  this._workspaceUpdateKeyDialog = null;
  this._windowHash = {};
  // I need to keep track of visible windows. They each need to
  // report a title for the menu, and I need to regenerate
  // the menu each time it's displayed. So this is a hash
  // of window ids to windows. It's keyed off the 
  // visible property. And we need to be able to retrieve
  // a menu title.
  this._showableTabContents = {};
  this._docTabView = null;
  this._detailsTabView = null;
  this._taskLegends = {};
  this._layout = null;
  this.createDesktop();
  this._overlayMgr = new YAHOO.widget.OverlayManager();
  this._popupMgr = new MAT.YUIPopupManager(document.body, this._overlayMgr);
  var ui = this;

  // Recommended as a trivial fix for the problem of
  // raising the menu bar menus. I reported
  // in YUI 2.5.2 as bug 2072679: focus() behavior was
  // being overridden, and as a result you couldn't do the
  // right thing with menus and the overlay manager.
  // Fixed in YUI 2.6.0, but the problem was that the
  // menubar thinks it's already focused, so it never
  // passes focus down to its menus (and thus never
  // triggers the raise). This is still a bug, but someone
  // suggested just calling bringToTop() on the submenu.
  // But that's not enough in my current layout - I have to
  // make sure that the menu bar's container has an auto z-index
  // so that the menu element shares a stacking context
  // with the other popups.
  
  this._menuBar.subscribe("show", function (type, args) {

    ui._layout.getUnitByPosition("top").get("element").style.zIndex = "auto";
    this.bringToTop();    
          
  });


  // Firefox has removed the customization
  // in the unload prompt. They say that the possibility of untrusted text
  // in a window that's owned by the browser is subject to all sorts of
  // mischief. https://bugzilla.mozilla.org/show_bug.cgi?id=641509
  // documents the whole gory aftermath. Punch line: in all browsers,
  // you'll get a sequence of two popups. Firefox will tell you what's wrong
  // first, and then give you some hideously misphrased popup asking you if
  // you want to leave the page. Safari, on the other hand, will give you
  // a popup which contains the alert information as well. Sigh.
  
  window.onbeforeunload = function (e) {
    var isDirty = ui._context.documentsDirty();
    var loggerRunning = ui._context.loggerRunning();
    // The msg really is unformatted text. No HTML.
    var msg;
    if (isDirty && loggerRunning) {
      msg = "Some of your documents have unsaved changes, and the logger has unsaved content.";
    } else if (isDirty) {
      msg = "Some of your documents have unsaved changes.";
    } else if (loggerRunning) {
      msg = "The logger has unsaved content.";
    }
    if (msg) {      
      alert(msg);
      e.returnValue = msg;
      return msg;
    }
  };

  // We want to ensure that every lock is freed.
  window.onunload = function () {
    ui._context.releaseAllWorkspaceLocks();
  }

  // We need a global repository of view settings, some of which
  // may be specific to particular views (e.g., reconciliation). We
  // need a general mechanism for enabling items in the view menu, with
  // the right check mark; a way of announcing the setting change to the
  // display (in some cases, it's not needed, since the display might
  // consult the global setting dynamically), and consulting the global
  // setting dynamically.

  this._panelConfig = {
    showCharOffsets: false,    
    showSegments: false,
    editInTab: false,
    editInPopup: false,
    autotagIsCaseSensitive: true,
    showAnnotationTables: false,
    reconciliationShowProcessedVotes: false,
    reconciliationAutoAdvance: false,
    reconciliationExportToFile: false    
  }
}

/*
 *             PUBLIC  API
 *
 * These functions are used by the context object, at least.
 * Every UI which the annotation tool uses must implement them.
 *
 */

// Menu callbacks are called with "this" set to the scope,
// with <type>, <event>, <obj>.

YAHOO.extend(MAT.WorkbenchUI, MAT.CoreUI, {

  getElement: function(prefix, childId) {
    return YAHOO.util.Dom.get(prefix + "_" + childId);
  },

  overlayRegister: function(obj) {
    this._overlayMgr.register(obj);
  },

  createDesktop: function() {
    this.createMenubar();
    this.createLayout();
  },

  // My heavens. Javascript in HTML5 now appends C:\fakepath\ to
  // input uploads. Gotta defeat that right here and now...
  
  getData: function(dialog) {
    // But the data may be lists of elements, even if
    // it's a select which isn't multi.
    var d = dialog.getData();
    for (var k in d) {
      if (d.hasOwnProperty(k) && (d[k].constructor == Array) && (d[k].length == 1)) {
        d[k] = d[k][0];
      }
    }
    if (d.input && /^C:\\fakepath\\/.test(d.input)) {
      d.input = d.input.replace(/^C:\\fakepath\\/, "");
    }
    return d;
  },

  _replenishOpenFileDialog: function(attrStore) {
    this._fileNewDialogs[attrStore] = new MAT.WorkbenchUI.FileDialog(this, attrStore, this._fileNewDialogs[attrStore]);
  },

  showFileNewDialog: function() {
    
    // Turn the upload form into a panel. The upload form is a
    // template, and when the file is actually submitted, the
    // new dialog is moved from where it's stored in the UI to
    // the new document, and all the IDs need to be updated.
    // Also, a new dialog should have the defaults from the
    // previous one.

    // This function will be called with the DIALOG as this.
    // So how do we access the context object? What we really
    // want is the UI, because the context isn't set at this point.
    
    if (this._fileNewDialogs.open == null) {
      // var obj = document.createElement("div");
      this._replenishOpenFileDialog("open");
    }

    var ui = this;
    var dialog = this._fileNewDialogs.open;
    dialog.show({
      form: dialog.getElement("controlForm"),
      panelCreationParams: {
        // These are used by the thing that creates the document panel.
        dialog: dialog
      },
      failureCb: function () {
        // Destroy the load dialog.
        dialog.destroy();
      }
    });
  },

  showFileComparisonDialog: function (/* {newComparison: true} */) {
    var useNewComparison = false;
    var compareEntry = "align";
    if ((arguments.length > 0) && (arguments[0].newComparison)) {
      useNewComparison = true;
      compareEntry = "compare";
    }
    if (this._multiFileDialogs[compareEntry] == null) {
      var v = this;
      this._multiFileDialogs[compareEntry] = new MAT.WorkbenchUI.MultiFileOpDialog(this, {
        newID: "fileComparisonDialog",
        idPrefix: useNewComparison ? "uicomp" : "uialign",
        operation: useNewComparison ? "Compare" : "Align",
        fileOpenerKey: compareEntry,
        submitFn: function () {
          // The scope of this function is the dialog itself.
          v.fileComparisonSubmit(this);
        },
        addFileCb: function (docLabel) {
          v._compAddComparison(docLabel, this);
        },
        renderRowCb: function (docLabel, tBody) {
          v._compRenderComparisonRow(docLabel, this, tBody);
        }
      });
    } else {
      this._multiFileDialogs[compareEntry].reset();
    }
    this._multiFileDialogs[compareEntry].useNewComparison = useNewComparison;
    this._comparisonCache = {};
    this._multiFileDialogs[compareEntry].show();
  },
  
  showFileReconciliationDialog: function () {
    if (this._multiFileDialogs.reconcile == null) {
      var v = this;
      this._multiFileDialogs.reconcile = new MAT.WorkbenchUI.MultiFileOpDialog(this, {
        newID: "fileReconciliationDialog",
        idPrefix: "uirec",
        operation: "Reconcile",
        fileOpenerKey: "reconcile",
        submitFn: function () {
          // The scope of this function is the dialog itself.
          v.fileReconciliationSubmit(this);
        },
        renderRowCb: function (docLabel, tBody) {
          v._renderReconciliationRow(docLabel, this, tBody);
        }
      });
    } else {
      this._multiFileDialogs.reconcile.reset();
    }
    this._multiFileDialogs.reconcile.show();
  },

  showWorkspaceNewDialog: function() {

    // This function will be called with the DIALOG as this.
    // So how do we access the context object? What we really
    // want is the UI, because the context isn't set at this point.
    
    if (this._workspaceNewDialog == null) {
      // var obj = document.createElement("div");
      
      var obj = $$$("workspaceNewDialog");

      // Update the task menu, percolate choices forward if necessary.
      // Make sure that you update the dialog
      // AFTER you create the new dialog, because some of the cascaded
      // updates require it.
      
      this._workspaceNewDialog = new YAHOO.widget.Dialog(obj, {
        width : "30em",
        fixedcenter : true,
        visible : false,
        modal: true,
        constraintoviewport : true,
        // Note that "this" will be the dialog itself, at callback time.
        buttons : [ { text:"Open", handler: { fn: this.newWorkspaceSubmit, obj: this },
                      disabled: true },
		    { text:"Cancel", handler: function () { this.cancel(); } } ]
      });

      // We have to register all the dialogs with the overlay
      // manager, so errors will pop up on top of them.
      this.overlayRegister(this._workspaceNewDialog);

      // And render it, so we can update the buttons.
      this._workspaceNewDialog.render();
      
      this._workspaceNewDialog.getButtons()[0].set("disabled", true, true);

    }
    
    var wsKey = this._context.getWorkspaceKey();
    if (!wsKey) {
      wsKey = "";
    }
    $$$("workspaceKey").value = wsKey;
    this._workspaceNewDialog.show();    
  },
  
  showWorkspaceKeyUpdate: function() {
    
    // This function will be called with the DIALOG as this.
    // So how do we access the context object? What we really
    // want is the UI, because the context isn't set at this point.
    
    if (this._workspaceUpdateKeyDialog == null) {
      // var obj = document.createElement("div");
      
      var obj = $$$("workspaceUpdateKeyDialog");

      // Update the task menu, percolate choices forward if necessary.
      // Make sure that you update the dialog
      // AFTER you create the new dialog, because some of the cascaded
      // updates require it.

      var ui = this;
      
      this._workspaceUpdateKeyDialog = new YAHOO.widget.Dialog(obj, {
        width : "30em",
        fixedcenter : true,
        visible : false,
        modal: true,
        constraintoviewport : true,
        // Note that "this" will be the dialog itself, at callback time.
        buttons : [ { text:"OK",
                      handler: function () {
                        this.hide();
                        ui._context.setWorkspaceKey($$$("workspaceKeyUpdate").value);
                      } },
		    { text:"Cancel", handler: function () { this.cancel(); } } ]
      });

      // We have to register all the dialogs with the overlay
      // manager, so errors will pop up on top of them.
      this.overlayRegister(this._workspaceUpdateKeyDialog);

      // And render it, so we can update the buttons.
      this._workspaceUpdateKeyDialog.render();
    }
    $$$("workspaceKeyUpdate").value = "";
    this._workspaceUpdateKeyDialog.show();    
  },

  // Scope of this function used to be the new file comparison dialog,
  // but now we're capturing and modifying it to be the UI again. 
  // object passed is the dialog.

  fileComparisonSubmit: function(dialog) {
    // First, hide the window.
    dialog.hide();

    var context = this._context;

    var compEntries = [];
    for (var i = 0; i < dialog.docLabels.length; i++) {
      var e = this._comparisonCache[dialog.docLabels[i]];
      compEntries.push(e);
      e.doc = context.getDocument(e.label);
    }
    this._comparisonCache = null;

    if (dialog.useNewComparison) {
      this.log(null, {action: "open_file_comparison_request", documents: dialog.docLabels});
      context.documentComparison(compEntries, 
                                 {dialog: dialog, compEntries: compEntries});
    } else {
      // We have to collect the information in the window, and then
      // create a new comparison window here. I'm not sure we
      // need the context.
      this.log(null, {action: "open_comparison"});

      var data = this.getData(dialog);

      // This will always be the case
      data.readonly = true;
      delete data.workflow;

      // And now, we create the window.
      var compLabel = "compwindow_" + context.incrementCounter();

      var panel = new MAT.WorkbenchUI.ComparisonDocumentPanel(this, compLabel, data, compEntries);

      // Use the same structure as for the document panels, just in case.
      this._windowHash[compLabel] = {mainPanel: panel};

      panel.show();
    }    
  },

  // I'm going to continue to
  // migrate to building the panes only AFTER the operation is
  // successful, as in the workspace panes.

  fileReconciliationSubmit: function(dialog) {
    // First, hide the window.
    dialog.hide();

    var context = this._context;

    this.log(null, {action: "open_file_reconciliation_request", documents: dialog.docLabels});
    context.documentReconciliation(dialog.docLabels, {dialog: dialog});
  },
  
  // And now for the workspace. Scope of this function is the new workspace file dialog.
  // object passed is the UI.

  newWorkspaceSubmit: function(event, ui) {
    // First, hide the window.
    this.hide();
    var context = ui._context;
    context.setWorkspaceKey($$$("workspaceKey").value);
    var data = ui.getData(this);
    ui.log(null, {action: "open_workspace_request", workspace: data.workspace_dir});
    context.openWorkspace(data);
  },

  notifyOpenWorkspaceError: function(err, isShort) {
    // And when the window dismisses, you want to get the
    // workspace open window back.
    var ui = this;
    if (isShort) {
      this.error(null, err, function () {
        ui.showWorkspaceNewDialog();
      });
    } else {
      this.notifyError(err, function () {
        ui.showWorkspaceNewDialog();
      });
    }
  },

  notifyWorkspaceOpen: function(wsLabel, userid) {
    // NOW, now we build the window.

    // The userid may be empty, in which case this is a read-only
    // workspace.
    // First, strip the userid, just in case there's edge whitespace.
    // This should probably happen elsewhere.
    userid = userid.replace(/^\s+|\s+$/g,"");
    if (userid.length == 0) {
      userid = "(read-only)";
    }

    // But first, reset the window.

    if (this._workspaceNewDialog) {
      // Disable the open button again.        
      this._workspaceNewDialog.getButtons()[0].set("disabled", true, true);
      var wsKey = this._context.getWorkspaceKey();
      if (!wsKey) {
        wsKey = "";
      }
      $$$("workspaceKey").value = wsKey;
      if (!$$$("workspaceKey").value) {
        $$$("workspaceDirName").disabled = true;
      }
      $$$("workspaceDirName").value = "";
    }
    
    // Build a resizeable panel which has a place for the
    // workspace menu and for the workspace contents.
    // And a refresh button.

    var panel = new MAT.WorkbenchUI.WorkspacePanel(this, wsLabel, userid);

    // Use the same structure as for the document panels, just in case.
    this._windowHash[wsLabel] = {mainPanel: panel};

    panel.show();
  },

  notifyWorkspaceFolderContents: function(wsLabel, folderName, fileList) {
    var wEntry = this._windowHash[wsLabel];
    if (wEntry) {
      wEntry.mainPanel.notifyWorkspaceFolderContents(folderName, fileList);
    }
  },

  notifyWorkspaceRefresh: function(wsLabel) {
    var wEntry = this._windowHash[wsLabel];
    if (wEntry) {
      wEntry.mainPanel.refresh();
    }
  },

  notifyWorkspaceDocument: function(docLabel) {
    var doc = this._context.getDocument(docLabel);

    // The panel may already exist.

    var panel = this._windowHash[docLabel];
    
    if (!panel) {
      // Now, build the pane.    
      panel = new MAT.WorkbenchUI.WorkspaceDocumentPanel(this, doc);

      // Use the same structure as for the document panels, just in case.
      this._windowHash[docLabel] = {mainPanel: panel};

      panel.show();
    }

    // tell the window to display the document, probably by asking
    // the document's workspace to do it.

    doc.updateUI();
  },

  notifyWorkspaceClosed: function(wsLabel) {
    var wEntry = this._windowHash[wsLabel];
    if (wEntry) {
      wEntry.mainPanel.destroy();
      delete this._windowHash[wsLabel];
    }
  },
    
  // This method was borrowed directly from the Yahoo! UI toolkit OS menu
  // example at http://developer.yahoo.com/yui/examples/menu/applicationmenubar.html.

  createMenubar: function() {

    this._loggingOffTxt = "<span>Logging is off <span style='font-size: 75%;'>(press to start)</span></span>";
    this._loggingOnTxt = "<span><span style='background-color: coral; padding: 2px'>Logging is on</span> <span style='font-size: 75%;'>(press to stop)</span></span>";
    
    /*
       Define an array of object literals, each containing 
       the data necessary to create the items for a MenuBar.
    */

    var aItemData = [
      
      { 
        text: "File", 
        submenu: {  
          id: "filemenu",
          itemdata: [[
            
            { text: "Open file...",
              onclick: { fn: this.showFileNewDialog, scope: this } },
            { text: "Align files...",
              onclick: { fn: this.showFileComparisonDialog, scope: this } },
            { text: "Compare files ...",
              onclick: {
                fn: function () {
                  this.showFileComparisonDialog({newComparison: true});
                },
                scope: this
              }
            },
            { text: "Reconcile files...",
              onclick: { fn: this.showFileReconciliationDialog, scope: this } },
            { text: "Open workspace...",
              onclick: { fn: this.showWorkspaceNewDialog, scope: this },
              disabled: true },
            { text: "Update workspace key...",
              onclick: { fn: this.showWorkspaceKeyUpdate, scope: this},
              disabled: true }
          ], [
            { text: "Hide",
              disabled: true,
              onclick: { fn: this.hideCurrentTab, scope: this }
            },
            { text: "Close",
              disabled: true,
              onclick: { fn: this.closeCurrentTab, scope: this }
            },
            { text: "Save...",
              disabled: true
            }
          ], [
            { text: "Reconcile these documents",
              disabled: true
            }
          ]
          ]
        }
        
      },

      { text: "Tabs",
        submenu: {
          id: "tabsmenu",
          itemdata: []
        }
      },

      { text: "View",
        submenu: {
          id: "viewmenu",
          itemdata: []
        },
        disabled: true
      },

      { text: "Reconciliation",
        submenu: {
          id: "recmenu",
          itemdata: []
        },
        disabled: true
      },
      
      // Odd: without the trailing slash, the URL tries to go
      // to the default port on the host. This is not a YUI problem -
      // this happens with Apache in general.

      {
        text: "Help",
        submenu: {
          id: "helpmenu",
          itemdata: [
            {text: "Documentation", url: "/MAT/doc/html/", target: "_blank" },
            {text: "About MAT", onclick: { fn: this.aboutMAT, scope: this }}
          ]
        }
      },

      { text: this._loggingOffTxt,
        disabled: this._loggerAvailable == false,
        onclick: { fn: this.toggleLogging, scope: this }
      }
      
    ];


    /*
     Instantiate a MenuBar:  The first argument passed to the 
     constructor is the id of the element to be created; the 
     second is an object literal of configuration properties.
    */

    this._menuBar = new YAHOO.widget.MenuBar("appmenubar", {
      // if lazyload is true, preventDefault() fails to execute the
      // first time the menu is selected, because for some reason
      // there's a test to see if the menu already exists. This leads
      // to very odd behavior when the viewport is small; the menu bar
      // appears to vanish (in fact, it's scrolled down, because the
      // browser is jumping to the anchor).
      // lazyload: true, 
      itemdata: aItemData 
    });
    

    /*
     Since this MenuBar instance is built completely from 
     script, call the "render" method passing in a node 
     reference for the DOM element that its should be 
     appended to.
  */

    /* For some reason, I have to disable fillHeight() because
      it's doing the wrong thing. The documentation for it says
      specifically it shouldn't be used in a context where there's
      no fixed height for the bar. Grrr. */

    this._menuBar.fillHeight = function () {};

    this._menuBar.render("appmenubarcontainer");

    // Add a "show" event listener for each submenu.
    
    function onSubmenuShow() {

      var oIFrame,
        oElement,
        nOffsetWidth;

      /*
       Need to set the width for submenus of submenus in IE to prevent the mouseout 
       event from firing prematurely when the user mouses off of a MenuItem's 
       text node.
      */

      if ((this.id == "filemenu" || this.id == "loggingmenu" )
          && YAHOO.env.ua.ie) {

        oElement = this.element;
        nOffsetWidth = oElement.offsetWidth;
        
        /*
         Measuring the difference of the offsetWidth before and after
         setting the "width" style attribute allows us to compute the 
         about of padding and borders applied to the element, which in 
         turn allows us to set the "width" property correctly.
        */
        
        oElement.style.width = nOffsetWidth + "px";
        oElement.style.width = (nOffsetWidth - (oElement.offsetWidth - nOffsetWidth)) + "px";
        
      }

    }
    
    // Subscribe to the "show" event for each submenu
    
    this._menuBar.subscribe("show", onSubmenuShow);

    // Do some surgery on the menu, because I REALLY don't want the first item.
    // to have a link.

    var menuUl = this._menuBar.body.firstChild;

    menuUl.insertBefore(MAT.Dom._buildElement("li", {attrs: {className: "yuimenubaritem", id: "brandContainer"},
                                                     style: {fontWeight: "bolder",
                                                             background: "transparent",
                                                             padding: "0 10px"},
                                                     text: "MAT"}),
                        menuUl.firstChild);

    // If we want to ensure that the menus are up to date, and things
    // happen appropriately even though things haven't been rendered
    // yet, the updates need to happen in a subscription.

    var ui = this;
    var menu = this._menuBar.getItemByName("File").cfg.getProperty("submenu");
    menu.beforeShowEvent.subscribe(function () {
      subItem = menu.getItemByName("Open workspace...");
      subItem.cfg.setProperty("disabled", !ui._workspaceAccess);
      subItem = menu.getItemByName("Update workspace key...");
      subItem.cfg.setProperty("disabled", !ui._workspaceAccess);
    });

    var sMenu = this._menuBar.getItemByName("Tabs").cfg.getProperty("submenu");
    sMenu.beforeShowEvent.subscribe(function() {
      ui.populateTabsMenu(sMenu);
    });
    
  },

  createLayout: function () {
    var layout = new YAHOO.widget.Layout({ 
      units: [ 
	{ position: 'right', width: 300, body: 'layoutright', resize: true },
        { position: 'center', body: 'layoutcenter' },
        { position: 'top', body: 'appmenubarcontainer',
          height: this._menuBar.element.offsetHeight,
          // These make the menu elements visible. See
          // the UI example for layout + menu controls.
          scroll: null //, zIndex: 2
        },
        { position: 'bottom', height: 200, body: 'layoutbottom', resize: true }
      ] 
    });
    // Turns out I need to save this, because I need to fiddle with
    // the z-index of one of the containers.
    this._layout = layout;
    layout.render();
    // Create a tab view. Make it invisible.
    this._docTabView = new MAT.WorkbenchUI.UITabView(
      this, layout.getUnitByPosition('center'), {
        hideButton: true,
        closeButton: true,
        toolTip: true
      });
    this._detailsTabView = new MAT.WorkbenchUI.UITabView(this, layout.getUnitByPosition('bottom'));
    
    // When the right layout unit is resized, we may need to recompute the panel size for the
    // center one. Similarly, when the overall window is resized, we've got to recompute
    // the panel size for the bottom and center.

    // So here's the story about resize. startResize/endResize is fired on the individual
    // layout units when their handles are moved. startResize is relayed to the parent layout,
    // but not to the individual units. startResize/endResize are never called on the center
    // unit, because the center unit has no handles.

    // When a window is zoomed, at least in Firefox and Safari, a resize event is
    // called. When the browser window is resized, a series of resize events are fired. You
    // don't get an endResize or anything like that. The only way to deal with THIS
    // case is to wait a certain number of ms, and then do the resize. I've looked
    // at this on Firefox and Safari on the Mac; it's 200ms on FF and 50ms on Safari for
    // resize intervals when the resize is smooth.

    // So the algorithm is: if the right or bottom unit sees a startResize, wait until
    // the endResize to do our local resize. Otherwise, set up a timer. The procedure
    // is called debouncing, described here:

    // http://unscriptable.com/2009/03/20/debouncing-javascript-methods/

    var rightUnit = layout.getUnitByPosition('right');
    var bottomUnit = layout.getUnitByPosition('bottom');

    this._inResize = false;
    var ui = this;
    rightUnit.subscribe('startResize', function() {
      ui._inResize = true;
    });
    rightUnit.subscribe('endResize', function() {
      ui._doResize();
      ui._inResize = false;
    });

    bottomUnit.subscribe('startResize', function() {
      ui._inResize = true;
    });
    bottomUnit.subscribe('endResize', function() {
      ui._doResize();
      ui._inResize = false;
    });

    this._resizeTimeout = null;
    layout.subscribe('resize', function () {
      if (!ui._inResize) {
        // We're not resizing via the handles. Either zoom or browser resize.
        if (ui._resizeTimeout) {
          clearTimeout(ui._resizeTimeout);
        }
        ui._resizeTimeout = setTimeout(function () {
          ui._resizeTimeout = null;
          ui._doResize();
        }, 400);
      }
    });
  },

  _doResize: function() {
    this._docTabView._resizePanel();
    this._detailsTabView._resizePanel();
  },

  // Either of these may be null.
  brand: function(shortName, longName) {
    if (shortName) {
      $$$("brandContainer").innerHTML = shortName;
    }
    if (longName) {
      document.title = longName;
    }
  },

  // Splash screen.

  notifyTasksLoaded: function () {
    this.splash();
  },

  splash: function () {
    var panel = new YAHOO.widget.Panel("welcome", {
      width: "300px",
      fixedcenter: true,
      close: false,
      draggable: false,
      zindex: 4,
      visible: false
    });
    panel.setHeader("");
    panel.setBody("<div style='text-align: center; margin: 10px'><span style='font-size: x-large'>" + document.title + "</span><p>Welcome!</div>");
    panel.render(document.body);
    // Set a timer.
    setTimeout(function () { panel.destroy(); }, 2000);
    panel.show();                                       
  },

  aboutMAT: function () {
    this._popupMgr.tell(null,
      "<div style='text-align: center'>"+document.title+"<br>(MAT version " + MAT.Version + ")</div>",
      "About MAT"
    );
  },

  aboutHandAnnotationMode: function () {
    this._popupMgr.tell(null,
      "<p>You can activate hand annotation by advancing to a step in your workflow where hand annotation is supported (e.g., 'Hand annotation'). <p>When hand annotation is activated, you can create new annotations by swiping annotation text or (if your task contains spanless annotations) clicking in the left sidebar. You can also select existing annotations (to delete, edit, etc.) by left-clicking on them.</p>",
      "About hand annotation mode",
      {width: "400px"});
  },

  aboutWorkspaceLogging: function () {
    this._popupMgr.tell(null,
      "<p>Workspace logging is controlled differently than normal UI logging. Workspace logging is enabled in the workspace itself, and when enabled, any UI events relating to that workspace and any documents in it are automatically logged. This logging cannot be enabled or disabled from the UI.</p>",
      "About workspace logging",
      {width: "400px"});
  },

  loggerAvailable: function() {
    this._loggerAvailable = true;
    // Enable the button.
    // $$$("loggingButton").disabled = false;
  },

  // If we try to disable the element we just selected, then
  // the menu won't go away. So what we should do is write
  // a notifier that the backend calls. Well, that's the
  // right thing to do, but it's not quite good enough.
  // I have to dismiss the menu by hand, it seems. Well, that's not
  // good enough either - I have to tell the menu bar not
  // to highlight the element. And I should do that in the
  // frontend function, since if we're notified that the
  // logger started, we don't know where it came from...

  // This is actually even more complicated, because if you
  // disable an item while the menu is still visible, 
  // the menu won't go away AND the item won't be highlighted
  // the next time the menu is summoned. So I ALSO
  // can't use the beforeHideEvent, but I CAN use the
  // beforeShowEvent, I think. I.e., the NEXT time the menu
  // displays, it updates itself first. See the menubar
  // setup.

  toggleLogging: function() {
    if (!this._loggerStarted) {
      // Start the logging.
      this._context.startLogging();
    } else {
      this._context.stopLogging();
    }
  },

  startLogging: function() {
    if (!this._loggerStarted) {
      this._context.startLogging();
    }
  },

  notifyLoggingStarted: function() {
    this._loggerStarted = true;
    this._menuBar.getItemByName(this._loggingOffTxt).cfg.setProperty("text", this._loggingOnTxt);
  },

  stopLogging: function() {
    if (this._loggerStarted) {
      this._context.stopLogging();
    }
  },

  notifyLoggingStopped: function() {
    this._loggerStarted = false;
    this._menuBar.getItemByName(this._loggingOnTxt).cfg.setProperty("text", this._loggingOffTxt);
  },

  log: function(obj, msg) {
    // All the UI gestures involve a transaction.
    this._context.commitLogTransaction();
    this._context.beginLogTransaction();
    if (obj) {
      obj.log(msg);
    } else {
      this._context.log(msg, {});
    }
  },
  
  // We generate the step buttons automatically.
  
  notifyStepsAvailable: function(docLabel, stepSeq) {
    var wEntry = this._windowHash[docLabel];
    if (wEntry) {
      wEntry.mainPanel.notifyStepsAvailable(stepSeq);
    }
  },
  
  notifyStepNotDone: function(docLabel, stepName) {
    var wEntry = this._windowHash[docLabel];
    if (wEntry) {
      wEntry.mainPanel.notifyStepNotDone(stepName);
    }
  },

  notifyStepDone: function(docLabel, stepName) {
    var wEntry = this._windowHash[docLabel];
    if (wEntry) {
      wEntry.mainPanel.notifyStepDone(stepName);
    }
  },

  notifyHandAnnotationAvailability: function(docLabel, bool) {
    var wEntry = this._windowHash[docLabel];
    if (wEntry) {
      wEntry.mainPanel.notifyHandAnnotationAvailability(bool);
    }
  },
    
  disableOperationControls: function (docLabel) {
    var wEntry = this._windowHash[docLabel];
    if (wEntry) {
      wEntry.mainPanel.disableOperationControls();
    }
  },

  enableOperationControls: function (docLabel) {
    var wEntry = this._windowHash[docLabel];
    if (wEntry) {
      wEntry.mainPanel.enableOperationControls();
    }
  },

  notifyStepsUnderway: function(docLabel, stepArray) {
    var wEntry = this._windowHash[docLabel];
    if (wEntry) {
      wEntry.mainPanel.notifyStepsUnderway(stepArray);
    }
  },

  notifyNothingUnderway: function (docLabel) {
    var wEntry = this._windowHash[docLabel];
    if (wEntry) {
      wEntry.mainPanel.notifyNothingUnderway();
    }
  },

  notifyOperationCompleted: function (wsLabel, docLabel, affectedFolders) {
    if (docLabel) {
      var wEntry = this._windowHash[docLabel];
      if (wEntry) {
        wEntry.mainPanel.notifyOperationCompleted();
      }
    }
    this.notifyWorkspaceFolderRefresh(wsLabel, affectedFolders);
  },

  notifyWorkspaceFolderRefresh: function(wsLabel, affectedFolders) {
    if (affectedFolders) {
      wEntry = this._windowHash[wsLabel];
      if (wEntry) {
        wEntry.mainPanel.maybeRefresh(affectedFolders);
      }
    }
  },

  notifyWorkspaceFolderRefreshCompleted: function(wsLabel) {
    wEntry = this._windowHash[wsLabel];
    if (wEntry) {
      wEntry.mainPanel.notifyWorkspaceFolderRefreshCompleted();
    }
  },
  
  notifyTaskTable: function(taskTable) {
    // First, make sure the table's been augmented appropriately.
    MAT.WorkbenchUI.superclass.notifyTaskTable.call(this, taskTable);
    // This no longer updates the file dialog, because the
    // file dialog is created from a template for
    // each document.
    // However, now we add the CSS rules.
    this._populateStyleSheetFromTaskTable(taskTable, "tag_styles");

    // Implement branding. If every element in
    // the table has the same long and short name, and
    // they're not null, then brand the UI.

    var names = null;
    var allTheSame = true;
    
    for (var task in taskTable) {
      var taskObj = taskTable[task];
      if (names != null) {
        if (!((names[0] == taskObj.shortName) && (names[1] == taskObj.longName))) {
          allTheSame = false;
          break;
        }
      } else {
        names = [taskObj.shortName, taskObj.longName];
      }
    }
    if (allTheSame) {
      this.brand(names[0], names[1]);
    }
  },

  notifyWorkspaceAccess: function(bool) {
    this._workspaceAccess = bool;
  },

  // The buttonList already has the handlers in it, but they don't
  // do anything with the window. We have to wrap something around them
  // to take care of destroying the panel.

  ask: function(docLabel, text, buttonList) {
    return this._popupMgr.ask(docLabel, text, buttonList);
  },

  inform: function(docLabel, text) {
    return this._popupMgr.inform(docLabel, text);
  },

  popup: function(docLabel, text, pId, pHeader, buttonList /*, popupParams */) {
    var popupParams = {};
    if (arguments.length > 5) {
      popupParams = arguments[5];
    }
    return this._popupMgr.popup(docLabel, text, pId, pHeader, buttonList, popupParams);
  },
    
  tell: function(docLabel, msg, title /*, params */) {
    this._popupMgr.tell.apply(this._popupMgr, arguments);
  },

  // This is slightly different than notifyError, because we don't
  // need it to be resizeable.

  error: function(docLabel, s) {
    if (arguments.length > 2) {
      this._popupMgr.error(docLabel, s, arguments[2]);
    } else {
      this._popupMgr.error(docLabel, s);
    }
  },
  
  notifyError: function(s) {

    var dismissCallback = null;
    
    if (arguments.length > 1) {
      dismissCallback = arguments[1];
    }

    // As far as I can tell, you can only build a resize
    // on top of an existing div.

    var el = document.createElement("div");
    el.id = "errorpopup";
    el.style.visibility = "hidden";
    document.body.appendChild(el);
    
    var oPanel = new MAT.YUIExtensions.ResizeableSimpleDialog(el, {
      constraintoviewport: true,
      fixedcenter: true,
      draggable: true,
      width: "400px",
      hide: false,
      text: s,
      zIndex: 1}, {
        minWidth: 400,
        minHeight: 300,
        height: 300,
        // PADDING USED FOR BODY ELEMENT (Hardcoded for example)
        // 10px top/bottom padding applied to Panel body element. The top/bottom border width is 0
        bodyPadding: 10*2
      });
    
    oPanel.setHeader("Error");
    this.overlayRegister(oPanel);
    
    oPanel.render();

    // Make sure that the "hide" button
    // destroys it.

    var coreClose = oPanel.closePanel;
    
    oPanel.closePanel = function (e) {
      coreClose.call(oPanel, e);
      oPanel.destroy();
      if (dismissCallback) {
        dismissCallback();
      }
    };

    // For the overlay manager.
    oPanel.focus();
  },

  // This must be called BEFORE the document is displayed.
  ensureDocumentPanel: function(docLabel, config) {
    var wEntry = this._windowHash[docLabel];
    if (!wEntry) {
      // That means it's a new one.
      var d = this._context.getDocument(docLabel);
      if (d.currentDocument.doc.isReconciliationDoc()) {
        this.createReconciliationDocumentPanel(docLabel, config);
      } else if (d.currentDocument.doc.isComparisonDoc()) {
        if (config.compEntries[0].doc) {
          // this is a newly generated comparison document; must set up docNames
          // There's len(compEntries) - 1 pairs, and the first compEntry
          // is the pivot doc.
          var pairs = d.currentDocument.doc.metadata.comparison.pairs;
          for (var i = 0; i < pairs.length; i++) {
            if (i == 0) {
              pairs[i].pivotDocName = config.compEntries[0].doc.currentDocumentName;
            }
            var doc = config.compEntries[i + 1].doc;
            pairs[i].otherDocName = doc.currentDocumentName;
          }
        }
        this.createNewComparisonDocumentPanel(docLabel, config);
      } else {
        if (config.dialog) {
          config.data = this.getData(config.dialog);
          if (config.data.workflow == "(comparison)" || config.data.workflow == "(reconciliation)") {
            d.updateConfiguration({readonly: true});
          }
        } else {
          config.data = {readonly: true, task: d.getTask()};
          d.updateConfiguration({readonly: true, task: d.getTask()});
        }
        this.createWorkflowDocumentPanel(docLabel, config);
      }
    }
  },

  notifyDocumentPresent: function(docLabel) {
    var wEntry = this._windowHash[docLabel];
    wEntry.mainPanel.notifyDocumentPresent();
  },

  notifyNoDocumentPresent: function(docLabel) {
    var wEntry = this._windowHash[docLabel];
    if (wEntry) {
      wEntry.mainPanel.notifyNoDocumentPresent();
    }
  },

  notifyDocumentClosed: function(docLabel) {
    var wEntry = this._windowHash[docLabel];
    if (wEntry) {
      wEntry.mainPanel.destroy();
      // Not always set, because I also use this for workspace documents.
      if (wEntry.loadDialog) {
        wEntry.loadDialog.destroy();
      }
      delete this._windowHash[docLabel];
    }
  },

  notifyDocumentModified: function(doc) {
    var wEntry = this._windowHash[doc.docLabel];
    if (wEntry) {
      wEntry.mainPanel.notifyDocumentModified();
    }
  },

  notifyDocumentUnmodified: function(doc) {
    var wEntry = this._windowHash[doc.docLabel];
    if (wEntry) {
      wEntry.mainPanel.notifyDocumentUnmodified();
    }
  },


/*
 *
 *             SHOW/HIDE MENU
 *
 * These functions update the _showableTabContents hash, and take care of
 * populating the menu.
 *
 */

  populateTabsMenu: function (menu) {
    // First, clear the menu.
    menu.clearContent();

    var ui = this;

    // So if the content is currently installed in a tab, just
    // switch to that tab. Otherwise, add the tab.
    function callbackFactory (w) {
      return function () {
        if (w.installedTab == null) {
          // Install it.
          w.show();
        } else {
          // Switch to it.
          ui._docTabView.set('activeTab', w.installedTab);
        }
      }
    }
    
    for (var key in this._showableTabContents) {
      var w = this._showableTabContents[key];
      menu.addItem({text: w.getWindowTitle(),
                    onclick: { fn: callbackFactory(w) } });
    }
    menu.render();
  },

  cacheShowableTabContent: function(w) {
    this._showableTabContents[w.id] = w;
  },

  uncacheShowableTabContent: function(w) {
    delete this._showableTabContents[w.id];
  },

/*
 *             OTHER TOPLEVEL MENU ITEMS
 */

  closeCurrentTab: function () {
    this._docTabView.closeActiveTab();
  },

  hideCurrentTab: function () {
    this._docTabView.hideActiveTab();
  },

/*
 *             INTERNAL FUNCTIONS
 *
 * These functions don't have anything to do with the 
 * connection to the backend tool - they're entirely local
 * to this UI implementation.
 *
 */

  // Called to create the document pane when a load is successful.
  // NOTE: if the user tries to reuse the file new dialog in the meantime,
  // bad things will happen.
  
  createWorkflowDocumentPanel: function(docLabel, params) {

    // Now, build a window. It should be a tab. 

    var panel = new MAT.WorkbenchUI.WorkflowDocumentPanel(this, docLabel, params.data);

    var entry = {mainPanel: panel};
    if (params.dialog) {
      entry.loadDialog = params.dialog;
    }

    this._windowHash[docLabel] = entry;

    // Record the panel. The value in the hash will be an
    // object, because in the future, we may have multiple
    // windows associated with a given document.

    // panel.render();
    if (!params.initiallyHidden) {
      panel.show();
    }
    return entry;
  },

  
  // Called to create the document pane when a load is successful.
  // NOTE: if the user tries to reuse the file new dialog in the meantime,
  // bad things will happen.
  
  createReconciliationDocumentPanel: function(docLabel, params) {

    var data = this.getData(params.dialog);
    data.description = params.description || data.input;

    var panel = new MAT.WorkbenchUI.ReconciliationDocumentPanel(this, docLabel, data);

    // The dialog needs to be destroyed, if it's not the cached
    // reconcile dialog. We don't use it for anything.
    if (params.dialog !== this._multiFileDialogs.reconcile) {
      params.dialog.destroy();
    }
    var entry = {mainPanel: panel};

    this._windowHash[docLabel] = entry;

    // Record the panel. The value in the hash will be an
    // object, because in the future, we may have multiple
    // windows associated with a given document.

    // We need to respect this because if some silly person tries to
    // open a reconciliation document as a component of another
    // reconciliation document, we have to fail, and we don't want
    // the user to see the document.
    
    if (!params.initiallyHidden) {
      panel.show();
    }
    
    return entry;
  },

   
  // Called to create the document pane when a load is successful.
  // NOTE: if the user tries to reuse the file new dialog in the meantime,
  // bad things will happen. 
  // copied from createReconcilationDocumentPanel above
  
  createNewComparisonDocumentPanel: function(docLabel, params) {

    var data = this.getData(params.dialog);
    data.description = params.description || data.input;
    data.readonly = true;

    var panel = new MAT.WorkbenchUI.NewComparisonDocumentPanel(this, docLabel, data, params.compEntries);

    // The dialog needs to be destroyed, if it's not the cached
    // comparison dialog. We don't use it for anything.
    if (params.dialog !== this._multiFileDialogs.compare) {
      params.dialog.destroy();
    }

    var entry = {mainPanel: panel};

    this._windowHash[docLabel] = entry;

    // Record the panel. The value in the hash will be an
    // object, because in the future, we may have multiple
    // windows associated with a given document.

    // We need to respect this because if some silly person tries to
    // open a reconciliation document as a component of another
    // reconciliation document, we have to fail, and we don't want
    // the user to see the document.

    /**** should not be needed here
    if (!params.initiallyHidden) {
      panel.show();
    } ***/
    // Do this instead.
    panel.show();
    
    return entry;
  },

  updateIDs: function(obj, oldPrefix, newPrefix) {
    var testFn;
    var updateFn;
    if (oldPrefix != null) {
      var prefPlusUnderscore = oldPrefix + "_";
      var prefLen = prefPlusUnderscore.length;
      testFn = function (e) {
        return (e.id != null) && (e.id.indexOf(prefPlusUnderscore) == 0);
      };
      updateFn = function (e) {
        e.id = newPrefix + "_" + e.id.substr(prefLen);
      };
    } else {
      testFn = function (e) {
        return (e.id != null) && (e.id != "");
      };
      updateFn = function (e) {
        e.id = newPrefix + "_" + e.id;
      };
    }
    // Do it for the children, and also for the node
    // itself.
    YAHOO.util.Dom.getElementsBy(testFn, null, obj, updateFn);
    if (testFn(obj)) {
      updateFn(obj);
    }
  },

  fromTemplate: function(tClass, newID, idPrefix) {
    var obj = YAHOO.util.Dom.get(tClass).cloneNode(true);
    if (obj.style.display == "none") {
      obj.style.display = null;
    }
    obj.id = newID;
    this.updateIDs(obj, null, idPrefix);
    return obj;
  },

  // Enable the file upload.

  updateWorkspaceDialog: function (where) {
    if (where == "workspaceKey") {
      if ($$$("workspaceKey").value) {
        $$$("workspaceDirName").disabled = false;
        // Focus that element.
        $$$("workspaceDirName").focus();
      }
    } else if (where == "userId") {
      if ($$$("userid").value) {
        $$$("workspaceKey").disabled = false;
        $$$("workspaceKey").focus();
      }
    } else if (where == "workspaceDir") {
      // Enable the buttons.
      if ($$$("workspaceDirName").value) {
        this._workspaceNewDialog.getButtons()[0].set("disabled", false, true);
      } else {
        this._workspaceNewDialog.getButtons()[0].set("disabled", true, true);
      }
    }
  },

  _chooseDialog: function(dialogElement) {
    for (var k in this._fileNewDialogs) {
      if (this._fileNewDialogs.hasOwnProperty(k)) {
        var cand = this._fileNewDialogs[k];
        if (cand && YAHOO.util.Dom.isAncestor(cand.element, dialogElement)) {
          return cand;
        }
      }
    }
    return null;
  },

  updateFileDialog: function(dialogElement, startingWhere) {
    var d = this._chooseDialog(dialogElement);
    if (d) {
      d.updateFileDialog(startingWhere);
    }
  },

  updateFileDialogEncodingInfo: function (dialogElement) {
    var d = this._chooseDialog(dialogElement);
    if (d) {
      d.updateFileDialogEncodingInfo();
    }
  },

  updateMultiFileDialog: function(dialogElement, startingWhere) {
    for (var k in this._multiFileDialogs) {
      if (this._multiFileDialogs.hasOwnProperty(k)) {
        var cand = this._multiFileDialogs[k];
        if (cand && YAHOO.util.Dom.isAncestor(cand.element, dialogElement)) {
          cand.updateMultiFileDialog(startingWhere);
        }
      }
    }
  },
    
  _clearMenu: function(menu) {
    menu.disabled = true;
    while (menu.options.length > 1) {
      // Keep removing the last children until you
      // get to the initial entry.
      menu.removeChild(menu.options[menu.options.length -1]);
    }
    menu.selectedIndex = 0;
    menu.options[0].disabled = false;
  },

  // Sort the damn keys.
  _populateMenuFromKeys: function(menu, obj, selectedKey, extraValues) {
    var i = 0;
    var selectedIndex = 0;

    function addMenuItem(key) {
      var optNode = document.createElement("option");
      optNode.appendChild(document.createTextNode(key));
      menu.appendChild(optNode);
      i++;
      // Increment BEFORE, because there's already a node.
      if (selectedKey && (key == selectedKey)) {
        selectedIndex = i;
      }
    }

    var keys = [];
    
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        keys.push(key);
      }
    }

    // Let's put the extra values at the end.
    keys.sort();
    for (var k = 0; k < keys.length; k++) {
      addMenuItem(keys[k]);
    }
    
    if (extraValues) {
      for (var j = 0; j < extraValues.length; j++) {
        addMenuItem(extraValues[j]);        
      }
    }
      
    menu.disabled = false;
    if (i == 1) {
      // If there's exactly one workflow, use it.
      menu.selectedIndex = 1;
      return true;
    } else if (selectedIndex > 0) {
      menu.selectedIndex = selectedIndex;
      return true;
    } else {
      return false;
    }
  },

  _populateMenuFromArray: function(menu, labels, selectedKey) {
    var i = 0;
    var selectedIndex = 0;
    for (var i = 0; i < labels.length; i++) {
      var optNode = document.createElement("option");
      optNode.appendChild(document.createTextNode(labels[i]));
      menu.appendChild(optNode);
      if (selectedKey && (labels[i] == selectedKey)) {
        selectedIndex = i+1;
      }
    }
    menu.disabled = false;
    if (i == 1) {
      // If there's exactly one workflow, use it.
      menu.selectedIndex = 1;
      return true;
    } else if (selectedIndex > 0) {
      menu.selectedIndex = selectedIndex;
      return true;
    } else {
      return false;
    }
  },

  // Actually, in order to do this right, I need
  // to know how many panes are on the screen, since I want
  // to return "home" in the case where the document home
  // position is set.
  
  _getPanePosition: function () {
    var xOrigin = 100;
    var yOrigin = 100;
    var seed = null;
    if (arguments.length > 0) {
      xOrigin = arguments[0][0];
      yOrigin = arguments[0][1];
    }

    // Let's figure out the next pane position based
    // on how many windows are currently showable. I know,
    // I know, someone may have moved one. And the
    // tasks might be different. But this is the best I can do.
    // What we're going to do is for each window, we're going
    // to move diagonally in x and y, and when we've
    // moved 100px, move back to 0 and increment x.
    // So we're creating windows in columns.

    var padX = 0;
    var padDiag = 0;
    for (var k in this._showableTabContents) {
      if (padDiag == 100) {
        if (padX == 100) {
          // Go back to the beginning.
          padX = padDiag = 0;
        } else {
          padDiag = 0;
          padX += 20;
        }        
      } else {
        padDiag += 20;
      }
    }

    return {x: xOrigin + padDiag + padX,
            y: yOrigin + padDiag};
  },

  /*
   * These are the utilities which deal with the comparison dialog.
   */

  COMP_POSITION_FILLERS: {
    above: '<div style="text-align: center; margin: 0px 5px"><span style="font-size: 75%">above</span><br><span style="color: gray">T</span></div>',
    behind: '<div style="z-index: 0; text-align: center; position: relative; margin: 0px 5px"><div style="z-index: 1; position: absolute; width: 100%; top: 0px"><span style="color: gray">T</span></div><span style="font-size: 75%;vertical-align: center">behind</span></div>',
    below: '<div style="text-align: center; margin: 0px 5px"><span style="color: gray">T</span><br><span style="font-size: 75%">below</span></div>'
  },

  // Each of these is 14 px wide.
  
  COMP_BUTTON_UP: "/MAT/resources/yui-2.6.0-dist/build/assets/skins/sam/asc.gif",
  COMP_BUTTON_DOWN: "/MAT/resources/yui-2.6.0-dist/build/assets/skins/sam/desc.gif",
  
  _compAddComparison: function(docLabel, dialog) {
    // It's just been added to the docLabels list, so we know what position it has.
    var newCacheEntry = {label: docLabel, initial: null};
    this._comparisonCache[docLabel] = newCacheEntry;

    // first entry defaults to being the reference document and displays
    // "behind" -- others default to "above"
    if (dialog.docLabels.length == 1) {
      newCacheEntry.position = "behind";
    } else {
      newCacheEntry.position = "above";
    }
  },

  _comparisonMove: function(docLabel, dir, dialog) {
    // Let's see where you are. If you're the lowest "above" and there's a
    // "behind" below you, you can't move down; ditto if you're the
    // highest "below" and there's a "behind" above you.
    var entry = this._comparisonCache[docLabel];
    var listPos = entry.listPosition;
    var prevPos = null;
    var nextPos = null;
    if (listPos > 0) {
      prevPos = this._comparisonCache[dialog.docLabels[listPos - 1]].position;
      if ((dir == "up") && (prevPos == "behind") && (entry.position == "below")) {
        // Can't do it.
        this.error(null, "Can't move the element up because there's already an element behind");
        return;
      }
    }
    if (listPos < (dialog.docLabels.length - 1)) {
      nextPos = this._comparisonCache[dialog.docLabels[listPos + 1]].position;
      if ((dir == "down") && (nextPos == "behind") && (entry.position == "above")) {
        // Can't do it.
        this.error(null, "Can't move the element down because there's already an element behind");
        return;
      }
    }

    var reorder = false;
    if (dir == "down") {
      if ((entry.position == "above") && ((nextPos == "below") || (nextPos == null))) {
        entry.position = "behind";          
        // And that's it.
      } else if (entry.position == "behind") {
        entry.position = "below";
        // And that's it.
      } else {
        // We have to reorder. The position
        // name remains the same, but we swap the next element
        // and this one. First pop, then re-add.
        dialog.docLabels.splice(listPos, 1);
        dialog.docLabels.splice(listPos + 1, 0, docLabel);
        reorder = true;
      }
    } else if (dir == "up") {
      if ((entry.position == "below") && ((prevPos == "above") || (prevPos == null))) {
        entry.position = "behind";
      } else if (entry.position == "behind") {
        entry.position = "above";
      } else {
        // First remove.
        dialog.docLabels.splice(listPos, 1);
        // Then re-add.
        dialog.docLabels.splice(listPos - 1, 0, docLabel);
        reorder = true;
      }
    }
    
    if (reorder) {
      for (var j = 0; j < dialog.docLabels.length; j++) {
        this._comparisonCache[dialog.docLabels[j]].listPosition = j;
      }
    }
    dialog.renderFileList();
  },

  _compRenderComparisonRow: function(docLabel, dialog, tBody) {
    var M = MAT.Dom._buildElement;
    var A = MAT.Dom._appendChild;
    var cacheEntry = this._comparisonCache[docLabel];
    
    // First, add a row. 
    // If this is the first one selected, disable all the documents
    // which don't have the same signal. Always disable this one.
    var position = cacheEntry.position;

    var doc = this._context.getDocument(docLabel);

    // make the select reference document text visible
    // only need to do this the first time, but doesn't matter if we
    // do it every time
    dialog.getElement("selectRefText").style.display = null;
    
    var v = this;
    var d = dialog;
    var l = docLabel;

    var newTr = A(tBody, M("tr"));
    var newTd = A(newTr, M("td", {style: {verticalAlign: "top"}}));

    var newSel = M("select", {
      attrs: {
        onchange: function() {
          v._comparisonSetPos(this, cacheEntry);
        }
      },
      children: [
        M("option", {text: "above", attrs: {value: "above"}}),
        M("option", {text: "below", attrs: {value: "below"}})
      ]
    });

    newTd.appendChild(newSel);

    A(newTr, M("td", {
      style: {
        verticalAlign: "top"
      },
      children: [
        M("input", {
          attrs: {
            checked: (position === "behind"),
            type: "radio",
            name: "reference", 
            value: cacheEntry.listPosition, 
            onclick: function() { 
              v._comparisonSelectRef(cacheEntry, newSel, v); 
            }
          }
        })
      ]
    }));

    A(newTr, M("td", {
      children: [
        doc.getDescription(),
        M("br"),
        "Initial: ",
        M("input", {
          attrs: {
            className: 'fileinitial',
            type: "text",
            size: 1,
            value: cacheEntry.initial || "",
            onchange: function () {
              v._comparisonCache[l].initial = this.value;
            }
          }
        })
      ]
    }));                        

    v._behindSpan = M("span", {text: "[Reference]"});

    if (position === "behind") {
      v._comparisonSelectRef(cacheEntry, newSel, v);
    } else {
      newSel.value = position;
    }

  },

  _comparisonSetPos: function(selectElement, cacheEntry) {
    cacheEntry.position = selectElement[selectElement.selectedIndex].value;
  },


  _comparisonSelectRef: function(cacheEntry, newSel, v) {
    // unselect "behind" for the previous reference selection
    // default to "above", and enable the selector element
    if (v._curRefSelector) {
      var oldSel = v._curRefSelector;
      var oldTd = v._curRefTd;
      oldTd.removeChild(oldTd.childNodes[0]);
      oldTd.appendChild(oldSel);
      oldSel.onchange();
    }

    // select "behind" for the new reference selection and save the 
    // selectElement for later
    var newTd = newSel.parentElement;
    v._curRefSelector = newSel;
    v._curRefTd = newTd;
    newTd.removeChild(newTd.childNodes[0]);
    newTd.appendChild(v._behindSpan);
    cacheEntry.position = "behind";
  },

  /*
   * And these are the utilities which deal with the reconciliation dialog.
   */

  _renderReconciliationRow: function (docLabel, dialog, tBody) {
    var M = MAT.Dom._buildElement;
    var A = MAT.Dom._appendChild;
    
    // First, add a row. 
    // If this is the first one selected, disable all the documents
    // which don't have the same signal. Always disable this one.
    var doc = this._context.getDocument(docLabel);
    
    var newTr = A(tBody, M("tr"));
    var newTd = A(newTr, M("td", { style: {textAlign: "center"} }));

    var v = this;
    var d = dialog;
    var l = docLabel;

    newTd.appendChild(M("span", {
      text: "X",
      style: {cursor: "pointer"},
      attrs: {
        onclick: function () {
          for (var j = 0; j < d.docLabels.length; j++) {
            if (d.docLabels[j] == l) {
              d.docLabels.splice(j, 1);
              d.renderFileList();
              break;
            }
          }
        }
      }
    }));
    // A(newTr, M("td"));
    newTr.appendChild(M("td", {text: doc.getDescription()}));
  },

  /*
   * Managing the legend.
   */

  _displayLegend: function(task) {
    if (!this._taskLegends[task]) {
      var thisDiv = MAT.Dom._buildElement("div", {attrs: {className: "bd"}});
      this._taskLegends[task] = this._createCollapsibleDiv(
        MAT.Dom._buildElement(
          "div", {
            attrs: {className: "collapsibleDiv legendDiv"},
            children: [{label: "div",
                        attrs: {className: "hd"},
                        text: "Legend"
                       }, thisDiv]
          }
        )
      );
      this._populateTagLegend(task, thisDiv);
    }
    var c = YAHOO.util.Dom.get("legendcontainer");
    c.innerHTML = "";
    c.appendChild(this._taskLegends[task]);
  },

  _clearLegend: function () {
    var c = YAHOO.util.Dom.get("legendcontainer");
    c.innerHTML = "";
  },

  /* Managing hide/show */

  _createCollapsibleDiv: function (div) {
    var header = YAHOO.util.Dom.getElementsByClassName("hd", "div", div)[0];
    var button = MAT.Dom._buildElement("span", {attrs: {className: 'columnHideShow expanded'}});
    header.appendChild(button);
    var d = div;
    button.onclick = function () {
      if (YAHOO.util.Dom.hasClass(d, "expanded")) {
        // Contract it.
        YAHOO.util.Dom.replaceClass(d, "expanded", "contracted");
      } else {
        // It's hidden. Show it.
        YAHOO.util.Dom.replaceClass(d, "contracted", "expanded");
      }
    }
    YAHOO.util.Dom.addClass(div, "expanded");
    return div;
  },

  /* Managing the menu bar */

  _getMenuBarItem: function(path) {
    var menu = this._menuBar;
    var item = null;
    for (var i = 0; i < path.length; i++) {
      if (i > 0) {
        menu = item.cfg.getProperty("submenu");
      }
      item = menu.getItemByName(path[i]);
    }
    return item;    
  },

  _addMenuBarItems: function(path, items, gIndex) {
    var item = this._getMenuBarItem(path);
    var menu = item.cfg.getProperty("submenu");
    menu.addItems(items, gIndex);
    menu.render();
  },

  _removeMenuBarItems: function(path, itemNames, gIndex) {
    // This isn't EXACTLY right, because the menu should already
    // know what group it's in, but I'm not going to
    // worry about that.
    var item = this._getMenuBarItem(path);
    var menu = item.cfg.getProperty("submenu");
    for (var i = 0; i < itemNames.length; i++) {
      var itm = menu.getItemByName(itemNames[i]);
      // If the item has a submenu, we have to remove the subscriptions.
      var subM = itm.cfg.getProperty("submenu");
      if (subM) {
        // And, if this item is the menu's activeItem, it's gotta
        // be cleared.
        menu.clearActiveItem();
        menu.cfg.configChangedEvent.unsubscribe(
          menu._onParentMenuConfigChange, subM);
        menu.renderEvent.unsubscribe(menu._onParentMenuRender, subM);        
      }
      menu.removeItem(itm, gIndex);
    }
  },

  // In order to get the right things to happen
  // if you switch from no menu to a menu, you need to
  // set up some subscriptions.
  _enableMenuBarItem: function(path, params) {      
    var item = this._getMenuBarItem(path);
    item.cfg.setProperty('disabled', false);
    if (params) {
      if (params.setMenuItems) {
        // Needs to be transformed, because it may
        // have entries which have the matconfig specification (label, configvar, panel)
        // And because we're rebinding the variable and the panel each time,
        // we need a function factory. And finally, don't forget that the
        // setMenuItems can be an array of arrays.
        ui = this;
        function toggleFactory (variable, panel) {
          return  function () {
            // This is the menu item.
            ui._togglePanelConfig(variable, panel, this);
          }
        }
        
        function processMenuItems(itemList, recursible) {
          var returnList = [];
          for (var i = 0; i < itemList.length; i++) {
            var t = itemList[i];
            if ((t.constructor === Array) && recursible) {
              returnList.push(processMenuItems(t, false));
            } else if (t.matconfig) {
              var label = t.matconfig.label;
              var variable = t.matconfig.configvar;
              var panel = t.matconfig.panel;
              var s = {
                text: label,
                checked: ui._panelConfig[variable],
                onclick: {
                  fn: toggleFactory(variable, panel)
                }
              }
              returnList.push(s);
              // Make damn sure the panel has the right setting.
              panel.setConfigVar(variable, ui._panelConfig[variable]);              
            } else {
              returnList.push(t);
            }
          }
          return returnList;  
        }
        
        var trueMenuItems = processMenuItems(params.setMenuItems, true);

        var menu = null;
        if (params.setSubmenu) {
          item.cfg.setProperty("submenu", {
            id: params.setSubmenu,
            itemdata: trueMenuItems
          });
          menu = item.cfg.getProperty("submenu");
          // var pMenu = item.parent;
          // pMenu._configureSubmenu(item);
          // You have to remember to render the container.
          menu.render(menu.cfg.getProperty("container")); 
        } else {
          menu = item.cfg.getProperty("submenu");
          menu.clearContent();
          menu.addItems(trueMenuItems);
        }
        menu.render();
      }
      if (params.setClick) {
        item.cfg.setProperty("onclick", params.setClick);
      }
    }
  },
  
  _disableMenuBarItem: function(path, params) {
    var item = this._getMenuBarItem(path);
    if (params) {
      if (params.clearMenuItems) {
        var menu = item.cfg.getProperty("submenu");
        menu.clearContent();
        menu.render();
      }
      if (params.clearSubmenu) {
        var menu = item.cfg.getProperty("submenu");
        var pMenu = item.parent;
        pMenu.clearActiveItem();
        pMenu.cfg.configChangedEvent.unsubscribe(
          pMenu._onParentMenuConfigChange, menu);
        pMenu.renderEvent.unsubscribe(pMenu._onParentMenuRender, menu);
        item.cfg.setProperty("submenu", null);
      }
      if (params.unsetClick) {
        item.cfg.setProperty("onclick", null);
      }
    }
    // Disable it last, so that if we remove a submenu,
    // we don't add the submenu-disabled classes.
    item.cfg.setProperty('disabled', true);
  },

  
  /*
   * menu callbacks
   */

  _togglePanelConfig: function(variable, panel, mItem) {
    if (this._panelConfig[variable]) {
      mItem.cfg.setProperty("checked", false);
      panel.setConfigVar(variable, false);
      this._panelConfig[variable] = false;
    } else {
      mItem.cfg.setProperty("checked", true);
      panel.setConfigVar(variable, true);
      this._panelConfig[variable] = true;
    }
  }
  
});


/*
 *                    File format customizations
 *
 * I need to add some extensions for the various customizations so
 * that we can parametrize the UI. This is already done in the MAT.FileFormats
 * object in mat_core.js for the core.
 *
 */

MAT.FileFormats.formats.raw.ui = {
  activateInFileDialog: function (dialog) {
    dialog.getElement("charEncoding").value = "ascii";
    dialog.getElement("charEncoding").disabled = false;
  },
  deactivateInFileDialog: function (dialog) {
  },
  inheritPreviousFileDialogSettings: function (dialog, data) {
  },
  showSaveDialog: null
};

MAT.FileFormats.formats["fake-xml-inline"].ui = {
  activateInFileDialog: function (dialog) {
    dialog.getElement("charEncoding").value = "utf-8";
    dialog.getElement("charEncoding").disabled = false;
  },
  deactivateInFileDialog: function (dialog) {
  },
  inheritPreviousFileDialogSettings: function (dialog, data) {
  },
  showSaveDialog: null
};

MAT.FileFormats.formats["mat-json"].ui = {
  activateInFileDialog: function (dialog) {
    dialog.getElement("charEncoding").value = "utf-8";
    dialog.getElement("charEncoding").disabled = true;
  },
  deactivateInFileDialog: function (dialog) {
  },
  inheritPreviousFileDialogSettings: function (dialog, data) {
  },
  showSaveDialog: null
};

// This is only a write format. Not sure if I need any of
// these settings.

MAT.FileFormats.formats["mat-json-v1"].ui = {
  activateInFileDialog: function (dialog) {
  },
  deactivateInFileDialog: function (dialog) {
  },
  inheritPreviousFileDialogSettings: function (dialog, data) {
  },
  showSaveDialog: null
};

(function () {

  var E = MAT.Dom._augmentElement;
  var B = MAT.Dom._buildElement;

  // Let's encapsulate this variable.
  var _OVERLAY_ROW_TMPL = '<tr id="xmlIsOverlayRow"><td></td>' +
    '<td>What to do with unknown XML elements:<br> ' +'document type is intended to interpret XML elements as known ' +
      'annotations. It will discard any XML elements not known by the task. If your document ' +
      'contains XML elements intended as annotations <em>as well as</em> XML elements you want ' +
      'to preserve in the signal, select this checkbox: ' +
      '<input id="xmlIsOverlay" type="checkbox" name="xml_input_is_overlay">' +
      '</td></tr>';
  MAT.FileFormats.formats["xml-inline"].ui = {
    activateInFileDialog: function (dialog) {
      dialog.getElement("charEncoding").value = "utf-8";
      dialog.getElement("charEncoding").disabled = false;
      var details = dialog.getElement("filetypedetails");
      details.innerHTML = "";
      // My heavens, this is ugly. I need the menu because I
      // want it to be clear; but it really needs to be a checkbox.
      var hiddenCheckbox = B("input", {attrs: {id: "xmlHiddenCheckbox", type: "checkbox"}, style: {display: "none"}});
      var dContent = B('tr', {
        children: [B('td'), B('td', {
          children: [B("p", {
            children: ["What to do with unknown XML elements:", B("br"),
                       hiddenCheckbox,
                       B("select", {                       
                         attrs: {
                           id: "xmlParams",
                           selectedIndex: 0,
                           // This is ugly. Depending on what the selected option is,
                           // we have to change the actual form name of the input.
                           onchange: function () {
                             if (this.selectedIndex == 0) {
                               hiddenCheckbox.name = "xml_input_default_behavior";
                               hiddenCheckbox.checked = false;
                             } else if (this.selectedIndex == 1) {
                               hiddenCheckbox.name = "xml_translate_all",
                               hiddenCheckbox.checked = true;
                             } else if (this.selectedIndex == 2) {
                               hiddenCheckbox.name = "xml_input_is_overlay";
                               hiddenCheckbox.checked = true;
                             }
                           }
                         },
                         children: [B("option", {text: "Discard them"}),
                                    B("option", {text: "Convert them into annotations"}),
                                    B("option", {text: "Consider them part of an underlying XML document signal"})]
                       })]
          }), B("p", {children: ["More information ",
                                 B("a", {attrs: {href: '/MAT/doc/html/readers_and_writers.html#inline_xml_rw',
                                                 target: '_blank'},
                                         text: "here"}),
                                 "."]})
                    ]
        })]
      });
      E(details, {
        children: [dContent]
      });      
      dialog._ui.updateIDs(dContent, null, dialog._idPrefix);
      details.style.display = null;
    },
    deactivateInFileDialog: function (dialog) {
    },
    inheritPreviousFileDialogSettings: function (dialog, data) {
      if (data.xml_input_is_overlay) {
        dialog.getElement("xmlParams").selectedIndex = 2;
        dialog.getElement("xmlHiddenCheckbox").name = "xml_input_is_overlay";
        dialog.getElement("xmlHiddenCheckbox").checked = true;
      } else if (data.xml_translate_all) {
        dialog.getElement("xmlParams").selectedIndex = 1;
        dialog.getElement("xmlHiddenCheckbox").name = "xml_translate_all";
        dialog.getElement("xmlHiddenCheckbox").checked = true;
      } else {
        dialog.getElement("xmlParams").selectedIndex = 0;
        dialog.getElement("xmlHiddenCheckbox").name = "xml_input_default_behavior";
        dialog.getElement("xmlHiddenCheckbox").checked = false;
      }
    },
    
    // This dialog needs to have its success and failure
    // callbacks updated each time it's called. So I'd better create and
    // destroy it, rather than save it.

    showSaveDialog: function(ui, successCb, failureCb) {

      var obj = ui.fromTemplate("xmlSaveDialogTemplate", "xmlSaveDialog", "ui");
      obj.style.visibility = "hidden";
      document.body.appendChild(obj);
      var u = ui;

      var d = new YAHOO.widget.Dialog(obj, {
        width: "30em",
        fixedcenter: true,
        visible: false,
        modal: true,      
        constraintoviewport: true,
        buttons : [ {text: "OK",
                     handler: function () {
                       successCb(u.getData(this));
                       this.destroy();
                     }
                    },
                    {text: "Cancel",
                     handler: function () {
                       this.cancel();
                       failureCb();
                       this.destroy();
                     }
                    }]
      });

      // We have to register all the dialogs with the overlay
      // manager, so errors will pop up on top of them.
      ui.overlayRegister(d);
      
      d.render();
      
      // Make sure that the "hide" button
      // destroys it. The way to do this is to redefine _doClose, or,
      // more to the point, reregister the callback, because
      // once the function is part of the callback registration,
      // redefining it doesn't do any good.

      if (d.close) {
        YAHOO.util.Event.removeListener(d.close, "click", d._doClose);
      }

      YAHOO.util.Event.on(d.close, "click", function (e) {
        d._doClose(e);
        failureCb();
        d.destroy();
      });

      d.show();
    }

  };
})();

/*
 *                    YAHOO extensions
 *
 *
 * I want to build some stuff on top of the YUI library, but the 
 * loader doesn't guarantee when it's loaded. So...
 *
 */

MAT.WorkbenchUI.loadYUIExtensions = function () {

  MAT.YUIExtensions.loadBugFixes();
    
  // This method seems not to exist. Not sure why.

  YAHOO.widget.Menu.prototype.getItemByName = function(name) {
      
    var aGroups = this._aItemGroups,
      nGroups,
      aItems = [];

    if (YAHOO.lang.isArray(aGroups)) {

      for (var i = 0; i < aGroups.length; i++ ) {

        var g = aGroups[i];

        for (var j = 0; j < g.length; j++) {
          if (g[j].cfg.getProperty("text") == name) {
            return g[j];
          }
        }
      }
    }
  };

  // And in addition to the bug fixes for the menu anchors,
  // here's where the stupid anchor for the container
  // close button is added.

  
  /**
    * The default event handler fired when the "close" property is changed.
    * The method controls the appending or hiding of the close icon at the 
    * top right of the Panel.
    * @method configClose
    * @param {String} type The CustomEvent type (usually the property name)
    * @param {Object[]} args The CustomEvent arguments. For configuration 
    * handlers, args[0] will equal the newly applied value for the property.
    * @param {Object} obj The scope object. For configuration handlers, 
    * this will usually equal the owner.
    */
  YAHOO.widget.Panel.prototype.configClose = function (type, args, obj) {

    var val = args[0],
    oClose = this.close,
    strings = this.cfg.getProperty("strings");

    if (val) {
      if (!oClose) {

        oClose = document.createElement("span");
        oClose.className = "container-close";
        
        this.innerElement.appendChild(oClose);

        oClose.innerHTML = (strings && strings.close) ? strings.close : "&#160;";

        YAHOO.util.Event.on(oClose, "click", this._doClose, this, true);

        this.close = oClose;

      } else {
        oClose.style.display = "block";
      }

    } else {
      if (oClose) {
        oClose.style.display = "none";
      }
    }

  };


/*
 *                    MAT.WorkbenchUI.FileDialog
 *
 *
 * Let's try to use the YAHOO! object system to extend the dialog
 * to create a file dialog. I've resisted refactoring this for a while,
 * but now that we have a file dialog which we pop up from the
 * comparison, it's making all sorts of mess.
 *
 */

  MAT.WorkbenchUI.FileDialog = function (ui, idPrefix, oldDialog) {

    this._idPrefix = idPrefix;
    this._ui = ui;
    this._cbs = null;
    
    // the template now does not contain the hd div so that it can be
    // embedded in another dialog if desired
    var obj = ui.fromTemplate("fileNewDialogTemplate", "fileNewDialog", idPrefix);
    obj.style.visibility = "hidden";    

    // and here is how we add the hd div when it needs to stand alone
    var hd = document.createElement("div");
    hd.setAttribute("class","hd");
    hd.innerHTML = "Load document";
    obj.insertBefore(hd, obj.firstChild);

    // and I think we only want to append it to the document for standalone?
    document.body.appendChild(obj);

    // Update the task menu, percolate choices forward if necessary.
    // Make sure that you update the dialog
    // AFTER you create the new dialog, because some of the cascaded
    // updates require it.
    
    MAT.WorkbenchUI.FileDialog.superclass.constructor.call(this, obj, {
      width : "30em",
      fixedcenter : true,
      visible : false,
      modal: true,
      constraintoviewport : true,
      // Note that "this" will be the dialog itself, at callback time.
      buttons : [ { text:"Open", handler: { fn: this.newFileSubmit }, disabled: true },
		  { text:"Cancel", handler: function () { this.cancel(); } } ]
    });

    this._ui.overlayRegister(this);
    
    // And render it, so we can update the buttons.
    this.render();

    // Add the format options.

    var menu = this.getElement("filetypemenu");
    for (var k in MAT.FileFormats.formats) {
      var fmt = MAT.FileFormats.formats[k];
      if ((fmt.direction === undefined) || (fmt.direction == "in")) {
        var optNode = document.createElement("option");
        optNode.appendChild(document.createTextNode(k));
        menu.appendChild(optNode);
      }        
    }
    
    var s = this.getElement("taskmenu");
    if (this._ui._context.taskTable) {
      var chosenTask = this._ui._populateMenuFromKeys(s, this._ui._context.taskTable, null, null);
      if (oldDialog) {
        var data = this._ui.getData(oldDialog);
        // Now, we should be able to update menu values.
        this._updateMenuFromValue(this.getElement("taskmenu"), data.task);
        this._taskMenuResponse();
        this._updateMenuFromValue(this.getElement("workflowmenu"), data.workflow);
        this._afterTaskMenuResponse();
        this._afterWorkflowMenuResponse();
        this._updateMenuFromValue(this.getElement("filetypemenu"), data.file_type);
        this.updateFileDialogEncodingInfo();
        // Preserve the previous settings.
        this.getElement("charEncoding").value = data.encoding;
        var menu = this.getElement("filetypemenu");
        var selectedValue = menu.options[menu.selectedIndex].value;
        MAT.FileFormats.formats[selectedValue].ui.inheritPreviousFileDialogSettings(this, data);
      } else if (chosenTask) {
        this.updateFileDialog("taskMenu");
      }
    }
    
    this.getButtons()[0].set("disabled", true, true);
  };

  var FileDialog = MAT.WorkbenchUI.FileDialog;

  YAHOO.extend(FileDialog, YAHOO.widget.Dialog, {

    _updateMenuFromValue: function(menu, value) {
      for (var i = 0; i < menu.options.length; i++) {
        var opt = menu.options[i];
        if (opt.value == value) {
          menu.selectedIndex = i;
          break;
        }
      }
    },
    
    // The menu stuff is getting kind of complicated,
    // so let's simplify it. It's a simple sequence, which we can enter
    // at any point.

    updateFileDialog: function(startingWhere) {

      var started = false;
      
      if (startingWhere == "taskMenu") {
        this._taskMenuResponse();
        started = true;
      }

      if (started || startingWhere == "workflowMenu") {
        this._afterTaskMenuResponse();
        started = true;
      }

      if (started || startingWhere == 'inputFile') {
        this._afterWorkflowMenuResponse();
      }
    },

    // Oops, suddenly things are more complex. The workflow
    // menu isn't enabled until the doc format is chosen.
    // And the display configuration isn't chosen until
    // the workflow is chosen.
    // Unconfigure the task. I have to do this later as well,
    // in case the entry point is from the workflow menu.
    // Clear all the menus and leave the workflow menu disabled.

    // The task table is a hash from visible task names to
    // a hash from workflows to relevant data.

    _taskMenuResponse: function() {
      
      var wfMenu = this.getElement("workflowmenu");
      var taskMenu = this.getElement("taskmenu");
      var taskName = taskMenu.options[taskMenu.selectedIndex].value;
      var appObj = this._ui._context.taskTable[taskName];
      /* this._chosenTask = taskName; */

      // the taskMenu has been set. Make sure that
      // the first element ("select...") is disabled.    

      taskMenu.options[0].disabled = true;

      // Clear the workflow menu. Disable it.
      
      this._ui._clearMenu(wfMenu);

      // Disable the file upload field. It can't be
      // cleared programmatically, due to security reasons.
      this.getElement("fileUpload").disabled = true;
      // Ditto the submit button.
      this.getButtons()[0].set("disabled", true, true);
      
      // Now, figure out what the workflows are.
      // They're either the labels in the appObj, or
      // tokens in the doc format.

      this._ui._populateMenuFromKeys(wfMenu, appObj.workflows, null, ["(read-only)", "(reconciliation)", "(comparison)"]);
    },

    // Called when the appmenu is done being updated, or when
    // any of the other menus have a selection made.

    _afterTaskMenuResponse: function() {

      var wfMenu = this.getElement("workflowmenu");
      
      if (wfMenu.selectedIndex > 0) {

        // Disable the "Select..." option.
        wfMenu.options[0].disabled = true;
        var wfName = wfMenu.options[wfMenu.selectedIndex].value;

        // Deal with the reconciliation right now. Later, we deal with
        // read-only.
        if (wfName == "(reconciliation)") {
          // Select mat-json, disable the menu, and then update the file encoding.
          this._updateMenuFromValue(this.getElement("filetypemenu"), "mat-json");
          this.updateFileDialogEncodingInfo();
          this.getElement("filetypemenu").disabled = true;
        } else if (wfName == "(comparison)") {
          // Select mat-json, disable the menu, and then update the file encoding.
          this._updateMenuFromValue(this.getElement("filetypemenu"), "mat-json");
          this.updateFileDialogEncodingInfo();
          this.getElement("filetypemenu").disabled = true;
        } else {
          this.getElement("filetypemenu").disabled = false;
        }        

        // We're all set.

        // Enable the file field.

        this.getElement("fileUpload").disabled = false;
      }
    },

    _afterWorkflowMenuResponse: function() {

      // Enable the submit button.

      if (this.getElement("fileUpload").value) {
        this.getButtons()[0].set("disabled", false, true);
      } else {
        this.getButtons()[0].set("disabled", true, true);
      }      
    },

    getElement: function(childId) {
      return this._ui.getElement(this._idPrefix, childId);
    },
    
    updateFileDialogEncodingInfo: function () {
      var menu = this.getElement("filetypemenu");
      var selectedValue = menu.options[menu.selectedIndex].value;
      var details = this.getElement("filetypedetails");
      details.innerHTML = "";
      details.style.display = "none";
      for (key in MAT.FileFormats.formats) {
        if (key == selectedValue) {
          MAT.FileFormats.formats[key].ui.activateInFileDialog(this);
        } else {
          MAT.FileFormats.formats[key].ui.deactivateInFileDialog(this);
        }
      }
    },

    // This dialog is always MODAL. So when we call it, we're going
    // to stash the callback data, and retrieve it in newFileSubmit.
    // There won't be any clashes, because it's modal.
    
    show: function(cbO) {
      this._cbs = cbO;
      FileDialog.superclass.show.call(this);
    },

    
    // Scope of this function is the new file dialog, conveniently, because
    // that's what we have.

    newFileSubmit: function(event) {
      // First, hide the window.
      var ui = this._ui;
      var attrStore = this._idPrefix;
      this.hide();

      var context = ui._context;
      var cbs = this._cbs;
      
      // We have to submit a form with a human-selected file
      // to do the file upload, so this process needs to create a
      // new document and then load it.

      var data = ui.getData(this);

      if (data.workflow == "(read-only)") {
        data.readonly = true;
        delete data.workflow;
      }
      
      ui.log(null, {action: "open_file_request", file: data.input});    
      var docLabel = context.newDocument(data);

      // Also, stash the load dialog so we can use it later for reloading.
      // We also need to replenish the file new dialog, and update the
      // IDs for the load dialog. But do the ID update first, so that
      // the dialog methods work (no duplicate IDs).

      ui.updateIDs(this.element, this._idPrefix, docLabel);
      // Disable the menus, so the YAHOO Connection manager doesn't use select values.
      ui.getElement(docLabel, "taskmenu").disabled = true;
      ui.getElement(docLabel, "workflowmenu").disabled = true;
      ui.getElement(docLabel, "filetypemenu").disabled = true;

      // Here, we make a new one, because we're going to save this one,
      // and we want the defaults to be the same next time around,
      // so we want them to be copied BEFORE we stash it away.
      ui._replenishOpenFileDialog(attrStore);

      // If we fail, make sure to get rid of the document we just created.
      var failureCb = cbs.failureCb;
      cbs.failureCb = function () {
        if (failureCb) {
          failureCb();
        }
        context.destroyDocument(docLabel);
      }
      
      // Note that here we're calling loadDocument as file upload, and
      // CherryPy uses the absence of input_file to return different
      // headers than if it were AJAX.      
      ui._context.loadDocument(docLabel, cbs);
    }
    
  });

/*
 *                    MAT.WorkbenchUI.MultiFileOpDialog
 *
 *
 * And another one. Once I realized I needed to reuse most of this for
 * the reconciliation, well, it was time for another object...
 *
 */

  // Params are: newID, idPrefix, submitFn, operation, fileOpenerKey, addFileCb, renderRowCb.
  // renderRowCb takes docLabel, tBody.
  
  MAT.WorkbenchUI.MultiFileOpDialog = function (ui, params) {
    this._ui = ui;
    var newID = params.newID;
    var idPrefix = this._idPrefix = params.idPrefix;
    this._fileOpenerKey = params.fileOpenerKey;
    this._addFileCb = params.addFileCb;
    this._renderRowCb = params.renderRowCb;
    // This is intentionally "public" so that clients can do other
    // things with it. In particular, it will have to be reordered by
    // the comparison tool.
    this.docLabels = [];
    var submitFn = params.submitFn;
    var operation = params.operation;
    var obj = ui.fromTemplate("multipleFileTaskDialogTemplate", newID, idPrefix);
    obj.style.visibility = "hidden";    
    document.body.appendChild(obj);

    // Update the task menu, percolate choices forward if necessary.
    // Make sure that you update the dialog
    // AFTER you create the new dialog, because some of the cascaded
    // updates require it.

    MAT.WorkbenchUI.MultiFileOpDialog.superclass.constructor.call(this, obj, {
      // there's going to be a menu of file descriptions, which will
      // expand. So This shouldn't be a fixed width, and I need to recenter
      // it every time I expand the menu.
      // width : "30em",
      fixedcenter : true,
      visible : false,
      modal: true,
      constraintoviewport : true,
      // Note that "this" will be the dialog itself, at callback time.
      buttons : [ { text: operation, handler: { fn: submitFn }, disabled: true },
		  { text:"Cancel", handler: function () { this.cancel(); } } ]
    });

    ui.overlayRegister(this);
    
    // And render it, so we can update the buttons.
    this.render();
    
    this.getElement("multiFileHeader").innerHTML = operation;
    this.getElement("multiFilePrompt").innerHTML = operation;
    
    var s = this.getElement("taskmenu");    
    if (ui._context.taskTable) {
      ui._populateMenuFromKeys(s, ui._context.taskTable, null, null);
    }
    
    this.getButtons()[0].set("disabled", true, true);
  };

  var MultiFileOpDialog = MAT.WorkbenchUI.MultiFileOpDialog;

  YAHOO.extend(MultiFileOpDialog, YAHOO.widget.Dialog, {
    
    getElement: function(childId) {
      return this._ui.getElement(this._idPrefix, childId);
    },

    // When we redisplay it, we need to see whether the task has been selected.
    // If it has, repopulate the menu.

    reset: function () {
      var taskMenu = this.getElement("taskmenu");
      var addDocMenu = this.getElement("adddocmenu");
      if (taskMenu.selectedIndex > 0) {
        this._taskMenuResponse();
      } else {
        addDocMenu.disabled = true;
      }
      // And remove all the existing elements.
      this._clearFileList();
      this.docLabels = [];
      this.getButtons()[0].set("disabled", true, true);
      this.getElement("selectRefText").style.display = 'none';
    },

    // The menu stuff is getting kind of complicated,
    // so let's simplify it. It's a simple sequence, which we can enter
    // at any point.

    updateMultiFileDialog: function(startingWhere) {

      // If you're changing the task menu, you have to
      // check to see what the task is.
    
      if (startingWhere == "taskMenu") {
        this._taskMenuResponse();
      } else if (startingWhere == "addFileButton") {
        // This doesn't cascade the way the open file dialog does.
        this._addFileResponse();
      }
    },

    // All this does is enable the comparison menu.
  
    _taskMenuResponse: function(addDocMenu) {

      var addDocMenu = this.getElement("adddocmenu");
      var taskMenu = this.getElement("taskmenu");
      var taskName = taskMenu.options[taskMenu.selectedIndex].value;

      // Now, populate the document list.
      var docs = this._ui._context.getDocuments({taskName: taskName});
      this._ui._clearMenu(addDocMenu);
      docs.sort(function(a, b) { return a.docCounter - b.docCounter; });
      for (var i = 0; i < docs.length; i++) {
        if (docs[i].currentDocument.doc.isReconciliationDoc() || docs[i].currentDocument.doc.isComparisonDoc()) {
          continue;
        }
        // The menu already has Load document... in it.
        var optNode = document.createElement("option");
        optNode.setAttribute("value", docs[i].docLabel);
        optNode.appendChild(document.createTextNode(docs[i].getDescription()));
        addDocMenu.appendChild(optNode);
      }
      addDocMenu.disabled = false;
      // And enable the "Go!" button.
      this.getElement("docsubmitmenu").disabled = false;
    },

    _addFileResponse: function () {
      var addDocMenu = this.getElement("adddocmenu");
      var selectedOption = addDocMenu.options[addDocMenu.selectedIndex].value;
      if (selectedOption == "Load document...") {
        // We need to go get the document, and THEN continue.
        if (this._ui._fileNewDialogs[this._fileOpenerKey] == null) {
          this._ui._replenishOpenFileDialog(this._fileOpenerKey);
        }
        YAHOO.util.Dom.addClass(this._ui._fileNewDialogs[this._fileOpenerKey].element, "suppressedMenus");
        var dialog = this._ui._fileNewDialogs[this._fileOpenerKey];
        var taskMenu = this.getElement("taskmenu");
        var taskName = taskMenu.options[taskMenu.selectedIndex].value;
        dialog._updateMenuFromValue(dialog.getElement("taskmenu"), taskName);
        // I have to clear the menu and then populate it with (read-only), which will be automatically selected.
        this._ui._clearMenu(dialog.getElement("workflowmenu"));
        this._ui._populateMenuFromKeys(dialog.getElement("workflowmenu"), {}, null, ["(read-only)"]);
        dialog.updateFileDialog("workflowMenu");
        var ui = this._ui;
        var d = this;
        dialog.show({
          form: dialog.getElement("controlForm"),
          panelCreationParams: {
            // These are used to create the pane.
            dialog: dialog,
            initiallyHidden: true
          },
          successCb: function (docLabel) {
            var aDoc = ui._context.getDocument(docLabel);
            // And we check if the signal matches. If it doesn't, then we barf.
            if ((d.docLabels.length > 0) &&
                (aDoc.currentDocument.doc.signal != ui._context.getDocument(d.docLabels[0]).currentDocument.doc.signal)) {
              ui.error(null, "Signal doesn't match existing files.");
              // And then get rid of the document.
              ui._context.destroyDocument(docLabel);
            } else if (aDoc.currentDocument.doc.isReconciliationDoc()) {
              ui.error(null, "Can't use a reconciliation document as an input to another reconciliation document.");
              ui._context.destroyDocument(docLabel);
            } else {
              // But I DO need to add it to the doc menu (disabled).
              addDocMenu.appendChild(MAT.Dom._buildElement("option", {attrs: {disabled: true, value: docLabel},
                                                                      text: aDoc.getDescription()}));
              // And I DO need to add the selected option.
              d._addFile(aDoc.docLabel);
            }
          },
          failureCb: function () {
            dialog.destroy();
          }
        });
      } else {
        // The selected option is a docLabel, so we can add that option.
        this._addFile(selectedOption);
        addDocMenu.selectedIndex = 0;
      }
    },

    _addFile: function(docLabel) {
      this.docLabels.push(docLabel);
      if (this._addFileCb) {
        this._addFileCb.call(this, docLabel);
      }
      this.renderFileList();
    },

    renderFileList: function() {
      this._clearFileList();
      var tbl = this.getElement("multiFileTable");
      var M = MAT.Dom._buildElement;
      var A = MAT.Dom._appendChild;
      for (var i = 0; i < this.docLabels.length; i++) {
        var tBody = A(tbl, M("tbody", {attrs: {className: "fileentry", docLabel: this.docLabels[i]}}));
        this._renderRowCb(this.docLabels[i], tBody);
      }
      // Make sure that the submit button is enabled or disabled appropriately.
      if (this.docLabels.length > 1) {
        this.getButtons()[0].set("disabled", false, true);
      } else {
        this.getButtons()[0].set("disabled", true, true);
      }
      
      // Finally, go through the doc menu. Disable this one, and if this is the first element,
      // disable everything that doesn't match the signal.
      var addDocMenu = this.getElement("adddocmenu");
      var opts = addDocMenu.options;
      // Skip the first, because it's load document.
      var knownLabels = {};
      for (var j = 0; j < this.docLabels.length; j++) {
        knownLabels[this.docLabels[j]] = true;
      }

      var doc = null;
      
      for (var i = 1; i < opts.length; i++) {
        var dLabel = opts[i].value;
        opts[i].disabled = false;
        if (knownLabels[dLabel] !== undefined) {
          opts[i].disabled = true;
        } else if (this.docLabels.length >= 1) {
          if (doc == null) {
            doc = this._ui._context.getDocument(this.docLabels[0]);
          }
          var d = this._ui._context.getDocument(dLabel);
          if (d.currentDocument.doc.signal != doc.currentDocument.doc.signal) {
            opts[i].disabled = true;
          }
        }
      }
      // Now, recenter, because the new file may be longer than what we had previously.
      this.center();

    },

    _clearFileList: function () {
      var elts = YAHOO.util.Dom.getElementsByClassName("fileentry", "tbody", this.getElement("multiFileTable"));
      for (var i = 0; i < elts.length; i++) {
        var e = elts[i];
        e.parentNode.removeChild(e);
      }
    }

  });

/*
 * 
 *                    MAT.WorkbenchUI.UITabView
 *
 * This tab view will do special things on resize, and when it's
 * adding a tab, to ensure that it never has more than one row.
 *
 */

  MAT.WorkbenchUI.UITabView = function(ui, layoutUnit, params) {
    MAT.WorkbenchUI.UITabView.superclass.constructor.call(this);
    this._ui = ui;
    // We passed an element; it was moved into the body of the layout unit.
    this.appendTo(layoutUnit.body.firstChild);
    this.setStyle('display', 'none');
    this.currentTabContent = null;
    this.hideButton = params && params.hideButton;
    this.closeButton = params && params.closeButton;
    this.toolTip = params && params.toolTip;
    this.layoutUnit = layoutUnit
    this._ttCounter = 0;

    // Both this and index change get called. You only
    // need to subscribe to one. But note that this doesn't
    // get called when the final tab is removed.
    
    this.subscribe('beforeActiveTabChange', function(e) {
      if (this.currentTabContent != null) {
        // Deselect and select.
        this.currentTabContent.deselect();
      }
      this.currentTabContent = e.newValue.assignedTabContent;
      this.currentTabContent.select();      
    });
    
    // This is only fired when the tab really changes.
    this.subscribe('activeTabChange', function(e) {
      if (this.currentTabContent) {
        this.currentTabContent.afterSelect();
      }
    });
  };

  YAHOO.extend(MAT.WorkbenchUI.UITabView, YAHOO.widget.TabView, {
    
    addTabContent: function (tabContent) {
      if (this.get("tabs").length == 0) {
        // We're about to add it. Show the view.
        this.setStyle("display", null);
      }
      // If I pass a labelEl to the widget, it's gotta be
      // exactly what the label would be constructed as in YUI.
      // I want a child span which contains the actual label, and
      // I can append buttons to the parent span.
      var labelChildren = [tabContent.tabLabel];
      // I'm going to add hide and close buttons to the label element.
      if (this.hideButton || tabContent.hideButton) {
        labelChildren.push({
          label: "span",
          text: "-",
          attrs: {
            className: "tabControlButton",
            onclick: function (e) {
              tab.assignedTabContent.hide();
              e.stopPropagation();
              return false;
            }
          }
        });
      }
      if (this.closeButton || tabContent.closeButton) {
        labelChildren.push({
          label: "span",
          text: "x",
          attrs: {
            className: "tabControlButton",
            onclick: function (e) {
              tab.assignedTabContent.close();
              e.stopPropagation();
              return false;
            }
          }
        });
      }

      var tab = new YAHOO.widget.Tab({
        contentEl: tabContent.contentEl,
        labelEl: MAT.Dom._buildElement("em", {children: labelChildren})
      });

      // Originally, I was using the length of the tabs as the differentiating suffix. But
      // in the case where you create a tab, create a second tab, then delete the first
      // tab, and create a third, the second two tabs will have the SAME SUFFIX. So, duh,
      // I need to use a counter.      
      if (this.toolTip) {
        tab.toolTip = new YAHOO.widget.Tooltip(this.layoutUnit.get('body') + '_tt' + this._ttCounter, {
          context: tab.get('element'),
          text: tabContent.label
        });
        this._ttCounter += 1;
        // And since the label may change...
        tab.toolTip.contextMouseOverEvent.subscribe(function () {
          this.cfg.setProperty("text", tabContent.label);
        });
      }

      // Note that this computation would have to be redone when the
      // enclosing panel is resized. Grrr. Do I want to do this?
      // Add it, make it active.

      this.addTab(tab);
      tabContent.installedTab = tab;
      tab.assignedTabContent = tabContent;
      this.set("activeTab", tab, false);
      // We have to set the size of the panel.
      this._setPanelSize();
    },

    removeTabContent: function (tabContent) {
      if (tabContent.installedTab) {
        if (tabContent.installedTab.toolTip) {
          var tt = tabContent.installedTab.toolTip;
          // It's not enough to destroy the tooltip, because we're
          // possibly in the odd situation that we're hovering over
          // the tab (on the hide or close button). Usually, the timeouts
          // are managed via mousein/mouseout, but if the tooltip
          // is destroyed before one of those timeouts expires, well,
          // that's a bad thing.
          if (tt.hideProcId) {
            clearTimeout(tt.hideProcId);
            tt.hideProcId = null;
          }
          if (tt.showProcId) {
            clearTimeout(tt.showProcId);
            tt.showProcId = null;
          }
          tt.destroy();
          tabContent.installedTab.toolTip = null;
        }          
        this.removeTab(tabContent.installedTab);
        tabContent.installedTab = null;
        if (this.get("tabs").length == 0) {
          // If it's the last tab, activeTab doesn't get
          // set, so we need to deselect here.
          tabContent.deselect();
          this.currentTabContent = null;
          // We just removed it. Show the view.
          this.setStyle("display", "none");
          // BUG in YUI. If you remove the last tab, activeTab
          // isn't cleared.
          this._configs.activeTab.value = undefined;
          this._configs.activeIndex.value = undefined;
        }
        this._setPanelSize();
      }
    },

    closeActiveTab: function () {
      if (this.currentTabContent) {
        this.currentTabContent.close();
      }
    },

    hideActiveTab: function () {
      // I'll do something different if we're in a menu, but for
      // now, let's not worry about it.
      // To hide, we remove the current tab content.
      if (this.currentTabContent) {
        this.currentTabContent.hide();
      }
    },

    _resizePanel: function() {
      this._setPanelSize();
      if (this.currentTabContent) {
        this.currentTabContent.onResize();
      }
    },

    _setPanelSize: function () {
      // The tab set will have a height. Set the entire navset
      // position: relative, and the two children to be
      // fixed at 0 and the bottom, and the height of the tab
      // set to be the boundary between.
      var panel = this.get("element");
      var tabs = YAHOO.util.Dom.getElementsByClassName("yui-nav", null, panel)[0];
      var content = YAHOO.util.Dom.getElementsByClassName("yui-content", null, panel)[0];
      var height = tabs.offsetHeight;
      content.style.top = height + "px";
    }
  });

/*
 *                    MAT.WorkbenchUI.UITabContent
 *
 * Now, let's set up the basic tab capability for the UI. This will
 * be what's IN the tab; the tab view is going to manage whether a tab
 * gets created, or whether one gets reused.
 *
 */

  MAT.WorkbenchUI.UITabContent = function (tabView, title, tabLabel, elt /*, params */) {
    this.contentEl = elt;
    this.label = title;
    // tabLabel can be a string or a span.
    if (tabLabel) {
      if (tabLabel.constructor === String) {
        this.tabLabel = MAT.Dom._buildElement("span", {
          text: tabLabel
        });
      } else {
        // It had better be an element.
        this.tabLabel = tabLabel;
      }
    } else {
      this.tabLabel = MAT.Dom._buildElement("span");
    }
    this._tabView = tabView;
    this.installedTab = null;
    this._closing = false;
    this.closeButton = false;
    this.hideButton = false;
    if (arguments.length > 4) {
      this.closeButton = arguments[4].closeButton || false;
      this.hideButton = arguments[4].hideButton || false;
    }
  };

  MAT.Extend(MAT.WorkbenchUI.UITabContent, {

    // The tab is associated with one of the tab views in the
    // UI. But the tab view is not necessarily visible (it's
    // only visible if it has at least one tab).

    // show() is called when the tab content is inserted into a tab.
    show: function () {
      if (!this.installedTab) {
        this._tabView.addTabContent(this);
      }
    },

    // hide() is called when the tab content is removed from a tab.
    hide: function () {
      if (this.installedTab) {
        this._tabView.removeTabContent(this);
      }
    },

    // Make sure it's installed, and if it is, then make it the
    // active tab.
    makeActive: function() {
      if (!this.installedTab) {
        this.show();
      } else {
        this._tabView.set('activeTab', this.installedTab);
      }
    },

    // select() is called when the tab is selected, immediately
    // before the tab is made active.
    select: function () {
    },

    // afterSelect() is called after the tab is made active.
    afterSelect: function() {
    },

    isSelected: function() {
      // It's selected if it's installed and it's the current tab content.
      return (this.installedTab && (this._tabView.currentTabContent === this));
    },

    // deselect() is called when the tab is deselected.
    deselect: function () {
    },

    // onResize is called when the panel is resized. I'll
    // need it at the very least in the document panes.
    onResize: function() {
    },

    // close() is called when the tab content is removed from the UI entirely.
    
    close: function () {
      if (!this._closing) {
        this._closing = true;
        // Remove it from the tab.
        this.hide();
        this._close();
      }        
    },

    // This is the function that should be specialized for close.
    // Remember, by the time it's called, hide() has already happened.
    _close: function () {
    },

    updateTabLabel: function(s) {
      this.tabLabel.innerHTML = "";
      this.tabLabel.appendChild(document.createTextNode(s));
    },
    
    // I don't think anything needs to happen here - I think it's
    // a layover from the previous UI.
    destroy: function () {
      // Actually, it's probably just analogous to close.
      this.close();
    }
    
  });  

/*
 * A tab for the annotation popup. We have to be careful how we register
 * the visual display. This is only in response to a value being set elsewhere.
 * This implies that the popup body has to register itself, and that the
 * registration here is EXCLUSIVELY for the header.
 */

  MAT.WorkbenchUI.AnnotationEditorTab = function(annot, docPanel) {
    this._docPanel = docPanel;
    this._contentDiv = MAT.Dom._buildElement("div", {
      style: {
        height: "100%",
        width: "100%",
        overflow: "auto"
      }
    });
    this._labelDisplay = new MAT.DocDisplay.AnnotationNameDisplay(annot, this._docPanel, {
      formatParams: {
        showIndices: true,
        showFormattedName: true,
        formattedNameFormatString: "$(_text:truncate=20)",
        expandEffectiveLabel: true
      }
    });
    // The title can be empty because it's used for the tooltip, and that's it.
    MAT.WorkbenchUI.AnnotationEditorTab.superclass.constructor.call(
      this, ui._detailsTabView, null, this._labelDisplay.span,
      this._contentDiv, {
        closeButton: true
      }
    );
    this._docPanel._annotationEditorTabs[annot.id] = this;
    this.annot = annot;
    // If it's a managed display, it has to have a unique display ID.
    this.displayId = this._docPanel._ui.getDisplayCounter();
    // We only need to make sure this is removed when the annotation is removed.
    this.annot.doc.rd.registerEvents(this.annot, this, [{
      event_name: "remove_annotation",
      action: "remove"
    }]);
    this._tableDisp = null;
  };

  var AnnotationEditorTab = MAT.WorkbenchUI.AnnotationEditorTab;

  // So when we deselect the docPanel, this tab will hide. When
  // it's selected, this tab will be shown. When we
  // close this tab, we remove it from its parent's list of editors.
  // I think that's pretty much it.

  // Not quite. It's gotta implement the visualDisplay interface, and the viewContainer
  // interface for the popup.
  
  YAHOO.extend(AnnotationEditorTab, MAT.WorkbenchUI.UITabContent, {

    // viewContainer interface.
    getAnnotationDisplayDiv: function() {
      return this._contentDiv;
    },

    // This one already knows what the annot is, because it was able to create
    // the annotation. Not always true (see standalone viewer, e.g.).
    notifyVisualDisplay: function(annot, disp) {
      this._tableDisp = disp;
      if (this._tableDisp._firstForFocus) {
        this._tableDisp._firstForFocus.focus();
      }
    },

    // If you're registered as a display, you have to know how to delete,
    // too. We don't need forceRedisplayResponse(), because all it does is remove.

    forceRemoveRedisplayResponse: function() {
      // Do NOT do this on the _tableDisp. The _tableDisp takes care
      // of itself, and has to, because you only want this to redisplay
      // the stuff that needs redisplaying, which means the annotation
      // editor should not cause itself to redisplay indirectly.
      // And when this is called when the remove gesture is fired, the
      // removal of the registration happens automatically.
      this.close();
    },

    // This is called when the editor tab is hidden. We want to instruct
    // the table itself to remove all the custom editors.
    deselect: function() {      
      this._tableDisp.hide();
    },
    
    _close: function() {
      delete this._docPanel._annotationEditorTabs[this.annot.id];
      this._labelDisplay.unregister();
      this.annot.doc.rd.unregisterDisplay(this);
      // And we have to make sure that the display does its own cleanup.
      this._tableDisp._close();
    }
  });
  
/*
 * And a tab for the annotation tables. Ultimately, we'll have the
 * current annotation table subscribe to the resize.
 */


  MAT.WorkbenchUI.AnnotationTableTab = function(docPanel) {
    this._docPanel = docPanel;
    this._doc = docPanel.getDocument();
    this._contentDiv = MAT.Dom._buildElement("div", {
      style: {
        height: "100%",
        width: "100%",
        overflow: "auto"
      }
    });
    var label = "Annotation tables for " + this._doc.getShortDescription();
    // I wanted to put the menu span in the tab itself, but it turns out that
    // Firefox (14) does something really odd - onchange never gets called, and
    // the menu can't be reselected until something else is selected first.
    // Works fine in Safari, but that ain't good enough. I have to sacrifice
    // either horizontal or vertical space. Let's pick vertical.
    var B = MAT.Dom._buildElement;
    this._menuSpan = B("span", {
      attrs: {
        className: "compact"
      }
    });    
    MAT.WorkbenchUI.AnnotationTableTab.superclass.constructor.call(
      this, docPanel._ui._detailsTabView, label, label,
      this._contentDiv);
    this._currentLabel = null;
    this._currentAtype = true;
    this.attachToDoc();
  };

  var AnnotationTableTab = MAT.WorkbenchUI.AnnotationTableTab;

  // So when we deselect the docPanel, this tab will hide. When
  // it's selected, this tab will be shown. When we
  // close this tab, we remove it from its parent's list of editors.
  // I think that's pretty much it.

  // Not quite. It's gotta implement the visualDisplay interface, and the viewContainer
  // interface for the popup.
  
  YAHOO.extend(AnnotationTableTab, MAT.WorkbenchUI.UITabContent, {

    attachToDoc: function() {
      this._trueDoc = this._doc.currentDocument.doc;
      // If it's a managed UI, it has to have an id, and also
      // forceRedisplayResponse.
      this.displayId = this._docPanel._ui.getDisplayCounter();
      this._trueDoc.addVisualDisplay(this);
      // Render it. We need to create a data table. Only the content annotations
      // should be displayed. You also need a menu of which type is being displayed.
      // Redraw the data table each time the menu changes; don't cache.
      // Or, more to the point, cache until you get annotations changed or removed,
      // and then invalidate the cache for those types.
      this._dtCache = {};
      this._tableDiv = null;
      this._annotMenu = null;
      this._renderDoc();
    },

    _renderDoc: function() {
      // This can be called when the current atype and label are set.
      this._contentDiv.innerHTML = "";
      var M = MAT.Dom._buildElement;
      var A = MAT.Dom._appendChild;
      /*var td = M("td");
      var tr = M("tr", {style: {verticalAlign: "top"}, children: [td]});
      var tbl = M("table", {children: [tr]});
      A(this._contentDiv, tbl);*/
      var tDiv = M("div");      
      this._tableDiv = tDiv;
      A(this._contentDiv, this._menuSpan);
      A(this._contentDiv, tDiv);

      var disp = this;
      
      function cb(item) {
        disp._renderTable(item.value, item.onclick.obj.atype, null);
      }

      // The types we want to use are from the GLOBAL table AND the local one.
      // Right now, I can't use the YUI menus, but I don't want to lose the
      // code, so I'm going to encapsulate it AND a common interface for a
      // simpler select menu.
      
      var itemData = [];
      // Display the first item, unless we already have an atype.
      var itemToDisplay = 0;
      for (var lab in this._trueDoc.annotTypes.typeTable) {
        var atype = this._trueDoc.annotTypes.typeTable[lab];
        if (MAT.Annotation.AnnotationType.isContentType(atype.category)) {
          var label = this._computeAnnotationTableMenuLabel(lab, atype);
          if (this._currentLabel == lab) {
            itemToDisplay = itemData.length;
            this._currentLabel = this._currentAtype = null;
          }
          itemData.push({text: label, value: lab, onclick: {fn: cb, obj: {atype: atype}}});
        }
      }
      if (this._trueDoc.annotTypes.globalATR) {
        var globalATR = this._trueDoc.annotTypes.globalATR;
        for (var lab in globalATR.typeTable) {
          var atype = globalATR.typeTable[lab];
          if ((this._trueDoc.annotTypes.typeTable[lab] === undefined) &&
              MAT.Annotation.AnnotationType.isContentType(atype.category)) {
            var label = lab;
            if (!atype.hasSpan) {
              label += " (spanless)";
            }
            label += " (0)";
            if (this._currentLabel == lab) {
              itemToDisplay = itemData.length;
              this._currentLabel = this._currentAtype = null;
            }
            itemData.push({text: label, value: lab, onclick: {fn: cb, obj: {atype: atype}}});
          }
        }            
      }

      /*var bDiv = M("div", {attrs: {className: "compact"}});
      A(td, bDiv);*/
      this._menuSpan.innerHTML = "";
      this._annotMenu = new MAT.WorkbenchUI.SimpleMenu(this._menuSpan /*bDiv*/, itemData);
      
      if (itemToDisplay > 0) {
        // This is the case where we are reattaching an existing table. We have to move the
        // menu ourselves.
        this._annotMenu.setSelectedItem(itemData[itemToDisplay].value);
      }

      /*
      this._tableDiv = M("td");      
      A(tr, this._tableDiv);*/
      // And render the appropriate thing.
      this._renderTable(itemData[itemToDisplay].value, itemData[itemToDisplay].onclick.obj.atype, null);
    },

    // I use this when we compute the menu, and when we force a redisplay.
    // Note that the labels are TRUE labels, not effective labels.
    
    _computeAnnotationTableMenuLabel: function(lab, atype) {
      var hasSpan = atype.hasSpan;
      var label = lab;
      if (!hasSpan) {
        label += " (spanless)";
      }
      var len = 0;
      if (this._trueDoc.annotTypes.annotTable[lab]) {
        len = this._trueDoc.annotTypes.annotTable[lab].length;
      }
      return label + " (" + len + ")";
    },
    
    forceRedisplayResponse: function(events) {

      var annotsChanged = {};
      var annotsRemoved = {};
      var foundAnnotsChanged = false;
      var foundAnnotsRemoved = false;
      
      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        // for now, "modify_annotation", "attach_child" and "detach_child" all come
        // from this file or the popup manager.
        if ((event.event_name == "add_annotation") ||
            (event.event_name == "modify_extent") ||
            (event.event_name == "modify_annotation") ||
            (event.event_name == "detach_child") ||
            (event.event_name == "attach_child") ||
            (event.event_name == "attach_to_parent") ||
            (event.event_name == "detach_from_parent")) {
          annotsChanged[event.annot.id] = event.annot;
          foundAnnotsChanged = true;
        } else if (event.event_name == "remove_annotation") {
          annotsRemoved[event.annot.id] = event.annot;
          foundAnnotsRemoved = true;
        }
      }
      
      // For annotations that are changed, update the row.
      // For annotations which are removed, remove the row. If
      // the row should be updated but you can't find it, just invalidate
      // the cache for that label and start over. If you're changing
      // an annotation and the number of columsn is different, then
      // just invalidate the cache for that label.

      // It's a bit more complicated when you add something and the table
      // is already sorted. The table DOES NOT KNOW ITS ORIGINAL ORDER.
      // It also, internally, doesn't do anything smart with mapping
      // record IDs to indices. The best it can do is search. And addRow()
      // doesn't return the row object. Sigh...

      // So my map should always be from annotation IDs to row IDs, which
      // I have to retrieve each time I add a row. And when I modify or add a row, I
      // have to check the sorting and then re-sort if necessary.

      // Here's an update bug. If the annot that's changed is an element
      // of the annot, we have to register the cell separately, the same way
      // we have to for the annotation editor.
      
      var currentInvalidated = false;
      var currentSort = null;
      var redisplayMenuLabel = {};

      // I was hoping to be clever, and only change the menu labels if we're adding
      // or removing an annotation. But the problem is that we don't have all this
      // information if there's no table to start with. So for the moment, I'm
      // just going to update them all.
      
      if (foundAnnotsChanged) {
        for (var annotId in annotsChanged) {
          if (!annotsChanged.hasOwnProperty(annotId)) {
            continue;
          }
          var a = annotsChanged[annotId];
          // This should probably be the effective label.
          redisplayMenuLabel[a.atype.label] = a.atype;
          var e = this._dtCache[a.atype.label];
          // What if there's no dtCache entry because there are no annotations
          // known? That's a problem. So if there's no entry, but this is the
          // current label, invalidate.
          if (e) {
            // If there's already an entry...
            var sortEntry = e.dt.get("sortedBy");
            if (a.atype.attrs.length != e.colCount) {
              // If the column counts don't match, just start over.
              for (var k in e.idToVisuals) {
                // Clear all the annotation callbacks.
                var c = e.idToVisuals[k];
                for (var dp in c.attrs) {
                  c.attrs[dp].clear();
                }
                if (c.parent) {
                  c.parent.clear();
                }
              }
              delete this._dtCache[a.atype.label];
              if (a.atype.label == this._currentLabel) {
                currentInvalidated = true;
                currentSort = sortEntry;
              }
            } else {
              var aRow = e.idToIdx[a.id];
              if (aRow == null) {
                // Can't find a row to update. Let's assume that means it's a new annotation.
                e.dt.addRow(this._extractData(e, a, a.atype, e.fieldData));
                // Recompute the idToIdx table, since we added a row.
                this._recomputeIdToIdx(e);
              } else {
                // OK, we have the row to update.
                // BUG. This is kind of hideous. If you try to update the row
                // using the index, YUI will try to find the row in the DOM, rather than
                // looking for it in the records. This is backward, because it ALWAYS
                // wants the record, but only SOMETIMES wants the DOM element (if the
                // "page" is visible). So I can't actually pass in a string - I need
                // to get the record itself, which involves an idiotic double search
                // through the list (once to get the record from the ID, and another to
                // find the record to update given the ID).
                if (a.atype.label == this._currentLabel) {
                  // If we're looking at the table, we don't need to jump through those hoops.
                  e.dt.updateRow(aRow, this._extractData(e, a, a.atype, e.fieldData));
                } else {
                  e.dt.updateRow(e.dt.getRecordSet().getRecord(aRow), this._extractData(e, a, a.atype, e.fieldData));
                  // And render it if it's not currently visible. This seems necessary.
                  // Not necessary for adding, oddly enough, but definitely for removing.
                  e.dt.render();
                }
              }
              // Force it.
              if (sortEntry) {
                e.dt.sortColumn(sortEntry.column, sortEntry.dir);
              }
            }
          } else if (a.atype.label == this._currentLabel) {
            // There's no entry, but we have an annotation. Invalidate.
            // This may be the case because a previous annotation already
            // invalidated the cache, or because there was no entry to start with.
            currentInvalidated = true;            
          }
        }
      }
      
      if (foundAnnotsRemoved) {
        for (var annotId in annotsRemoved) {
          if (!annotsRemoved.hasOwnProperty(annotId)) {
            continue;
          }
          var a = annotsRemoved[annotId];
          redisplayMenuLabel[a.atype.label] = a.atype;
          var e = this._dtCache[a.atype.label];
          if (e) {
            var aRow = e.idToIdx[a.id];
            if (aRow != null) {
              // There's a row to delete. Note that we have the same problem
              // here as we do with updating.
              if (a.atype.label == this._currentLabel) {
                e.dt.deleteRow(aRow);
              } else {
                e.dt.deleteRow(e.dt.getRecordSet().getRecord(aRow));
                e.dt.render();
              }
              delete e.idToIdx[a.id];
              // Clear the annotation callbacks.
              var c = e.idToVisuals[a.id];
              if (c) {
                for (var dp in c.attrs) {
                  c.attrs[dp].clear();
                }
                if (c.parent) {
                  c.parent.clear();
                }
                delete e.idToVisuals[a.id];
              }
            }
          }
        }
      }
      if (currentInvalidated) {
        var lab = this._currentLabel;
        // Force the redraw.
        this._currentLabel = null;
        this._renderTable(lab, this._currentAtype, currentSort);
      }
      
      // Update a bunch of things: the entry in the menu,
      // the menu button if the label is _currentLabel,
      // and the data in the callback.

      for (var k in redisplayMenuLabel) {
        if (redisplayMenuLabel.hasOwnProperty(k)) {
          // By value.
          this._annotMenu.setItemLabel(k, this._computeAnnotationTableMenuLabel(k, redisplayMenuLabel[k]))
        }
      }
    },

    _recomputeIdToIdx: function(e) {
      var dt = e.dt;
      var d = {};
      var records = dt.getRecordSet().getRecords();
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        d[r.getData("_aid")] = r.getId();
      }
      e.idToIdx = d;
    },    
    
    _close: function() {
      this._trueDoc.removeVisualDisplay(this);
    },

    _renderTable: function(lab, atype, currentSort) {
      var hasSpan = atype.hasSpan;
      if (lab == this._currentLabel) {
        return;
      }
      this._currentLabel = lab;
      this._currentAtype = atype;
      
      // Build a data table. It depends on the annotation. If there are
      // no annotations of that type, we have to print out no annotations known,
      // because we don't necessarily have an atype, and I don't want to
      // force the presence of an atype just for display purposes.
      var annots = this._trueDoc.annotTypes.getAnnotations(lab);
      if (annots.length == 0) {
        this._tableDiv.innerHTML = "No annotations found.";
      } else {
        // Build a data table.      
        this._tableDiv.innerHTML = "";        
        var dtEntry = this._dtCache[lab];
        if (!dtEntry) {
          // Has to exist, since we have data.
          var atype = this._trueDoc.annotTypes.typeTable[lab];
          // I want to store the mapping between the annotation order and the
          // annot IDs, and the convert flags.
          dtEntry = {
            label: lab,
            trueD: MAT.Dom._buildElement("div"),
            idToIdx: {},
            // This is a hash from annotation IDs to MAT.DocDisplay.AnnotationVisualDisplayContainer
            // objects.
            idToVisuals: {},
            fieldData: [],
            mightHaveReferences: false,
            // If this gets longer, we just want to invalidate the whole cache.
            colCount: atype.attrs.length
            // And dt will be added below.
          };
          var disp = this;
          // First, prepare the headers.
          var fields = [];
          var fieldKeys = ["_aid"];
          var data = [];
          var globalAtype = this._trueDoc.annotTypes.globalATR.typeTable[lab];
          var isEditable = this._docPanel._handAnnotationAvailable && globalAtype.isEditable();
          var isViewable = globalAtype.isViewable();
          for (var k in globalAtype.usedInTable) {
            if (globalAtype.usedInTable.hasOwnProperty(k)) {
              dtEntry.mightHaveReferences = true;
              break;
            }
          }
          if (atype.hasSpan) {
            fields = [{key: "_text", label: "Text", sortable: true,
                       formatter: function(el, oRecord, oColumn, oData) {
                         // Can't set innerHTML, because some of this may be
                         // actual brackets.
                         el.innerHTML = "";
                         el.appendChild(document.createTextNode(oData));
                       }
                      },
                      {key: "_start", label: "Start", formatter:YAHOO.widget.DataTable.formatNumber,
                       numberOptions: {thousandsSeparator: ""},
                       sortable: true},
                      {key: "_end", label: "End", formatter:YAHOO.widget.DataTable.formatNumber,
                       numberOptions: {thousandsSeparator: ""},
                       sortable: true}];
            fieldKeys = ["_aid", "_text", "_start", "_end"];
            dtEntry.fieldData = [{name: "_text", editable: false}, {name: "_start", editable: false}, {name: "_end", editable: false}];
          } else {
            // I'm going to want a dummy cell which isn't editable in the non-span
            // case, to hang row selection on. Works like a charm.
            dtEntry.fieldData = [{name: "_typecounter", editable: false}];
            fieldKeys = ["_aid", "_typecounter"];
            fields = [{key: "_typecounter", label: "Counter", sortable: true}];
          }
          
          // Add all the attribute fields. I need to convert them all to strings,
          // which means that the numbers will be sorted out of order. The alternative is
          // to leave them as native values, but then the null numeric values will show as 0.
          // Actually, let's format the numbers with a special formatter.

          // Oh, this is even worse. Because these values may be aggregations, I need
          // to check on that, and if they are, I need to construct the format here
          // by hand. Ugh.
          
          function numFormat(el, oRecord, oColumn, oData) {
            if ((oData === null) || (oData === undefined)) {
              el.innerHTML = "";
            } else {
              // I'm pretty sure that "this" is defined, because the formatter is
              // called with "this" as the table.
              if ((oData.constructor === MAT.Annotation.AttributeValueSet) ||
                  (oData.constructor === MAT.Annotation.AttributeValueList)) {
                var elts = oData.elements;
                var sList = [];
                if (oData.constructor === MAT.Annotation.AttributeValueSet) {
                  sList.push("{ ");
                } else {
                  sList.push("[ ");
                }
                for (var i = 0; i < elts.length; i++) {
                  YAHOO.widget.DataTable.formatNumber.call(this, el, oRecord, oColumn, elts[i]);
                  sList.push(el.innerHTML);
                }
                if (oData.constructor === MAT.Annotation.AttributeValueSet) {
                  sList.push(" }");
                } else {
                  sList.push(" ]");
                }
                el.innerHTML = sList.join("");
              } else {
                YAHOO.widget.DataTable.formatNumber.call(this, el, oRecord, oColumn, oData);
              }
            }
          }

          // I'll call this with "this" from the formatter scope.
          function cleanFloat(el, oRecord, oColumn, oData) {
            // I'm pretty sure that "this" is defined, because the formatter is
            // called with "this" as the table.
            YAHOO.widget.DataTable.formatNumber.call(this, el, oRecord, oColumn, oData);
            // The default decimal places are 1 (so we don't round), but we want the full
            // number. If we specify a number of decimal places it'll pad, which we don't 
            // want, so we need to deal with it ourselves,
            // and we also need to add .0 if there's no remainder.
            var s = "" + oData;
            // If the string representation of the number is an int, it'll have .0 already,
            // because of the single decimal place. If it isn't (if it has a decimal point
            // in it), we want to slice off what's there and add everything after it.
            // Ugh. But it works.
            var i = s.indexOf(".");
            if (i > -1) {
              el.innerHTML = el.innerHTML.slice(0, el.innerHTML.length - 1) + s.slice(i + 1);
            }
          }

          function numFormatCore(el, oRecord, oColumn, oData, doNumber) {
            if ((oData === null) || (oData === undefined)) {
              el.innerHTML = "";
            } else {
              if ((oData.constructor === MAT.Annotation.AttributeValueSet) ||
                  (oData.constructor === MAT.Annotation.AttributeValueList)) {
                var elts = oData.elements;
                var sList = [];
                var lBracket;
                var rBracket;
                if (oData.constructor === MAT.Annotation.AttributeValueSet) {
                  lBracket = "{ ";
                  rBracket = " }";
                } else {
                  lBracket = "[ ";
                  rBracket = " ]";
                }
                for (var i = 0; i < elts.length; i++) {
                  doNumber.call(this, el, oRecord, oColumn, elts[i]);
                  sList.push(el.innerHTML);
                }
                el.innerHTML = lBracket + sList.join(", ") + rBracket;
              } else {
                doNumber.call(this, el, oRecord, oColumn, oData);
              }
            }
          }

          function formatNum(el, oRecord, oColumn, oData) {
            numFormatCore.call(this, el, oRecord, oColumn, oData, YAHOO.widget.DataTable.formatNumber);
          }

          function formatFloatNum(el, oRecord, oColumn, oData) {
            numFormatCore.call(this, el, oRecord, oColumn, oData, cleanFloat);
          }

          function formatNumAggregation(el, oRecord, oColumn, oData) {
            oData = disp._trueDoc.getAnnotationByInternalID(oRecord.getData("_aid")).getAttributeValue(oColumn.getKey());
            numFormatCore.call(this, el, oRecord, oColumn, oData, YAHOO.widget.DataTable.formatNumber);
          }

          function formatFloatNumAggregation(el, oRecord, oColumn, oData) {
            oData = disp._trueDoc.getAnnotationByInternalID(oRecord.getData("_aid")).getAttributeValue(oColumn.getKey());
            numFormatCore.call(this, el, oRecord, oColumn, oData, cleanFloat);
          }

          // So there's a problem with these tables, namely, they try to copy whatever
          // data they hold when they update rows and things like that. So we can't
          // actually put any recursive objects as the actual data. This means that
          // we should be converting all the data we can. The problem is that
          // the conversion functions that happen WITHIN the loop that we want to use,
          // like an adapted numberFormat, won't work for things like sets of numbers
          // (because we can't have any sets as actual values). But I don't want to
          // set things up so that you convert some of the time, because I want to
          // have sortable columns. And the next question is, which values do we want
          // to be sortable? Sets can't be sortable. Definitely atomic numbers, booleans,
          // strings. But what about annotations? Do we sort those? If so, we need
          // to sort on the printed name, which means we need to convert the annotations
          // in advance.

          // So there are three bits of behavior we want:
          // - sortable, converted at display time: atomic numbers, booleans, strings.
          //   false < true, so we don't even need to convert them beforehand.
          // - sortable, converted at extract time: atomic annotations
          // - not sortable, converted at display time: number aggregations (because we interpret their formatter options)
          // - not sortable, converted at extract time: all other aggregations

          // So we convert as early as we can, and the two things that make us
          // postpone is: sortable by its actual value, and needs access to the
          // YUI display methods.

          // Using the annotation name displays with the annotations here is going to
          // be tricky. The convertor can't return anything recursive or circular,
          // because the records are cloned. So I can't return
          // a span, which is what I really want to do. But the sorting ALSO happens
          // on the output of the convertor, so
          // I have to keep them orderable, somehow. I think what I have to do
          // is what I do for aggregations: use the attrName and the _aid as a lookup
          // into the dtEntry for the appropriate attribute value manager, and
          // insert the spans from the presentation manager.

          // So this function takes the value and submits it for processing
          // to the appropriate attribute display, which manages the presence and
          // absence of multiple name displays, among other things. It then
          // produces a span and a string. The string is returned. When it's
          // time to run the actual formatter, it pulls the _aid, looks up the
          // current state of the attribute display for this annotation, and whomps
          // the overall span into the table.

          // So now that I'm doing more extensive event registration and dispatch
          // management, all the action is in here. This is a document-level
          // display, so we'll get all the events. We should ignore attach_to_parent.
          // attach_child should register more events for the child, but we
          // really need to separate by attributes, since the child might appear
          // in multiple places. In other words, it should be like the popup manager
          // attribute display. But the child events that will be registered are to
          // redraw this annotation row. And detach, of course, is part of the
          // events registered. So the only other thing that needs to happen is
          // for these displays to be created and recorded, like in the popup manager.

          // In this case, unlike the editor, the attribute display span isn't
          // directly visible - it's only visible when the row is rerendered. So essentially,
          // we have to ensure that when one of these annotations changes, it fires
          // a redisplay event for its parent.
          
          function convertAnnotation(dtEntry, annot, attr, val) {
            var c = dtEntry.idToVisuals[annot.id];        
            if (!c) {
              c = {attrs: {}, parent: null};
              dtEntry.idToVisuals[annot.id] = c;
            }
            var displayCls = c.attrs[attr.name];
            if (!displayCls) {
              displayCls = new MAT.DocDisplay.AnnotationNameDisplayCollection(annot, disp._docPanel, {
                nameDisplayParams: {
                  // "this" is the name display.
                  menuActionCb: function() {
                    // This does nothing yet.
                    var bundle = new MAT.DocDisplay.GestureMenuBundle(disp._docPanel.docDisplay);
                    bundle.addEditOrViewItem(disp.annot);
                    if (bundle.menuItems.length > 0) {
                      return bundle;
                    } else {
                      return null;
                    }
                  },
                  // "this" is the name display. But what we want to fire
                  // is the redisplay on the ROW, which is the annotation associated with the collection.
                  redisplayCb: function() {
                    // Don't fire the modify event - call the row redisplay
                    // directly.
                    disp.forceRedisplayResponse([{
                      annot: annot,
                      event_name: "modify_annotation",
                      attr_name: attr.name
                    }]);
                  }
                },
                multiplePrefix: "{ ",
                multiplePostfix: " }",
                multipleSeparator: ", ",
                attrObj: attr
              });
              c.attrs[attr.name] = displayCls;
            }
            // return displayCls.prepareCellValue(val);
            return displayCls.prepareSpan(val).textContent;
          }

          function convertEarly(dtEntry, annot, attr, val) {
            return attr.convertToStringNonNull(val);
          }

          function formatLate(el, oRecord, oColumn, oData) {
            if ((oData === null) || (oData === undefined)) {
              el.innerHTML = "";
            } else {
              el.innerHTML = dtEntry.fieldData[oColumn.getKeyIndex()].attr.convertToStringNonNull(oData);
            }
          }

          function convertNumberAggregation(dtEntry, annot, attr, val) {
            // This is a placeholder that's ignored.
            return attr.name;
          }

          function linkWrapFactory(oldFormatter) {
            return function (el, oRecord, oColumn, oData) {
              oldFormatter(el, oRecord, oColumn, oData);
              if ((oData !== null) && (oData !== undefined)) {
                var attrObj = dtEntry.fieldData[oColumn.getKeyIndex()].attr;
                var annot = disp._trueDoc.getAnnotationByInternalID(oRecord.getData("_aid"));
                // childNodes isn't really an array that I can just slice.
                var oldChildren = [];
                for (var i = 0; i < el.childNodes.length; i++) {
                  oldChildren.push(el.childNodes[i]);
                }
                el.innerHTML = "";
                el.appendChild(CD.formatURLLink(attrObj.display.url_link, annot, oldChildren));
              }
            }
          }
          
          for (var i = 0; i < atype.attrs.length; i++) {
            var attr = atype.attrs[i];
            var field = {key: attr.name};
            var sortable = false;
            var convertor = null;
            var formatter = null;
            if ((attr._typename == "int") || (attr._typename == "float")) {
              // Because the options are inherited all at once, if I override with
              // decimalPlaces for float, I have to respecify the thousandsSeparator.
              if (!attr.aggregation) {
                // sortable, converted at display time.
                sortable = true;
                if (attr._typename == "int") {
                  formatter = formatNum;
                } else {                  
                  field.numberOptions = {decimalPlaces: 1, thousandsSeparator: ","};
                  formatter = formatFloatNum;
                }
              } else {
                // not sortable, converted at extract time, and formatted at display time.
                convertor = convertNumberAggregation;
                if (attr._typename == "int") {
                  formatter = formatNumAggregation;
                } else {
                  field.numberOptions = {decimalPlaces: 1, thousandsSeparator: ","};
                  formatter = formatFloatNumAggregation;
                }
              }
            } else if ((attr._typename == "boolean") || (attr._typename == "string")) {
              if (!attr.aggregation) {
                // sortable, converted at display time.
                sortable = true;
                formatter = formatLate;
              } else {
                // not sortable, converted at extract time.
                convertor = convertEarly;
              }
            } else if (attr._typename == "annotation") {
              if (!attr.aggregation) {
                // sortable.
                sortable = true;
              }
              // always converted at extract time.
              convertor = convertAnnotation;
            }
            if (attr.display && attr.display.url_link) {
              var CD = MAT.DocDisplay.CellDisplay;
              if (formatter) {
                // Wrap something around it which retrieves the text content
                // and wraps the link around it.
                var oldFormatter = formatter
                formatter = linkWrapFactory(formatter);                
              } else {
                formatter = function (el, oRecord, oColumn, oData) {
                  el.innerHTML = "";
                  if ((oData !== null) && (oData !== undefined)) {
                    var attrObj = dtEntry.fieldData[oColumn.getKeyIndex()].attr;
                    var s = attrObj.convertToStringNonNull(oData);
                    var annot = disp._trueDoc.getAnnotationByInternalID(oRecord.getData("_aid"));
                    el.appendChild(CD.formatURLLink(attrObj.display.url_link, annot, [s]));
                  }
                }
              }
            }
            field.formatter = formatter;
            field.sortable = sortable;
            fields.push(field);
            fieldKeys.push(attr.name);
            dtEntry.fieldData.push({name: attr.name, attr: attr, editable: false /* should be true once we have cell editing */, convertor: convertor});
          }

          // Add references column info. I'm going to make this parallel to the
          // attribute references. The convertor is down in extractData.

          function formatReferences(el, oRecord, oColumn, oData) {
            // the data is a list of hashes {attr: <name>, annot: <id>}
            el.innerHTML = "";
            if (oData && (oData.length > 0)) {
              var refs = [];
              // Convert the data back to annotations.
              for (var i = 0; i < oData.length; i++) {
                refs.push({
                  attr: oData[i].attr,
                  annot: disp._trueDoc.getAnnotationByInternalID(oData[i].annot)
                });
              }
              var displayCls = dtEntry.idToVisuals[oRecord.getData("_aid")].parent;
              var sp = displayCls.prepareSpan(refs);
              if (sp.parentNode) {
                var foo = null;
              }
              el.appendChild(sp);
            }
          }

          // Boy, this is hideous. Not used yet - will be when I make the individual cells mouseable.
          function formatAnnotation(el, oRecord, oColumn, oData) {
            // Clear it.
            el.innerHTML = "";
            // Add a child.
            el.appendChild(dtEntry.idToVisuals[oRecord.getData("_aid")].attrs[dtEntry.fieldData[oColumn.getKeyIndex()].attr.name].displaySpan);
          }

          if (dtEntry.mightHaveReferences) {
            dtEntry.fieldData.push({name: "_references", editable: false});
            fieldKeys.push("_references");
            fields.push({key: "_references", label: "References", sortable: false, formatter: formatReferences});
          }

          var fieldData = dtEntry.fieldData;
          
          for (var i = 0; i < annots.length; i++) {            
            var annot = annots[i];
            data.push(this._extractData(dtEntry, annot, atype, fieldData));
          }

          // Next, build the data source.
          var myDataSource = new YAHOO.util.DataSource(data); 
          myDataSource.responseType = YAHOO.util.DataSource.TYPE_JSARRAY; 
          myDataSource.responseSchema = { 
	    fields: fieldKeys
	  };
          var dt = new YAHOO.widget.DataTable(dtEntry.trueD, fields, myDataSource, {});

          // The target of the arguments is the TD. So get the column from it.
          // Define these the same way the events in the core would be defined.

          // What I'm doing here is allowing the row to be selected from the
          // cells that can't be edited.

          var Dom = YAHOO.util.Dom;
          var Ev = YAHOO.util.Event;
          
          function onEventHighlightCell(oArgs) {
            if (!Dom.isAncestor(oArgs.target,Ev.getRelatedTarget(oArgs.event))) {
              var col = dt.getColumn(oArgs.target);
              if (dtEntry.fieldData[col.getKeyIndex()].editable) {
                dt.highlightCell(oArgs.target);
              } else {
                dt.highlightRow(oArgs.target.parentNode);
              }
            }
            var data = dt.getRecord(oArgs.target).getData("_aid");
            var a = disp._trueDoc.getAnnotationByInternalID(data);
            disp._docPanel.docDisplay.highlightAnnotation(a, "hlNeither", null);
          }

          function onEventUnhighlightCellAndRow(oArgs) {
            if (!Dom.isAncestor(oArgs.target,Ev.getRelatedTarget(oArgs.event))) {
              dt.unhighlightCell(oArgs.target);
              dt.unhighlightRow(oArgs.target.parentNode);
            }
            var data = dt.getRecord(oArgs.target).getData("_aid");
            var a = disp._trueDoc.getAnnotationByInternalID(data);
            disp._docPanel.docDisplay.unhighlightAnnotation(a);
          }
          
          // Row highlighting and selection. 
          dt.subscribe("cellMouseoverEvent", onEventHighlightCell);
          dt.subscribe("cellMouseoutEvent", onEventUnhighlightCellAndRow);
          dt.subscribe("cellClickEvent", function (oArgs) {
            var col = dt.getColumn(oArgs.target);
            // If this cell has a linked element, don't do anything.
            var attrObj = dtEntry.fieldData[col.getKeyIndex()].attr;
            if (attrObj && attrObj.display && attrObj.display.url_link) {
              return;
            }
            if (dtEntry.fieldData[col.getKeyIndex()].editable) {
              // Edit the cell.
              // dt.showCellEditor(oArgs.target);
            } else {
              // Offer a context menu.
              var data = dt.getRecord(oArgs.target).getData("_aid");
              var a = disp._trueDoc.getAnnotationByInternalID(data);
              // Offer an annotation popup. The things we should be able to do are
              // delete the annotation, edit the annotation, cancel.
              // But delete will need to wait for a bit, since I haven't figured out
              // how to interact appropriately with the logger, etc.
              // And the context menu really needs to offer the option of
              // choosing the annotation, but ONLY WHEN WE'RE IN CHOOSE MODE.
              // And that action should be first. And, the problem continues,
              // the display which should be considered the "source" of the
              // forceRedisplay() is the widget that triggered choose mode, NOT
              // THE ANNOTATION TABLE. If it's the annotation table, it won't
              // redisplay the annotation table because it thinks it'll take
              // care of itself.
              var actions = new MAT.DocDisplay.GestureMenuBundle(disp._docPanel.docDisplay);
              // This needs to be first, so when the menu goes away,
              // you're still hovering over the line, so it'll scroll and then
              // highlight. Otherwise, it highlights something ELSE - whatever
              // the mouse is over when the menu goes away.
              actions.addScrollToItem(a);
              if (disp._docPanel.inChooseMode()) {
                actions.addMenuItem({
                  label: "Choose annotation",
                  gesture: new MAT.DocDisplay.MenuGesture(function () {
                    disp._docPanel.chooseModeSuccess(a);
                  })
                });
              }
              actions.addEditOrViewItem(a);
              // No gestureDisplaySource here.
              if (disp._docPanel._handAnnotationAvailable) {
                actions.addDeleteItem(this._trueDoc, [a], {
                  setGestureDisplaySource: false
                });
              }
              disp._docPanel.offerAnnotationPopup(oArgs.event, actions);
            }
          });          

          // And when the cell is updated due to editing, this should fire.
          dt.subscribe("cellUpdateEvent", function(oArgs) {
            // oArgs.record, oArgs.column, oArgs.oldData
          });
        
          dtEntry.dt = dt;
          this._recomputeIdToIdx(dtEntry);
          if (currentSort) {
            dt.sortColumn(dt.getColumn(currentSort.key), currentSort.dir);
          } else if (atype.hasSpan) {
            // If it's a span annotation, sort by start.
            dt.sortColumn(dt.getColumn("_start"));
          }
          this._dtCache[lab] = dtEntry;
        }
        MAT.Dom._appendChild(this._tableDiv, dtEntry.trueD);
      }
    },

    _extractData: function(dtEntry, annot, atype, fieldData) {
      // I want to store the annotation directly, but it turns out
      // that these records are cloned, and for relation annotations
      // that leads to a circular, infinite cloning. Sigh. So I have to
      // keep this mapping somewhere else - the docdisplay already has
      // it, and maybe the document SHOULD have it. Sigh.

      // This is ALSO true of the annotation sets. The reason I didn't
      // hit it with the annotation sets is that we convert them. It's just
      // the non-converted ones, which we're not converting because we want
      // to sort them, or something.

      // We have to convert the references, too; and we should do it basically
      // the way we do the attr conversions.

      var d = {_aid: annot.id}

      if (dtEntry.mightHaveReferences) {
        var c = dtEntry.idToVisuals[annot.id];       
        if (!c) {
          c = {attrs: {}, parent: null};
          dtEntry.idToVisuals[annot.id] = c;
        }
        var disp = this;
        var displayCls = c.parent;
        if (!displayCls) {
          displayCls = new MAT.DocDisplay.AnnotationNameDisplayCollection(annot, this._docPanel, {
            multipleSeparator: ", ",
            isParent: true,
            nameDisplayParams: {
              // "this" is the name display.
              menuActionCb: function() {
                var bundle = new MAT.DocDisplay.GestureMenuBundle(this.docPanel.docDisplay);
                bundle.addEditOrViewItem(this.annot);
                if (bundle.menuItems.length > 0) {
                  return bundle;
                } else {
                  return null;
                }
              },
              // "this" is the name display. But what we want to fire
              // is the redisplay on the ROW, which is the annotation associated with the collection.
              redisplayCb: function() {
                // Don't fire the modify event - call the row redisplay
                // directly.
                disp.forceRedisplayResponse([{
                  annot: annot,
                  event_name: "modify_annotation"
                  // This really ought to have an attr name, but I'm just
                  // using it to force a redraw, which is really all I want.
                }]);
              }
            }
          });
          c.parent = displayCls;
        }

        annot.doc._buildInverseIdDict();
        var refs = annot.doc._inverseIdDict[annot.publicID];
        var theseRefs = [];
        if (refs && (refs.length > 0)) {
          for (var i = 0; i < refs.length; i++) {
            theseRefs.push({attr: refs[i].attr, annot: refs[i].annot.id});          
          }
        }
        d._references = theseRefs;
      }
      
      var buffer = 0;
      if (atype.hasSpan) {
        d._text = annot.doc.signal.slice(annot.start, annot.end);
        d._start = annot.start;
        d._end = annot.end;
        buffer = 3;
      } else {
        d._typecounter = annot.typeCounter;
        buffer = 1;
      }
      for (var j = 0; j < annot.attrs.length; j++) {
        var val = annot.attrs[j];
        var fdEntry = fieldData[buffer + j];
        if (fdEntry.convertor) {
          if (val != null) {
            d[fdEntry.name] = fdEntry.convertor(dtEntry, annot, atype.attrs[j], val);
          }
        } else {
          d[fdEntry.name] = val;
        }
      }
      return d;
    }
    
  });

/* 
 *
 * A YUI-based menu.
 *
 */

  // The items are like the items for YUI menus, except that each must have
  // a value: key, which we use to update the items. Also, the callbacks
  // should be a function that takes a single argument, which is the original item.
  
  MAT.WorkbenchUI.YUIMenu = function(container, items /*, params */) {
    // params are anything that can be passed to Button. 
    // items are the YUI itemData list for menus. The first element
    // is always displayed. And the obj is the original item.
    // So surgically altering the items list will always update
    // the item for the callback.

    var disp = this;
    this._selectedItem = items[0].value;
    
    function cbFactory(item) {
      return function(eType, e) {
        return disp._selectItem(item);
      }
    }

    this._items = items;

    var origItemHash = {};
    var menuItems = [];
    for (var i = 0; i < items.length; i++) {
      // Copy each item, except for onclick, which must be
      // modified.
      var d = {};
      var item = items[i];
      origItemHash[item.value] = item;
      for (var k in item) {
        if (item.hasOwnProperty(k)) {
          if (k == "onclick") {
            d[k] = {
              fn: cbFactory(item),
              // I don't really need the item here, because
              // it's captured in the lexical closure in the cbFactory,
              // but I DO need it to set up the hash of menu items below.
              obj: item
            }
          } else {
            d[k] = item[k];
          }
        }
      }
      menuItems.push(d);
    }

    var bParams = {
      type: "menu",
      container: container,
      label: menuItems[0].text || menuItems.value,
      menu: menuItems,
      // I want the menu created immediately, so that when I
      // have to update it because an annotation was created, I can
      // do it by going directly to the items.
      lazyloadmenu: false
    };

    if (arguments.length > 2) {
      for (var k in arguments[2]) {
        if (arguments[2].hasOwnProperty(k)) {
          bParams[k] = arguments[2][k];
        }
      }
    }
    
    this._menu = new YAHOO.widget.Button(bParams);

    this._itemHash = {};
    var bItems = this._menu.getMenu().getItems();
    for (var k = 0; k < bItems.length; k++) {
      var bItem = bItems[k];
      var val = bItem.cfg.getProperty("onclick").obj.value;
      this._itemHash[val] = {origItem: origItemHash[val], menuItem: bItem};
    }
  };

  MAT.Extend(MAT.WorkbenchUI.YUIMenu, {

    setItemLabel: function(itemValue, newText) {
      if (itemValue == this._selectedItem) {
        this._menu.set("label", newText);
      }
      var d = this._itemHash[itemValue];
      d.origItem.text = newText;
      d.menuItem.cfg.setProperty("text", newText);
    },

    _selectItem: function(item) {
      // We must always set the label of the menu.
      this._selectedItem = item.value;
      this._menu.set("label", item.text || item.value);
      if (item.onclick.scope) {
        return item.onclick.fn.call(item.onclick.scope, item);
      } else {
        return item.onclick.fn(item);
      }
    },

    selectItem: function(value) {
      if (value != this._selectedItem) {
        // Just call the callback.
        var d = this._itemHash[value];
        this._selectItem(d.origItem);
      }
    },

    setSelectedItem: function(value) {
      if (value != this._selectedItem) {
        var d = this._itemHash[value];
        this._selectedItem = d.origItem.value;
        this._menu.set("label", d.origItem.text || d.origItem.value);
      }
    },

    disableItem: function(value) {
      var d = this._itemHash[value];
      d.menuItem.cfg.setProperty("disabled", true);
    },

    enableItem: function(value) {
      var d = this._itemHash[value];
      d.menuItem.cfg.setProperty("disabled", false);
    },

    forEachItem: function(fn) {
      for (var i = 0; i < this._items.length; i++) {
        fn.call(this, this._items[i].value);
      }      
    }
    
  });

/*
 *
 * And a simpler non-YUI one.
 *
 */

  // items look like {text: ..., value: ..., selected: ..., disabled: ..., onclick: {fn: ..., obj: ..., scope: ...}};
  MAT.WorkbenchUI.SimpleMenu = function(container, items, params) {
    var M = MAT.Dom._buildElement;
    var A = MAT.Dom._appendChild;
    this._menu = M("select");
    A(container, this._menu);
    // Make sure they don't have anything special in them.
    var forbidden = ["checked", "classname", "url", "target", "submenu"];
    for (var i = 0; i < items.length; i++) {
      for (var j = 0; j < forbidden.length; j++) {
        if (items[i][forbidden[j]] !== undefined) {
          // This is more for the developer than anyone else, so, alert.
          alert("WARNING: SimpleMenu invoked with forbidden item config key '" + forbidden[j] + "'");
          return;
        }
      }
    }
    this._items = items;
    this._itemHash = {};
    this._itemIdx = {};
    this._params = params;
    // Originally, I put onclick on options, but apparently
    // that isn't intended to work on dropdown selects - instead,
    // use onchange on the select element.
    var menu = this;
    // Notice that if we update the onclick.obj object, we'll get it automatically
    // in the callback.
    this._menu.onchange = function() {
      // Figure out which item was chosen.
      var i = menu._menu.selectedIndex;
      var itm = menu._items[i];
      if (itm.onclick.scope) {
        itm.onclick.fn.call(itm.onclick.scope, itm);
      } else {
        itm.onclick.fn(itm);
      }
    }
    
    for (var i = 0; i < this._items.length; i++) {
      var item = this._items[i];
      this._itemHash[item.value] = item;
      this._itemIdx[item.value] = i;
      var optAttrs = {value: item.value};
      if (item.disabled) {
        optAttrs.disabled = true;
      }
      if (item.selected) {
        this._menu.selectedIndex = i;
      }
      var optNode = M("option", {attrs: optAttrs, text: item.text || item.value});
      A(this._menu, optNode);
    }
  };

  MAT.Extend(MAT.WorkbenchUI.SimpleMenu, {

    setItemLabel: function(itemValue, newText) {
      var item = this._itemHash[itemValue];
      item.text = newText;
      // Update the option.
      var opt = this._menu.options[this._itemIdx[itemValue]];
      opt.innerHTML = newText;
    },
    
    selectItem: function(value) {
      var curIdx = this._menu.selectedIndex;
      var valIdx = this._itemIdx[value];
      // Will this trigger the callback? No.
      if (curIdx != valIdx) {
        this._menu.selectedIndex = valIdx;
        this._menu.onchange();
      }
    },

    setSelectedItem: function(value) {
      var idx = this._itemIdx[value];
      this._menu.selectedIndex = idx;
    },

    disableItem: function(value) {
      this._menu.options[this._itemIdx[value]].disabled = true;
    },

    enableItem: function(value) {
      this._menu.options[this._itemIdx[value]].disabled = false;
    },

    forEachItem: function(fn) {
      for (var i = 0; i < this._items.length; i++) {
        fn.call(this, this._items[i].value);
      }      
    }

  });
  
/*
 *                    MAT.WorkbenchUI.TaggedDocumentPanel
 *
 *
 * Now, let's specialize the resizeable panel. This resizeable panel
 * shows a document (or a comparison; anything which requires a legend, basically).
 * It can also be customized in other ways. It has
 * four subclasses: a WorkflowDocumentPanel and a WorkspaceDocumentPanel, and
 * ComparisonDocumentPanel, ReconciliationDocumentPanel.
 *
 */

  MAT.WorkbenchUI.TaggedDocumentPanel = function (ui, docLabel, taskName, tClass, newID) {

    this._ui = ui;
    this._taskName = taskName;
    this._docLabel = docLabel;
    this._annotationEditorTabs = {};
    this._annotationEditorPopups = {};
    this._annotationTableTab = null;
    this._hasSpanlessAnnotationTypes = false;
    this._handAnnotationAvailable = false;
    this._chooseModeMgr = new MAT.DocDisplay.ChooseModeManager(this);
    this._cachedSize = null;
    // See notifyDocumentPresent and afterSelect.
    this._postponedDocumentPresentation = false;
    this._operationControlsDisabled = false;
    
    // Note throughout here that many of the entries in data
    // are lists; this is because this is the data pulled directly
    // from the file upload dialog form.

    // We're going to want to create a bunch of divs: the document div,
    // the control div, and ensure that the legend div is dealt with.

    this._controlDiv = this._ui._createCollapsibleDiv(ui.fromTemplate(tClass, newID, docLabel));
    this.id = this._controlDiv.id + "_tabcontent";
    
    this._docDiv = ui.fromTemplate("docColumnContainerTemplate", newID, docLabel);

    // We pass the control div into the tab view as its content.

    MAT.WorkbenchUI.TaggedDocumentPanel.superclass.constructor.call(
      this, ui._docTabView, null, null, this._docDiv);

    if (this.isReadOnly()) {
      YAHOO.util.Dom.addClass(this._docDiv, "readOnly");
      this._handAnnotationStatusButton = null;
    } else {
      // Set up the mode status line.
      var E = MAT.Dom._augmentElement;
      var B = MAT.Dom._buildElement;
      this._handAnnotationStatusButton = B("span", {
        children: ["Hand annotation: unavailable"],
        style: {
          cursor: "help",
          color: "gray"
        },
        attrs: {
          onclick: function() {
            ui.aboutHandAnnotationMode();
          }
        }
      });
      if (this._ui._context.taskTable[this._taskName].globalAnnotationTypeRepository.hasContentAnnotationValuedAttributes()) {
        // We only want the choose mode button in place
        // if the task contains annotation-valued attributes.
        E(this.getElement("modestatus"), {
          children: [this._handAnnotationStatusButton,
                     B("span", {
                       children: ["|"],
                       style: {
                         paddingLeft: ".5em",
                         paddingRight: ".5em"
                       }
                     }), this._chooseModeMgr.getStatusButton()]
        });
      } else {
        E(this.getElement("modestatus"), {
          children: [this._handAnnotationStatusButton]
        });
      }
    }

    this.computeTitle();

    // And now, we add a DocDisplay.
    this.createDocDisplay();
    
  };

  var TaggedDocumentPanel = MAT.WorkbenchUI.TaggedDocumentPanel;

  YAHOO.extend(TaggedDocumentPanel, MAT.WorkbenchUI.UITabContent, {

    // The tagged document panel sidebar will need to be redisplayed.
    // It also needs to be redisplayed if the panel has been
    // tabbed away from, then resize happens, then the panel
    // is selected again. See deselect/select.

    // Also: during actual resizes (either the pane or the browser)
    // this will be called AT LEAST twice. See the discussion
    // above in the createLayout method.
    
    onResize: function() {
      TaggedDocumentPanel.superclass.onResize.call(this);
      var cachedSize = this._cachedSize;
      this._cachedSize = [this._docDiv.offsetHeight, this._docDiv.offsetWidth];
      // Only fire on width changes.
      if (this.docDisplay && (cachedSize[1] != this._docDiv.offsetWidth)) {
        this.docDisplay.onResize();
      }
      // If the height changes, reset the height of any annotator editor popups.
      if (this.docDisplay && (cachedSize[0] != this._docDiv.offsetHeight)) {
        // Can't do the same as what I do in deselect() below, because the
        // annotation editors aren't registered with a requester ID, intentionally.
        // I want to redisplay them when I come back to this pane.
        for (var aid in this._annotationEditorPopups) {
          if (this._annotationEditorPopups.hasOwnProperty(aid)) {
            this._annotationEditorPopups[aid].setMaxHeight();
          }
        }
      }
    },

    // By default, we deal only with the segments and the annotation tables.
    // The reconciliation document panel extends the tagged document panel,
    // but you don't want annotation tables there.
    // Actually, we also deal with editInTab and editInPopup being toggles.
    setConfigVar: function(variable, bool) {
      if (variable == "showAnnotationTables") {
        if (bool) {
          this._maybeShowAnnotationTableTab();
        } else if (this._annotationTableTab && !this._hasSpanlessAnnotationTypes) {
          // Note that when we first open the panel, this will be called BEFORE
          // notifyDocumentPresent, which means that _hasSpanlessAnnotationTypes
          // will be false. So if annotation tables are already requested, they'll
          // vanish and then reappear when notifyDocumentPresent is called.
          this._annotationTableTab.hide();
        }
      } else if (variable == "showSegments") {
        if (bool) {
          this.docDisplay.showSegments();
        } else {
          this.docDisplay.hideSegments();
        }
      } else if (variable == "editInTab") {
        if (bool) {
          // If this is set, make sure the other one isn't.
          if (this.getConfigVar("editInPopup")) {
            var m = this._ui._getMenuBarItem(["View", "Edit/view annotations in popups"]);
            if (m) {
              this._ui._togglePanelConfig("editInPopup", this, m);
            } else {
              // You can't change it right now, because it isn't visible.
              this._ui._panelConfig.editInPopup = false;
            }
          }
        }
      } else if (variable == "editInPopup") {
        if (bool) {
          if (this.getConfigVar("editInTab")) {
            var m = this._ui._getMenuBarItem(["View", "Edit/view annotations in tabs"]);
            if (m) {
              this._ui._togglePanelConfig("editInTab", this, m);
            } else {
              // You can't change it right now, because it isn't visible.
              this._ui._panelConfig.editInTab = false;
            }
          }
        }
      }
    },

    _maybeShowAnnotationTableTab: function() {
      // Show the table. Elsewhere, we make sure
      // that if the document is present and has spanless annotations,
      // the table is always shown.
      if (!this._annotationTableTab) {
        this._annotationTableTab = new MAT.WorkbenchUI.AnnotationTableTab(this);
      }
      this._annotationTableTab.show();
    },    

    // Values are never stored locally. Always ask the UI.
    getConfigVar: function(variable) {
      return this._ui._panelConfig[variable];
    },

    isReadOnly: function() {
      return this.getDocument().isReadOnly();
    },

    controlsSuppressed: function() {
      return this.isReadOnly();
    },

    select: function () {
      YAHOO.util.Dom.get("controlcontainer").appendChild(this._controlDiv);
      this._ui._displayLegend(this._taskName);
      for (var aid in this._annotationEditorTabs) {
        if (this._annotationEditorTabs.hasOwnProperty(aid)) {
          this._annotationEditorTabs[aid].show();
        }
      }
      for (var aid in this._annotationEditorPopups) {
        if (this._annotationEditorPopups.hasOwnProperty(aid)) {
          this._annotationEditorPopups[aid].show();
        }
      }
      if (this._annotationTableTab) {
        // Note that when we first open the panel, this will be called BEFORE
        // notifyDocumentPresent, which means that _hasSpanlessAnnotationTypes
        // will be false. So if annotation tables are already requested, they'll
        // vanish and then reappear when notifyDocumentPresent is called.
        if (this.getConfigVar("showAnnotationTables") || this._hasSpanlessAnnotationTypes) {
          this._maybeShowAnnotationTableTab();
        }
      }      
    },

    afterSelect: function() {
      if (this._postponedDocumentPresentation) {
        this._renderPresentedDocument();
      } else if (!this._cachedSize) {
        // If, after you select, there's a cached size and it's
        // different than the current size, fire the resize. Actually,
        // I don't have the REAL size until the document is displayed,
        // which hasn't happened yet when you're first loading.
        // See notifyDocumentPresent().
        this._cachedSize = [this._docDiv.offsetHeight, this._docDiv.offsetWidth];
      } else if ((this._docDiv.offsetHeight != this._cachedSize[0]) ||
                 (this._docDiv.offsetWidth != this._cachedSize[1])) {
        this.onResize();
      }
    },

    // Oddly enough, the annotation editors are never closed when you
    // close a document window; they're hidden. This removes them from
    // the tab view, and then the document panel is deleted, so they go
    // away then. But it really DOES need to be closed, because the
    // comparison window may still be pointing to the document.
    // Also, when you deselect, you need to dismiss all the annotation popups.
    
    deselect: function () {
      YAHOO.util.Dom.get("controlcontainer").innerHTML = "";
      this._ui._clearLegend();
      for (var aid in this._annotationEditorTabs) {
        if (this._annotationEditorTabs.hasOwnProperty(aid)) {
          this._annotationEditorTabs[aid].hide();
        }
      }
      for (var aid in this._annotationEditorPopups) {
        if (this._annotationEditorPopups.hasOwnProperty(aid)) {
          this._annotationEditorPopups[aid].hide();
        }
      }
      if (this._annotationTableTab) {
        this._annotationTableTab.hide();
      }
      this._ui._popupMgr.dismissPopups(this._docLabel);
    },

    show: function () {
      TaggedDocumentPanel.superclass.show.call(this);
      // Make sure these are enabled.
      this._ui._enableMenuBarItem(["File", "Hide"]);
      this._ui._enableMenuBarItem(["File", "Close"]);
    },

    disableOperationControls: function () {
      this._operationControlsDisabled = true;
    },

    enableOperationControls: function () {
      this._operationControlsDisabled = false;
    },

    hide: function () {
      if (this._operationControlsDisabled) {
        return;
      }
      this.exitChooseMode();
      // Gesture source is WRONG.
      this.log({action: "hide_window", gesture_source: "window_button"});
      TaggedDocumentPanel.superclass.hide.call(this);
      // If there are no more tabs in the UI, disable the
      // menu bar items.
      if (this._ui._docTabView.get("tabs").length == 0) {
        this._ui._disableMenuBarItem(["File", "Hide"]);
        this._ui._disableMenuBarItem(["File", "Close"]);
      }
    },
    
    // This is the default, but it can be overridden.
    createDocDisplay: function() {
      this.docDisplay = new MAT.DocDisplay.DocDisplay(this, this._ui._context, this.getElement("docOutputDiv"));
    },

    close: function () {
      if (this._operationControlsDisabled) {
        return;
      }
      // Disable closing while I'm checking.
      if (!this._closing) {
        // This isn't strictly necessary, since ask() is modal, but it doesn't hurt.
        this.disableOperationControls();
        this.log({action: "close_file_request"});
        var panel = this;
        if (this._ui._context.isDirty(this._docLabel)) {
          this._ui.ask(this._docLabel,
                       "Closing this document will discard unsaved changes. Continue?",
                       [{ text:"Yes",
                          handler: function () {
                            panel._closeCompletion();
                          }
                        }, {
                          text: "No",
                          isDefault: true,
                          handler: function () {
                            panel._closing = false;
                            panel.log({action: "close_file_aborted", reason: "dirty"});
                            panel.enableOperationControls();
                          }
                        }]);
        } else {
          this._closeCompletion();
        }
      }
    },

    _closeCompletion: function () {
      this._closing = false;
      // close() calls hide(), and hide will fail if the operation
      // controls are disabled.
      this.enableOperationControls();
      TaggedDocumentPanel.superclass.close.call(this);
    },

    // This has to do pretty much what notifyNoDocumentPresent does.
    _close: function () {
      this._ui._context.destroyDocument(this._docLabel);
      this._removeDocumentDetails();
      if (this._annotationTableTab) {
        this._annotationTableTab.close();
        this._annotationTableTab = null;
      }
    },

    // A utility I'm going to need all over the place.
    // Implements the same algorithm as the fromTemplate method of WorkbenchUI.
    // But it can't, because the tab may not be attached, in which case DOM.get
    // won't work. I need to use getElementsBy.

    getControlElement: function(childId) {      
      var id = this._docLabel + "_" + childId;
      var v = YAHOO.util.Dom.getElementsBy(
        function (elt) { return elt.id == id; }, null,
        this._controlDiv);
      if (v.length == 0) {
        return null;
      } else {
        return v[0];
      }
    },

    getGlobalElement: function(childId) {
      return this._ui.getElement(this._docLabel, childId);
    },    

    getElement: function(childId) {
      var id = this._docLabel + "_" + childId;
      var v = YAHOO.util.Dom.getElementsBy(
        function (elt) { return elt.id == id; }, null,
        this._docDiv);
      if (v.length == 0) {
        return null;
      } else {
        return v[0];
      }
    },

    // For when we add new nodes.

    newId: function(id) {
      return this._docLabel + "_" + id;
    },

    getDocument: function() {
      return this._ui._context.getDocument(this._docLabel);
    },

    computeTitle: function() {
    },

    // This can be called WHEN THE DOCUMENT IS INITIALLY HIDDEN.
    
    notifyDocumentPresent: function() {
      // I need to clean up the annotation displays, and reattach the document displays.
      this._removeDocumentDetails();
      if (this.isSelected()) {
        this._renderPresentedDocument();
      } else {
        // Postpone it until afterSelect().
        this._postponedDocumentPresentation = true;
      }
    },

    // This might be postponed, if the tab isn't selected when
    // notifyDocumentPresent is originally called.

    _renderPresentedDocument: function() {
      this._postponedDocumentPresentation = false;      
      var doc = this.getDocument().currentDocument.doc;
      this._hasSpanlessAnnotationTypes = doc.hasSpanlessContentAnnotationTypes();
      // Originally, this was called before the workflows were applied, but
      // now it's called AFTER them. So we shouldn't disable hand annotation
      // as we set the data.
      this.docDisplay.setData(doc, {});
      if (this._annotationTableTab) {
        this._annotationTableTab.attachToDoc();
      }
      // We've just rendered, so the size cache can be updated now.
      this._cachedSize = [this._docDiv.offsetHeight, this._docDiv.offsetWidth];
      // Should be no tab there already. But this gets called a LOT. Bad.
      if (this.getConfigVar("showAnnotationTables") || this._hasSpanlessAnnotationTypes) {
        this._maybeShowAnnotationTableTab();
      }
    },

    // This is VERY similar to _close(), above.
    
    _removeDocumentDetails: function() {
      this._hasSpanlessAnnotationTypes = false;
      this._postponedDocumentPresentation = false;
      if (this.inChooseMode()) {
        this.exitChooseMode();
      }
      this.docDisplay.clear();
      // Make sure there are no annotation editors.
      for (var aid in this._annotationEditorTabs) {
        if (this._annotationEditorTabs.hasOwnProperty(aid)) {
          this._annotationEditorTabs[aid].close();
        }
      }
      for (var aid in this._annotationEditorPopups) {
        if (this._annotationEditorPopups.hasOwnProperty(aid)) {
          this._annotationEditorPopups[aid]._popup.closePanel();
        }
      }
      this._annotationEditorTabs = {};
      this._annotationEditorPopups = {};
    },    
    
    notifyNoDocumentPresent: function() {
      this._removeDocumentDetails();
      if (this._annotationTableTab) {
        this._annotationTableTab.close();
        this._annotationTableTab = null;
      }
    },

    notifyDocumentModified: function() {
      this.computeTitle();
    },

    notifyDocumentUnmodified: function() {
      this.computeTitle();
    },

    notifyHandAnnotationAvailability: function(bool) {
      if (bool) {
        this.handAnnotationAvailable();
      } else {
        this.handAnnotationUnavailable();
      }
    },

    handAnnotationAvailable: function() {
      this._handAnnotationAvailable = true;
      this.docDisplay.handAnnotationAvailable();
      // If it's read-only, there won't be a button.
      if (this._handAnnotationStatusButton) {
        this._handAnnotationStatusButton.innerHTML = "";
        var E = MAT.Dom._augmentElement;
        var B = MAT.Dom._buildElement;
        E(this._handAnnotationStatusButton, {
          style: {color: "black"},
          children: ["Hand annotation: ", B("span", {style: {fontWeight: "bold"}, text: "available"}),
                     " (swipe or left-click)"]
        });
      }
    },

    handAnnotationUnavailable: function() {
      this._handAnnotationAvailable = false;
      this.docDisplay.handAnnotationUnavailable();
      if (this._handAnnotationStatusButton) {
        this._handAnnotationStatusButton.innerHTML = "";
        var E = MAT.Dom._augmentElement;
        E(this._handAnnotationStatusButton, {
          style: {color: "gray"},
          children: ["Hand annotation: unavailable"]
        });
      }
    },

    mouseOverAnnotations: function (params) {
      var aType = params.type;
      var prefix = "Annotation";
      if (aType == "content") {
        prefix = "Content annotation";
      } else if (aType == "admin") {
        prefix = "Admin annotation";
      }
      var coveredContent = params.labels;
      var suffix = "";
      if (params.suffix) {
        suffix = params.suffix;
      }
        
      if (this._neutralStatus === undefined) {
        // Save the neutral status. If there's neutral status, it means
        // that we're being moused over. But don't overwrite an
        // existing neutral status.
        this._neutralStatus = this.getElement("annotstatus").innerHTML;
      }
      if (coveredContent.length > 1) {
        this.getElement("annotstatus").innerHTML = prefix + "s are " + coveredContent.join(", ") + suffix;
      } else {
        this.getElement("annotstatus").innerHTML = prefix + " is " + coveredContent[0] + suffix;
      }
      /* Here because someday I might want to try this. The problem is
         that computing whether an annotation can hover pretty much duplicates
         the logic in selectOrCreateContextuallyRestrictedAnnotation. So
         something needs to change. It's not just a matter of matching labels,
         anyway.
      if (params.annots && this._chooseMode && params.span) {
        // If I'm in choose mode, I want to change the cursor to "not-allowed"
        // if there are no matches in the _chooseMode.labels.
        var allowed = false;
        var cLabels = this._chooseMode.labels;
        for (var i = 0; i < params.annots; i++) {
          var a = params.annots[i];
          for (var j = 0; j < cLabels.length; j++) {
            if (a.atype.label == cLabels[j]) {
              allowed = true;
              break;
            }
          }
          if (allowed) {
            break;
          }
        }
        if (!allowed) {
          params.span.style.cursor = "not-allowed";
        }
      }
      */
    },

    cancelMouseOverAnnotations: function (/* {span: ...} */) {      
      if (this._neutralStatus !== undefined) {
        this.getElement("annotstatus").innerHTML = this._neutralStatus;
        delete this._neutralStatus;
      }
      /* Here for historical reasons. See mouseOverAnnotations. Do not remove.
      if (arguments.length > 0) {
        var span = arguments[0].span;
        if (span) {
          span.style.cursor = null;
        }
      }
      */
    },

    log: function (msg) {
      this._ui.log(this.getDocument(), msg);
    },

    /* Other bits required as the API that the DocDisplay requires. */

    getTaskName: function () {
      return this._taskName;
    },

    uiClearPane: function(div) {
      this._ui.clearPanes(div);
    },

    uiError: function(msg) {
      return this._ui.error(this._docLabel, msg);
    },

    uiInform: function(msg) {
      return this._ui.inform(this._docLabel, msg);
    },

    uiTell: function(msg, title /*, params */) {
      if (arguments.length > 2) {
        return this._ui.tell(this._docLabel, msg, title, arguments[2]);
      } else {
        return this._ui.tell(this._docLabel, msg, title);
      }
    },

    uiPopup: function(text, pId, pHeader, buttonList /*, popupParams */) {
      if (arguments.length > 4) {
        return this._ui.popup(this._docLabel, text, pId, pHeader, buttonList, arguments[4]);
      } else {
        return this._ui.popup(this._docLabel, text, pId, pHeader, buttonList);
      }
    },

    uiGetDisplayCounter: function() {
      return this._ui.getDisplayCounter();
    },

    notifyHandAnnotationPerformed: function() {
      this._ui._context.handAnnotationChanged(this._docLabel);
    },    

    createSaveMenuItems: function() {
      var params = {};
      if (arguments.length > 0) {
        params = arguments[0];
      }
      
      var formatSuffixForLogging = params.formatSuffixForLogging || "";
      var saveTypeForLogging = params.saveTypeForLogging || "save";
      var richOnly = params.richOnly;
      var panel = this;
      var ui = panel._ui;
      var context = panel._ui._context;
      var saveCb = params.saveCb || function(context, appDoc, format, parameters) {
        context.saveDocument(appDoc, format, parameters);
      };
      
      // Now, we need to put together the save menu list.
      // Create a factory function so we get the right encapsulations.

      function createSaveMenuItem(format) {
        if (MAT.FileFormats.formats[format].ui.showSaveDialog) {
          return {
            text: format,
            onclick: {
              fn: function (p_sType, p_aArgs, p_oItem) {
                panel.log({action: "save_file_request", file_type: format + formatSuffixForLogging, save_type: saveTypeForLogging});
                MAT.FileFormats.formats[format].ui.showSaveDialog(ui, function (parameters) {
                  saveCb(context, panel.getDocument(), format, parameters);
                }, function () {
                  panel.log({action: "save_file_request_aborted", file_type: format + formatSuffixForLogging, save_type: saveTypeForLogging});
                });
              }
            }          
          };
        } else {
          return {
            text: format,
            onclick: {
              fn: function (p_sType, p_aArgs, p_oItem) {
                panel.log({action: "save_file_request", file_type: format + formatSuffixForLogging, save_type: saveTypeForLogging});
                saveCb(context, panel.getDocument(), format, {});
              }
            }
          };
        }
      }

      var saveMenuItems = [];
      
      for (key in MAT.FileFormats.formats) {
        var fmt = MAT.FileFormats.formats[key];
        if ((fmt.direction === undefined) || (fmt.direction == "out")) {
          if ((!richOnly) || fmt.richFormat) {
            saveMenuItems.push(createSaveMenuItem(key));
          }
        }
      }

      return saveMenuItems;      
    },

    _ensurePopupLogger: function () {
      if (!this._popupLogger) {
        var disp = this;
        this._popupLogger = function(whichLog, entry) {
          if (whichLog == "panel") {
            disp.log(entry);
          } else if (whichLog == "document") {
            disp.getDocument().log(entry);
          }
        };
      }
    },
    
    // offerAnnotationPopup arguments:
    // e: mouse event
    // gestureBundle: a MAT.DocDisplay.GestureMenuBundle

    offerAnnotationPopup: function(e, gestureBundle) {
      var id = "annotateMenu_" + this._docLabel;
      this._ensurePopupLogger();

      // The default for the editor is popups. If neither default is set, but
      // the "Edit annotation" entry is in the menuItems, replace it with
      // two items.

      if ((!this._ui._panelConfig.editInTab) &&
          (!this._ui._panelConfig.editInPopup)) {
        for (var i = 0; i < gestureBundle.menuItems.length; i++) {
          var item = gestureBundle.menuItems[i];
          if ((item.label == "Edit annotation") ||
              (item.label == "View annotation")) {
            var copied = item.gesture.copy();
            copied.setClientInfo("editInTab", true);
            if (item.label == "Edit annotation") {
              gestureBundle.menuItems.splice(
                i, 1, {
                  label: "Edit annotation in tab",
                  gesture: copied
                }, {
                  label: "Edit annotation in popup",
                  gesture: item.gesture
                }
              );
            } else {
              gestureBundle.menuItems.splice(
                i, 1, {
                  label: "View annotation in tab",
                  gesture: copied
                }, {
                  label: "View annotation in popup",
                  gesture: item.gesture
                }
              );
            }
            break;
          }
        }
      }

      this._ui._popupMgr.offerAnnotationPopup(this._popupLogger, this._docLabel, id, e, gestureBundle);
    },

    // the default for the editor is popups. I've moved the popup
    // invocation to here, and left the construction of the annotation view,
    // perhaps confusingly, in the popup mgr code. The idea is that the
    // view container has only two methods, getAnnotationDisplayDiv and
    // notifyVisualDisplay, and the container is responsible for any
    // higher-level bookkeeping, such as the bookkeeping we do with _annotationEditorPopups.

    offerAnnotationEditor: function(annot /*, clientInfo */) {
      var clientInfo = null;
      if (arguments.length > 1) {
        clientInfo = arguments[1];
      }
      if (this._annotationEditorTabs[annot.id]) {
        this._annotationEditorTabs[annot.id].makeActive();
      } else {
        var view;
        if (this._annotationEditorPopups[annot.id]) {
          // Put it on top.
          this._annotationEditorPopups[annot.id]._popup.bringToTop();
          view = this._annotationEditorPopups[annot.id]._view;
        } else {
          this._ensurePopupLogger();
          var appDoc = this.getDocument();
          var viewContainer = null;
          var disp = this;
          if ((clientInfo && clientInfo.editInTab) || this._ui._panelConfig.editInTab) {        
            viewContainer = new MAT.WorkbenchUI.AnnotationEditorTab(annot, this);
            viewContainer.show();
          } else {
            // Make a popup, and show it.
            viewContainer = this._ui._popupMgr._constructPopupAnnotationEditorContainer(annot, function() {
              delete disp._annotationEditorPopups[annot.id];
            });
            this._annotationEditorPopups[annot.id] = viewContainer;
          }
          view = this._ui._popupMgr.offerAnnotationEditor(this._popupLogger, this, viewContainer, function () {
            disp.notifyDocumentModified();
          }, annot);
        }
        if (view._firstForFocus) {
          view._firstForFocus.focus();
        }
      }
    },

    // Choose mode.

    // params are successCb (one argument), exitCb (called when it's
    // time to cancel, or right before successCb), labels (a list of
    // permitted labels).
    
    enterChooseMode: function(params) {
      this._chooseModeMgr.enterChooseMode(params);
    },

    // An annotation has been chosen, somehow.
    chooseModeSuccess: function(annot) {
      this._chooseModeMgr.chooseModeSuccess(annot);
    },

    // An error is encountered.
    chooseModeError: function(errMsg) {
      this._chooseModeMgr.chooseModeError(errMsg);
    },

    // We're done with choose mode.
    exitChooseMode: function() {
      this._chooseModeMgr.exitChooseMode();
    },

    inChooseMode: function() {
      return this._chooseModeMgr.inChooseMode();
    },

    // For the annotation cell editor.

    getStyledButton: function(container, label, onclick) {
      return new MAT.YUIExtensions.StyledButton(container, label, onclick);
    }

  });

/*
 *                    MAT.WorkbenchUI.WorkflowDocumentPanel
 *
 *
 * A document panel with workflow controls.
 *
 */

  // The document may be read-only.
  
  MAT.WorkbenchUI.WorkflowDocumentPanel = function(ui, docLabel, data) {
    // For the blinking steps.
    this._stepsBlinking = null;

    MAT.WorkbenchUI.WorkflowDocumentPanel.superclass.constructor.call(
      this, ui, docLabel, data.task, "workflowDocumentControlDivTemplate", "workflow_document");

    var doc = this.getDocument();

    var panel = this;

    if (this.controlsSuppressed()) {
      YAHOO.util.Dom.addClass(this._controlDiv, "suppressControls");
    } else {
      // This used to be _workflowConfigure, but now we can do
      // this when we build the panel, because we have the initial
      // task and workflow.
      var wfMenu = this.getControlElement("panel_workflowmenu");
      var appObj = ui._context.taskTable[data.task];

      // The workflow menu now allows you to choose read-only or
      // reconciliation. So it isn't going to have a single default.
    
      // Now, figure out what the workflows are.
      // They're either the labels in the appObj, or
      // tokens in the doc format.
    
      wfMenu.options[0].disabled = true;    
      ui._populateMenuFromKeys(wfMenu, appObj.workflows, data.workflow, null);

      // Set the onChange operation.

      wfMenu.onchange = function () {
        panel.updateData();
      }
    }

    this._ui.cacheShowableTabContent(this);
    
  };

  // The tClass must have a docOutputDiv in which to place the
  // tagged document, and a "docMarkupTagDiv" in which to place
  // the tag legend.
  
  var WorkflowDocumentPanel = MAT.WorkbenchUI.WorkflowDocumentPanel;

  YAHOO.extend(WorkflowDocumentPanel, TaggedDocumentPanel, {

    select: function () {

      WorkflowDocumentPanel.superclass.select.call(this);
      
      this._ui._enableMenuBarItem(["File", "Save..."], {
        setSubmenu: "savemenu",
        setMenuItems: this.createSaveMenuItems()
      });

      var panel = this;
      
      this._ui._enableMenuBarItem(["View"], {
        setMenuItems: [
          {
            matconfig: {
              label: "Show character offsets",
              configvar: "showCharOffsets",
              panel: this
            }
          }, {
            matconfig: {
              label: "Show segment boundaries",
              configvar: "showSegments",
              panel: this
            }
          }, {
            matconfig: {
              label: "Edit/view annotations in tabs",
              configvar: "editInTab",
              panel: this
            }
          }, {
            matconfig: {
              label: "Edit/view annotations in popups",
              configvar: "editInPopup",
              panel: this
            }
          }, {
            matconfig: {
              label: "Show annotation tables",
              configvar: "showAnnotationTables",
              panel: this
            }
          }, {
            matconfig: {
              label: "Autotag is case-sensitive",
              configvar: "autotagIsCaseSensitive",
              panel: this
            }
          }
        ]
      });
    },

    _renderPresentedDocument: function() {
      WorkflowDocumentPanel.superclass._renderPresentedDocument.call(this);
      // Disable the annotation tables element if we're showing it because we
      // have to.
      if (this._hasSpanlessAnnotationTypes) {
        this._ui._disableMenuBarItem(["View", "Show annotation tables"]);
      }
    },

    deselect: function () {
      this._ui._disableMenuBarItem(["View"], {
        clearMenuItems: true
      });
      this._ui._disableMenuBarItem(["File", "Save..."], {
        clearSubmenu: true
      });
      WorkflowDocumentPanel.superclass.deselect.call(this);
    },

    computeTitle: function() {
      this.label = "File: " + this.getDocument().getDescription();
      this.getControlElement("titlefield").innerHTML = this.label;
      this.updateTabLabel(this.getDocument().getShortDescription());
    },

    getWindowTitle: function () {
      return this.label;
    },

    destroy: function () {
      if (this._stepsBlinking) {
        clearInterval(this._stepsBlinking);
      }
      if (this.docDisplay) {
        this.docDisplay.destroy();
      }
      this._ui.uncacheShowableTabContent(this);
      WorkflowDocumentPanel.superclass.destroy.call(this);
    },

    // This is called when the workflow menu changes.
    // It should update the backend data appropriately.
    
    updateData: function () {

      var wfMenu = this.getControlElement("panel_workflowmenu");
      var wfName = wfMenu.options[wfMenu.selectedIndex].value;

      this.getDocument().updateConfiguration({workflow: [wfName]});
    },

    // stepSeq is a sequence of Javascript objects.
    // The name attribute is always the value, but
    // there may also be a pretty_name attribute which
    // is the display.
    
    notifyStepsAvailable: function (stepSeq) {
      
      var stepSpan = this.getControlElement("stepbuttonspan");
      var panel = this;

      // Clear it, first.
      while (stepSpan.firstChild) {
        stepSpan.removeChild(stepSpan.firstChild);
      }

      var webRoot = this._ui._context.getWebRoot();

      // Any tag step (which will be initSettings.tag_step == true)
      // should have TWO steps - one for underway, and another
      // for done. Now that we have access to segments, we can
      // tell whether annotations have been marked as complete.
      // Or maybe, instead, I should change the label on the 
      // step.
      
      for (var i = 0; i < stepSeq.length; i++) {
        var step = stepSeq[i].initSettings.name;
        var stepVal = stepSeq[i].initSettings.pretty_name || step;
        if (i != 0) {
          var elt = document.createElement("img");
          elt.src = webRoot + "/img/caret_forward.gif";
          stepSpan.appendChild(elt);
        }
        var obj = document.createElement("span");
        obj.appendChild(document.createTextNode(stepVal));
        YAHOO.util.Dom.addClass(obj, "docstep");
        obj.id = this.newId('docstep'+step);
        stepSpan.appendChild(obj);
      }

      // Now, customize the buttons.

      panel.getControlElement("step_forward_button").onclick = function () {
        panel.log({action: "step_forward_request"});
        panel._ui._context.oneStepForward(panel._docLabel);
        return false;
      };
      
      panel.getControlElement("step_backward_button").onclick = function () {
        panel.log({action: "step_backward_request"});
        panel._ui._context.oneStepBack(panel._docLabel);
        return false;
      };

      panel.getControlElement("reload_button").onclick = function () {
        var form = panel.getGlobalElement("controlForm");
        
        panel.log({action: "reload_request"});
        if (panel._ui._context.isDirty(panel._docLabel)) {
          // This happens later, in reloadDocument, but I need to
          // disable it so the button doesn't get pressed again while
          // we're asking.
          // This isn't strictly necessary, since ask() is modal, but it doesn't hurt.
          panel.disableOperationControls();
          panel._ui.ask(panel._docLabel,
                        "Reloading this document will discard unsaved changes. Continue?",
                        [{ text:"Yes",
                           handler: function () {
                             panel._ui._context.reloadDocument(panel._docLabel, form);
                           }
                         }, {
                           text: "No",
                           isDefault: true,
                           handler: function () {
                             panel.log({action: "reload_aborted", reason: "dirty"});
                             panel.enableOperationControls();
                           }
                         }]);
        } else {
          panel._ui._context.reloadDocument(panel._docLabel, form);
        }
        return false;
      };      
    },

    notifyStepNotDone: function(stepName) {
      this._doButtons(stepName, stepName,
                      function(e) { YAHOO.util.Dom.removeClass(e, "stepdone"); });
      this.docDisplay.handAnnotationUnavailable();
    },
    
    notifyStepDone: function(stepName) {
      // Wasteful, but what the hell.
      this._doButtons(stepName, stepName,
                      function(e) { YAHOO.util.Dom.addClass(e, "stepdone"); });
      this.handAnnotationUnavailable();
    },
    
    disableOperationControls: function () {
      WorkflowDocumentPanel.superclass.disableOperationControls.call(this);
      this.getControlElement("step_forward_button").disabled = true;
      this.getControlElement("step_backward_button").disabled = true;
      this.getControlElement("reload_button").disabled = true;
    },

    enableOperationControls: function () {
      WorkflowDocumentPanel.superclass.enableOperationControls.call(this);
      this.getControlElement("step_forward_button").disabled = false;
      this.getControlElement("step_backward_button").disabled = false;
      this.getControlElement("reload_button").disabled = false;
    },

    notifyStepsUnderway: function(stepArray) {
      var panel = this;
      this._stepsBlinking = setInterval(function () {
        panel._doButtons(stepArray[0], stepArray[stepArray.length - 1],
                         function (e) {
                           if (YAHOO.util.Dom.hasClass(e, "stepunderway")) {
                             YAHOO.util.Dom.removeClass(e, "stepunderway");
                           } else {
                             YAHOO.util.Dom.addClass(e, "stepunderway");
                           }
                         });
      }, 500);
    },

    notifyNothingUnderway: function () {
      clearInterval(this._stepsBlinking);
      // Make absolutely sure that we weren't caught in the
      // middle of a blink.
      this._doButtons(null, null,
                      function (e) { YAHOO.util.Dom.removeClass(e, "stepunderway"); });
    },

    notifyNoDocumentPresent: function() {
      this.disableOperationControls();
      // clear the document display pane.
      WorkflowDocumentPanel.superclass.notifyNoDocumentPresent.call(this);
      // May have been disabled because the document contains spanless annotations.
      this._ui._enableMenuBarItem(["View", "Show annotation tables"]);
    },

    notifyDocumentPresent: function() {
      this.enableOperationControls();
      WorkflowDocumentPanel.superclass.notifyDocumentPresent.call(this);
    },
    
    // Change the status of the buttons in this status bar.

    _doButtons: function (initialStepName, finalStepName, fn) {
      var steps = this.getDocument().uiAvailableSteps();
      var start = false;
      for (var i = 0; i < steps.length; i++) {
        var curName = steps[i].initSettings.name;
        if ((initialStepName === null) || (curName == initialStepName)) {
          start = true;
        }
        if (start) {
          fn(this.getControlElement("docstep"+curName));
        }
        if (curName == finalStepName) {
          return;
        }
      }
    }
    
  });

/*
 *                    MAT.WorkbenchUI.WorkspacePanel
 *
 *
 * Make a workspace panel which is a resizeable panel.
 *
 */

  MAT.WorkbenchUI.WorkspacePanel = function (ui, wsLabel, userid) {

    this._ui = ui;
    this._wsLabel = wsLabel;
    this._userid = userid;

    // Note throughout here that many of the entries in data
    // are lists; this is because this is the data pulled directly
    // from the file upload dialog form.

    this._controlDiv = this._ui._createCollapsibleDiv(ui.fromTemplate("workspaceControlDivTemplate", "workspace", wsLabel));
    var B =  MAT.Dom._buildElement;
    this._listDiv = B("div", {
      attrs: {className: "wsPanelBody"}
    });
    
    this.getControlElement('taskfield').innerHTML = this.getWorkspace().getTask();
    this.getControlElement('useridfield').innerHTML = this._userid;
    this.getControlElement('loggingfield').innerHTML = "";
    this.getControlElement('loggingfield').appendChild(B("span", {
      children: [this.getWorkspace().loggingEnabled() ? B("b", {children: ["enabled"]}) : "disabled"],
      style: {
        cursor: "help"
      },
      attrs: {
        onclick: function () {
          ui.aboutWorkspaceLogging();
        }
      }
    }));
    
    MAT.WorkbenchUI.WorkspacePanel.superclass.constructor.call(
      this, ui._docTabView, null, null, this._listDiv);

    var w = this.getWorkspace();
    var d = w.getDir();
    
    this.updateTabLabel(d);
    
    if (w.isReadOnly()) {
      d += " (read-only)";
    }
    this.label = "Workspace: " + d;

    this.getControlElement("titlefield").innerHTML = this.getWindowTitle();

    // Populate the folder menu.

    var folders = this.getWorkspace().getFolders();

    this._ui._populateMenuFromKeys(this.getControlElement("foldermenu"), folders, "core", null);
    this.refresh();

    var panel = this;
    
    this.getControlElement("foldermenu").onchange = function () {
      panel.log({action: "list_workspace_folder_request"});
      panel.refresh();
    };

    this.getControlElement("refreshbutton").onclick = function () {
      panel.log({action: "list_workspace_folder_request"});
      panel.refresh();
    };

    // And make it show/hideable.
    
    this._ui.cacheShowableTabContent(this);

    // What a mess. If I want to ensure that the panel remains scrolled
    // to the appropriate place, I have to make sure that when the
    // panel is deselected, the scroll top is captured, and restored
    // when it's reselected. And if it's selected, we use the
    // value of the live window, and if it isn't, I use the
    // stashed one. Because when a tab is deselected, its scrollTop
    // becomes 0.
    
    this._scrollTop = 0;
    
  };
  
  var WorkspacePanel = MAT.WorkbenchUI.WorkspacePanel;

  YAHOO.extend(WorkspacePanel, MAT.WorkbenchUI.UITabContent, {

    select: function () {
      YAHOO.util.Dom.get("controlcontainer").appendChild(this._controlDiv);
      this._ui._displayLegend(this.getWorkspace().getTask());
    },

    afterSelect: function() {
      // Retrieve the scrollTop.
      var curBody = YAHOO.util.Dom.getElementsByClassName('yui-dt-bd', null, this._listDiv);
      if (curBody.length > 0) {
        curBody[0].scrollTop = this._scrollTop;
      }
    },

    deselect: function () {
      YAHOO.util.Dom.get("controlcontainer").innerHTML = "";
      this._ui._clearLegend();
      // Capture the scrollTop.
      var curBody = YAHOO.util.Dom.getElementsByClassName('yui-dt-bd', null, this._listDiv);
      if (curBody.length > 0) {
        this._scrollTop = curBody[0].scrollTop;
      }
    },

    getWindowTitle: function () {
      return this.label;
    },

    getWorkspace: function() {
      return this._ui._context.getWorkspace(this._wsLabel);
    },

    log: function (msg) {
      this._ui.log(this.getWorkspace(), msg);
    },

    show: function () {
      WorkspacePanel.superclass.show.call(this);
      // Make sure these are enabled.
      this._ui._enableMenuBarItem(["File", "Hide"]);
      this._ui._enableMenuBarItem(["File", "Close"]);
    },

    hide: function () {
      // Gesture source is WRONG.
      this.log({action: "hide_window", gesture_source: "window_button"});
      WorkspacePanel.superclass.hide.call(this);
      // If there are no more tabs in the UI, disable the
      // menu bar items.
      if (this._ui._docTabView.get("tabs").length == 0) {
        this._ui._disableMenuBarItem(["File", "Hide"]);
        this._ui._disableMenuBarItem(["File", "Close"]);
      }
    },
    
    // a utility I'm going to need all over the place.
    // Implements the same algorithm as the fromTemplate method of WorkbenchUI.
    // But it can't, because the tab may not be attached, in which case DOM.get
    // won't work. I need to use getElementsBy.

    getControlElement: function(childId) {      
      var id = this._wsLabel + "_" + childId;
      var v = YAHOO.util.Dom.getElementsBy(
        function (elt) { return elt.id == id; }, null,
        this._controlDiv);
      if (v.length == 0) {
        return null;
      } else {
        return v[0];
      }
    },

    getGlobalElement: function(childId) {
      return this._ui.getElement(this._wsLabel, childId);
    },    

    getElement: function(childId) {
      var id = this._wsLabel + "_" + childId;
      var v = YAHOO.util.Dom.getElementsBy(
        function (elt) { return elt.id == id; }, null,
        this._listDiv);
      if (v.length == 0) {
        return null;
      } else {
        return v[0];
      }
    },

    destroy: function () {
      this._ui.uncacheShowableTabContent(this);
      WorkspacePanel.superclass.destroy.call(this);
    },

    refresh: function () {
      // Refresh looks at the folder menu. If the option selected
      // is zero, do nothing. Otherwise, disable zero and load the
      // folder.
      var menu = this.getControlElement("foldermenu");
      if (menu.selectedIndex > 0) {
        menu.options[0].disabled = true;
        var val = menu.options[menu.selectedIndex].value;
        // What do we do when we do an operation? First,
        // we make the busy gif visible.
        this.getControlElement("busyimg").style.display = null;
        // Disable the menu and button.
        var button = this.getControlElement("refreshbutton");
        menu.disabled = true;
        button.disabled = true;
        this._ui._context.listWorkspaceFolder(this._wsLabel, val);
      }
    },

    notifyWorkspaceFolderRefreshCompleted: function() {
      this.getControlElement("busyimg").style.display = "none";
      var menu = this.getControlElement("foldermenu");
      var button = this.getControlElement("refreshbutton");
      menu.disabled = false;
      button.disabled = false;
    },

    maybeRefresh: function(possibleFolders) {
      var menu = this.getControlElement("foldermenu");
      if (menu.selectedIndex > 0) {
        var currentFolder = menu.options[menu.selectedIndex].value;
        for (var i = 0; i < possibleFolders.length; i++) {
          if (possibleFolders[i] == currentFolder) {
            // refresh.
            this.refresh();
            break;
          }
        }
      }
    },

    // fileList is no longer a list of strings - it's now a list
    // of hashes, where each hash is guaranteed to have the "basename" key.
    
    notifyWorkspaceFolderContents: function(folderName, fileList) {
      this.notifyWorkspaceFolderRefreshCompleted();
      // Let's double-check the file list, just in case.
      var menu = this.getControlElement("foldermenu");
      if (folderName != menu.options[menu.selectedIndex].value) {
        this._ui.notifyError("Selected folder has changed since refresh was requested");
      }

      // OK, OK, I've put it off as long as I can. Let's build a datatable!
      // It'll have two columns right now.

      // First, what if there's nothing in there?

      if (fileList.length == 0) {
        this._listDiv.innerHTML = "Folder is empty.";
      } else {
        // Clear the element. But first, make sure you capture
        // the scroll offset. There's no way to grab this element
        // using the datatable API, believe it or not.
        var scrollTop = 0;
        if (this.isSelected()) {
          var curBody = YAHOO.util.Dom.getElementsByClassName('yui-dt-bd', null, this._listDiv);
          if (curBody.length > 0) {
            scrollTop = curBody[0].scrollTop;
          }
        } else {
          scrollTop = this._scrollTop;
        }
        this._listDiv.innerHTML = "";
        // Carefully create the internal structure. I need a spacer
        // to place the header in. Ugh.
        var trueE = MAT.Dom._buildElement("div", {});
        this._listDiv.appendChild(trueE);          
        
        // First, build the appropriate data.
        var data = [];
        for (var i = 0;  i < fileList.length; i++) {
          var s = fileList[i];
          var b = s.basename;
          delete s.basename;
          data.push({fileName: b, status: s});
        }

        // Next, build the data source.
        var myDataSource = new YAHOO.util.DataSource(data); 
        myDataSource.responseType = YAHOO.util.DataSource.TYPE_JSARRAY; 
        myDataSource.responseSchema = { 
	  fields: ["fileName", "status"]
	};        

        var panel = this;

        var cellOrder = ["assigned to", "doc name", "locked by"];
        
        function statusFormatter(elCell, oRecord, oColumn, oData) {
          var sList = [];
          // Only the core folder has a useful status.
          if (oData.status) {
            sList.push(oData.status);
          }
          for (var i = 0; i < cellOrder.length; i++) {
            var s = oData[cellOrder[i]];
            if (s) {
              sList.push(cellOrder[i] + " " + s);
            }
          }
          elCell.innerHTML = sList.join(", ");
        }
        
        var fields = [{
          key: "fileName", label: "File", width: "50%"
        }, {
          key: "status", label: "Status", width: "50%", formatter: statusFormatter
        }];

        //  Finally, build the table. Note that the only reason
        // 100% height works is that I've set the table header row
        // to display: none in simple_ui.css. Otherwise, the table would overflow, because
        // the BODY would be set to 100%, plus the header. As usual, there's
        // no way in CSS to do this right; I want to say, let the header take
        // up whatever space it needs, and THEN fill the bottom with the
        // rest. But you can't say that in CSS.

        // So we're going to have to do this differently. We're going
        // to take the header out of the normal flow, and put it in
        // a fixed position. But we're going to have a div which has room for it
        // in its top padding.

        // A file can be opened if the workspace is readOnly
        // or if the document is either not locked or locked
        // by the current user. If the document is assigned
        // to someone who isn't you, it can't be opened, readOnly or not.
        // We need this function in formatting the rows (so the ones
        // which can't be selected have gray text), highlighting the rows,
        // and clicking the rows.

        var ws = this.getWorkspace();
        var userid = ws.getData().userid;
        
        function fileCanBeOpened(rowData) {
          if (rowData["assigned to"] && (userid != rowData["assigned to"])) {
            return false;
          }
          return (ws.isReadOnly() || (!rowData["locked by"]) || (rowData["locked by"] == userid));            
        }
        
        function rowFormatter(elTr, oRecord) {
          if (!fileCanBeOpened(oRecord.getData().status)) {
            elTr.style.color = "gray";
          }
          return true;
        }
        
        var dTable = new YAHOO.widget.DataTable(
          trueE,
          fields, myDataSource,
          {scrollable:true, width:"100%", height:"100%", formatRow: rowFormatter}
        );
        
        function maybeHighlightRow(oArgs, oTarget) {
          if (fileCanBeOpened(dTable.getRecord(oArgs.target).getData().status)) {
            dTable.onEventHighlightRow(oArgs, oTarget);
          }
        }

        // Row highlighting and selection.
        dTable.subscribe("rowMouseoverEvent", maybeHighlightRow);
        dTable.subscribe("rowMouseoutEvent", dTable.onEventUnhighlightRow);
        dTable.subscribe("rowClickEvent", function (oArgs) {
          var data = dTable.getRecord(oArgs.target).getData();
          if (fileCanBeOpened(data.status)) {
            panel.openWorkspaceFile(data.fileName, folderName);
          }
        });

        YAHOO.util.Dom.getElementsByClassName('yui-dt-bd', null, this._listDiv)[0].scrollTop = scrollTop;
      }
    },

    openWorkspaceFile: function(fileName, folderName) {
      // The folder information should be provided already.
      this.log({action: "open_file_request", file: fileName, userid: this._userid});
      this._ui._context.openWorkspaceFile(this._wsLabel, fileName, folderName);
    },

    _close: function (e) {
      this.log({action: "close_workspace_request"});
      WorkspacePanel.superclass._close.call(this, e);
      this._ui._context.destroyWorkspace(this._wsLabel);
    }
  });

/*
 *                    MAT.WorkbenchUI.WorkspaceDocumentPanel
 *
 *
 * A document panel with workspace controls.
 *
 */

  MAT.WorkbenchUI.WorkspaceDocumentPanel = function(ui, doc) {

    // The data has to contain at least the task name
    // in order to populate the legend appropriately. And
    // it has to be a singleton list, because we're mimicking
    // what the form might have.

    // I need this in order to create the doc display.
    this._userid = doc.getWorkspace().getData().userid;
    
    MAT.WorkbenchUI.WorkspaceDocumentPanel.superclass.constructor.call(
      this, ui, doc.docLabel, doc.getWorkspace().getTask(), "workspaceDocumentControlDivTemplate", "workspace_document");

    this.computeTitle();
    
    var panel = this;

    this.getControlElement("do_operation_button").onclick = function () {
      panel.performOperation();
    }
    
    this._ui.cacheShowableTabContent(this);
    
  };

  // The tClass must have a docOutputDiv in which to place the
  // tagged document, and a "docMarkupTagDiv" in which to place
  // the tag legend.
  
  var WorkspaceDocumentPanel = MAT.WorkbenchUI.WorkspaceDocumentPanel;

  YAHOO.extend(WorkspaceDocumentPanel, TaggedDocumentPanel, {

    select: function () {

      WorkspaceDocumentPanel.superclass.select.call(this);

      var panel = this;
      
      this._ui._enableMenuBarItem(["View"], {
        setMenuItems: [
          {
            matconfig: {
              label: "Show character offsets",
              configvar: "showCharOffsets",
              panel: this
            }
          }, {
            matconfig: {
              label: "Show segment boundaries",
              configvar: "showSegments",
              panel: this
            }
          }, {
            matconfig: {
              label: "Edit/view annotations in tabs",
              configvar: "editInTab",
              panel: this
            }
          }, {
            matconfig: {
              label: "Edit/view annotations in popups",
              configvar: "editInPopup",
              panel: this
            }
          }, {
            matconfig: {
              label: "Show annotation tables",
              configvar: "showAnnotationTables",
              panel: this
            }
          }, {
            matconfig: {
              label: "Autotag is case-sensitive",
              configvar: "autotagIsCaseSensitive",
              panel: this
            }
          }
        ]
      });
    },

    deselect: function () {
      this._ui._disableMenuBarItem(["View"], {
        clearMenuItems: true
      });
      WorkspaceDocumentPanel.superclass.deselect.call(this);
    },

    computeTitle: function() {
      this.label = "File: " + this.getDocument().getDescription();
      this.getControlElement("titlefield").innerHTML = this.label;
      this.updateTabLabel(this.getDocument().getShortDescription());
    },

    getWindowTitle: function () {
      return this.label;
    },

    createDocDisplay: function() {
      this.docDisplay = new MAT.DocDisplay.DocDisplay(this, this._ui._context, this.getElement("docOutputDiv"), {
        reviewer: this._userid
      });
    },

    destroy: function () {
      if (this.docDisplay) {
        this.docDisplay.destroy();
      }
      this._ui.uncacheShowableTabContent(this);
      WorkspaceDocumentPanel.superclass.destroy.call(this);
    },

    notifyDocumentPresent: function() {
      var doc = this.getDocument();
      // Update the folder.
      this.getControlElement("folderfield").innerHTML = doc.getFolder();
      var otherFields = doc.getExtraDataFields();
      var fieldBlock = this.getControlElement("fieldblock");
      fieldBlock.innerHTML = "";
      var B = MAT.Dom._buildElement;
      var E = MAT.Dom._augmentElement;
      if (otherFields) {
        for (var k in otherFields) {
          if (otherFields.hasOwnProperty(k)) {
            E(fieldBlock, {children: [B("tr", {children: [{label: "td", text: k + ":"}, {label: "td", text: otherFields[k]}]})]});
          }
        }
      }
      this.getControlElement("loggingfield").innerHTML = "";
      this.getControlElement('loggingfield').appendChild(B("span", {
        children: [this.getDocument().getWorkspace().loggingEnabled() ? B("b", {children: ["enabled"]}) : "disabled"],
        style: {
          cursor: "help"
        },
        attrs: {
          onclick: function () {
            ui.aboutWorkspaceLogging();
          }
        }
      }));

      // Make the busy gif invisible,  just in case.
      this.getControlElement("busyimg").style.display = "none";

      // Here, update the menu.
      var menu = this.getControlElement("panel_operationmenu");
      var button = this.getControlElement("do_operation_button");
      // Disable them both.
      menu.disabled = true;
      button.disabled = true;

      // Clear the menu.
      while (menu.options.length > 0) {
        menu.removeChild(menu.options[0]);
      }
      var found = false;
      // If the new folder has operations, enable the menu and button.
      // But only if it's not read-only.
      if (doc.isReadOnly()) {        
        var optNode = document.createElement("option");
        optNode.appendChild(document.createTextNode("(read only)"));
        menu.appendChild(optNode);
        button.style.display = "none";
      } else {
        var ops = doc.getOperations();
        // The selected operation will be labeled defaultOperation: true.
        // There may not be one.
        var i = 0;
        for (var key in ops) {
          if (!ops.hasOwnProperty(key)) {
            continue;
          }
          var op = ops[key];
          if (op.condition && !op.condition(doc)) {
            continue;
          }
          found = true;
          var optNode = document.createElement("option");
          optNode.appendChild(document.createTextNode(key));
          menu.appendChild(optNode);
          if (ops[key].defaultOperation) {
            menu.selectedIndex = i;
          }
          i++;
        }
        if (found) {
          menu.disabled = false;
          button.disabled = false;
        } else {
          var optNode = document.createElement("option");
          optNode.appendChild(document.createTextNode("(no operations available)"));
          menu.appendChild(optNode);
          button.style.display = "none";
        }
      }
      
      // Call the parent.

      WorkspaceDocumentPanel.superclass.notifyDocumentPresent.call(this);
      // If we have spanless annotation types, we should disable the show annotation table
      // element, because you can't toggle when you're looking at this document. This all happens
      // after the menu is configured, so we're good. It doesn't matter if we never
      // re-enable it, because the menu is reconstructed each time you change panes.
      if (this._hasSpanlessAnnotationTypes) {
        this._ui._disableMenuBarItem(["View", "Show annotation tables"]);
      }
    },

    notifyNoDocumentPresent: function() {
      // clear the document display pane.
      WorkspaceDocumentPanel.superclass.notifyNoDocumentPresent.call(this);
      // May have been disabled because the document contains spanless annotations.
      this._ui._enableMenuBarItem(["View", "Show annotation tables"]);
    },

    performOperation: function() {
      // What do we do when we do an operation? First,
      // we make the busy gif visible.
      this.getControlElement("busyimg").style.display = null;
      // Disable the menu and button.
      var menu = this.getControlElement("panel_operationmenu");
      var button = this.getControlElement("do_operation_button");
      menu.disabled = true;
      button.disabled = true;

      var op = menu.options[menu.selectedIndex].value;
      this.log({action: "do_operation_request", operation: op});
      
      // Now, do something.
      this._ui._context.doWorkspaceOperationOnFile(this._docLabel, op);
    },

    notifyOperationCompleted: function() {
      this.getControlElement("busyimg").style.display = "none";
      var menu = this.getControlElement("panel_operationmenu");
      var button = this.getControlElement("do_operation_button");
      menu.disabled = false;
      button.disabled = false;
    }
        
  });

/*
 *                    MAT.WorkbenchUI.ComparisonDocumentPanel
 *
 *
 * A multi-document panel with comparison controls.
 * This is a special, odd sort of tagged document window - it
 * doesn't correspond to a document.
 *
 */

  // compEntries hav label, initial, position, doc.

  MAT.WorkbenchUI.ComparisonDocumentPanel = function(ui, compLabel, data, compEntries) {

    this._windowTitle = "Comparison: " + compEntries[0].doc.getDescription() + " ...";
    this._shortWindowTitle = compEntries[0].doc.getShortDescription() + " ...";
    if (this._shortWindowTitle.charAt(0) == "*") {
      // Remove it.
      this._shortWindowTitle = this._shortWindowTitle.substring(1);
    }

    // So createDocDisplay happens when the parent constructor is called, so
    // the _compEntries must be in shape for that. But getElement isn't defined
    // until after the constructor is called. So I have to make sure that I have
    // all the descriptions collected so I can add them after the constructor
    // is called.

    var descs = [];
        
    for (var i = 0; i < compEntries.length; i++) {
      var e = compEntries[i];
      // Everybody gets an initial.
      var prefix;
      if (e.initial && e.initial.length > 0) {
        prefix = e.initial + ": ";
      } else {
        e.initial = "" + (i + 1);
        prefix = e.initial + ": ";
      }
      descs.push(prefix + "(" + e.position + ") " + e.doc.getDescription());
      e.doc = e.doc.currentDocument.doc;
    }
    
    this._compEntries = compEntries;
    
    MAT.WorkbenchUI.ComparisonDocumentPanel.superclass.constructor.call(
      this, ui, compLabel, data.task, "comparisonDocumentControlDivTemplate", "comparison_document");

    // The underlying documents are never modified.

    var docList = this.getControlElement("docList");    
    var p = MAT.Dom._buildElement("p");
    docList.appendChild(p);

    for (var i = 0; i < descs.length; i++) {      
      if (i > 0) {
        p.appendChild(document.createElement("br"));
      }
      p.appendChild(document.createTextNode(descs[i]));
    }
    
    this._ui.cacheShowableTabContent(this);
    
  };  
  
  var ComparisonDocumentPanel = MAT.WorkbenchUI.ComparisonDocumentPanel;  

  YAHOO.extend(ComparisonDocumentPanel, TaggedDocumentPanel, {

    select: function () {

      ComparisonDocumentPanel.superclass.select.call(this);

      var panel = this;

      this._ui._enableMenuBarItem(["View"], {
        setMenuItems: [
          {
            matconfig: {
              label: "Show character offsets",
              configvar: "showCharOffsets",
              panel: this
            }
          }
        ]
      });      

      this._ui._enableMenuBarItem(["File", "Reconcile these documents"], {        
        
        setClick: {
          fn: function () {
            var docLabels = [];
            for (var k = 0; k < panel._compEntries.length; k++) {
              docLabels.push(panel._compEntries[k].label);
            }
            panel.log(null, {action: "open_file_reconciliation_request", documents: docLabels});
            // Normally, this is called from the reconciliation dialog, and that dialog
            // supports the getData() method. In order to make this happen here, I have to
            // provide an object as a value for the dialog key that supports getData(), and
            // returns the minimal plausible data hash.
            panel._ui._context.documentReconciliation(docLabels, {
              dialog: {
                getData: function () {
                  return {task: panel.getTaskName()};
                }
              }
            });
          }
        }
      });      
    },

    deselect: function () {
      this._ui._disableMenuBarItem(["View"], {
        clearMenuItems: true
      });
      this._ui._disableMenuBarItem(["File", "Reconcile these documents"], {
        unsetClick: true
      });
      ComparisonDocumentPanel.superclass.deselect.call(this);
    },

    computeTitle: function () {
      this.label = this._windowTitle;
      this.updateTabLabel(this._shortWindowTitle);
      this.getControlElement("titlefield").innerHTML = this.label;
      // Never changes, so I don't need to change the installed tab.
    },

    createDocDisplay: function() {
      this.docDisplay = new MAT.DocDisplay.ComparisonDocDisplay(
        this, this._ui._context, this.getElement("docOutputDiv"), {
          compEntries: this._compEntries
        });
    },    

    getWindowTitle: function () {
      return this.label;
    },

    isReadOnly: function() {
      return true;
    },

    destroy: function () {
      if (this.docDisplay) {
        this.docDisplay.destroy();
      }
      this._ui.uncacheShowableTabContent(this);
      ComparisonDocumentPanel.superclass.destroy.call(this);
    },

    _close: function () {
      this.log({action: "close_comparison"});
      ComparisonDocumentPanel.superclass._close.call(this);
      this._ui.notifyDocumentClosed(this._docLabel);
    }
    
  });  

/*
 *                    MAT.WorkbenchUI.NewComparisonDocumentPanel
 *
 *
 * A multi-document panel with comparison controls.
 * This uses the new comparison paradigm with a single comparison document.
 * This is a special, odd sort of tagged document window - it
 * corresponds to a document, but it's a (new-style) comparison document.
 *
 */

  MAT.WorkbenchUI.NewComparisonDocumentPanel = function(ui, docLabel, params, compEntries) {

    // here's the detail tab div
    this._detailsDiv = MAT.Dom._buildElement("div", {
      style: {
        height: "100%",
        width: "100%",
        overflow: "auto"
      }
    });

    if ((params.workflow && params.workflow == "(comparison)") ||
        (compEntries[0].doc === undefined)) {
      // for reading in a previously saved comparison document. The
      // workflow may be (comparison), or it might be loaded with
      // the wrong workflow and shunted into here.
      this._windowTitle = "Comparison Document: " + params.input;
      this._shortWindowTitle = params.input;
    } else {
      // for a freshly-generated comparison document
      this._windowTitle = "Comparison: " + compEntries[0].doc.getDescription() + " ...";
      this._shortWindowTitle = compEntries[0].doc.getShortDescription() + " ...";
    }
    this._compEntries = compEntries;

    if (this._shortWindowTitle.charAt(0) == "*") {
      // Remove it.
      this._shortWindowTitle = this._shortWindowTitle.substring(1);
    }

    var descs = [];

    for (var i = 0; i < this._compEntries.length; i++) {
      var e = this._compEntries[i];
      // Everybody gets an initial.
      var prefix;
      if (e.initial && e.initial.length > 0) {
        prefix = e.initial + ": ";
      } else {
        e.initial = "" + (i + 1);
        prefix = e.initial + ": ";
      }
      if (e.doc) {
        descs.push(prefix + "(" + e.position + ") " + e.doc.getDescription());
      } else if (e.docname) {
        descs.push(prefix + "(" + e.position + ") " + e.docname);
      } else {
        descs.push(prefix + "(" + e.position + ") " + e.label);
      }
      // not convinced I want/need to change the compEntries docs here
      // e.doc = e.doc.currentDocument.doc;
    }
    
    this._windowDescription = params.description;

    MAT.WorkbenchUI.NewComparisonDocumentPanel.superclass.constructor.call(
      this, ui, docLabel, params.task, "comparisonDocumentControlDivTemplate", "comparison_document");

    var docList = this.getControlElement("docList");    
    var p = MAT.Dom._buildElement("p");
    docList.appendChild(p);

    for (var i = 0; i < descs.length; i++) {      
      if (i > 0) {
        p.appendChild(document.createElement("br"));
      }
      p.appendChild(document.createTextNode(descs[i]));
    }

    // create the tab for the details div
    this._detailsTab = new MAT.WorkbenchUI.UITabContent(this._ui._detailsTabView, "Pairings", "Pairings", this._detailsDiv);
                                                        
    this._ui.cacheShowableTabContent(this);
  }

  var NewComparisonDocumentPanel = MAT.WorkbenchUI.NewComparisonDocumentPanel;  

  YAHOO.extend(NewComparisonDocumentPanel, TaggedDocumentPanel, {

    _renderPresentedDocument: function() {
      NewComparisonDocumentPanel.superclass._renderPresentedDocument.call(this);
      this._detailsTab.makeActive();

    },
    
    select: function () {

      NewComparisonDocumentPanel.superclass.select.call(this);

      var panel = this;

      this._ui._enableMenuBarItem(["View"], {
        setMenuItems: [
          {
            matconfig: {
              label: "Show character offsets",
              configvar: "showCharOffsets",
              panel: this
            }
          }
        ]
      });
      // Show the vote tab.
      this._detailsTab.show();

      // allow saving
      this._ui._enableMenuBarItem(["File", "Save..."], {
        setClick: {
          fn: function () {
            panel._ui._context.saveComparisonDocument(panel.getDocument());
          }
        }
      });



      /****
      this._ui._enableMenuBarItem(["File", "Reconcile these documents"], {        
        
        setClick: {
          fn: function () {
            var docLabels = [];
            for (var k = 0; k < panel._compEntries.length; k++) {
              docLabels.push(panel._compEntries[k].label);
            }
            panel.log(null, {action: "open_file_reconciliation_request", documents: docLabels});
            // Normally, this is called from the reconciliation dialog, and that dialog
            // supports the getData() method. In order to make this happen here, I have to
            // provide an object as a value for the dialog key that supports getData(), and
            // returns the minimal plausible data hash.
            panel._ui._context.documentReconciliation(docLabels, {
              dialog: {
                getData: function () {
                  return {task: panel.getTaskName()};
                }
              }
            });
          }
        }
      });      
***/
    },


    deselect: function () {
      this._ui._disableMenuBarItem(["File", "Save..."], {
        unsetClick: true
      });
      this._ui._disableMenuBarItem(["View"], {
        clearMenuItems: true
      });
      /***
      this._ui._disableMenuBarItem(["File", "Reconcile these documents"], {
        unsetClick: true
      });  ***/
      this._detailsTab.hide();
      NewComparisonDocumentPanel.superclass.deselect.call(this);
    },

    computeTitle: function () {
      this.label = this._windowTitle;
      this.updateTabLabel(this._shortWindowTitle);
      this.getControlElement("titlefield").innerHTML = this.label;
      // Never changes, so I don't need to change the installed tab.
    },

    createDocDisplay: function() {
      this.docDisplay = new MAT.DocDisplay.NewComparisonDocDisplay(
        this, this._ui._context, this.getElement("docOutputDiv"), {
          compEntries: this._compEntries,
          detailsDiv: this._detailsDiv
        });
    },    

    getWindowTitle: function () {
      return this.label;
    },

    destroy: function () {
      if (this.docDisplay) {
        this.docDisplay.destroy();
      }
      this._ui.uncacheShowableTabContent(this);
      if (this._detailsTab.nameDisplays) {
        for (var i = 0; i < this._detailsTab.nameDisplays.length; i++) {
          // unregister the nameDisplay
          this._detailsTab.nameDisplays[i].unregister();
        }
      }
      NewComparisonDocumentPanel.superclass.destroy.call(this);
    },

    _close: function () {
      this.log({action: "close_comparison"});
      NewComparisonDocumentPanel.superclass._close.call(this);
      this._ui.notifyDocumentClosed(this._docLabel);
    }
    
  });  



  /*
 *                    MAT.WorkbenchUI.ReconciliationDocumentPanel
 *
 *
 * A multi-document panel with reconciliation controls.
 * This is a special, odd sort of tagged document window - it
 * corresponds to a document, but it's a reconciliation document.
 *
 */

  MAT.WorkbenchUI.ReconciliationDocumentPanel = function(ui, docLabel, params) {

    // Here's the vote div. Create it before you call the parent.
    this._voteDiv = MAT.Dom._buildElement("div", {
      style: {
        height: "100%",
        width: "100%",
        overflow: "auto"
      }
    });
    
    // If I want to save this file, I need to give it a name.
    MAT.WorkbenchUI.ReconciliationDocumentPanel.superclass.constructor.call(
      this, ui, docLabel, params.task,
      "reconciliationDocumentControlDivTemplate", "reconciliation_document");

    this._windowDescription = params.description;
    this.computeTitle();

    // And, create a tab for the vote div.
    this._voteTab = new MAT.WorkbenchUI.UITabContent(this._ui._detailsTabView, "Voting", "Voting", this._voteDiv);
    
    this._ui.cacheShowableTabContent(this);
    
  };
  
  var ReconciliationDocumentPanel = MAT.WorkbenchUI.ReconciliationDocumentPanel;  

  YAHOO.extend(ReconciliationDocumentPanel, TaggedDocumentPanel, {

    // No annotation tables.
    _maybeShowAnnotationTableTab: function() {
    },
    
    select: function () {
      ReconciliationDocumentPanel.superclass.select.call(this);
      
      // There's a bunch of things we need to do here.
      
      var panel = this;

      this._ui._enableMenuBarItem(["File", "Save..."], {
        setClick: {
          fn: function () {
            panel._ui._context.saveReconciliationDocument(panel.getDocument());
          }
        }
      });

      this._ui._enableMenuBarItem(["Reconciliation"], {        
        setMenuItems: [[{
          text: "Process votes",
          onclick: {
            fn: function() {
              panel.log({action: "update_reconciliation_doc_request"});
              panel._ui._context.refreshReconciliationDocument(panel.getDocument());
            }
          }
        }, {
          matconfig: {
            label: "Show processed votes",
            configvar: "reconciliationShowProcessedVotes",
            panel: this            
          }
        }, {
          text: "Export",          
          onclick: {
            fn: function () {
              panel.log([{action: "update_reconciliation_doc_request"}, {action: "export_reconciliation_doc_request"}]);
              panel._ui._context.exportReconciliationDocument(panel.getDocument());
            }
          }
        }], [{
          matconfig: {
            label: "Auto-advance",
            configvar: "reconciliationAutoAdvance",
            panel: this
          }
        }, {
          matconfig: {
            label: "Export to file",
            configvar: "reconciliationExportToFile",
            panel: this
          }
        }]]
      });

      // And now that the menu is created, if we need to enable export
      // to file, do so.

      if (this._ui._panelConfig["reconciliationExportToFile"]) {
        this.setConfigVar("reconciliationExportToFile", true);
      }

      this._ui._enableMenuBarItem(["View"], {
        setMenuItems: [
          {
            matconfig: {
              label: "Show character offsets",
              configvar: "showCharOffsets",
              panel: this
            }
          }, {
            matconfig: {
              label: "Show all segment boundaries",
              configvar: "showSegments",
              panel: this
            }
          }
        ]
      });
      // Show the vote tab.
      this._voteTab.show();
    },

    deselect: function () {
      this._ui._disableMenuBarItem(["File", "Save..."], {
        unsetClick: true
      });
      this._ui._disableMenuBarItem(["Reconciliation"], {
        clearMenuItems: true
      });
      this._ui._disableMenuBarItem(["View"], {
        clearMenuItems: true
      });
      this._voteTab.hide();
      ReconciliationDocumentPanel.superclass.deselect.call(this);
    },    
               
    setConfigVar: function(variable, bool) {
      if (variable == "reconciliationAutoAdvance") {
        if (bool) {
          this.docDisplay.maybeStartAutoAdvance();
        }
      } else if (variable == "reconciliationShowProcessedVotes") {
        if (bool) {
          this.docDisplay.showProcessedVotes();
        } else {
          this.docDisplay.hideProcessedVotes();
        }
      } else if (variable == "reconciliationExportToFile") {
        // This one doesn't go to the UI; it changes the "Export" menu.
        // When we first select, we may be already true, or false. So
        // the true case always gets changed, but the false case we
        // only want to do if the label of the element in question is "Export...".
        // Actually, if it's at startup, it won't even exist, darn it all, because
        // the menu hasn't actually been created. So I have to do this afterward.
        var menu = this._ui._getMenuBarItem(["Reconciliation"]).cfg.getProperty("submenu");
        var mItem = menu.getItem(2, 0);
        if (mItem) {
          if (bool) {
            menu.removeItem(2, 0);
            menu.insertItem({
              text: "Export...",
              submenu: {
                id: "saveMenu_" + this._docLabel,
                constraintoviewport: true,
                itemdata: this.createSaveMenuItems({
                  richOnly: true,
                  saveCb: function(context, appDoc, format, parameters) {
                    panel.log([{action: "update_reconciliation_doc_request"},
                               {action: "export_reconciliation_doc_request"}]);
                    context.exportAndSaveReconciliationDocument(appDoc, format, parameters);
                  }
                })
              }
            }, 2, 0);
            // Let's rerender the parent. This seems to be the most efficient
            // way of getting the new child menu rendered and displayed.
            menu.render();
          } else if (mItem.cfg.getProperty("text") == "Export...") {
            // We do this if we have to turn it off. We TRY to call this
            // immediately after creation only if the flag is set, but
            // it can't hurt to check again.
            
            // Another bug in YUI. If you remove a menu item, it does NOT
            // unsubscribe from some of the events. This only happens in clearContent.
            var oSubmenu = mItem.cfg.getProperty("submenu");
            menu.cfg.configChangedEvent.unsubscribe(
              menu._onParentMenuConfigChange, oSubmenu);
            menu.renderEvent.unsubscribe(menu._onParentMenuRender, oSubmenu);
            menu.removeItem(2, 0);
            var panel = this;
            menu.insertItem({
              text: "Export",
              onclick: {
                fn: function () {
                  panel.log([{action: "update_reconciliation_doc_request"}, {action: "export_reconciliation_doc_request"}]);
                  panel._ui._context.exportReconciliationDocument(panel.getDocument());
                }
              }
            }, 2, 0);
          }
        }
      } else {
        ReconciliationDocumentPanel.superclass.setConfigVar.call(this, variable, bool);
      }
    },    
    
    computeTitle: function () {
      this.label = "Reconciliation: " + this._windowDescription + "...";
      var shortLabel = this._windowDescription + "...";
      var d = this.getDocument();
      if (d.currentDocument && d.currentDocument.isDirty()) {
        this.label += " (modified)";
        shortLabel = "*" + shortLabel;
      }
      this.getControlElement("titlefield").innerHTML = this.label;
      this.updateTabLabel(shortLabel);
    },
    
    createDocDisplay: function() {
      this.docDisplay = new MAT.DocDisplay.ReconciliationDocDisplay(
        this, this._ui._context, this.getElement("docOutputDiv"), {
          doc: this.getDocument().currentDocument.doc,
          voteReviewDiv: this._voteDiv
        });
    },

    getWindowTitle: function () {
      return this.label;
    },

    controlsSuppressed: function() {
      return true;      
    },

    destroy: function () {
      if (this.docDisplay) {
        this.docDisplay.destroy();
      }
      this._ui.uncacheShowableTabContent(this);
      ReconciliationDocumentPanel.superclass.destroy.call(this);
    },

    // Makes the document dirty.
    notifyReconciliationVoted: function() {
      this.getDocument().stepDone("reconciliation_vote");
    },

    notifySegmentReviewUnderway: function() {
      // Can't export or save or process votes while segment review is underway.
      this._ui._disableMenuBarItem(["Reconciliation", "Process votes"]);
      this._ui._disableMenuBarItem(["Reconciliation", "Export"]);
      this._ui._disableMenuBarItem(["File", "Save..."]);
    },

    notifySegmentReviewFinished: function() {
      // Now we can export or save.
      this._ui._enableMenuBarItem(["Reconciliation", "Process votes"]);
      this._ui._enableMenuBarItem(["Reconciliation", "Export"]);
      this._ui._enableMenuBarItem(["File", "Save..."]);
    },

    notifyAutoAdvanceExhausted: function() {
      this.uiInform("No more segments to review.");
      this._ui._togglePanelConfig("reconciliationAutoAdvance", this, 
                                  this._ui._getMenuBarItem(["Reconciliation", "Auto-advance"]));
    },

    offerBoundaryRelocationPopup: function(e, item, itemCb) {
      this.getDocument().log({action: "summon_boundary_change_popup"});
      var disp = this;      
      var popup = new YAHOO.widget.Menu("boundaryRelocMenu_" + this._docLabel, {
        constraintoviewport: true,
        xy: [ e.pageX, e.pageY ],
        itemdata: [
          {
            text: item,
            onclick: {
              fn: function() {
                itemCb();
              }
            }
          }, {
            text: "Cancel",
            onclick: {
              fn: function() {
                // Cancel.
                disp.log({action: "cancel_boundary_change"});
              }
            }
          }
        ]
      });
      YAHOO.util.Dom.addClass(popup.element, "annotationMenu");

      popup.render(document.body);
      
      // How can we destroy an object after it's hidden? Subscribing to
      // "hide" is the wrong thing, because stuff happens after the
      // callback. So try this. Worked. At least, nothing broke that I can see.
      
      var coreHide = popup.hide;
      popup.hide = function () {
        coreHide.call(popup);        
        disp.getDocument().log({action: "dismiss_boundary_change_popup"});
        popup.destroy();
      }
      
      popup.show();
    },

    // We have to catch this - if someone opens a reconciliation
    // document without selecting "(reconciliation)", we can get here.
    // The steps will be the steps for the workflow.
    
    notifyStepsAvailable: function (stepSeq) {
    },

    notifyStepDone: function(stepName) {
    }

  });  
}

