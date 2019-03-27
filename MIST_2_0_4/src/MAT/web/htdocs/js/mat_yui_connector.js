/* Copyright (C) 2010 The MITRE Corporation. See the toplevel
file LICENSE for license terms. */

/* In this file, we implement a connector via YUI. */

MAT.YUIBackendConnector = function (backend) {
  this._backend = backend;
}

MAT.Extend(MAT.YUIBackendConnector, {

  /*
   *              PUBLIC API
   */

  //  And even another layer on top of ajaxRequest. We should be able
  // to hide just about everything, now that I've abstracted _catchError.
  // I'd go back and clean up everything, but it's not worth it. Just the
  // toplevel calls, thanks.
  
  backendRequest: function(properties) {
    var protocol = properties.protocol || "POST";
    var url = properties.url || this._backend._cgiURL;
    var form = properties.form || null;
    var parameters = properties.parameters || {};
    var uploadConversion = properties.uploadConversion || null;
    var connector = this;
    var async = !properties.synchronous;
    if (this._backend._context.tasksOfInterest) {
      parameters.tasks_of_interest = this._backend._context.tasksOfInterest;
    }
    var cb = function (responseText, successFlag, contentType) {
      connector._catchError(responseText, successFlag, contentType,
                            properties.success, properties.failure,
                            properties.jsonError);
    };
    var ajaxCallback = {
      success: function (transport) {
        cb(transport.responseText, true,
           transport.getResponseHeader['Content-Type']);
      },
      failure: function (transport) {
        // The transport may have failed for a number of reasons.
        // So this may be a failure object, rather than a
        // success object. The failure object only has
        // statusText.
        if ((transport.status == 0) || (transport.status == -1)) {
          // comm failure, abort.
          cb(transport.statusText, false, null);
        } else {
          cb(transport.responseText, false,
             transport.getResponseHeader['Content-Type']);
        }
      }
    }
    if (uploadConversion) {
      ajaxCallback.upload = function (transport) {
        res = uploadConversion.call(connector._backend, transport.responseText);
        cb(res.responseText, res.successFlag, res.contentType);
      }
    }

    // So in the case where we're doing a post and we have a form to file upload,
    // the problem is that failures never get reported, because the YUI mechanism
    // to report the results of the hidden iframe load are defeated by the page
    // load error displays in Firefox and in Safari. So the only way to check
    // this is to "ping" the server.

    if (form) {
      this._ping(url, {
        success: function (transport) {
          connector._ajaxRequest(protocol, url, form, parameters, ajaxCallback, async);
        },
        failure: function (transport) {
          // Just as if the actual callback had failed.
          ajaxCallback.failure(transport);
        }
      }, async);
    } else {
      this._ajaxRequest(protocol, url, form, parameters, ajaxCallback, async);
    }
  },

  // Send a simple GET to the server. If it's successful, proceed with the
  // original request Otherwise, raise the error the request would have raised.
  
  ping: function(url, cb) {
    this._ping(url, cb, true);
  },

  _ping: function(url, cb, async) {
    this._doRequest("GET", url+"?operation=ping", cb, "", async);
  },

  // Used below, and in the modification of YAHOO.util.Connection.createXhrObject.
  makeAsyncConnection: true,

  _doRequest: function(method, url, cb, postVals, async) {
    if (async) {
      YAHOO.util.Connect.asyncRequest(method, url, cb, postVals);
    } else {
      // As documented below, we have to postpone the send because
      // asyncRequest fires the startEvent. Even if JS isn't threaded,
      // let's at least TRY to preserve the order.
      MAT.YUIBackendConnector.prototype.makeAsyncConnection = false;
      var o = YAHOO.util.Connect.asyncRequest(method, url, cb, postVals);
      MAT.YUIBackendConnector.prototype.makeAsyncConnection = true;
      o.conn.syncSend();
    }
  },

  /*
   *                  PRIVATE FUNCTIONS
   */


  // This is nuts. In Yahoo UI, you can't pass parameters into an AJAX request.
  // If the ajaxForm is present, we do a file upload.

  // GAAAH. When a file upload is involved, form.submit() is called (of course),
  // which means that any element in the parameters which corresponds to an
  // actual widget in the form SHOULDN'T be added to the components, because
  // it'll be converted into a hidden input element. Boy, that rots. 

  _ajaxRequest: function(ajaxMethod, ajaxURL, ajaxForm, ajaxParameters, ajaxCallback, async) {
    var first = true;
    var components = [];
    var postVals = null;
    for (var oName in ajaxParameters) {
      // Parameters may be multiple values.
      var val = ajaxParameters[oName];
      if (val.constructor != Array) {
        val = [val];
      }
      for (var i = 0; i < val.length; i++) {
        if (!first) {
          components.push("&");
        }
        first = false;
        components.push(encodeURIComponent(oName));
        components.push("=");
        components.push(encodeURIComponent(val[i]));
      }
    }
    if (ajaxForm) {
      YAHOO.util.Connect.setForm(ajaxForm, true);
    }
    // if ajaxForm is true, it doesn't matter what the ajaxmethod is -
    // it'll end up being POST.
    if (ajaxMethod.toLowerCase() == "get" && (!ajaxForm)) {
      ajaxURL += "?" + components.join("");
    } else {
      postVals = components.join("");
    }
    this._doRequest(ajaxMethod, ajaxURL, ajaxCallback, postVals, async);
  },

  // Currently, there's a bug in YUI on Safari. contentType must be stripped.
  
  _catchError: function(s, successFlag, contentType,
                        successFn, failureFn, jsonErrorFn) {
    if (successFlag &&
        ((contentType == null) ||
         (contentType.match(/^\s*application\/json(;.*)?\s*$/)))) {
      try {
        var obj = JSON.parse(s);
      }
      catch (ex) {
        jsonErrorFn.call(this._backend, "<h2>JSON digestion error</h2><p>" + ex.name + ": " + ex.message);
        return;
      }
      successFn.call(this._backend, obj);
    } else {
      failureFn.call(this._backend, s);
    }
  }

});

// Oh, I'm so unhappy. The only way to make it possible to 
// have synchronous connections (which I need for lock releasing in 
// window.onunload) is to redefine the connection object. But how?
// We don't want to interfere with any of the state checks, etc.
// But if I do it only when we call open() and then unset it again,
// bad things will happen afterwards because the startEvent will be called after
// everything is done in the synchronous case. I think
// I can redefine the send function for that connection.

MAT.Initializations.push(function () {

  var oldCreateXhrObject = YAHOO.util.Connect.createXhrObject;

  // We need obj.conn to do something fancy; I need to be able to pass in
  // state, somehow. 

  YAHOO.util.Connect.createXhrObject = function(transactionId) {
    var obj = oldCreateXhrObject(transactionId);
    if (obj && !MAT.YUIBackendConnector.prototype.makeAsyncConnection) {
      var oldOpen = obj.conn.open;
      var oldSend = obj.conn.send;
      obj.conn.open = function (method, uri, async, user, password) {
        oldOpen.call(obj.conn, method, uri, false, user, password);
      }
      
      // Don't do anything.
      obj.conn.send = function(data) {
        obj.data = data;
      }

      obj.conn.syncSend = function() {
        oldSend.call(obj.conn, obj.data);
      }
    }
    return obj;
  };

});