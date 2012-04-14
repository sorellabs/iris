/// jsonp.js --- Abstracts over JSONP requests
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

/// Module iris.jsonp

//// -- Dependencies ----------------------------------------------------------
var utils  = require('./utils')
var cassie = require('cassie')


//// -- Aliases ---------------------------------------------------------------
var keys               = Object.keys
var call               = Function.call
var to_array           = call.bind([].slice)
var build_query_string = utils.build_query_string
var Promise            = cassie.Promise


//// -- Helpers ---------------------------------------------------------------
window.__iris_callbacks__ = { }
var id_poll = []
var request_id = 0

var head = document.getElementsByTagName('head')[0]

function get_callback() {
  return id_poll.length?  'f' + id_poll.pop()
  :      /* otherwise */  'f' + ++request_id }

function noop() { }

//// -- Public interface ------------------------------------------------------
var active = []

var PromiseP = Promise.derive({
  init:
  function _init(uri, callback, options) {
    Promise.init.call(this)
    this.uri      = uri
    this.options  = options
    this.callback = callback

    return this }
})

function request(uri, options) {
  options = options || {}
  options.query = options.query || {}

  var callback_field = options.query.callback || 'callback'
  var callback = get_callback()
  var script = document.createElement('script')
  var promise = PromiseP.make(uri, callback, options)

  active.push(promise)

  __iris_callbacks__[callback] = promise.bind.bind(promise)
  script.onerror = promise.fail.bind(promise)

  promise.on('done', clean)

  options.query[callback_field] = '__iris_callbacks__.' + callback
  script.src = build_query_string(uri, options.query)
  script.async = true

  head.appendChild(script)

  return promise

  function clean() {
    active.splice(active.indexOf(promise), 1)
    id_poll.push(callback.slice(1))
    __iris_callbacks__[callback] = noop
    script.parentNode.removeChild(script) }
}


//// -- Exports ---------------------------------------------------------------
module.exports = { PromiseP: PromiseP
                 , request:  request
                 , active:   active }