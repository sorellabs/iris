var expect = require('expect.js')

describe('{} iris', function() {
describe('{} http', function() {
  var http  = require('iris/src').http
  var proto = Object.getPrototypeOf
  var ok    = false


  function add_event(o, ev, f) {
    ev = ev.toLowerCase()
    'addEventListener' in o?  o.addEventListener(ev, f)
    : /* otherwise */         void function() { var old = o['on' + ev]
                                                o['on' + ev] = function() {
                                                                 old.apply(this, arguments)
                                                                 f.apply(this, arguments) }}()}

  function without_args(f){ return function() { return f() }}


  function each(xs, f, done) {
    var i = 0
    step()

    function step() {
      if (i < xs.length) f(xs[i++], step)
      else               done() }}


  function zipRange(pre, start, end) {
    var xs = range(start, end)
    return xs.map(function(x){ return [pre, x] })}


  function zip(a, b) {
    return b.map(function(x, i){ return [x, b[i]] })}

  function range(start, end) {
    var xs = []
    --start
    while (++start <= end) xs.push(start)
    return xs }


  function success() { ok = true }
  function failure() { ok = false }


  function http_done(p, step) { return function() {
    if (!step) step = p, p = null
    if (p && p.client.status == 0)
      console.log(p.client.status, 'Request failed', p)
    else
      expect(ok).to.be(true)
    ok = false
    step() }}


  function check_status(idx) { return function(item, step) {
    var type   = item[0]
    var status = item[1]
    var event  = item[idx]
    var p = http.head('/status/' + status)
    p.on('status:' + event, success)
     .on('done',            http_done(p, step)) }}

  beforeEach(function() {
    ok = false
  })

  describe('λ request', function() {
    describe('—— Pre and post conditions ——————————', function() {
      it('Should return a PromiseP object.', function(next) {
        var p = http.request('/no-op').on('done', without_args(next))
        expect(proto(p)).to.be(http.PromiseP)
      })
      it('Should add the promise to the list of active requests.', function(next) {
        var p = http.request('/no-op').completed(function(){
          expect(http.active).to.contain(p)
          p.forget()
          next()
        })

      })

      it('Should, when done, remove the promise from the list of active requests.', function(next) {
        var p = http.request('/no-op').ok(function() {
                                            expect(http.active).to.not.contain(p)
                                            next() })
      })
    })

    describe('—— Headers and other meta information —————', function() {
      it('Should use GET as the default method.', function(next) {
        http.get('/method').ok(function(data) {
          expect(data).to.be('GET')
          next()
        })
      })
      it('Should serialise the #query object in the URI.', function(next) {
        http.get('/query', {query: {a: 1, b: 2, c: 3}}).ok(function(data) {
          data = JSON.parse(data)
          expect(data).to.eql({a: 1, b: 2, c: 3})
          next()
        })
      })
      it('Should serialise the #body object in the URI for GET requests.', function(next) {
        http.get('/query', {query: {a: 1 }, body: { b: 2, c: 3}}).ok(function(data) {
          data = JSON.parse(data)
          expect(data).to.eql({a:1, b:2, c: 3})
          next()
        })
      })
      it('Should serialise the #body object in the request\'s body otherwise.', function(next) {
        http.post('/body', {body: {a:1, b:2, c:3}}).ok(function(data) {
          data = JSON.parse(data)
          expect(data).to.eql({a:1, b:2, c:3})
          next()
        })
      })
      it('Should use JSON for body encoding when the content-type dictates it.', function(next) {
        http.post('/body', { body: {a:1, b:2, c:3}
                           , headers: { 'Content-Type': 'application/json' }})
            .ok(function(data) {
              data = JSON.parse(data)
              expect(data).to.eql({a:1, b:2, c:3})
              next()
            })
      })
      it('Should set the HTTP headers given in the request.', function(next) {
        http.get('/headers', { headers: { 'Content-Type': 'application/json'
                                        , 'Accept':       'application/json' }})
            .ok(function(data) {
              data = JSON.parse(data)
              expect(data).to.contain('content-type')
              expect(data).to.contain('accept')
              expect(data).to.contain('x-requested-with')
              next()
            })
      })
      it('Should pass the username and password options, if given.')
    })


    describe('—— Responses ————————————————', function() {
      describe('—— Should execute all callbacks matching the generic HTTP status type.', function(next) {
        it('- Success 2xx', function(next) {
          each( zipRange('success', 200, 206)
              , check_status(0)
              , next )
        })
        it('- Type: Redirected 3xx', function(next) {
          each( zip('redirected', [300, 304, 305, 306])
              , check_status(0)
              , next )
        })
        it('- Client Error 4xx', function(next) {
          each( zipRange('client-error', 400, 417)
              , check_status(0)
              , next)
        })
        it('- Server Error 5xx', function(next) {
          each( zipRange('server-error', 500, 505)
              , check_status(0)
              , next)
        })
      })
      describe('—— Should execute all callbacks matching the exact HTTP response status.', function(next) {
        it('- Success 2xx', function(next) {
          each( zipRange('success', 200, 206)
              , check_status(1)
              , next )
        })
        it('- Redirected 3xx', function(next) {
          each( zip('redirected', [300, 304, 305, 306])
              , check_status(1)
              , next )
        })
        it('- Client Error 4xx', function(next) {
          each( zipRange('client-error', 400, 417)
              , check_status(1)
              , next)
        })
        it('- Server Error 5xx', function(next) {
          each( zipRange('server-error', 500, 505)
              , check_status(1)
              , next)
        })
      })
      it('Should execute the success callbacks in case of a 2xx.', function(next) {
        each( range(200, 206)
            , function(status, step) {
                var p = http.get('/status/' + status)
                p.ok(success).failed(failure)
                 .on('done', http_done(p, step)) }
            , next)
      })
      it('Should execute all failure callbacks in case of a 4xx or 5xx.', function(next) {
        each( range(400, 417).concat(range(500, 505))
            , function(status, step) {
                var p = http.get('/status/' + status)
                p.failed(success).ok(failure)
                 .on('done', http_done(p, step)) }
            , next)
      })
      it('Shouldn\'t execute success or failure callbacks in case of 1xx or 3xx.', function(next) {
        each( [300, 304, 305, 306]
            , function(status, step) {
                ok = true
                var p = http.get('/status/' + status)
                p.ok(failure).failed(failure)
                 .on('done', http_done(p, step)) }
            , next)
      })
      it('Should pass the response and status as parameters of the callbacks.', function(next) {
        http.get('/response')
            .ok(success).failed(failure)
            .on('done', function(data, status) {
                          expect(ok).to.be.ok()
                          expect(data).to.be('response.')
                          expect(status).to.be(200)
                          next() })
      })
    })

    describe('—— Events ——————————————————', function() {
      it('Should execute all callbacks from state X when the request enters that state.', function(next) {
        function check_state(n) { return function() {
          states.splice(states.indexOf(n), 1) }}

        var p = http.get('/response')
                    .unsent(check_state(0))
                    .opened(check_state(1))
                    .headers_received(check_state(2))
                    .loading(check_state(3))
                    .completed(check_state(4))
                    .on('done', function() {
                                  expect(states).to.be.empty()
                                  next() })

        var states = []
        add_event(p.client, 'readystatechange', function(ev) {
          var state = p.client.readyState
          states.push(state) })
      })
      it('Should execute all forget callbacks when the request is aborted.', function(next) {
        var n = 0
        http.get('/response')
            .forgotten(function(){ ++n })
            .forgotten(function(){ ++n })
            .on('done', function() { expect(n).to.be(2)
                                     next() })
            .forget()
      })
      it('Should set the promise\'s value to `forgotten\' when aborted.', function(next) {
        var p = http.get('/response')
                    .on('done', function(err) { expect(err).to.be('forgotten')
                                                next() })
        p.forget()
      })
      it('Should execute all timeout callbacks when the request times out.', function(next) {
        var n = 0
        http.get('/looong')
            .timeouted(function() { ++n })
            .timeouted(function() { ++n })
            .on('done', function() { expect(n).to.be(2)
                                     next() })
            .timeout(0.1)
      })
      it('Should set the promise\'s value to `timeouted\' when timeouted.', function(next) {
        var n = 0
        var p = http.get('/looong')
                    .on('done', function(err) { expect(err).to.be('timeouted')
                                                next() })
                    .timeout(0.1)
      })
      it('Should execute the `error\' callbacks if an error occurs with the request itself.', function(next) {
        var n = 0
        var p = http.get('/cross-redirect')
                    .errored(function(){ ++n })
                    .errored(function(){ ++n })
                    .on('load:end', function(){ expect(p.value).to.contain('errored')
                                                expect(n).to.be(2)
                                                next() })
      })
    })

    describe('—— XHR2 Events ———————————————', function() {
      it('Should execute the `load:start\' callbacks when loading starts.', function(next) {
        ok = 1
        var p = http.get('/no-op')
                    .on('load:start', success)
                    .on('done',       http_done(next))
        add_event(p.client, 'loadstart', function(ev) {
          expect(ok).to.be(true) })
      })
      it('Should execute the `load:progress\' callbacks anytime we receive new chunks.', function(next) {
        this.timeout(4000)
        var n = 0
        http.get('/chunked')
            .on('load:progress', function(){ ++n })
            .on('done', function(data){ expect(data.replace(/\s/g, '')).to.be('abcd')
                                        expect(n).to.be(4)
                                        next() })
      })
      it('Should execute the `load:end\' callbacks when loading finishes.', function(next) {
        ok = 1
        var p = http.get('/no-op')
                    .on('load:end', success)
        add_event(p.client, 'loadend', function(ev) {
          expect(ok).to.be(true)
          next() })
      })
      it('Should execute the `load:success\' callbacks when we fully receive the request.', function(next) {
        ok = 1
        var p = http.get('/no-op')
                    .on('load:success', success)
        add_event(p.client, 'load', function(ev) {
          expect(ok).to.be(true)
          next() })
      })
    })
  })
})
})