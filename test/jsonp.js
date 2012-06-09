var expect = require('expect.js')

describe('{} iris', function() {
describe('{} jsonp', function() {
  var jsonp    = require('iris/src').jsonp
  var proto    = Object.getPrototypeOf
  var ok       = false

  function success() { ok = true  }
  function failure() { ok = false }
  function without_args(f){ return function() { return f() }}
  function to_array(o) {
    var r = []
    for (var i = 0; i < o.length; ++i) r.push(o[i])
    return r }

  beforeEach(function() {
    ok = false
  })

  describe('λ request', function() {
    it('Should return a PromiseP object.', function(next) {
      var p = jsonp.request('/jsonp/no-op').on('done', without_args(next))
      expect(proto(p)).to.be(jsonp.PromiseP)
    })
    it('Should add the promise to the list of active requests.', function() {
      var p = jsonp.request('/jsonp/no-op')
      expect(jsonp.active).to.contain(p)
    })
    it('Should, when done, remove the promise from the list of active requests.', function(next) {
      var p = jsonp.request('/jsonp/no-op')
                   .on('done', function() { expect(jsonp.active).to.not.contain(p)
                                            next() })
    })
    it('Should remove the script element from the document.', function(next) {
      jsonp.request('/jsonp/special')
           .on('done', function() { var scripts = to_array(document.scripts).filter(special_p)
                                    expect(scripts).to.be.empty()
                                    next() })

      function special_p(s){ return /\/jsonp\/special$/.test(s.src) }
    })
    it('Should call the success callbacks if the server responds.', function(next) {
      jsonp.request('/jsonp/no-op')
           .ok(success).failed(failure)
           .on('done', function(data){ expect(ok).to.be.ok()
                                       expect(data).to.eql({ status: 200, statusText: 'OK' })
                                       next() })
    })
    it('Should call the error callbacks if anything goes wrong.', function(next) {
      jsonp.request('/jsonp/error')
           .failed(success).ok(failure)
           .on('done', function(){ expect(ok).to.be.ok()
                                   next() })
    })
    it('Should cancel the request after the given timeout.', function(next) {
      jsonp.request('/jsonp/looong')
           .timeouted(success)
           .ok(failure)
           .timeout(0.1)
           .on('done', function(){ expect(ok).to.be.ok()
                                   next() })
    })
  })
})
})