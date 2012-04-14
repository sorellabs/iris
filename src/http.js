/// http.js --- Deals with HTTP requests in the browser
//
// Copyright (c) 2012 Quildreen Motta
//
// Permission is hereby granted, free of charge, to any person
// obtaining a copy of this software and associated documentation files
// (the "Software"), to deal in the Software without restriction,
// including without limitation the rights to use, copy, modify, merge,
// publish, distribute, sublicense, and/or sell copies of the Software,
// and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

/// Module iris.http

//// -- Dependencies ----------------------------------------------------------
var utils  = require('./utils')
var cassie = require('cassie')


//// -- Aliases ---------------------------------------------------------------
var keys               = Object.keys
var call               = Function.prototype.call
var to_array           = call.bind([].slice)
var class_of           = call.bind({}.toString)
var serialise          = utils.serialise
var build_query_string = utils.build_query_string
var register           = cassie.register
var Promise            = cassie.Promise


//// -- Helpers ---------------------------------------------------------------
var make_xhr = function() {
                 return 'XMLHttpRequest' in this?
                        /* W3C? */ function() {
                                     return new XMLHttpRequest() }
                        :
                        /* IE? */  function() {
                                     return new ActiveXObject('Microsoft.XMLHTTP') }}()

var support_timeout_p = 'timeout' in make_xhr()

var success = /2\d{2}/
var error   = /[45]\d{2}/

var statuses = [ 'information'
               , 'success'
               , 'redirected'
               , 'client-error'
               , 'server-error' ]

var state_map = [ 'unsent'
                , 'opened'
                , 'headers-received'
                , 'loading'
                , 'completed' ]

function object_p(subject) {
  return class_of(subject) == '[object Object]' }

function status_type(status) {
  var type = (status - 1).toString().charAt(0)
  return statuses[type] }


//// -- Public interface ------------------------------------------------------
var active = []

var PromiseP = Promise.derive({
  init:
  function _init(client, uri, options) {
    Promise.init.call(this)
    this.client  = client
    this.uri     = uri
    this.options = options

    return this }

, fire:
  function _fire(event) {
    var args, callbacks, i, len
    args      = to_array(arguments, 1)
    callbacks = this.listeners[event] || []

    for (i = 0, len = callbacks.length; i < len; ++i)
      callbacks[i].apply(this, args)

    return this }

, forget:
  function _forget() {
    this.client.abort()
    return Promise.forget.call(this) }

, timeout: support_timeout_p?  function _timeout(delay) {
                                 this.timeout = delay * 1000
                                 return this }

         : /* otherwise */     function _timeout(delay) {
                                 this.clear_timer()
                                 this.timer = setTimeout( function() {
                                                            this.abort()
                                                            this.flush('timeouted')
                                                                .fail(Promise.TIMEOUTED) }.bind(this)
                                                        , delay * 1000 )}

, clear_timer: support_timeout_p?  function _clear_timer() {
                                     this.timeout = 0
                                     return this }

             : /* otherwise */     Promise.clear_timer

// Generalised HTTP statuses
, information  : register('status:information')
, success      : register('status:success')
, redirected   : register('status:redirected')
, client_error : register('status:client-error')
, server_error : register('status:server-error')

// Ready states
, unsent           : register('state:unsent')
, opened           : register('state:opened')
, headers_received : register('state:headers-received')
, loading          : register('state:loading')
, completed        : register('state:completed')
})



function request(uri, options) {
  var client, promise, method
  options = options || {}
  method  = (options.method || 'GET').toUpperCase()
  uri     = build_uri(uri, options.query, options.body)

  client  = make_xhr()
  promise = PromiseP.make(client, uri, options)

  setup_headers(options.headers || {})
  setup_listeners()

  client.open(method, uri, true, options.username, options.password)
  client.send( object_p(options.body)?  serialise(options.body)
             : /* otherwise */          options.body )

  active.push(promise)

  return promise


  function build_uri(uri, query, body) {
    uri = build_query_string(uri, query)
    return method == 'GET'?  build_query_string(uri, body)
    :      /* otherwise */   uri }

  function setup_headers(headers) {
    keys(headers).forEach(function(key) {
      client.setRequestHeader(key, headers[key]) })}

  function setup_listeners() {
    client.onerror            = function(ev){ promise.fail('errored', ev)       }
    client.onabort            = function(ev){ promise.fail('aborted', ev)       }
    client.ontimeout          = function(ev){ promise.fail('timeouted', ev)     }
    client.onloadstart        = function(ev){ promise.fire('load:start', ev)    }
    client.onprogress         = function(ev){ promise.fire('load:progress', ev) }
    client.onloadend          = function(ev){ promise.fire('load:end', ev)      }
    client.onload             = function(ev){ promise.fire('load:success', ev)  }
    client.onreadystatechange = function(  ){
                                  var response, status, state
                                  response = client.responseText
                                  status   = client.status
                                  state    = client.readyState

                                  promise.fire('state:' + state_map[state], response, status)

                                  if (state == 4) {
                                    active.splice(active.indexOf(promise), 1)
                                    promise.flush('status:' + status)
                                           .flush('status:' + status_type(status))
                                      success.test(status)?  promise.bind(response, status)
                                    : error.test(status)?    promise.fail(response, status)
                                    : /* otherwise */        promise.done([response, status]) }}}
}


function request_with_method(method) { return function(uri, options) {
  options = options || { }
  options.method = method.toUpperCase()
  return request(uri, options) }}


//// -- Exports ---------------------------------------------------------------
module.exports = { PromiseP: PromiseP
                 , request:  request
                 , active:   active
                 , get:      request_with_method('GET')
                 , post:     request_with_method('POST')
                 , put:      request_with_method('PUT')
                 , head:     request_with_method('HEAD')
                 , delete_:  request_with_method('DELETE')
                 , options:  request_with_method('OPTIONS')

                 , internal: { make_xhr: make_xhr }}
