/* Copyright (C) 2007 - 2009 The MITRE Corporation. See the toplevel
file LICENSE for license terms. */

// I used to use Prototype. And I don't want to clash with jQuery.

function $$$(e) { return document.getElementById(e); }

/* Modeled on the Yahoo UI library. */

MAT = {

  Extend: function(obj /*, (parent), dict */) {
    var parent;
    var dict;
    if (arguments.length == 2) {
      parent = null;
      dict = arguments[1];
    } else if (arguments.length == 3) {
      parent = arguments[1];
      dict = arguments[2];
    }
    if (parent != null) {
      obj.prototype = new parent();
      // This has to be changed, because obj.constructor
      // is actually obj.prototype.constructor, and in this
      // case it's going to be the constructor of the PARENT.
      obj.prototype.constructor = obj;
    }
    for (var label in dict) {
      obj.prototype[label] = dict[label];
    }
  },

  // This is going to assemble a new class. Its arguments
  // are identical to the Extend function above. This allows
  // me to create "anonymous" classes, so I can put them
  // in dictionaries.
  
  Class: function(obj /*, (parent, dict) */) {
    MAT.Extend.apply(null, arguments);
    return obj;    
  },

  Initializations: [],

  initialize: function () {
    for (var i = 0; i < MAT.Initializations.length; i++) {
      MAT.Initializations[i]();
    }
  },

  isMSIE: function () {
    if (MAT._isMSIE === undefined) {
      /*
       * Microsoft IE Detection
       * http://msdn.microsoft.com/en-us/library/ms537509%28v=vs.85%29.aspx
       */
      // Returns the version of Internet Explorer or a -1
      // (indicating the use of another browser).
      nav  = (navigator || window.navigator);

      var rv = -1; // Return value assumes failure.
      if (nav.appName == 'Microsoft Internet Explorer') {
        var ua = nav.userAgent;
        var re  = new RegExp("MSIE ([0-9]{1,}[\.0-9]{0,})");
        if (re.exec(ua) != null)
          rv = parseFloat( RegExp.$1 );
      }
      MAT._isMSIE = (rv > 0);
    }
    return MAT._isMSIE;
  },

  MajorVersion: 1,

  MinorVersion: 0,

  _yuiLoaderBase: null,

  setYUILoaderBase: function(base) {
    MAT._yuiLoaderBase = base;
  },

  _extraYUIModules: [],

  addYUIModules: function(modules) {
    MAT._extraYUIModules = MAT._extraYUIModules.concat(modules);
  },

  withYUILoaded: function(modules, fn) {
    var mDict = {};
    var finalModules = [];
    for (var i = 0; i < modules.length; i++) {
      if (!mDict[modules[i]]) {
        finalModules.push(modules[i]);
        mDict[modules[i]] = true;
      }
    }
    for (var i = 0; i < MAT._extraYUIModules.length; i++) {
      if (!mDict[MAT._extraYUIModules[i]]) {
        finalModules.push(MAT._extraYUIModules[i]);
        mDict[MAT._extraYUIModules[i]] = true;
      }
    }
    var loader = new YAHOO.util.YUILoader({
      require: finalModules,
      allowRollup: false,
      loadOptional: true,
      base: MAT._yuiLoaderBase,
      filter: "RAW",
      onSuccess: fn
    });
    // This will insert the script tags in the header.
    loader.insert();
  },

  CSS: {

    // Ugh. It turns out that Safari doesn't update the list of
    // style sheets, so boy, that's annoying.
    createOrRetrieveStyleSheet: function (styleSheetTitle) {
      for (var i = 0; i < document.styleSheets.length; i++) {
        if (document.styleSheets[i].title == styleSheetTitle) {
          return document.styleSheets[i];
        }
      }
      // Make on. In Firefox, apparently, you can only create
      // a style sheet this way.
      var cssNode = document.createElement('style');
      cssNode.type = 'text/css';
      cssNode.rel = 'stylesheet';
      cssNode.media = 'screen';
      // For some reason, if there's a title, Safari won't use the
      // dynamically-created style sheet.      
      // cssNode.title = styleSheetTitle;
      document.getElementsByTagName("head")[0].appendChild(cssNode);
      // Why? I have no idea.
      cssNode.sheet.disabled = false;
      return cssNode.sheet;
    },

    deleteStyleSheet: function(styleSheet) {
      // According to http://stackoverflow.com/questions/3182840/javascript-jquery-removing-or-replacing-a-stylesheet-link,
      // it's safe cross-browserly to disable the style sheet first.
      styleSheet.disabled = true;
      // And now, remove it, if you can find it. Remember the Safari
      // bug - you can't go through the styleSheets list. And you
      // can't use titles - it turns out that Safari won't use
      // the dynamically-created style sheet if it has a title.
      var styleNodes = document.getElementsByTagName("style");
      for (var j = 0; j < styleNodes.length; j++) {
        if (styleNodes[j].sheet == styleSheet) {
          styleNodes[j].parentNode.removeChild(styleNodes[j]);
          break;
        }
      }
    }
  },

  Dom: {
    
    /*
   * Some simple jQuery-like utilities.
   */
    
    _buildElement: function(label, params) {
      var e = document.createElement(label);
      if (params) {
        MAT.Dom._augmentElement(e, params);
      }
      return e;
    },

    _augmentElement: function(e, params) {
      if (params.attrs) {
        var attrs = params.attrs;
        for (var k in attrs) {
          if (attrs.hasOwnProperty(k)) {
            e[k] = attrs[k];
          }
        }
      }
      if (params.style) {
        var style = params.style;
        for (var k in style) {
          if (style.hasOwnProperty(k)) {
            e.style[k] = style[k];
          }
        }
      }
      if (params.text) {
        e.appendChild(document.createTextNode(params.text));
      }
      if (params.children) {
        for (var i = 0; i < params.children.length; i++) {
          var child = params.children[i];
          if (child.constructor === String) {
            child = document.createTextNode(child);
          } else if (child.constructor === Object) {
            // Just a garden-variety hash; turn it into an element.
            child = MAT.Dom._buildElement(child.label, child);
          }
          e.appendChild(child);
        }
      }
      return e;
    },

    _appendChild: function(parent, child) {
      if (child.constructor === String) {
        child = document.createTextNode(child);
      }
      parent.appendChild(child);
      return child;
    },
    
    _addClasses: function(e /* , cls, ... */) {
      if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {          
          var arg = arguments[i];
          if (arg.constructor === Array) {
            for (var j = 0; j < arg.length; j++) {
              var cls = arg[j];
              if ((!e.className) || (e.className.length == 0)) {
                e.className = cls;
              } else if (!RegExp("(\\s|^)"+cls+"(\\s|$)").test(e.className)) {
                e.className += " " + cls;
              }
            }
          } else if ((!e.className) || (e.className.length == 0)) {
            e.className = arg;
          } else if (!RegExp("(\\s|^)"+arg+"(\\s|$)").test(e.className)) {
            e.className += " " + arg;
          }
        }
      }
    },

    _hasClasses: function(e /* , cls, ... */) {
      if ((!e.className) || (e.className.length == 0)) {
        return false;
      } else if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {          
          var arg = arguments[i];
          if (arg.constructor === Array) {
            for (var j = 0; j < arg.length; j++) {
              var cls = arg[j];
              if (!RegExp("(\\s|^)"+cls+"(\\s|$)").test(e.className)) {
                return false;
              }
            }
          } else {
            if (!RegExp("(\\s|^)"+arg+"(\\s|$)").test(e.className)) {
              return false;
            }
          }
        }
      }
      return true;
    },

    _removeClasses: function(e /* , cls, ...*/) {
      if ((!e.className) || (e.className.length == 0)) {
        return;
      } else {
        var origClass = e.className;
        if (arguments.length > 1) {
          for (var i = 1; i < arguments.length; i++) {
            var arg = arguments[i];
            if (arg.constructor === Array) {
              for (var j = 0; j < arg.length; j++) {
                var cls = arg[j];
                e.className = e.className.replace(RegExp("(\\s|^)"+cls+"(\\s|$)"), " ");
              }
            } else {
              e.className = e.className.replace(RegExp("(\\s|^)"+arg+"(\\s|$)"), " ");
            }
          }
        }
        if (e.className != origClass) {
          // If it's changed, normalize it.
          e.className = e.className.replace(/\s+/g, " ").replace(/^ | $/g, "");
        }
      }
    }    
  }
}

