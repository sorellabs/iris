Iris
====

Iris is a library for handling HTTP (through XMLHttpRequest) and JSONP requests
in a more high-level way. It uses promises to allow for more declarative and
flexible handling of the responses from either side.

```javascript
// HTTP example
var http = require('iris').http

http.get('/user/profile')
    .timeout(10) // in seconds
    .ok(function(data){
       $('#user').html(data)
    })
    .timeouted(function(){
       dialog.error('The operation timed out.')
    })
    .failed(function() {
       dialog.error('Ooops, something went wrong.')
    })
    

// JSONP example
var jsonp = require('iris').jsonp

jsonp.get('/user/posts')
     .timeout(10)
     .ok(function(data) {
        $('#post-count').text(data.posts.length + ' posts.')
     })
     .timeouted(function() {
        dialog.error('The operation timed out.')
     })
     .failed(function() {
        dialog.error('Ooops, something went wrong.')
     })
```

Requirements and Supported Platforms
------------------------------------

Iris depends on the following libraries:

 - [browserify][]
 - [boo][]
 - [cassie][]

Additionally, there's a dependency on the set of safely shim-able ECMAScript 5
features, which can be provided by a library like [es5-shim][].

[browserify]: https://github.com/substack/node-browserify
[boo]: https://github.com/killdream/boo
[cassie]: https://github.com/killdream/cassie
[es5-shim]: https://github.com/kriskowal/es5-shim


Installing
----------

1. you'll need [node.js][] and [npm][]. As soon as you got your hands on those
   beautiful thingies, you can just run the following in your project's
   directory.

   ```bash
   $ npm install iris
   ```



2. Then require `iris` in your script:

   ```javascript
   var iris = require('iris')
    
   iris.http.get('/za/warudo')
   ```

3. Then compile it (use `--watch` for added development-phase awesomeness):

   ```bash
   $ browserify your-script.js -o bundle.js
   ```
    
4. Finally, just put it all in your page:

   ```html
   <html>
     {{ ... }}
     <body>
       {{ lots of things may go here, too }}
       <script src="/path/to/bundle.js"></script>
     </body>
   </html>
   ```

[node.js]: http://nodejs.org/
[npm]: http://npmjs.org/


Downloading
-----------

Iris is nicely hosted (and developed) on [Github][]. You can
[download the lastest snapshot][snapshot] or clone the entire
repository:

```bash
$ git clone git://github.com/killdream/iris.git
```

[Github]:   https://github.com/killdream/iris
[snapshot]: https://github.com/killdream/iris/zipball/master


Getting support
---------------


- Use the [Github tracker][] to report bugs or request features. Like a
  boss!
  
- Fork, do your changes and send me a pull request if you want to~

- For general support, you can send me an e-mail on `quildreen@gmail.com`

[Github tracker]: https://github.com/killdream/iris/issues



Licence
-------

Iris is licensed under the delicious and permissive [MIT][]
licence. You can happily copy, share, modify, sell or whatever — refer
to the actual licence text for `less` information:

```bash
$ less LICENCE.txt
```
    
[MIT]: https://github.com/killdream/iris/raw/master/LICENCE.txt
