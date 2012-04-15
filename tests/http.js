var expect = require('expect.js')

describe('{} iris', function() {
describe('{} http', function() {
  var http  = require('iris').http
  var proto = Object.getPrototypeOf
  var ok    = false

  var statuses = zipRange('success',      200, 206).concat(
                   zipRange('redirected',   300, 307).concat(
                     zipRange('client-error', 400, 417).concat(
                       zipRange('server-error', 500, 505))))

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

  function range(start, end) {
    var xs = []
    --start
    while (++start <= end) xs.push(start)
    return xs }

  function success() { ok = true }
  function failure() { ok = false }

  function http_done(p, step) { return function() {
    if (p.client.status == 0)
      console.log(p.client.status, 'Request failed', p)
    else
      expect(ok).to.be.ok()
    step() }}

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
        var p = http.request('/no-op').headers_received(function(){
          expect(http.active).to.contain(p)
          p.forget()
          next()
        })

      })

      it('Should, when done, remove the promise from the list of active requests.', function(next) {
        var p = http.request('/no-op').ok(function() {
                                            expect(http.active).to.not.contain(p) })
                                      .on('done', without_args(next))
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
      it('Should execute all callbacks matching the generic HTTP status type.', function(next) {
        each( statuses
            , function(item, step) {
                var type   = item[0]
                var status = item[1]
                var p = http.get('/status/' + status)
                p.on('status:' + type, success)
                 .on('done',           http_done(p, step)) }
            , next)
      })
      it('Should execute all callbacks matching the exact HTTP response status.', function(next) {
        each( statuses
            , function(item, step) {
                var type   = item[0]
                var status = item[1]
                var p = http.get('/status/' + status)
                p.on('status:' + status, success)
                 .on('done',             http_done(p, step)) }
            , next)
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
        each( range(300, 307)
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
      it('Should execute all callbacks from state X when the request enters that state.')
      it('Should execute all abort callbacks when the request is aborted.')
      it('Should set the promise\'s value to `aborted\' when aborted.')
      it('Should execute all timeout callbacks when the request times out.')
      it('Should set the promise\'s value to `timeouted\' when timeouted.')
      it('Should execute the `error\' callbacks if an error occurs with the request itself.')
    })

    describe('—— XHR2 Events ———————————————', function() {
      it('Should execute the `load:start\' callbacks when loading starts.')
      it('Should execute the `load:progress\' callbacks anytime we receive new chunks.')
      it('Should execute the `load:end\' callbacks when loading finishes.')
      it('Should execute the `load:success\' callbacks when we fully receive the request.')
    })
  })
})
})