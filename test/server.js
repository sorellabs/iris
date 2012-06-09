var express = require('express')
var browserify = require('browserify')
var app = express.createServer()


app.use(express.bodyParser())
app.use(express.static(__dirname + '/browser'))
app.use(function(req, res, next) { res.header('Expires', 'Sun, 08 Apr 2012 06:00:00 GMT')
                                   res.header('Cache-Control', [ 'no-store'
                                                               , 'no-cache'
                                                               , 'must-revalidate'
                                                               , 'max-age=0' ])
                                   res.header('Pragma', 'no-cache')
                                   next() })

app.get('/suite.js', function(req, res) {
  var source = browserify({ debug: true })
                 .require('iris')
                 .addEntry(__dirname + '/suite.js')
                 .bundle()
  res.send(source, { 'Content-Type': 'text/javascript' }) })


app.set('jsonp callback', 'callback')

app.get('/no-op', function(req, res) {
  res.send(200) })

app.get('/method', function(req, res) {
  res.send(req.method) })

app.get('/query', function(req, res) {
  res.send(req.query)
})

app.post('/body', function(req, res) {
  res.send(req.body)
})

app.get('/headers', function(req, res) {
  res.send(Object.keys(req.headers))
})

app.get('/status/:id', function(req, res) {
  res.send('', {}, +req.params.id)
})

app.get('/response', function(req, res) {
  res.send('response.', 200)
})

app.get('/looong', function(req, res) {
  setTimeout( function() { res.send(200) }
            , 1000 )
})

app.get('/cross-redirect', function(req, res) {
  res.redirect('http://localhost:8081')
})

app.get('/chunked', function(req, res) {
  res.write('a\r\n')
  setTimeout(function(){ res.write('b\r\n') }, 400)
  setTimeout(function(){ res.write('c\r\n') }, 800)
  setTimeout(function(){ res.end('d\r\n')   }, 1000)
})

app.get('/jsonp/no-op', function(req, res) {
  res.send({ status: 200, statusText: 'OK' })
})

app.get('/jsonp/special', function(req, res) {
  res.send({ })
})

app.get('/jsonp/error', function(req, res) {
  res.send(404)
})

app.get('/jsonp/looong', function(req, res) {
  setTimeout(function(){ res.send({ }) }, 1000)
})

app.listen(8080)
console.log('>> Test server listening on port 8080')
