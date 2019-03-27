/* Copyright (C) 2007 - 2012 The MITRE Corporation. See the toplevel
file LICENSE for license terms. */

/* This file contains the popup manager which the YUI UI uses. It's
   used both by the main annotation UI and the standalone document
   viewer. In fact, this file contains a bunch of things that are YUI-specific
   that only get used if YUI is available. */


// I also need to create a button. This comes into play when a styled button
// is needed by one of the annotation popups.

MAT.YUIExtensions = {

  loadBugFixes: function () {

    var origConfigzIndex = YAHOO.widget.Overlay.prototype.configzIndex;

    YAHOO.widget.Overlay.prototype.configzIndex = function (type, args, obj) {
      origConfigzIndex.call(this, type, args, obj);
      // Heavens. There's a hideous bug in YUI where somehow, after you
      // render, the zIndex is a string rather than a number. This ends
      // up doing very, very strange things when there are two of these,
      // because it's sorting on zIndex.
      var zIndex = this.cfg.getProperty("zIndex");
      if (typeof zIndex === "string") {
        this.cfg.setProperty("zIndex", parseInt(zIndex, 10), false);
      }
    },    
    // And a couple bug fixes. For some bizarre reason, the
    // menu items all like to create <a> elements for their contents,
    // even when there's no real URL. This leads to all sorts of
    // hideous behavior, including when you select the Save... menu
    // item instead of one of its children, you end up selecting
    // that anchor, which permanently screws up the UI, and then if
    // you select something without an actual anchor, just "#", you
    // get this stupid permanent link in the bottom left corner.
    // And there's no elegant way of overriding this behavior, so I'm
    // going to use an inelegant one: redefine the methods. If we EVER
    // upgrade from 2.6.0, this will need to be redone. This involves
    // redefining two MenuItem methods: _createRootNodeStructure
    // and configURL and configTarget (just in case one or the other
    // happens first).
    
    /**
    * @method _createRootNodeStructure
    * @description Creates the core DOM structure for the menu item.
    * @private
    */

    YAHOO.widget.MenuItem.prototype._createRootNodeStructure = function () {

      // SAM: Completely rewritten. Note that the _oAnchor is a span.
      // Apparently, one problem I failed to anticipate is that when you
      // press a key, anchors are natural foci for keypress events, but spans
      // aren't. So what happens if I give the span a null keypress event?
      // Will that focus the keypress? No. The problem is that only a small
      // handful of DOM elements can receive focus, and none of them are the
      // ones I'm interested in. THAT's why this is an anchor.
      // Setting the default href to "" is a slight improvement - that way,
      // you only make it reload when you select an item that has no
      // action. :-). But the URL is still visible at the bottom. Note that
      // you MUST have an href, at least in Firefox, to get the keyboard focus.
      // So we're going to try something otherwise horrible and awful.
      // Actually, it looks like I'm being defeated from doing something
      // horrible and awful by the way events are set up in the menu manager.
      // So what I'm going to do is override the function that sets the
      // event. Boy, this is ugleeee.....
      var B = MAT.Dom._buildElement;
      this._oAnchor = B("span", {attrs: {className: this.CSS_LABEL_CLASS_NAME}});
      this.element = B("li", {children: [this._oAnchor], attrs: {className: this.CSS_CLASS_NAME}});

    };
    
    var origAdd = YAHOO.util.Event.addListener;
    YAHOO.util.Event.addListener = function(el, sType, fn, obj, override) {
      if ((el === document) &&
          ((sType == "keypress") || (sType == "keyup") || (sType == "keydown")) &&
          ((obj === YAHOO.widget.MenuManager))) {
        // See menu.js, line 582 or so. We need to wrap fn before we record it, in order
        // to munge the event. This addresses the issue with replacing "a" with "span".
        var oldfn = fn;
        fn = function (oEvent) {
          // The case we want to catch is one where the event target is the
          // document, and there are displayed menus.
          var bestMenu = null;
          var bestZIndex = 0;
          // get window.event if argument is falsy (in IE) 
          var evt = oEvent || window.event; 
          // get srcElement if target is falsy (IE)
          var tgt = evt.target || evt.srcElement;
          if (tgt.nodeName && (tgt.nodeName.toLowerCase() == "body")) {
            var menus = YAHOO.util.Dom.getElementsByClassName("yuimenu");
            for (var i = 0; i < menus.length; i++) {
              if (menus[i].style.visibility == "visible") {
                var zIndex = parseInt(menus[i].style.zIndex);
                if ((!isNaN(zIndex)) && (zIndex > bestZIndex)) {
                  bestMenu = menus[i];
                  bestZIndex = zIndex;
                }
              }
            }
          }
          if (bestMenu) {
            // Well, it turns out that we can't modify the target of
            // the event, which sucks; I can't even copy an event and
            // set the target directly. And what's even worse, the
            // mechanism for choosing the custom event type is, once
            // again, in the private lexical context. Grrr. So the
            // only recourse is to copy that information.
            var m_oEventTypes = {
              "keydown": "keyDownEvent",
              "keyup": "keyUpEvent",
              "keypress": "keyPressEvent"
            };
            // The second argument of this event, in the case of keyDown, must
            // be the menu item that's currently being hovered over. Otherwise,
            // menu scrolling will break.
            var m = YAHOO.widget.MenuManager.getMenu(bestMenu.id);
            return m[m_oEventTypes[oEvent.type]].fire(oEvent, m.activeItem);
          } else {
            return oldfn(oEvent);
          }
        }
      }
      return origAdd.call(this, el, sType, fn, obj, override);
    };
    YAHOO.util.Event.on = YAHOO.util.Event.addListener;

    // There's yet another bug in the same area. 
    // Oh, my heavens. In YUI, if this menu is focused, and I pop up
    // a context menu, the UI control which was focused before
    // the menu was brought up will be focused when the menu
    // is dismissed, WHETHER OR NOT THAT UI CONTROL IS VISIBLE.
    // So if you've interacted with a menu, and then you scroll a div
    // that the menu is in, it'll go back to the  menu. Ugh.
    // Not only that, but blur doesn't remove the focus - ever.
    // Obviously, you don't want it to unfocus if you're unfocusing
    // because you're focusing the menu, but this is ridiculous.
    // And since I can't UNfocus, all I can do is block it from
    // recording the focus, period.

    var origFocus = YAHOO.util.Event.addFocusListener;
    YAHOO.util.Event.addFocusListener = function (el, fn, obj, override) {
      if ((el === document) && (obj === YAHOO.widget.MenuManager)) {
        // DO NOT DO THIS.
        return;
      } else {
        return origFocus.call(this, el, fn, obj, override);
      }
    }
    YAHOO.util.Event.onFocus = YAHOO.util.Event.addFocusListener;

    /**
    * @method configURL
    * @description Event handler for when the "url" configuration property of 
    * the menu item changes.
    * @param {String} p_sType String representing the name of the event that 
    * was fired.
    * @param {Array} p_aArgs Array of arguments sent when the event was fired.
    * @param {YAHOO.widget.MenuItem} p_oItem Object representing the menu item
    * that fired the event.
    */    

    YAHOO.widget.MenuItem.prototype.configURL = function (p_sType, p_aArgs, p_oItem) {

      var sURL = p_aArgs[0];
      // Make absolutely sure it's a real URL; if it's a hash URL, don't use it.
      if (sURL && (sURL.length > 0) && (sURL.charAt(0) != "#")) {
        // This used to change the URL to a hash. Here, I want to ensure that it's
        // an anchor.
        if (this._oAnchor.tagName.toLowerCase() != "a") {
          // First, turn it into an anchor.
          var oldAnchor = this._oAnchor;
          this._oAnchor = MAT.Dom._buildElement("a", {attrs: {href: sURL, className: this.CSS_LABEL_CLASS_NAME}});
          this._oAnchor.innerHTML = oldAnchor.innerHTML;
          this.element.replaceChild(this._oAnchor, oldAnchor);
        } else {
          if (YAHOO.env.ua.opera) {
            this._oAnchor.removeAttribute("href");
          }
          this._oAnchor.setAttribute("href", sURL);
        }
      }
    };

    
    /**
    * @method configTarget
    * @description Event handler for when the "target" configuration property 
    * of the menu item changes.  
    * @param {String} p_sType String representing the name of the event that 
    * was fired.
    * @param {Array} p_aArgs Array of arguments sent when the event was fired.
    * @param {YAHOO.widget.MenuItem} p_oItem Object representing the menu item
    * that fired the event.
    */    

    YAHOO.widget.MenuItem.prototype.configTarget = function (p_sType, p_aArgs, p_oItem) {

      var sTarget = p_aArgs[0],
      oAnchor = this._oAnchor;

      // If the target is empty, remove it if the node is an anchor.

      if (sTarget && sTarget.length > 0) {
        if (this._oAnchor.tagName.toLowerCase() != "a") {
          // First, turn it into an anchor.
          var oldAnchor = this._oAnchor;
          this._oAnchor = MAT.Dom._buildElement("a", {attrs: {href: "#", target: sTarget, className: this.CSS_LABEL_CLASS_NAME}});
          this._oAnchor.innerHTML = oldAnchor.innerHTML;
          this.element.replaceChild(this._oAnchor, oldAnchor);
        } else {
          this._oAnchor.setAttribute("target", sTarget);
        }
      } else if (this._oAnchor.tagName.toLowerCase() == "a") {
        this._oAnchor.removeAttribute("target");
      }
    };

    // Bug: if a menu is scrollable, but MAX_HEIGHT hasn't been set, _onKeyDown
    // won't scroll the menu when a down arrow is encountered. So I'm going
    // to ensure that in the scrolled case, MAX_HEIGHT is set. That's bad
    // enough; what's worse is that if you set the max height, the scroll
    // height is set.
    var origSetScrollHeight = YAHOO.widget.Menu.prototype._setScrollHeight;
    YAHOO.widget.Menu.prototype._setScrollHeight = function(hgt) {
      origSetScrollHeight.call(this, hgt);
      // Now, if the scrolling class is set, but there's no max height,
      // set the max height. That's gonna cause a recursive call here.
      // No way around it, I don't think.
      if (YAHOO.util.Dom.hasClass(this.body, "yui-menu-body-scrolled") &&
          (this.cfg.getProperty("maxheight") == 0)) {
        var height = this.element.clientHeight;
        this.cfg.setProperty("maxheight", height);
      }
    };

    // Another hideous bug. We want to block mouseover from causing
    // a refocus in menus when you scroll in the menu and move a new
    // item under the mouse; but the code that blocks this in _onKeyDown
    // sets the flag on the wrong variable. Plus, each new keydown
    // should extend the time some more, rather than each one
    // cancelling.

    var origOnKeyDown = YAHOO.widget.Menu.prototype._onKeyDown;
    YAHOO.widget.Menu.prototype._onKeyDown = function (sType, args) {
      origOnKeyDown.call(this, sType, args);
      if (window._bStopMouseEventHandlers) {
        window._bStopMouseEventHandlers = false;
        // This was on the wrong element, and the time was too short.
        // But making the time longer means that successive keystrokes
        // will trounce the handling, unless it's handled correctly.
        if (this._bStopMouseEventHandlers) {
          this._bStopMouseEventHandlers.cancel();
        }
        this._bStopMouseEventHandlers = YAHOO.lang.later(500, this, function () {
          this._bStopMouseEventHandlers = null;        
        });
      }
    }
    
    /*
     *                    MAT.WorkbenchUI.ResizeableSimpleDialog
     *
     *
     * Let's try to use the YAHOO! object system to extend the simple dialog
     * to make it resizeable.
     *
     */

    MAT.YUIExtensions.ResizeableSimpleDialog = function (el, userConfig, resizeConfig) {

      /* Here's what it says in the YUI source:
         Note that we don't pass the user config in here yet because 
         we only want it executed once, at the lowest subclass level
      */

      /* I need to copy the height into the user config, but
         it may not be available - the paradigm for the panel
         initialization cascade appears never to pass the config to 
         the parent. So we have a child of resizeable panel later,
         and then we wouldn't be able to update the userConfig.
         There also doesn't seem to be any event I can subscribe to.
      */
      
      MAT.YUIExtensions.ResizeableSimpleDialog.superclass.constructor.call(this, el, null);
      
      if (userConfig) {
        if (resizeConfig.height !== undefined) {
          userConfig.height = resizeConfig.height + "px";
        }
        this.cfg.applyConfig(userConfig, true);
      } else {
        var coreApplyConfig = this.cfg.applyConfig;
        var cfg = this.cfg;
        this.cfg.applyConfig = function(uc, flag) {
          if (resizeConfig.height !== undefined) {
            uc.height = resizeConfig.height + "px";
          }
          coreApplyConfig.call(cfg, uc, flag);
        }
      }

      this._resizeElement = el;
      this._resizeConfig = resizeConfig;
    };
    
    var ResizeableSimpleDialog = MAT.YUIExtensions.ResizeableSimpleDialog;

    // These methods were borrowed directly from
    // http://developer.yahoo.com/yui/examples/container/panel-resize.html
    // hopefully encapsulated a bit better than they do it...

    // private. resizeConfig has minHeight, minWidth, bodyPadding, height.

    function makeResizeable(panel, el, resizeConfig) {
      
      // Create Resize instance, binding it to the resizeable panel.
      // Can't use panel.element, because it's a container wrapped around
      // the div we're targeting.
      
      var resize = new YAHOO.util.Resize(el, {
        handles: ['br'],
        autoRatio: false,
        minWidth: resizeConfig.minWidth,
        minHeight: resizeConfig.minHeight,
        status: true
      });

      // Setup resize handler to update the size of the Panel's body element
      // whenever the size of the 'resizablepanel' DIV changes
      resize.on('resize', function(args) {
        this.cfg.setProperty('height', args.height + "px");
      }, panel, true);
      
      if (resizeConfig.height !== undefined) {
        panel.cfg.setProperty('height', resizeConfig.height);
      }
    }

    YAHOO.extend(ResizeableSimpleDialog, YAHOO.widget.SimpleDialog, {

      // Just in case this needs to be rendered first.

      init: function(el, userConfig) {
        ResizeableSimpleDialog.superclass.init.call(this, el, userConfig);
        YAHOO.util.Dom.addClass(el, "resizeablePanel");
      },
      
      render: function() {
        ResizeableSimpleDialog.superclass.render.call(this);
        makeResizeable(this, this._resizeElement, this._resizeConfig);
      }
      
    });

  },

  // This is awful: it turns out that if the container is an
  // actual element, YUI sets an init callback to POSTPONE SETTING
  // THE PARENT BY 0 MS, using a timer. So we have no idea when
  // the button will actually get attached. So we need to attach
  // it ourselves, explicitly.
  
  StyledButton: MAT.Class(function(container, label, onclick) {

    this.b = new YAHOO.widget.Button({
      label: label,
      onclick: {
        fn: onclick,
        scope: this
      }
    });
    if (container) {
      this.b.appendTo(container);
    }    

  }, {

    attachTo: function(container) {
      this.b.appendTo(container);
    },

    enable: function() {
      this.b.set("disabled", false, true);
    },

    disable: function() {
      this.b.set("disabled", true, true);
    },

    setLabel: function(lab) {
      return this.b.set("label", lab);
    },

    getLabel: function() {
      return this.b.get("label");
    },

    addClass: function(cls) {
      MAT.Dom._addClasses(this.b.get("element"), cls);
    },

    removeClass: function(cls) {
      MAT.Dom._removeClasses(this.b.get("element"), cls);
    },

    getButton: function() {
      return this.b.get("element");
    }
    
  })
};

MAT.YUIPopupManager = function (appendDiv, overlayMgr) {
  this.appendDiv = appendDiv;
  this._overlayMgr = overlayMgr;
  // We want to ensure that offerAnnotationPopup offers the
  // appropriate capability of being able to dismiss all the 
  // popups for a particular requestor.
  this._requesterDocLabelToAnnotationPopupHash = {};
  // Ditto with the popups themselves.
  this._requesterDocLabelToPopupHash = {};
};

MAT.YUIPopupManager._editorCounter = 0;

MAT.Extend(MAT.YUIPopupManager, {

  popup: function(requesterId, text, pId, pHeader, buttonList /* , popupParams */) {

    var popupParams = {};
    var icn = YAHOO.widget.SimpleDialog.ICON_ALARM;
    if (arguments.length > 5) {
      popupParams = arguments[5];
    }

    if (popupParams.icon !== undefined) {
      icn = popupParams.icon;
    }
    
    var width = "300px";
    if (popupParams.width !== undefined) {
      width = popupParams.width;
    }

    var resizeable = false;
    if (popupParams.resizeable !== undefined) {
      resizeable = popupParams.resizeable;
    }

    var fixedCenter = true;
    if (popupParams.fixedCenterInitialOnly !== undefined) {
      fixedCenter = !popupParams.fixedCenterInitialOnly;
    }

    var modal = false;
    if (popupParams.modal !== undefined) {
      modal = popupParams.modal;
    }

    // The problem is that the height variable doesn't
    // really enforce an overall height - while SOME computation
    // seems to be done, it appears to be the WRONG computation.
    // I can't bear to try to fix this bug, so I'm going to make sure the
    // popup is "enough" smaller. But,  of course, what I really need is
    // a maximum height, and I'm not sure how to implement that...

    var height = null; // document.body.clientHeight - 150;
    // The default height is just a bit smaller than the parent window.
    //if (popupParams.height !== undefined) {
    //  height = popupParams.height;
    //}

    // Build a temporary div for the dialog.
    // As far as I can tell, you can only build a resize
    // on top of an existing div.

    var el = document.createElement("div");
    el.id = pId;
    el.style.visibility = "hidden";
    this.appendDiv.appendChild(el);
    
    // Instantiate the Dialog
    var oPanel;

    if (resizeable) {
      oPanel = new MAT.YUIExtensions.ResizeableSimpleDialog(el, {
        width: width,
        fixedcenter: fixedCenter,
        visible: false,
        draggable: true,
        close: true,
        text: text,
        icon: icn,
        modal: modal,
        constraintoviewport: true
      }, {
      });
    } else {
      oPanel = new YAHOO.widget.SimpleDialog(el, {
        width: width,
        fixedcenter: fixedCenter,
        visible: false,
        draggable: true,
        close: true,
        text: text,
        icon: icn,
        modal: modal,
        constraintoviewport: true
      });
    }    

    var mgr = this;

    // The oldHandler should be able to block hiding and destroying.
    function handler_factory(oldHandler) {
      return function () {
        if (requesterId) {
          delete mgr._requesterDocLabelToPopupHash[requesterId][pId];
        }
        if (oldHandler() !== false) {
          oPanel.hide();
          oPanel.destroy();
        }
      }
    }

    // Postprocess the button list to add hiding to
    // each element as the last step.
    for (var i = 0; i < buttonList.length; i++) {
      var buttonEntry = buttonList[i];
      if (!buttonEntry.handler) {
        buttonEntry.handler = function () {
          if (requesterId) {
            delete mgr._requesterDocLabelToPopupHash[requesterId][pId];
          }
          oPanel.hide();
          oPanel.destroy();
        }
      } else {
        buttonEntry.origHandler = buttonEntry.handler;
        buttonEntry.handler = handler_factory(buttonEntry.handler);
      }
    }

    oPanel.cfg.queueProperty("buttons", buttonList);

    this._overlayMgr.register(oPanel);

    oPanel.setHeader(pHeader);

    // Render the Dialog
    oPanel.render();

    // Originally, I had fixedcenter set, but if you move and then
    // resize, it would yank it back. So now, for annotation editors,
    // we don't do that.

    if (!fixedCenter) {
      oPanel.center();
    }

    // If it ends up getting rendered as huge, shrink it immediately.
    // But make sure that we resize the BODY. So we have to get the
    // height of the element less the height of the body, because
    // that stuff has to be factored out. Actually, just set the
    // maxHeight and we'll be done.

    this.setMaxHeight(oPanel);
    
    // Make sure that the "hide" button
    // destroys it. The way to do this is to redefine _doClose, or,
    // more to the point, reregister the callback, because
    // once the function is part of the callback registration,
    // redefining it doesn't do any good.

    if (oPanel.close) {
      YAHOO.util.Event.removeListener(oPanel.close, "click", oPanel._doClose);
    }

    oPanel.closePanel = function(e) {
      if (popupParams.closeCb) {
        popupParams.closeCb();
      } else {
        // Execute the default.
        for (var i = 0; i < buttonList.length; i++) {
          if (buttonList[i].isDefault) {
            if (buttonList[i].origHandler) {
              buttonList[i].origHandler();
            }
            break;
          }          
        }
      }
      if (e === undefined) {
        e = {};
      }
      if (requesterId) {
        delete mgr._requesterDocLabelToPopupHash[requesterId][pId];
      }
      oPanel._doClose(e);
      oPanel.destroy();
    }

    YAHOO.util.Event.on(oPanel.close, "click", function (e) {
      oPanel.closePanel(e);
    });
    
    oPanel.show();
    // For the overlay manager.
    oPanel.focus();

    // See offerAnnotationPopup. We want to be able to dismiss
    // these things by requester.
    if (requesterId) {
      var requesterHash = this._requesterDocLabelToPopupHash[requesterId];
      if (requesterHash === undefined) {
        requesterHash = {};
        this._requesterDocLabelToPopupHash[requesterId] = requesterHash;
      }
      requesterHash[pId] = oPanel;
    }
    
    return oPanel;
  },

  setMaxHeight: function(oPanel) {
    var everythingButTheBody = oPanel.element.offsetHeight - oPanel.body.offsetHeight;
    oPanel.body.style.maxHeight = (YAHOO.util.Dom.getViewportHeight() - 40 - everythingButTheBody) + "px";
  },

  // All of these functions have to specify what happens when
  // there's no closeCb. The default button is what should happen.
  // So there has to be a default button.

  error: function(requesterId, s) {
    var dismissCallback = null;
    
    if (arguments.length > 2) {
      dismissCallback = arguments[2];
    }

    this.popup(requesterId, s, "error", "Error",
               [{text: "OK",
                 isDefault: true,
                 handler: function () {
                   if (dismissCallback) {
                     dismissCallback();
                   }
                 }}]);
  },

  ask: function(requesterId, text, buttonList) {
    return this.popup(requesterId, text, "question", "Question", buttonList, {
      icon: YAHOO.widget.SimpleDialog.ICON_HELP,
      modal: true
    });
  },

  inform: function(requesterId, text) {
    return this.popup(requesterId, text, "info", "FYI",
                      [{text: "OK",
                        isDefault: true}], {icon: YAHOO.widget.SimpleDialog.ICON_INFO});
  },

  tell: function(requesterId, msg, title /*, params */) {
    var params = {};
    if (arguments.length > 3) {
      params = arguments[3];
    }
    if (params.icon === undefined) {
      params.icon = null;
    }
    return this.popup(requesterId, msg, "info", title, [{text: "OK",
                                                         isDefault: true}], params);
  },

  // logger: an function which can log either document or panel
  //   log entries, as shown. When this is standalone, this entry will
  //   be a dummy. Note, too, that this popup manager is now for the UI,
  //   not for the document panel.
  // id: the id of the popup to create.
  // offerAnnotationPopup arguments:
  // e: mouse event
  // gestureBundle: a MAT.DocDisplay.GestureMenuBundle
  
  offerAnnotationPopup: function(logger, requesterId, id, e, gestureBundle) {

    if ($$$(id)) {
      return;
    }

    var menuItems = gestureBundle.menuItems;
    var annotationPopupTree = gestureBundle.annotationPopupTree;
    var annGesture = gestureBundle.annGesture;
    var lastAnnotationEntry = gestureBundle.lastAnnotationEntry;
    var repeatAccelerator = gestureBundle.repeatAccelerator;
    var cancelCb = gestureBundle.cancelCb;
    var dismissCb = gestureBundle.dismissCb;

    var popup = new YAHOO.widget.Menu(id, {
      constraintoviewport: true,
      xy: [ e.pageX, e.pageY ],
      scrollincrement: 5
    });

    YAHOO.util.Dom.addClass(popup.element, "compact");

    // I'm going to manipulate this in the lexical closures.
    var actionTaken = false;

    var specialNumAccels = {};
    specialStringAccels = {};

    for (var i = 0; i < menuItems.length; i++) {
      var mItem = menuItems[i];
      popup.addItem({
        text: mItem.label.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"),
        onclick: {
          fn: function(eType, argArray, m) {
            actionTaken = true;
            var oEvent = argArray[0];
            if (m.constructor == MAT.DocDisplay.AnnotationGesture) {
              if (oEvent.type == "keypress") {
                m.gestureIsKbd();
              } else {
                m.gestureIsMouse();
              }
            }
            m.execute();
          },
          obj: mItem.gesture
        }
      });
      if (mItem.accel !== undefined) {
        if (mItem.accel.constructor === String) {
          specialStringAccels[mItem.accel] = mItem.gesture;
        } else {
          specialNumAccels[mItem.accel] = mItem.gesture;
        }
      }
    }
    
    // Put in the menu and the buttons.

    // Right now, we don't have a lot of tags, but eventually we will.
    // We should have submenus, but at the moment, the simplest thing
    // will just be to have multiple entries. I tried using a <select>,
    // but the programming gets complicated if you just want the selected
    // element, and the color highlighting doesn't work.

    var tagPrefix = null;

    // I tried using the helptext instead of appending the shortcut
    // to the menu entry, but it got thrown off somehow in the CSS.

    if (annGesture && annGesture.affectedAnnots && (annGesture.affectedAnnots.length > 0)) {
      tagPrefix = "Replace with ";
    } else {
      tagPrefix = "Add ";
    }

    var accelHash = {};

    // In special cases, when I'm in choose mode, I will have
    // constructed a special popup menu which contains
    // extra attribute value pairs to pass along to
    // _addOrDeleteAnnotations.
    // In that case, no accelerator will be used.
    // See addTagMenuAction and populateMenu below.

    function labelClosureFactory (labelEntry, forceHide, extraAttributeValuePairs) {
      var doHide = forceHide;
      var lEntry = labelEntry;
      return function (eType, argArray) {
        // Using <enter>, we can fire an onclick
        // with a keystroke. So we check.
        var oEvent = argArray[0];
        actionTaken = true;
        if (oEvent.type == "keypress") {
          annGesture.gestureIsKbd();
        } else {
          annGesture.gestureIsMouse();
        }
        annGesture.setDisplayInfo(lEntry);
        if (extraAttributeValuePairs) {
          annGesture.extraAttributeValuePairs = extraAttributeValuePairs;
        }
        annGesture.execute();
        if (doHide && (oEvent.type != "keypress")) {
          popup.hide();
        }
      };
    }
    
    function addTagMenuAction(tPrefix, curTagEntry, forceHide, acceleratorOverride,
                              extraAttributeValuePairs) {
      var menuEntry = {};
      var label = curTagEntry.name;
      var tagSuffix = "";
      var accelerator = curTagEntry.accelerator;
      if (acceleratorOverride) {
        accelerator = acceleratorOverride;
      }
      if (extraAttributeValuePairs && (extraAttributeValuePairs.length > 0)) {
        var sList = [" "];
        for (var i = 0; i < extraAttributeValuePairs.length; i++) {
          sList.push(extraAttributeValuePairs[i][0] + "=" + extraAttributeValuePairs[i][1]);
        }
        tagSuffix = sList.join(" ");
      } else if (accelerator) {
        tagSuffix = " ("+accelerator+")";
      }
      menuEntry.text = "<span class='menuItem'>"+tPrefix+"<span class='"+curTagEntry.css_classes.join(" ")+"'>" + label + "</span>" + tagSuffix + "</span>";
      menuEntry.onclick = {
        fn: labelClosureFactory(curTagEntry, forceHide, extraAttributeValuePairs)
      };
      return menuEntry;
    }

    function populateMenu(m, mId, tPrefix, treeLevel) {      
      for (var i = 0; i < treeLevel.length; i++) {
        var treeEntry = treeLevel[i];
        var menuEntry = null;
        if (!treeEntry.virtual) {
          menuEntry = addTagMenuAction(tPrefix, treeEntry.contents, treeEntry.children.length > 0,
                                       null, treeEntry.extraAttributeValuePairs);
        } else if (treeEntry.contents.css) {
          menuEntry = {
            text: "<span class='menuItem'>"+tPrefix+"<span style='"+treeEntry.contents.css+"'>" + treeEntry.contents.name + "</span></span>"
          };
        } else {
          menuEntry = {
            text: "<span class='menuItem'>"+tPrefix+ treeEntry.contents.name + "</span>"
          };
        }
        if (treeEntry.children.length > 0) {
          // Make a new menu.
          var subId = mId + "_sub" + i;
          var subM = new YAHOO.widget.Menu(subId, {
            constraintoviewport: true
          });
          YAHOO.util.Dom.addClass(subM.element, "annotationMenu");
          populateMenu(subM, subId, "", treeEntry.children);
          menuEntry.submenu = subM;
        }
        m.addItem(menuEntry);
      }
    }

    if (annotationPopupTree) {
      // We've previously composed the annotation popup tree.
      accelHash = annotationPopupTree.accelHash;    
      populateMenu(popup, id, tagPrefix, annotationPopupTree.tree);
    }

    if (lastAnnotationEntry) {
      popup.addItem(addTagMenuAction("Repeat ", lastAnnotationEntry, false,
                                     repeatAccelerator, null));
    }

    var isAccel = false;

    // call the cancel callback, if present, in the hide method,
    // not here.
    
    popup.addItem({
      text: "<span class='menuItem'>Cancel (&lt;ESC&gt;)</span>",
      onclick: {
        fn:  function (eType, argArray) {
          var oEvent = argArray[0];
          // Nothing needs to happen here. The menu will
          // hide and since no action was taken, the
          // cancel will be recorded. We simply need to check
          // if this was triggered with a keystroke or
          // a mouse click. 
          isAccel = (oEvent.type == "keypress");
        }
      }
    });
    
    popup.render(this.appendDiv);
    
    // How can we destroy an object after it's hidden? Subscribing to
    // "hide" is the wrong thing, because stuff happens after the
    // callback. So try this. Worked. At least, nothing broke that I can see.

    // Here's another hideous thing. If no action was taken, and we're
    // in tokenless mode, we may have created new spans JUST TO PROVIDE
    // THE APPROPRIATE HIGHLIGHT FEEDBACK. What we need to do here is
    // make sure, in that case, that we get rid of those spans by redrawing
    // the document.

    var mgr = this;    
    var coreHide = popup.hide;
    popup.hide = function () {
      coreHide.call(popup);
      // Most of these things need to happen whenever the menu is dismissed,
      // but if no action was taken (i.e., Cancel was selected, either by mouse or
      // by keystroke), we need to cancel.
      if (!actionTaken) {
        logger("panel", {"gesture_type": isAccel ? "kbd" : "mouse_click",
                         action: "cancel_annotation_change"});
      }
      var selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
      
      // This gesture should NEVER be a UI gesture - it's
      // part of whatever gesture caused the menu to go away.
      //  We do this by bypassing the UI.
      logger("document", {action: "dismiss_annotation_popup"});
      // And remove it from the requester hash before it's dismissed.
      delete mgr._requesterDocLabelToAnnotationPopupHash[requesterId][id];
      popup.destroy();
      if (dismissCb !== null) {
        dismissCb();
      }
      // Call this here, not in the cancel operation.
      if ((!actionTaken) && (cancelCb !== null)) {
        cancelCb();
      }
    }

    // The problem here is that we have to register with the overlay
    // manager for the popup to be guaranteed to appear in the foreground.
    // But we ALSO need the focus() behavior from the original focus()
    // method that the Menu had before it was registered with the
    // overlay manager.
      
    this._overlayMgr.register(popup);

    popup.subscribe("show", popup.focus);

    // We're going to add a keypress handler, which SHOULD be
    // able to coexist with the default one.
    // Hm. The problem, of course, is that the menu
    // has to hide itself if one of these keys fires.
    // So I actually need to specialize the method, which is
    // a problem, since it's called _onKeyPress and it's not
    // really public. So I think I'll just hide it myself,
    // which should destroy it, which should keep
    // all the other events from firing.

    // My, my, key handling is a mess. I was using keydown, but
    // that was wrong, so I'm now using keypress, but that doesn't
    // work consistently. See http://unixpapa.com/js/key.html, but
    // that isn't even right anymore.

    // The generalization for current browsers (5/2/13) seems
    // to be that in Firefox, Chrome, Opera and Safari, ASCII
    // characters get the appropriate code in charCode. <Enter>
    // appears in keyCode. <Tab> is captured by Safari and never
    // fires keypress; so where that used to be the delete key,
    // it's now -.

    popup.keyPressEvent.subscribe(function (eType, argArray) {
      var oEvent = argArray[0];
      var keyConsumed = false;
      var kCode = oEvent.charCode;
      var kStr = String.fromCharCode(kCode);
      var specialEntry = specialNumAccels[kCode] || specialStringAccels[kStr];
      if (oEvent.keyCode == 13) { // enter
        // <Enter> will select the current item.
        if (popup.activeItem) {
          // Tricky! This should be an accelerator entry,
          // not a mouse click, in the log.
          // Firing a mouse click event with a keyboard event.
          // Will this work? Apparently. See the various onclick
          // callbacks.
          // The various callbacks will take care of
          // whether an action was taken.
          keyConsumed = true;
          popup.activeItem.clickEvent.fire(oEvent);
        }
      } else if (specialEntry) {
        actionTaken = true;
        keyConsumed = true;
        specialEntry.gestureIsKbd();
        specialEntry.execute();
      } else {
        var lCase = kStr.toLowerCase();
        var uCase = lCase.toUpperCase();
        // Now, we have to loop through the table and invoke the
        // appropriate element. But it's not actually a menu,
        // or anything useful, so we're going to have to do something
        // slightly more clever than I anticipated.
        
        var accelEntry = accelHash[lCase] || accelHash[uCase];
        if (accelEntry) {
          actionTaken = true;
          keyConsumed = true;
          annGesture.gestureIsKbd();
          annGesture.setDisplayInfo(accelEntry);
          annGesture.execute();
        }
      }
      if (keyConsumed) {
        popup.hide();
        YAHOO.util.Event.preventDefault(oEvent);
      }
    });
    
    popup.show();

    // So the caller needs to be able to grab the popup
    // in case it needs to be forcibly hidden (which will also
    // destroy it). If the popup is stored, the storer
    // needs to make sure that if the popup is NOT forcibly
    // hidden, it's removed from the store. Ideally, the 
    // popup manager itself should manage this. Let's say
    // that all we want to be able to do is ensure that a
    // requester can dismiss all its pending popups. See the
    // redefinition of hide() above to see how things are
    // removed from this hash.

    var requesterHash = this._requesterDocLabelToAnnotationPopupHash[requesterId];
    if (requesterHash === undefined) {
      requesterHash = {};
      this._requesterDocLabelToAnnotationPopupHash[requesterId] = requesterHash;
    }
    requesterHash[id] = popup;
  },

  dismissPopups: function(requesterId) {
    function dismiss(d, dismissFn) {
      var requesterHash = d[requesterId];
      // We have to collect them first and THEN remove them,
      // because the hash is modified as we go along.
      var toRemove = [];
      if (requesterHash) {
        for (var k in requesterHash) {
          if (requesterHash.hasOwnProperty(k)) {
            toRemove.push(requesterHash[k]);
          }
        }
        for (var i = 0; i < toRemove.length; i++) {
          dismissFn(toRemove[i]);
        }
        delete d[requesterId];
      }
    }
    dismiss(this._requesterDocLabelToAnnotationPopupHash,
            function (o) {
              o.hide();
            });
    dismiss(this._requesterDocLabelToPopupHash,
            function (o) {
              o.closePanel();
            });
  },

  // logger: same as above.
  // docDisplay: the docdisplay object.
  // changeCb: a callback to be called when the document is changed.
  // attrConfigList is a list of pairs of elements, so
  // we can order the results. The first element of each pair
  // is an attribute name, and the second element is an
  // object with the following possible parameters:
  // type: either short_string, long_string, int, float.
  // choices: for short_string, int, float. 
  // default: default value.

  // The annotation should be updated IMMEDIATELY, not when OK is pressed.
  // So I need an encapsulated handler for each attribute. You should
  // also be able to clear annotations; there has to be a difference
  // between the empty string and null.

  // The problem is that I can't really attach behavior the way
  // I want until the text is rendered - so what I really need, for
  // the popup, is to build a DOM, not to pass in text. Is this even
  // possible? Hm. The source code for YUI suggests that it IS. I
  // just need to build a DOM object instead of constructing a string. Yay!

  // The viewContainer has to implement two methods: getAnnotationDisplayDiv()
  // and notifyVisualDisplay(disp). The first gets the display into which
  // the table will be rendered, and the second is used to report the
  // display to the container. When there's a container, the table view
  // delegates the responsibility for adding and removing the display
  // from the visual displays list.

  offerAnnotationEditor: function(logger, panel, viewContainer, changeCb, annot) {
    var ed = new MAT.YUIPopupManager.AnnotationEditorView(this, logger, panel, viewContainer, changeCb, annot);
    ed.draw();
    ed.show();
    return ed;
  },
  
  // The idea is that the
  // view container has only two methods, getAnnotationDisplayDiv and
  // notifyVisualDisplay, and the container is responsible for any
  // higher-level bookkeeping, such as the bookkeeping we do with _annotationEditorPopups.

  // Turns out that we need this in the standalone editor too, so we're moving it here.

  // Let's introduce a local class definition. Note that the popup itself must
  // respond to the "remove" message, and nothing else - the header is now its
  // own display.
  
  _redisplayContainerCls: MAT.Class(function(mgr, annot, dismissCb) {
    this.mgr = mgr;
    this._enclosingDiv = MAT.Dom._buildElement("div", {
      style: {
        height: "100%",
        width: "100%",
        overflow: "auto"
      }
    });
    this._annot = annot;
    this._popup = null;
    this._view = null;
    this._dismissCb = dismissCb;
    this._titleDisplay = null;
  }, {

    show: function () {
      if (this._popup) {
        this._popup.show();
      }
    },

    hide: function () {
      if (this._popup) {
        this._popup.hide();
      }
      if (this._view) {
        this._view.hide();
      }
    },
    
    forceRemoveRedisplayResponse: function() {
      this._popup.closePanel();
      // The display is removed by the registration engine when
      // the remove event is fired.
    },
    
    getAnnotationDisplayDiv: function() {
      return this._enclosingDiv;
    },

    // view is a AnnotationEditorView, below. 
    notifyVisualDisplay: function(annot, view) {          
      // This is to handle the header, and only the header.
      this._view = view;
      this._titleDisplay = new MAT.DocDisplay.AnnotationNameDisplay(annot, view._docPanel, {
        formatParams: {
          showIndices: true,
          showFormattedName: true,
          formattedNameFormatString: "$(_text:truncate=20)",
          expandEffectiveLabel: true
        }
      });
      var disp = this;
      // Before I do this, I have to create an ID.
      this.displayId = view._docPanel.uiGetDisplayCounter();
      // We only need to make sure this is removed when the annotation is removed.
      this._annot.doc.rd.registerEvents(this._annot, this, [{
        event_name: "remove_annotation",
        action: "remove"
      }]);
      this._popup = this.mgr.popup(null, this._enclosingDiv, this._view.eId, this._titleDisplay.span, [{
        text: "Done",
        isDefault: true,
        handler: function () {
          disp._titleDisplay.unregister();
          disp._annot.doc.rd.unregisterDisplay(disp);
          disp._view._close();
          if (disp._dismissCb) {
            disp._dismissCb();
          }
        }
      }], {
        resizeable: true,
        fixedCenterInitialOnly: true,
        icon: null,
        width: null,
        closeCb: function () {
          disp._titleDisplay.unregister();
          disp._annot.doc.rd.unregisterDisplay(disp);
          disp._view._close();
          if (disp._dismissCb) {
            disp._dismissCb();
          }
        }
      });
      /*
        this._popup.keyPressEvent.subscribe(function(eType, argArray) {
          var oEvent = argArray[0];
          if (oEvent.charCode == 13) {
            // <Enter> was pressed. Close it.
            this._popup.closePanel();
          }
        });
      */
    },

    setMaxHeight: function () {
      if (this._popup) {
        this.mgr.setMaxHeight(this._popup);
      }
    }

  }),

  _constructPopupAnnotationEditorContainer: function(annot, dismissCb) {
    return new this._redisplayContainerCls(this, annot, dismissCb);
  }

});

// I really want to set up the annotation description table as a separate thing, because
// it has to know how to redraw itself.

// There's a problem here: the header is a separate display element from the
// pane itself. That's crucial - the pane shouldn't redraw when the value
// change comes from the pane itself, but the header should.

MAT.YUIPopupManager.AnnotationEditorView = function(mgr, logger, panel, viewContainer, changeCb, annot) {
  this._docPanel = panel;
  this.mgr = mgr;
  this.logger = logger;
  this.docDisplay = panel.docDisplay;
  this.annot = annot;
  this.viewContainer = viewContainer;
  this.enclosingDiv = this.viewContainer.getAnnotationDisplayDiv();
  this.changeCb = changeCb;
  // We need to know if we entered choose mode from here.
  this._chooseModeSource = false;
  
  this.eId = "annot_edit_" + MAT.YUIPopupManager._editorCounter;
  MAT.YUIPopupManager._editorCounter++;
  
  this.globalType = this.annot.doc.annotTypes.globalATR.typeTable[this.annot.atype.label];
  var disp = this;
  this.parentAttrValueDisplay = null;
  this._firstForFocus = null;
  this.cellEditors = [];

  // There used to be a separate "show()" method, but it turns out that I needed some of the setup
  // first.

  // We have to add an ID before we add the visual display.
  // It must implement forceRedisplayResponse and forceRemoveRedisplayResponse.
  this.displayId = this._docPanel.uiGetDisplayCounter();
  // This happens no matter what.
  this.annot.addVisualDisplay(this);

  // And these are for the reference pointers.
  
  // Now, if the annotation is referenced anywhere, then we should list the references.
  // We also need to subscribe to the parent attach/detach to update it.
  
  var M = MAT.Dom._buildElement;
  this.referenceSubdiv = M("div");
  this.referenceDiv = M("div", {
    style: {display: "none"},
    children: [M("hr"), M("h3", {children: ["References"]}), this.referenceSubdiv]
  });
  
  // If there are choice attribute values, 
  // the parent attaches/detaches and the choice attributes need
  // to be linked together - each of the 
  // We need to subscribe to any attaches and detaches if there are
  // choice attribute values, because those may impact the display of
  // the choice attributes. We also need to redraw if any of the choice
  // attributes change.
  // This will override the separate drawing of just the references. 
  if (this.annot.atype.hasChoiceAttributeValues) {
    this.annot.doc.rd.registerEvents(this.annot, this, [{
      event_name: "attach_to_parent",
      action: "redisplay"
    }, {
      event_name: "detach_from_parent",
      action: "redisplay"
    }]);
  } else {
    var disp = this;
    this.annot.doc.rd.registerEvents(this.annot, this, [{
      event_name: "detach_from_parent",
      action: function () {
        disp.drawReferences();
      }
    }, {
      event_name: "attach_to_parent",
      action: function () {
        disp.drawReferences();
      }
    }]);
  }
}

MAT.Extend(MAT.YUIPopupManager.AnnotationEditorView, {

  draw: function() {

    // Don't clear the existing attr value displays.
    
    var docDisplay = this.docDisplay;
    var annot = this.annot;
    var changeCb = this.changeCb;
    var eId = this.eId;
    var globalType = this.globalType;
    var handAnnotationAvailable = docDisplay._handAnnotationAvailable;
    
    var M = MAT.Dom._buildElement;
    var A = MAT.Dom._appendChild;

    // attrs, style, text, children
    var popupForm = M("table", {attrs: {className: "annEditor"}});

    var disp = this;
    var a = annot;
    var permittedAttrs;
    var curBits;
    if (a.atype.hasChoiceAttributeValues) {
      permittedAttrs = a.atype._permittedChoiceAttributes(annot);      
      curBits = a.atype._generateChoiceBitsFromAnnot(annot);
    }
       
    function successCbFactory(attrObj, editSuccessCb) {      
      if (attrObj._choiceAttribute && (!attrObj.aggregation)) {
        // The issue is that we only want to redraw these cells. But there's
        // currently no way to do that, because the cell editors don't
        // encapsulate anything. The entire editor is redrawn if attributes
        // are otherwise changed, but only if the request comes from 
        // elsewhere.
        if (editSuccessCb) {
          return function () {
            editSuccessCb();
            disp.draw();
          }
        } else {
          return function() {
            disp.draw();
          }
        }
      } else {
        return editSuccessCb;
      }
    }

    var firstForFocus = null;
    for (var i = 0; i < globalType.attrs.length; i++) {

      var attrObj = globalType.attrs[i];
      var attr = attrObj.name;
      
      var cellEditorCls = MAT.DocDisplay.CellDisplay.selectCellDisplay(attrObj);
     
      var cellEditor = new cellEditorCls(attrObj, this.mgr, {
        eventSource: this,
        editSuccessCb: successCbFactory(attrObj, this.changeCb),
        // For annotation-valued attributes.
        chooseModeHost: this,
        docPanel: this._docPanel,
        // For choice attribute limitations.
        permittedChoiceAttributes: permittedAttrs
      });
      
      this.cellEditors.push(cellEditor);
      
      var children;
      if (handAnnotationAvailable && cellEditor.editable) {
        var res = cellEditor.annotToEditChildren(a);
        firstForFocus = firstForFocus || res.firstFocusableElement;
        children = res.children;
      } else {
        children = cellEditor.annotToDisplayChildren(a);
      }
      
      if (handAnnotationAvailable) {
        var cList = cellEditor.getTypeDescriptionChildren();
        cList.splice(0, 0, "(");
        cList.push(")");
        A(popupForm, M("tr", {children: [M("td", {children: [M("span", {text: attr}),
                                                             M("br"), M("span", {style: {fontSize: "80%"},
                                                                                 children: cList})]}),
                                         M("td", {children: children})]}));
      } else {
        A(popupForm, M("tr", {children: [M("td", {children: [attr]}),
                                         M("td", {children: children})]}));
      }
    }
    this.enclosingDiv.innerHTML = "";
    A(this.enclosingDiv, popupForm);

    A(this.enclosingDiv, this.referenceDiv);      
      
    if (!this.parentAttrValueDisplay) {
      this.parentAttrValueDisplay = new MAT.DocDisplay.AnnotationNameDisplayCollection(a, this._docPanel, {
        enclosingSpan: this.referenceSubdiv,
        multipleSeparator: {label: "span", children: [", ", {label: "br"}]},
        isParent: true,
        nameDisplayParams: {
          // Called with "this" as the name display. When isParent
          // is true, this.attrName will be the annotation where the focal annotation appears.
          menuActionCb: function() {
            var bundle = new MAT.DocDisplay.GestureMenuBundle(disp._docPanel.docDisplay);
            bundle.addEditOrViewItem(this.annot);
            bundle.addScrollToItem(this.annot);
            var v = this;
            if (handAnnotationAvailable) {
              bundle.addMenuItem({
                label: "Detach from this location",
                gesture: new MAT.DocDisplay.AnnotationGesture(this.annot.doc, [this.annot], function() {
                  var events = v.annot.removeAttributeValueViaUI(v.attrName, a, disp, disp.mgr);
                  if (events) {
                    disp._docPanel.docDisplay._reportAnnotationResultsCore(events, null, {
                      markHandAnnotated: true,
                      reportHandAnnotationPerformed: true,
                      log: true
                    });
                    if (a.atype.hasChoiceAttributeValues) {
                      disp.draw();
                    } else {
                      disp.drawReferences();
                    }
                    // Recapitulates some of the setting stuff.
                    disp.changeCb();
                  }
                }, {
                  // No gestureDisplaySource here.
                  gestureSource: "menu"                    
                })
              });
            }
            return bundle;
          }
        }
      });
    }      

    this.drawReferences();

    if (handAnnotationAvailable) {
      
      // Assemble the usedIn list, and if it's non-null, present it.

      function chooseModeFactory(label, attrName) {
        return function () {
          // Show the "Choosing..." button.
          disp._usedInChoosingButtonDiv.style.display = null;
          // Disable the menu.
          disp._usedInMenu.set("disabled", true);
          // Enter choose mode. We're going to create
          // a fake annotation-valued attribute, because that's
          // the easiest way of dealing with this. NOTE: this
          // label will ALWAYS be a true label, because the
          // infrastructure does not allow attribute restrictions
          // which apply only if another attribute value pair holds.
          // So label restrictions on effective labels are
          // right out.
          var labelObj = {};
          labelObj[label] = true;
          var self = {
            atomicLabelRestrictions: labelObj,
            _choicesSatisfyRestrictions: function(label, bits) {
              return MAT.Annotation.AnnotationAttributeType.prototype._choicesSatisfyRestrictions.call(self, label, bits);
            }
          }
          // We can enter choose mode, but we may already be in it.
          // We need to know that we entered choose mode from
          // this widget, but we can't lose that information if we re-enter
          // and exit as a result.
          disp.enterChooseMode(self, {
            successCb: function(aVal) {
              // Add the annotation to the chosen annotation as the attrName.
              // I should try to reuse _maybeSetAttributeValue, but not right now.
              // I had a bug here and there was no catch to show it to me.
              var events = aVal.addAttributeValueViaUI(attrName, annot, disp, disp.mgr);
              if (events) {
                disp._docPanel.docDisplay._reportAnnotationResultsCore(events, null, {
                  markHandAnnotated: true,
                  reportHandAnnotationPerformed: true,
                  log: true
                });
                if (a.atype.hasChoiceAttributeValues) {
                  disp.draw();
                } else {
                  disp.drawReferences();
                }
                disp.changeCb();
              }
            },
            exitCb: function() {
              disp._usedInChoosingButtonDiv.style.display = "none";
              disp._usedInMenu.set("disabled", false);
            }
          });
        }
      }

      var usedInList = [];
      for (var label in globalType.usedInTable) {
        if (globalType.usedInTable.hasOwnProperty(label)) {
          for (var attrName in globalType.usedInTable[label]) {
            if (globalType.usedInTable[label].hasOwnProperty(attrName)) {
              // Only add it if the current annotation satisfies it.
              var labelO = globalType.repository.typeTable[label];
              var labelAttr = labelO.attrs[labelO.attrTable[attrName]];
              if ((!a.atype.hasChoiceAttributeValues) ||
                  (labelAttr._choicesSatisfyRestrictions(a.atype.label, curBits))) {
                // A YUI button menu element entry. If the attribute is
                // an aggregate, we want "to" instead of "as".
                var how = "as ";
                var labelHow = " to ";
                if (labelAttr.aggregation) {
                  how = "to ";
                  labelHow = " in ";
                }
                usedInList.push({
                  text: "Add " + how + attrName + labelHow + label + "...",
                  onclick: {
                    fn: chooseModeFactory(label, attrName)
                  }
                });
              }
            }
          }
        }
      }

      // We're always going to have a menu. The question
      // is whether we have multiple sections or not. The decision is whether 
      // we have a usedInList or not.
      A(this.enclosingDiv, M("hr"));
      
      // Now, add the operations menu. It'll have two sections if we have a usedInList.
      
      var mDiv = M("div", {attrs: {className: "compact mat-yui-button-context"}});
      this._usedInChoosingButtonDiv = M("div", {style: {fontSize: "75%", display: "none"}, attrs: {className: "compact"}});      ;
      A(this.enclosingDiv, mDiv);

      var actionItems = [];
      var menuItems;
      if (usedInList.length > 0) {
        menuItems = [actionItems, usedInList];
      } else {
        menuItems = actionItems;
      }

      // If we're in choose mode, add the chooser. We can't use the usual
      // encapsulation we use with the popups, since we're doing a dropdown.
      // Actually, that's not quite right - what we need to do is insert
      // "Choose annotation" when we display the menu, if we're in
      // choose mode, and remove it, always, when we hide it. This is because
      // if the annotation remains visible, we want it to react dynamically
      // to choose mode.

      // Actually, I probably want to do exactly the same with deletions.
      // I should be able to detach and delete, but I should only do that
      // if it's attached somewhere. But actually, I should actually put
      // this into a popup. Well, you shouldn't have to ask.
      
      actionItems.push({
        text: "Delete annotation",
        onclick: {
          fn: function() {
            var g = new MAT.DocDisplay.AnnotationGesture(a.doc, [a], function() {
              disp.docDisplay._deleteAnnotations(this);
            });
            g.gestureIsMouse();
            g.execute();
          }
        }
      });
      
      this._usedInMenu = new YAHOO.widget.Button({
        type: "menu",
        container: mDiv,
        label: "Actions",
        menu: menuItems
      });

      this._usedInMenu.getMenu().subscribe("beforeShow", function () {
        if (disp._docPanel.inChooseMode()) {
          this.insertItem({
            text: "Choose annotation",
            onclick: {
              fn: function() {
                disp._docPanel.chooseModeSuccess(a);
              }
            }
          }, 0, 0);
        }
      });

      this._usedInMenu.getMenu().subscribe("beforeHide", function () {
        if (this.getItem(0, 0).cfg.getProperty("text") == "Choose annotation") {
          this.removeItem(0, 0);        
        }
      });
      
      firstForFocus = firstForFocus || this._usedInMenu.get("element");
      // And set up the choosing button div so that it can be shown when we select an
      // action.
      A(this.enclosingDiv, this._usedInChoosingButtonDiv);
      var b = new YAHOO.widget.Button({
        container: this._usedInChoosingButtonDiv,
        label: "Choosing (press to cancel)",
        onclick: {
          fn: function () {
            docDisplay.exitChooseMode();
            this._usedInChoosingButtonDiv.style.display = "none";
            this._usedInMenu.set("disabled", false);
          },
          scope: this
        }
      });
      MAT.Dom._addClasses(b.get("element"), "duringChoose");
    }
    
    if (firstForFocus) {
      this._firstForFocus = firstForFocus;
    }
  },

  show: function() {
    this.viewContainer.notifyVisualDisplay(this.annot, this);
    this._docPanel.log({action: "summon_annotation_editor"});
  },

  // When you hide, you
  // need to hide the cellEditors. You don't actually NEED
  // to cancel choose mode, but you really ought to - the editor
  // tabs might not get reinstated in an order that makes it clear
  // who's triggered choose mode.

  hide: function () {
    for (var i = 0; i < this.cellEditors.length; i++) {
      this.cellEditors[i].hide();
    }
    // If you entered choose mode from this window, you have to cancel it.
    if (this._chooseModeSource) {
      this.docDisplay.exitChooseMode();
      this._chooseModeSource = false;
    }
  },

  // Called from the popup's closeCb(), and from the viewContainer (at least,
  // it better be). 
  
  _close: function() {
    this._docPanel.log({action: "dismiss_annotation_editor"});
    for (var i = 0; i < this.cellEditors.length; i++) {
      this.cellEditors[i].close();
    }
    this.cellEditors = [];
    // If you entered choose mode from this window, you have to cancel it.
    if (this._chooseModeSource) {
      this.docDisplay.exitChooseMode();
      this._chooseModeSource = false;
    }
    this.annot.removeVisualDisplay(this);
    if (this.parentAttrValueDisplay) {
      this.parentAttrValueDisplay.clear();
      this.parentAttrValueDisplay = null;
    }
  },

  // These are ALWAYS called.
  forceRedisplayResponse: function(events) {
    this.draw();
  },

  forceRemoveRedisplayResponse: function() {
    // Nothing needs to happen - the remove happens when the event
    // is fired.
  },

  drawReferences: function() {
    var a = this.annot;
    a.doc._buildInverseIdDict();
    var refs = a.doc._inverseIdDict[a.publicID];
    if ((!refs) || (refs.length == 0)) {
      this.referenceDiv.style.display = "none";
      this.referenceSubdiv.innerHTML = "";
    } else {
      this.referenceDiv.style.display = null;      
      // Note that in this case, this editor has to be redisplayed when the
      // references change, among other things.
      this.parentAttrValueDisplay.prepareSpan(refs);
    }
  },
  
  // Choose mode.

  // attrObj may be a "fake" object created for parent selection.
  
  enterChooseMode: function(attrObj, outerParams /* {exitCb: ... ,successCb: ...} */) {
    // The API is identical to the one for the doc display. And I have to
    // modify it.

    // We can enter choose mode, but we may already be in it.
    // We need to know that we entered choose mode from
    // this widget, but we can't lose that information if we re-enter
    // and exit as a result.
    var alreadyChooseModeSource = this._chooseModeSource;
    if (!alreadyChooseModeSource) {
      this._chooseModeSource = true;
    }
    var oldExitCb = outerParams.exitCb;
    var exitCb;
    var disp = this;
    if (!oldExitCb) {
      exitCb = function () {
        if (!alreadyChooseModeSource) {
          disp._chooseModeSource = false;
        }
      }
    } else {
      exitCb = function () {
        if (!alreadyChooseModeSource) {
          disp._chooseModeSource = false;
        }
        oldExitCb();
      }
    }
    this.docDisplay.enterChooseMode(attrObj, {
      successCb: outerParams.successCb,
      exitCb: exitCb
    });
  }
  
});
