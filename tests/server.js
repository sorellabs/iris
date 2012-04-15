var express = require('express')
var app = express.createServer()


app.use(express.bodyParser())
app.use(express.static(__dirname + '/browser'))

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

app.listen(8080)
console.log('>> Test server listening on port 8080')