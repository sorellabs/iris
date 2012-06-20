/// utils.js --- Utilities shared by all iris modules
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

/// Module iris.utils

//// -- Aliases ---------------------------------------------------------------
var keys   = Object.keys
var encode = encodeURIComponent


//// --- Utilities ------------------------------------------------------------
function serialise(data) {
  return keys(data || {}).map(encode_pair).join('&')

  function encode_pair(key) {
    return encode(key) + '=' + encode(data[key]) }}


function build_query_string(uri, parameters) {
  var query = serialise(parameters || {})
  var sep   = /\?/.test(uri)?  '&' : '?'
  return query?           uri + sep + query
  :      /* otherwise */  uri }


//// -- Exports ---------------------------------------------------------------
module.exports = { serialise:          serialise
                 , build_query_string: build_query_string
                 , buildQueryString:   build_query_string
                 }