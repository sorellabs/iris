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

///// Function make_xhr
// Creates a new XMLHttpRequest object that can be used for the current
// engine.
//
// make-xhr :: () -> XMLHttpRequest
var make_xhr = function() {
                 return 'XMLHttpRequest' in this?
                        /* W3C? */ function() {
                                     return new XMLHttpRequest() }
                        :
                        /* IE? */  function() {
                                     return new ActiveXObject('Microsoft.XMLHTTP') }}()


///// Function object_p
// Is the given `subject' an `Object'?
//
// object? :: a -> Bool
function object_p(subject) {
  return class_of(subject) == '[object Object]' }


///// Function status_type
// Returns the firendly HTTP status name for the class of HTTP statuses
// the given `status' belongs to.
//
// status-type :: Number -> String
function status_type(status) {
  var type = status.toString().charAt(0) - 1
  return statuses[type] }


///// Function serialise_for_type
// Serialises the given data according to the specified MIME type.
//
// serialise-for-type :: String, { String -> String } -> String
function serialise_for_type(mime, data) {
  return mime == 'application/json'?  JSON.stringify(data)
  :      /* otherwise */              serialise(data) }



// Whether the engine supports XHR2's `timeout' attribute
//
// support-timeout? :: Bool
var support_timeout_p = 'timeout' in make_xhr()

// A regular expression matching successful HTTP response codes
//
// success :: RegExp
var success = /2\d{2}/

// A regular expression matching client and server error HTTP response
// codes.
//
// error :: RegExp
var error = /[45]\d{2}/

// A list of friendly name for the classes of HTTP status codes.
//
// statuses :: [String]
var statuses = [ 'information'
               , 'success'
               , 'redirected'
               , 'client-error'
               , 'server-error' ]

// A list of friendly name for a request's lifecycle's state.
//
// state-map :: [String]
var state_map = [ 'unsent'
                , 'opened'
                , 'headers-received'
                , 'loading'
                , 'completed' ]



//// -- Public interface ------------------------------------------------------

///// Data active
// A list of all active promises for HTTP requests.
//
// active :: [PromiseP]
var active = []


///// Object PromiseP <| Promise
// A promise for an HTTP request.
//
// PromiseP :: Promise <| { "client"  -> XMLHttpRequest
//                        , "uri"     -> String
//                        , "options" -> { String -> String }}
var PromiseP = Promise.derive({

  ////// Function init
  // Initialises an instance of a PromiseP.
  //
  // init! :: @this:Object* -> this
  init:
  function _init(client, uri, options) {
    Promise.init.call(this)
    this.client  = client
    this.uri     = uri
    this.options = options

    return this }


  ////// Function fire
  // Immediately invokes all functions registered for the given `event',
  // even if the promise hasn't been resolved yet.
  //
  // Different from flushing, the invoked callbacks are not removed from
  // the event's list of callbacks. So a callback may `fire' multiple
  // times.
  //
  // fire :: @this:PromiseP, String, Any... -> this
, fire:
  function _fire(event) {
    var args, callbacks, i, len
    args      = to_array(arguments, 1)
    callbacks = this.callbacks[event] || []

    for (i = 0, len = callbacks.length; i < len; ++i)
      callbacks[i].apply(this, args)

    return this }


  ////// Function forget
  // Aborts a request and resolves the promise with a `forgotten`
  // failure.
  //
  // forget :: @this:PromiseP* -> this
, forget:
  function _forget() {
    this.client.abort()
    return this.flush('forgotten').fail('forgotten') }


  ////// Function timeout
  // Specifies the maximum amount of time (in seconds) the promise can
  // take to be fulfilled. If it takes more time than time, the promise
  // fails with a `timeout' error.
  //
  // timeout :: @this:PromiseP*, Number -> this
, timeout: support_timeout_p?  function _timeout(delay) {
                                 this.timeout = delay * 1000
                                 return this }

         : /* otherwise */     function _timeout(delay) {
                                 this.clear_timer()
                                 this.timer = setTimeout( function() {
                                                            this.flush('timeouted')
                                                                .fail('timeouted')
                                                            this.forget() }.bind(this)
                                                        , delay * 1000 )
                                 return this }


  ////// Function clear_timer
  // Stops the timer for the promise. If one was previously set by
  // invoking `timeout'.
  //
  // clear-timer :: @this:Promise* -> this
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

// General failure statuses
, errored : register('errored')
})


///// Function request
// Makes an HTTP request to the given URI, and returns a `PromiseP' that
// such request will be fulfilled.
//
// Any actual work is carried over after the promise is returned from
// this method. As such, the user can freely manipulate the promise
// object synchronously before the connection with the endpoint is even
// opened.
//
// Aside from the event queues flushed after the promise has been
// fulfilled (or failed), the promise will also fire events from time to
// time, or depending on certain occurrences — as soon as they
// happen. Callbacks registered for those events may be invoked more
// than once, and may be invoked before the promise is fulfilled.
//
// request :: String, { String -> String } -> PromiseP
function request(uri, options) {
  var client, promise, method, serialise_body_p, mime
  options          = options         || {}
  options.headers  = options.headers || {}
  method           = (options.method || 'GET').toUpperCase()
  uri              = build_uri(uri, options.query, options.body)

  options.headers['X-Requested-With'] = 'XMLHttpRequest'

  serialise_body_p = object_p(options.body)
  if (serialise_body_p) {
    mime = options.headers['Content-Type'] || 'application/x-www-form-urlencoded'
    options.body = serialise_for_type(mime, options.body)
    options.headers['Content-Type'] = mime }

  client  = make_xhr()
  promise = PromiseP.make(client, uri, options)

  setup_listeners()

  setTimeout(function() {
    client.open(method, uri, true, options.username, options.password)
    setup_headers(options.headers || {})
    client.send(options.body) })

  active.push(promise)

  return promise


  // Sticks a serialised query and body object at the end of an URI.
  // build-uri :: String, { String -> String }, { String -> String }? -> String
  function build_uri(uri, query, body) {
    uri = build_query_string(uri, query)
    return method == 'GET'?  build_query_string(uri, body)
    :      /* otherwise */   uri }

  // Setups the headers for the HTTP request
  // setup-headers :: { String -> String | [String] } -> Undefined
  function setup_headers(headers) {
    keys(headers).forEach(function(key) {
      client.setRequestHeader(key, headers[key]) })}

  // Generates a handler for the given type of error
  // make-error-handler :: String -> Event -> Undefined
  function make_error_handler(type) { return function(ev) {
    promise.flush(type).fail(type, ev) }}

  // Invokes an error handler for the given type
  // raise :: String -> Undefined
  function raise(type) {
    make_error_handler(type)() }

  // Setups the event listeners for the HTTP request client
  // setup-listeners :: () -> Undefined
  function setup_listeners() {
    client.onerror            = make_error_handler('errored')
    client.onabort            = make_error_handler('forgotten')
    client.ontimeout          = make_error_handler('timeouted')
    client.onloadstart        = function(ev){ promise.fire('load:start', ev)    }
    client.onprogress         = function(ev){ promise.fire('load:progress', ev) }
    client.onloadend          = function(ev){ promise.fire('load:end', ev)      }
    client.onload             = function(ev){ promise.fire('load:success', ev)  }
    client.onreadystatechange = function(  ){
                                  var response, status, state
                                  state = client.readyState

                                  promise.fire('state:' + state_map[state])

                                  if (state == 4) {
                                    response = client.responseText
                                    status = client.status
                                    active.splice(active.indexOf(promise), 1)
                                    promise.flush('status:' + status)
                                           .flush('status:' + status_type(status))

                                      status == 0?           raise('errored')
                                    : success.test(status)?  promise.bind(response, status)
                                    : error.test(status)?    promise.fail(response, status)
                                    : /* otherwise */        promise.done([response, status]) }}}
}


////// Function request_with_method
// Generates a specialised request function for the given method.
//
// request-with-method :: String -> String, { String -> String } -> PromiseP
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
