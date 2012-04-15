var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var res = mod._cached ? mod._cached : mod();
    return res;
}

require.paths = [];
require.modules = {};
require.extensions = [".js",".coffee"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        var y = cwd || '.';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = x + '/package.json';
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

require.define = function (filename, fn) {
    var dirname = require._core[filename]
        ? ''
        : require.modules.path().dirname(filename)
    ;
    
    var require_ = function (file) {
        return require(file, dirname)
    };
    require_.resolve = function (name) {
        return require.resolve(name, dirname);
    };
    require_.modules = require.modules;
    require_.define = require.define;
    var module_ = { exports : {} };
    
    require.modules[filename] = function () {
        require.modules[filename]._cached = module_.exports;
        fn.call(
            module_.exports,
            require_,
            module_,
            module_.exports,
            dirname,
            filename
        );
        require.modules[filename]._cached = module_.exports;
        return module_.exports;
    };
};

if (typeof process === 'undefined') process = {};

if (!process.nextTick) process.nextTick = (function () {
    var queue = [];
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;
    
    if (canPost) {
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);
    }
    
    return function (fn) {
        if (canPost) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        }
        else setTimeout(fn, 0);
    };
})();

if (!process.title) process.title = 'browser';

if (!process.binding) process.binding = function (name) {
    if (name === 'evals') return require('vm')
    else throw new Error('No such module')
};

if (!process.cwd) process.cwd = function () { return '.' };

require.define("path", function (require, module, exports, __dirname, __filename) {
function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("/node_modules/expect.js/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"./expect"}
});

require.define("/node_modules/expect.js/expect.js", function (require, module, exports, __dirname, __filename) {

(function (global, module) {

  if ('undefined' == typeof module) {
    var module = { exports: {} }
      , exports = module.exports
  }

  /**
   * Exports.
   */

  module.exports = expect;
  expect.Assertion = Assertion;

  /**
   * Exports version.
   */

  expect.version = '0.1.2';

  /**
   * Possible assertion flags.
   */

  var flags = {
      not: ['to', 'be', 'have', 'include', 'only']
    , to: ['be', 'have', 'include', 'only', 'not']
    , only: ['have']
    , have: ['own']
    , be: ['an']
  };

  function expect (obj) {
    return new Assertion(obj);
  }

  /**
   * Constructor
   *
   * @api private
   */

  function Assertion (obj, flag, parent) {
    this.obj = obj;
    this.flags = {};

    if (undefined != parent) {
      this.flags[flag] = true;

      for (var i in parent.flags) {
        if (parent.flags.hasOwnProperty(i)) {
          this.flags[i] = true;
        }
      }
    }

    var $flags = flag ? flags[flag] : keys(flags)
      , self = this

    if ($flags) {
      for (var i = 0, l = $flags.length; i < l; i++) {
        // avoid recursion
        if (this.flags[$flags[i]]) continue;

        var name = $flags[i]
          , assertion = new Assertion(this.obj, name, this)
  
        if ('function' == typeof Assertion.prototype[name]) {
          // clone the function, make sure we dont touch the prot reference
          var old = this[name];
          this[name] = function () {
            return old.apply(self, arguments);
          }

          for (var fn in Assertion.prototype) {
            if (Assertion.prototype.hasOwnProperty(fn) && fn != name) {
              this[name][fn] = bind(assertion[fn], assertion);
            }
          }
        } else {
          this[name] = assertion;
        }
      }
    }
  };

  /**
   * Performs an assertion
   *
   * @api private
   */

  Assertion.prototype.assert = function (truth, msg, error) {
    var msg = this.flags.not ? error : msg
      , ok = this.flags.not ? !truth : truth;

    if (!ok) {
      throw new Error(msg);
    }

    this.and = new Assertion(this.obj);
  };

  /**
   * Check if the value is truthy
   *
   * @api public
   */

  Assertion.prototype.ok = function () {
    this.assert(
        !!this.obj
      , 'expected ' + i(this.obj) + ' to be truthy'
      , 'expected ' + i(this.obj) + ' to be falsy');
  };

  /**
   * Assert that the function throws.
   *
   * @param {Function|RegExp} callback, or regexp to match error string against
   * @api public
   */

  Assertion.prototype.throwError =
  Assertion.prototype.throwException = function (fn) {
    expect(this.obj).to.be.a('function');

    var thrown = false
      , not = this.flags.not

    try {
      this.obj();
    } catch (e) {
      if ('function' == typeof fn) {
        fn(e);
      } else if ('object' == typeof fn) {
        var subject = 'string' == typeof e ? e : e.message;
        if (not) {
          expect(subject).to.not.match(fn);
        } else {
          expect(subject).to.match(fn);
        }
      }
      thrown = true;
    }

    if ('object' == typeof fn && not) {
      // in the presence of a matcher, ensure the `not` only applies to
      // the matching.
      this.flags.not = false; 
    }

    var name = this.obj.name || 'fn';
    this.assert(
        thrown
      , 'expected ' + name + ' to throw an exception'
      , 'expected ' + name + ' not to throw an exception');
  };

  /**
   * Checks if the array is empty.
   *
   * @api public
   */

  Assertion.prototype.empty = function () {
    var expectation;

    if ('object' == typeof this.obj && null !== this.obj && !isArray(this.obj)) {
      if ('number' == typeof this.obj.length) {
        expectation = !this.obj.length;
      } else {
        expectation = !keys(this.obj).length;
      }
    } else {
      if ('string' != typeof this.obj) {
        expect(this.obj).to.be.an('object');
      }

      expect(this.obj).to.have.property('length');
      expectation = !this.obj.length;
    }

    this.assert(
        expectation
      , 'expected ' + i(this.obj) + ' to be empty'
      , 'expected ' + i(this.obj) + ' to not be empty');
    return this;
  };

  /**
   * Checks if the obj exactly equals another.
   *
   * @api public
   */

  Assertion.prototype.be =
  Assertion.prototype.equal = function (obj) {
    this.assert(
        obj === this.obj
      , 'expected ' + i(this.obj) + ' to equal ' + i(obj)
      , 'expected ' + i(this.obj) + ' to not equal ' + i(obj));
    return this;
  };

  /**
   * Checks if the obj sortof equals another.
   *
   * @api public
   */

  Assertion.prototype.eql = function (obj) {
    this.assert(
        expect.eql(obj, this.obj)
      , 'expected ' + i(this.obj) + ' to sort of equal ' + i(obj)
      , 'expected ' + i(this.obj) + ' to sort of not equal ' + i(obj));
    return this;
  };

  /**
   * Assert within start to finish (inclusive). 
   *
   * @param {Number} start
   * @param {Number} finish
   * @api public
   */

  Assertion.prototype.within = function (start, finish) {
    var range = start + '..' + finish;
    this.assert(
        this.obj >= start && this.obj <= finish
      , 'expected ' + i(this.obj) + ' to be within ' + range
      , 'expected ' + i(this.obj) + ' to not be within ' + range);
    return this;
  };

  /**
   * Assert typeof / instance of
   *
   * @api public
   */

  Assertion.prototype.a =
  Assertion.prototype.an = function (type) {
    if ('string' == typeof type) {
      // proper english in error msg
      var n = /^[aeiou]/.test(type) ? 'n' : '';

      // typeof with support for 'array'
      this.assert(
          'array' == type ? isArray(this.obj) :
            'object' == type
              ? 'object' == typeof this.obj && null !== this.obj
              : type == typeof this.obj
        , 'expected ' + i(this.obj) + ' to be a' + n + ' ' + type
        , 'expected ' + i(this.obj) + ' not to be a' + n + ' ' + type);
    } else {
      // instanceof
      var name = type.name || 'supplied constructor';
      this.assert(
          this.obj instanceof type
        , 'expected ' + i(this.obj) + ' to be an instance of ' + name
        , 'expected ' + i(this.obj) + ' not to be an instance of ' + name);
    }

    return this;
  };

  /**
   * Assert numeric value above _n_.
   *
   * @param {Number} n
   * @api public
   */

  Assertion.prototype.greaterThan =
  Assertion.prototype.above = function (n) {
    this.assert(
        this.obj > n
      , 'expected ' + i(this.obj) + ' to be above ' + n
      , 'expected ' + i(this.obj) + ' to be below ' + n);
    return this;
  };

  /**
   * Assert numeric value below _n_.
   *
   * @param {Number} n
   * @api public
   */

  Assertion.prototype.lessThan =
  Assertion.prototype.below = function (n) {
    this.assert(
        this.obj < n
      , 'expected ' + i(this.obj) + ' to be below ' + n
      , 'expected ' + i(this.obj) + ' to be above ' + n);
    return this;
  };
  
  /**
   * Assert string value matches _regexp_.
   *
   * @param {RegExp} regexp
   * @api public
   */

  Assertion.prototype.match = function (regexp) {
    this.assert(
        regexp.exec(this.obj)
      , 'expected ' + i(this.obj) + ' to match ' + regexp
      , 'expected ' + i(this.obj) + ' not to match ' + regexp);
    return this;
  };

  /**
   * Assert property "length" exists and has value of _n_.
   *
   * @param {Number} n
   * @api public
   */

  Assertion.prototype.length = function (n) {
    expect(this.obj).to.have.property('length');
    var len = this.obj.length;
    this.assert(
        n == len
      , 'expected ' + i(this.obj) + ' to have a length of ' + n + ' but got ' + len
      , 'expected ' + i(this.obj) + ' to not have a length of ' + len);
    return this;
  };

  /**
   * Assert property _name_ exists, with optional _val_.
   *
   * @param {String} name
   * @param {Mixed} val
   * @api public
   */

  Assertion.prototype.property = function (name, val) {
    if (this.flags.own) {
      this.assert(
          Object.prototype.hasOwnProperty.call(this.obj, name)
        , 'expected ' + i(this.obj) + ' to have own property ' + i(name)
        , 'expected ' + i(this.obj) + ' to not have own property ' + i(name));
      return this;
    }

    if (this.flags.not && undefined !== val) {
      if (undefined === this.obj[name]) {
        throw new Error(i(this.obj) + ' has no property ' + i(name));
      }
    } else {
      var hasProp;
      try {
        hasProp = name in this.obj
      } catch (e) {
        hasProp = undefined !== this.obj[name]
      }
      
      this.assert(
          hasProp
        , 'expected ' + i(this.obj) + ' to have a property ' + i(name)
        , 'expected ' + i(this.obj) + ' to not have a property ' + i(name));
    }
    
    if (undefined !== val) {
      this.assert(
          val === this.obj[name]
        , 'expected ' + i(this.obj) + ' to have a property ' + i(name)
          + ' of ' + i(val) + ', but got ' + i(this.obj[name])
        , 'expected ' + i(this.obj) + ' to not have a property ' + i(name)
          + ' of ' + i(val));
    }

    this.obj = this.obj[name];
    return this;
  };

  /**
   * Assert that the array contains _obj_ or string contains _obj_.
   *
   * @param {Mixed} obj|string
   * @api public
   */

  Assertion.prototype.string =
  Assertion.prototype.contain = function (obj) {
    if ('string' == typeof this.obj) {
      this.assert(
          ~this.obj.indexOf(obj)
        , 'expected ' + i(this.obj) + ' to contain ' + i(obj)
        , 'expected ' + i(this.obj) + ' to not contain ' + i(obj));
    } else {
      this.assert(
          ~indexOf(this.obj, obj)
        , 'expected ' + i(this.obj) + ' to contain ' + i(obj)
        , 'expected ' + i(this.obj) + ' to not contain ' + i(obj));
    }
    return this;
  };

  /**
   * Assert exact keys or inclusion of keys by using
   * the `.own` modifier.
   *
   * @param {Array|String ...} keys
   * @api public
   */

  Assertion.prototype.key =
  Assertion.prototype.keys = function ($keys) {
    var str
      , ok = true;

    $keys = isArray($keys)
      ? $keys
      : Array.prototype.slice.call(arguments);

    if (!$keys.length) throw new Error('keys required');

    var actual = keys(this.obj)
      , len = $keys.length;

    // Inclusion
    ok = every($keys, function (key) {
      return ~indexOf(actual, key);
    });

    // Strict
    if (!this.flags.not && this.flags.only) {
      ok = ok && $keys.length == actual.length;
    }

    // Key string
    if (len > 1) {
      $keys = map($keys, function (key) {
        return i(key);
      });
      var last = $keys.pop();
      str = $keys.join(', ') + ', and ' + last;
    } else {
      str = i($keys[0]);
    }

    // Form
    str = (len > 1 ? 'keys ' : 'key ') + str;

    // Have / include
    str = (!this.flags.only ? 'include ' : 'only have ') + str;

    // Assertion
    this.assert(
        ok
      , 'expected ' + i(this.obj) + ' to ' + str
      , 'expected ' + i(this.obj) + ' to not ' + str);

    return this;
  };

  /**
   * Function bind implementation.
   */

  function bind (fn, scope) {
    return function () {
      return fn.apply(scope, arguments);
    }
  }

  /**
   * Array every compatibility
   *
   * @see bit.ly/5Fq1N2
   * @api public
   */

  function every (arr, fn, thisObj) {
    var scope = thisObj || global;
    for (var i = 0, j = arr.length; i < j; ++i) {
      if (!fn.call(scope, arr[i], i, arr)) {
        return false;
      }
    }
    return true;
  };

  /**
   * Array indexOf compatibility.
   *
   * @see bit.ly/a5Dxa2
   * @api public
   */

  function indexOf (arr, o, i) {
    if (Array.prototype.indexOf) {
      return Array.prototype.indexOf.call(arr, o, i);
    }

    if (arr.length === undefined) {
      return -1;
    }

    for (var j = arr.length, i = i < 0 ? i + j < 0 ? 0 : i + j : i || 0
        ; i < j && arr[i] !== o; i++);

    return j <= i ? -1 : i;
  };

  /**
   * Inspects an object.
   *
   * @see taken from node.js `util` module (copyright Joyent, MIT license)
   * @api private
   */

  function i (obj, showHidden, depth) {
    var seen = [];

    function stylize (str) {
      return str;
    };

    function format (value, recurseTimes) {
      // Provide a hook for user-specified inspect functions.
      // Check that value is an object with an inspect function on it
      if (value && typeof value.inspect === 'function' &&
          // Filter out the util module, it's inspect function is special
          value !== exports &&
          // Also filter out any prototype objects using the circular check.
          !(value.constructor && value.constructor.prototype === value)) {
        return value.inspect(recurseTimes);
      }

      // Primitive types cannot have properties
      switch (typeof value) {
        case 'undefined':
          return stylize('undefined', 'undefined');

        case 'string':
          var simple = '\'' + json.stringify(value).replace(/^"|"$/g, '')
                                                   .replace(/'/g, "\\'")
                                                   .replace(/\\"/g, '"') + '\'';
          return stylize(simple, 'string');

        case 'number':
          return stylize('' + value, 'number');

        case 'boolean':
          return stylize('' + value, 'boolean');
      }
      // For some reason typeof null is "object", so special case here.
      if (value === null) {
        return stylize('null', 'null');
      }

      // Look up the keys of the object.
      var visible_keys = keys(value);
      var $keys = showHidden ? Object.getOwnPropertyNames(value) : visible_keys;

      // Functions without properties can be shortcutted.
      if (typeof value === 'function' && $keys.length === 0) {
        if (isRegExp(value)) {
          return stylize('' + value, 'regexp');
        } else {
          var name = value.name ? ': ' + value.name : '';
          return stylize('[Function' + name + ']', 'special');
        }
      }

      // Dates without properties can be shortcutted
      if (isDate(value) && $keys.length === 0) {
        return stylize(value.toUTCString(), 'date');
      }

      var base, type, braces;
      // Determine the object type
      if (isArray(value)) {
        type = 'Array';
        braces = ['[', ']'];
      } else {
        type = 'Object';
        braces = ['{', '}'];
      }

      // Make functions say that they are functions
      if (typeof value === 'function') {
        var n = value.name ? ': ' + value.name : '';
        base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
      } else {
        base = '';
      }

      // Make dates with properties first say the date
      if (isDate(value)) {
        base = ' ' + value.toUTCString();
      }

      if ($keys.length === 0) {
        return braces[0] + base + braces[1];
      }

      if (recurseTimes < 0) {
        if (isRegExp(value)) {
          return stylize('' + value, 'regexp');
        } else {
          return stylize('[Object]', 'special');
        }
      }

      seen.push(value);

      var output = map($keys, function (key) {
        var name, str;
        if (value.__lookupGetter__) {
          if (value.__lookupGetter__(key)) {
            if (value.__lookupSetter__(key)) {
              str = stylize('[Getter/Setter]', 'special');
            } else {
              str = stylize('[Getter]', 'special');
            }
          } else {
            if (value.__lookupSetter__(key)) {
              str = stylize('[Setter]', 'special');
            }
          }
        }
        if (indexOf(visible_keys, key) < 0) {
          name = '[' + key + ']';
        }
        if (!str) {
          if (indexOf(seen, value[key]) < 0) {
            if (recurseTimes === null) {
              str = format(value[key]);
            } else {
              str = format(value[key], recurseTimes - 1);
            }
            if (str.indexOf('\n') > -1) {
              if (isArray(value)) {
                str = map(str.split('\n'), function (line) {
                  return '  ' + line;
                }).join('\n').substr(2);
              } else {
                str = '\n' + map(str.split('\n'), function (line) {
                  return '   ' + line;
                }).join('\n');
              }
            }
          } else {
            str = stylize('[Circular]', 'special');
          }
        }
        if (typeof name === 'undefined') {
          if (type === 'Array' && key.match(/^\d+$/)) {
            return str;
          }
          name = json.stringify('' + key);
          if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
            name = name.substr(1, name.length - 2);
            name = stylize(name, 'name');
          } else {
            name = name.replace(/'/g, "\\'")
                       .replace(/\\"/g, '"')
                       .replace(/(^"|"$)/g, "'");
            name = stylize(name, 'string');
          }
        }

        return name + ': ' + str;
      });

      seen.pop();

      var numLinesEst = 0;
      var length = reduce(output, function (prev, cur) {
        numLinesEst++;
        if (indexOf(cur, '\n') >= 0) numLinesEst++;
        return prev + cur.length + 1;
      }, 0);

      if (length > 50) {
        output = braces[0] +
                 (base === '' ? '' : base + '\n ') +
                 ' ' +
                 output.join(',\n  ') +
                 ' ' +
                 braces[1];

      } else {
        output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
      }

      return output;
    }
    return format(obj, (typeof depth === 'undefined' ? 2 : depth));
  };

  function isArray (ar) {
    return Object.prototype.toString.call(ar) == '[object Array]';
  };

  function isRegExp(re) {
    var s = '' + re;
    return re instanceof RegExp || // easy case
           // duck-type for context-switching evalcx case
           typeof(re) === 'function' &&
           re.constructor.name === 'RegExp' &&
           re.compile &&
           re.test &&
           re.exec &&
           s.match(/^\/.*\/[gim]{0,3}$/);
  };

  function isDate(d) {
    if (d instanceof Date) return true;
    return false;
  };

  function keys (obj) {
    if (Object.keys) {
      return Object.keys(obj);
    }

    var keys = [];

    for (var i in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, i)) {
        keys.push(i);
      }
    }

    return keys;
  }

  function map (arr, mapper, that) {
    if (Array.prototype.map) {
      return Array.prototype.map.call(arr, mapper, that);
    }

    var other= new Array(arr.length);

    for (var i= 0, n = arr.length; i<n; i++)
      if (i in arr)
        other[i] = mapper.call(that, arr[i], i, arr);

    return other;
  };

  function reduce (arr, fun) {
    if (Array.prototype.reduce) {
      return Array.prototype.reduce.apply(
          arr
        , Array.prototype.slice.call(arguments, 1)
      );
    }

    var len = +this.length;

    if (typeof fun !== "function")
      throw new TypeError();

    // no value to return if no initial value and an empty array
    if (len === 0 && arguments.length === 1)
      throw new TypeError();

    var i = 0;
    if (arguments.length >= 2) {
      var rv = arguments[1];
    } else {
      do {
        if (i in this) {
          rv = this[i++];
          break;
        }

        // if array contains no values, no initial value to return
        if (++i >= len)
          throw new TypeError();
      } while (true);
    }

    for (; i < len; i++) {
      if (i in this)
        rv = fun.call(null, rv, this[i], i, this);
    }

    return rv;
  };

  /**
   * Asserts deep equality
   *
   * @see taken from node.js `assert` module (copyright Joyent, MIT license)
   * @api private
   */

  expect.eql = function eql (actual, expected) {
    // 7.1. All identical values are equivalent, as determined by ===.
    if (actual === expected) { 
      return true;
    } else if ('undefined' != typeof Buffer 
        && Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
      if (actual.length != expected.length) return false;

      for (var i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) return false;
      }

      return true;

    // 7.2. If the expected value is a Date object, the actual value is
    // equivalent if it is also a Date object that refers to the same time.
    } else if (actual instanceof Date && expected instanceof Date) {
      return actual.getTime() === expected.getTime();

    // 7.3. Other pairs that do not both pass typeof value == "object",
    // equivalence is determined by ==.
    } else if (typeof actual != 'object' && typeof expected != 'object') {
      return actual == expected;

    // 7.4. For all other Object pairs, including Array objects, equivalence is
    // determined by having the same number of owned properties (as verified
    // with Object.prototype.hasOwnProperty.call), the same set of keys
    // (although not necessarily the same order), equivalent values for every
    // corresponding key, and an identical "prototype" property. Note: this
    // accounts for both named and indexed properties on Arrays.
    } else {
      return objEquiv(actual, expected);
    }
  }

  function isUndefinedOrNull (value) {
    return value === null || value === undefined;
  }

  function isArguments (object) {
    return Object.prototype.toString.call(object) == '[object Arguments]';
  }

  function objEquiv (a, b) {
    if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
      return false;
    // an identical "prototype" property.
    if (a.prototype !== b.prototype) return false;
    //~~~I've managed to break Object.keys through screwy arguments passing.
    //   Converting to array solves the problem.
    if (isArguments(a)) {
      if (!isArguments(b)) {
        return false;
      }
      a = pSlice.call(a);
      b = pSlice.call(b);
      return expect.eql(a, b);
    }
    try{
      var ka = keys(a),
        kb = keys(b),
        key, i;
    } catch (e) {//happens when one is a string literal and the other isn't
      return false;
    }
    // having the same number of owned properties (keys incorporates hasOwnProperty)
    if (ka.length != kb.length)
      return false;
    //the same set of keys (although not necessarily the same order),
    ka.sort();
    kb.sort();
    //~~~cheap key test
    for (i = ka.length - 1; i >= 0; i--) {
      if (ka[i] != kb[i])
        return false;
    }
    //equivalent values for every corresponding key, and
    //~~~possibly expensive deep test
    for (i = ka.length - 1; i >= 0; i--) {
      key = ka[i];
      if (!expect.eql(a[key], b[key]))
         return false;
    }
    return true;
  }

  var json = (function () {
    "use strict";

    if ('object' == typeof JSON && JSON.parse && JSON.stringify) {
      return {
          parse: nativeJSON.parse
        , stringify: nativeJSON.stringify
      }
    }

    var JSON = {};

    function f(n) {
        // Format integers to have at least two digits.
        return n < 10 ? '0' + n : n;
    }

    function date(d, key) {
      return isFinite(d.valueOf()) ?
          d.getUTCFullYear()     + '-' +
          f(d.getUTCMonth() + 1) + '-' +
          f(d.getUTCDate())      + 'T' +
          f(d.getUTCHours())     + ':' +
          f(d.getUTCMinutes())   + ':' +
          f(d.getUTCSeconds())   + 'Z' : null;
    };

    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        gap,
        indent,
        meta = {    // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        },
        rep;


    function quote(string) {

  // If the string contains no control characters, no quote characters, and no
  // backslash characters, then we can safely slap some quotes around it.
  // Otherwise we must also replace the offending characters with safe escape
  // sequences.

        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string' ? c :
                '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }


    function str(key, holder) {

  // Produce a string from holder[key].

        var i,          // The loop counter.
            k,          // The member key.
            v,          // The member value.
            length,
            mind = gap,
            partial,
            value = holder[key];

  // If the value has a toJSON method, call it to obtain a replacement value.

        if (value instanceof Date) {
            value = date(key);
        }

  // If we were called with a replacer function, then call the replacer to
  // obtain a replacement value.

        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

  // What happens next depends on the value's type.

        switch (typeof value) {
        case 'string':
            return quote(value);

        case 'number':

  // JSON numbers must be finite. Encode non-finite numbers as null.

            return isFinite(value) ? String(value) : 'null';

        case 'boolean':
        case 'null':

  // If the value is a boolean or null, convert it to a string. Note:
  // typeof null does not produce 'null'. The case is included here in
  // the remote chance that this gets fixed someday.

            return String(value);

  // If the type is 'object', we might be dealing with an object or an array or
  // null.

        case 'object':

  // Due to a specification blunder in ECMAScript, typeof null is 'object',
  // so watch out for that case.

            if (!value) {
                return 'null';
            }

  // Make an array to hold the partial results of stringifying this object value.

            gap += indent;
            partial = [];

  // Is the value an array?

            if (Object.prototype.toString.apply(value) === '[object Array]') {

  // The value is an array. Stringify every element. Use null as a placeholder
  // for non-JSON values.

                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || 'null';
                }

  // Join all of the elements together, separated with commas, and wrap them in
  // brackets.

                v = partial.length === 0 ? '[]' : gap ?
                    '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']' :
                    '[' + partial.join(',') + ']';
                gap = mind;
                return v;
            }

  // If the replacer is an array, use it to select the members to be stringified.

            if (rep && typeof rep === 'object') {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    if (typeof rep[i] === 'string') {
                        k = rep[i];
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            } else {

  // Otherwise, iterate through all of the keys in the object.

                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ': ' : ':') + v);
                        }
                    }
                }
            }

  // Join all of the member texts together, separated with commas,
  // and wrap them in braces.

            v = partial.length === 0 ? '{}' : gap ?
                '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}' :
                '{' + partial.join(',') + '}';
            gap = mind;
            return v;
        }
    }

  // If the JSON object does not yet have a stringify method, give it one.

    JSON.stringify = function (value, replacer, space) {

  // The stringify method takes a value and an optional replacer, and an optional
  // space parameter, and returns a JSON text. The replacer can be a function
  // that can replace values, or an array of strings that will select the keys.
  // A default replacer method can be provided. Use of the space parameter can
  // produce text that is more easily readable.

        var i;
        gap = '';
        indent = '';

  // If the space parameter is a number, make an indent string containing that
  // many spaces.

        if (typeof space === 'number') {
            for (i = 0; i < space; i += 1) {
                indent += ' ';
            }

  // If the space parameter is a string, it will be used as the indent string.

        } else if (typeof space === 'string') {
            indent = space;
        }

  // If there is a replacer, it must be a function or an array.
  // Otherwise, throw an error.

        rep = replacer;
        if (replacer && typeof replacer !== 'function' &&
                (typeof replacer !== 'object' ||
                typeof replacer.length !== 'number')) {
            throw new Error('JSON.stringify');
        }

  // Make a fake root object containing our value under the key of ''.
  // Return the result of stringifying the value.

        return str('', {'': value});
    };

  // If the JSON object does not yet have a parse method, give it one.

    JSON.parse = function (text, reviver) {
    // The parse method takes a text and an optional reviver function, and returns
    // a JavaScript value if the text is a valid JSON text.

        var j;

        function walk(holder, key) {

    // The walk method is used to recursively walk the resulting structure so
    // that modifications can be made.

            var k, v, value = holder[key];
            if (value && typeof value === 'object') {
                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = walk(value, k);
                        if (v !== undefined) {
                            value[k] = v;
                        } else {
                            delete value[k];
                        }
                    }
                }
            }
            return reviver.call(holder, key, value);
        }


    // Parsing happens in four stages. In the first stage, we replace certain
    // Unicode characters with escape sequences. JavaScript handles many characters
    // incorrectly, either silently deleting them, or treating them as line endings.

        text = String(text);
        cx.lastIndex = 0;
        if (cx.test(text)) {
            text = text.replace(cx, function (a) {
                return '\\u' +
                    ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            });
        }

    // In the second stage, we run the text against regular expressions that look
    // for non-JSON patterns. We are especially concerned with '()' and 'new'
    // because they can cause invocation, and '=' because it can cause mutation.
    // But just to be safe, we want to reject all unexpected forms.

    // We split the second stage into 4 regexp operations in order to work around
    // crippling inefficiencies in IE's and Safari's regexp engines. First we
    // replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
    // replace all simple value tokens with ']' characters. Third, we delete all
    // open brackets that follow a colon or comma or that begin the text. Finally,
    // we look to see that the remaining characters are only whitespace or ']' or
    // ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

        if (/^[\],:{}\s]*$/
                .test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
                    .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
                    .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

    // In the third stage we use the eval function to compile the text into a
    // JavaScript structure. The '{' operator is subject to a syntactic ambiguity
    // in JavaScript: it can begin a block or an object literal. We wrap the text
    // in parens to eliminate the ambiguity.

            j = eval('(' + text + ')');

    // In the optional fourth stage, we recursively walk the new structure, passing
    // each name/value pair to a reviver function for possible transformation.

            return typeof reviver === 'function' ?
                walk({'': j}, '') : j;
        }

    // If the text is not JSON parseable, then a SyntaxError is thrown.

        throw new SyntaxError('JSON.parse');
    };

    return JSON;
  })();

  if ('undefined' != typeof window) {
    window.expect = module.exports;
  }

})(
    this
  , 'undefined' != typeof module ? module : {}
  , 'undefined' != typeof exports ? exports : {}
);

});

require.define("/node_modules/iris/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"./src/index.js"}
});

require.define("/node_modules/iris/src/index.js", function (require, module, exports, __dirname, __filename) {
/// index.js --- Entry point for the Iris package
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

module.exports = { http:  require('./http')
                 , jsonp: require('./jsonp') }
});

require.define("/node_modules/iris/src/utils.js", function (require, module, exports, __dirname, __filename) {
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
                 }
});

require.define("/node_modules/iris/node_modules/cassie/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"./src/cassie.js"}
});

require.define("/node_modules/iris/node_modules/cassie/src/cassie.js", function (require, module, exports, __dirname, __filename) {
/// cassie.js --- Simple future library for JS. Ready to be raped by Ajax!
//
// // Copyright (c) 2011 Quildreen Motta
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

/// Module cassie


//// -- Dependencies --------------------------------------------------------
var Base = require('boo').Base



//// -- Aliases -------------------------------------------------------------
var slice = [].slice



//// -- Helpers -------------------------------------------------------------

///// Function get_queue
// Returns a list of callbacks registered for the event.
//
// If callbacks ain't defined for the event yet, it's also *initialised*
// to an empty array.
//
// get_queue! :: Promise*, String -> [Fun]
function get_queue(promise, event) {
  return promise.callbacks[event]
  ||    (promise.callbacks[event] = []) }


///// Function register
// Creates a function that registers handlers for the given event.
//
// register! :: String -> @this:Promise*, Fun -> this
function register(event) { return function(fun) {
  return this.on(event, fun) }}



//// -- Public interface ----------------------------------------------------

///// Object Promise <| Base
// A placeholder for a value that can be computed asynchronously.
//
// The `Promise' allows any code to define how they'll handle the value
// before the value is actually computed, by adding listeners to the
// various events that can be triggered once a promise is fulfilled.
//
// Promise :: { "callbacks"     -> { String -> [Fun] }
//            , "flush_queue"   -> [Fun]
//            , "value"         -> [Any]
//            , "timer"         -> TimerID
//            , "default_event" -> String
//            }
var Promise = Base.derive({
  ///// Function init
  // Initialises an instance of a Promise.
  //
  // init! :: @this:Object* -> this
  init:
  function _init() {
    this.callbacks     = {}
    this.flush_queue   = []
    this.value         = null
    this.timer         = null
    this.default_event = 'done'
    return this }


  ///// Function on
  // Adds a callback to the given event.
  //
  // on! :: @this:Promise*, String, Fun -> this
, on:
  function _on(event, callback) {
    this.default_event = event

    if (this.value)  invoke_callback(this)
    else             add_callback(this)

    return this

    // Invokes all the callbacks for the event
    function invoke_callback(promise) {
      var queue = get_queue(promise, event)
      return callback && queue.flushed?  callback.apply(promise, promise.value)
      :      /* otherwise */             null }

    // Adds the callback to the event
    function add_callback(promise) {
      return callback?  get_queue(promise, event).push(callback)
      :                 null }}


  ///// Function then
  // Adds a callback to the active event queue.
  //
  // The active event queue is the one for which the last callback was
  // registered, usually. It is controlled by the internal
  // `default_event' property.
  //
  // then! :: @this:Promise*, Fun -> this
, then:
  function _then(callback) {
    return this.on(this.default_event, callback) }



  ///// Function flush
  // Fires all the callbacks for the event.
  //
  // If the promise hasn't been resolved yet, the callbacks are placed
  // in a queue to be flushed once the Promise is fulfilled.
  //
  // flush :: @this:Promise*, String -> this
, flush:
  function _flush(event) {
    var self = this

      !this.value?     queue_event(event)
    : event?           flush_queue(event)
    : /* otherwise */  flush_all()

    return this


    // Adds the event to the flush queue
    function queue_event(event) {
      if (event) self.flush_queue.push(event) }

    // Calls all of the callbacks related to a given event
    function flush_queue(event) {
      var callbacks = get_queue(self, event)

      callbacks.forEach(function(callback) {
                          callback.apply(self, self.value) })
      callbacks.length  = 0
      callbacks.flushed = true }

    // Calls the callbacks for all events that have been queued
    function flush_all() {
      self.flush_queue.forEach(flush_queue) }}


  ///// Function done
  // Fulfills the promise with the values given.
  //
  // done :: @this:Promise*, [Any] -> this
, done:
  function _done(values) {
    if (!this.value) {
      this.clear_timer()
      this.flush('done')
      this.value = slice.call(values)
      this.flush() }

    return this }


  ///// Function fail
  // Fails to fulfill the promise.
  //
  // fail :: @this:Promise*, Any... -> this
, fail:
  function _fail() {
    return this.flush('failed').done(arguments) }


  ///// Function bind
  // Successfully fulfills the promise.
  //
  // bind :: @this:Promise*, Any... -> this
, bind:
  function _bind() {
    return this.flush('ok').done(arguments) }


  ///// Function forget
  // Cancels the promise.
  //
  // forget :: @this:Promise* -> this
, forget:
  function _forget() {
    return this.flush('forgotten').fail('forgotten') }


  ///// Function timeout
  // Schedules the promise to fail after a given number of seconds.
  //
  // timeout :: @this:Promise*, Number -> this
, timeout:
  function _timeout(delay) {
    this.clear_timer()
    this.timer = setTimeout( function(){ this.flush('timeouted')
                                             .fail('timeouted')  }.bind(this)
                           , delay * 1000)

    return this }


  ///// Function clear_timer
  // Stop the timer for the promise, if one was previously set by
  // invoking `timeout'.
  //
  // clear_timer :: @this:Promise* -> this
, clear_timer:
  function _clear_timer() {
    clearTimeout(this.timer)
    this.timer = null
    return this }


  ///// Function ok
  // Registers a callback for when the promise is successfully
  // fulfilled.
  //
  // ok :: @this:Promise*, Fun -> this
, ok: register('ok')

  ///// Function failed
  // Registers a callback for when the promise fails to be fulfilled.
  //
  // failed :: @this:Promise*, Fun -> this
, failed: register('failed')

  ///// Function timeouted
  // Registers a callback for when the promise fails by timing out.
  //
  // timeouted :: @this:Promise*, Fun -> this
, timeouted: register('timeouted')

  ///// Function forgotten
  // Registers a callback for when the promise fails by being
  // cancelled.
  //
  // forgotten :: @this:Promise*, Fun -> this
, forgotten: register('forgotten')
})



//// -- Exports ---------------------------------------------------------------
module.exports = { Promise   : Promise
                 , register  : register

                 , internals : { get_queue: get_queue }}

});

require.define("/node_modules/iris/node_modules/boo/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"./src/boo.js"}
});

require.define("/node_modules/iris/node_modules/boo/src/boo.js", function (require, module, exports, __dirname, __filename) {
/// boo.js --- Prototypical utilities
//
// Copyright (c) 2011 Quildreen Motta
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

/// Module boo
void function(root, exports) {
  var slice   = [].slice
    , keys    = Object.keys
    , inherit = Object.create


  
  //// - Interfaces -----------------------------------------------------------

  ///// Interface DataObject
  // :: { "to_data" -> () -> Object }


  
  //// - Helpers --------------------------------------------------------------

  ///// Function data_obj_p
  // :internal:
  // Checks if the given subject matches the DataObject interface
  //
  // data_obj_p :: Any -> Bool
  function data_obj_p(subject) {
    return subject != null
    &&     typeof subject.to_data == 'function' }


  ///// Function resolve_mixins
  // :internal:
  // Returns the proper mixin for the given object.
  //
  // resolve_mixin :: Object -> Object
  function resolve_mixin(object) {
    return data_obj_p(object)?  object.to_data()
    :                           object }


  ///// Function fast_extend
  // :internal:
  // Extends the target object with the provided mixins, using a
  // right-most precedence rule — when a there's a property conflict, the
  // property defined in the last object wins.
  //
  // `DataObject's are properly handled by the `resolve_mixin'
  // function.
  //
  // :warning: low-level
  //    This function is not meant to be called directly from end-user
  //    code, use the `extend' function instead.
  //
  // fast_extend :: Object, [Object | DataObject] -> Object
  function fast_extend(object, mixins) {
    var i, j, len, mixin, props, key
    for (i = 0, len = mixins.length; i < len; ++i) {
      mixin = resolve_mixin(mixins[i])
      props = keys(mixin)
      for (j = props.length; j--;) {
        key         = props[j]
        object[key] = mixin[key] }}

    return object }


  
  //// - Basic primitives -----------------------------------------------------

  ///// Function extend
  // Extends the target object with the provided mixins, using a
  // right-most precedence rule.
  //
  // :see-also:
  //   - `fast_extend' — lower level function.
  //   - `merge'       — pure version.
  //
  // extend :: Object, (Object | DataObject)... -> Object
  function extend(target) {
    return fast_extend(target, slice.call(arguments, 1)) }


  ///// Function merge
  // Creates a new object that merges the provided mixins, using a
  // right-most precedence rule.
  //
  // :see-also:
  //   - `extend' — impure version.
  //
  // merge :: (Object | DataObject)... -> Object
  function merge() {
    return fast_extend({}, arguments) }

  ///// Function derive
  // Creates a new object inheriting from the given prototype and extends
  // the new instance with the provided mixins.
  //
  // derive :: Object, (Object | DataObject)... -> Object
  function derive(proto) {
    return fast_extend(inherit(proto), slice.call(arguments, 1)) }


  
  //// - Root object ----------------------------------------------------------

  ///// Object Base
  // The root object for basing all the OOP code. Provides the previous
  // primitive combinators in an easy and OOP-way.
  var Base = {

    ////// Function make
    // Constructs new instances of the object the function is being
    // applied to.
    //
    // If the object provides an ``init`` function, that function is
    // invoked to do initialisation on the new instance.
    //
    // make :: Any... -> Object
    make:
    function _make() {
      var result = inherit(this)
      if (typeof result.init == 'function')
        result.init.apply(result, arguments)

      return result }

    ////// Function derive
    // Constructs a new object that inherits from the object this function
    // is being applied to, and extends it with the provided mixins.
    //
    // derive :: (Object | DataObject)... -> Object
  , derive:
    function _derive() {
      return fast_extend(inherit(this), arguments) }}


  
  //// - Exports --------------------------------------------------------------
  exports.extend   = extend
  exports.merge    = merge
  exports.derive   = derive
  exports.Base     = Base
  exports.internal = { data_obj_p    : data_obj_p
                     , fast_extend   : fast_extend
                     , resolve_mixin : resolve_mixin
                     }

}
( this
, typeof exports == 'undefined'? this.boo = this.boo || {}
  /* otherwise, yay modules! */: exports
)
});

require.define("/node_modules/iris/src/jsonp.js", function (require, module, exports, __dirname, __filename) {
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
});

require.define("/node_modules/iris/src/http.js", function (require, module, exports, __dirname, __filename) {
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
  var type = status.toString().charAt(0) - 1
  return statuses[type] }

function serialise_for_type(mime, data) {
  return mime == 'application/json'?  JSON.stringify(data)
  :      /* otherwise */              serialise(data) }


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
    callbacks = this.callbacks[event] || []

    for (i = 0, len = callbacks.length; i < len; ++i)
      callbacks[i].apply(this, args)

    return this }

, forget:
  function _forget() {
    this.client.abort()
    return this.flush('forgotten').fail('forgotten') }

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


  function build_uri(uri, query, body) {
    uri = build_query_string(uri, query)
    return method == 'GET'?  build_query_string(uri, body)
    :      /* otherwise */   uri }

  function setup_headers(headers) {
    keys(headers).forEach(function(key) {
      client.setRequestHeader(key, headers[key]) })}

  function make_error_handler(type) { return function(ev) {
    promise.flush(type).fail(type, ev) }}

  function raise(type) {
    make_error_handler(type)() }

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

});

require.define("/http.js", function (require, module, exports, __dirname, __filename) {
var expect = require('expect.js')

describe('{} iris', function() {
describe('{} http', function() {
  var http  = require('iris').http
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
    var p = http.get('/status/' + status)
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
        it('- Redirected 3xx', function(next) {
          each( zipRange('redirected', 300, 307)
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
      describe('Should execute all callbacks matching the exact HTTP response status.', function(next) {
        it('- Success 2xx', function(next) {
          each( zipRange('success', 200, 206)
              , check_status(1)
              , next )
        })
        it('- Redirected 3xx', function(next) {
          each( zipRange('redirected', 300, 307)
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
            .then(function(){ ++n })
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
            .then(function() { ++n })
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
                    .then(function(){ ++n })
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
});

require.define("/suite.js", function (require, module, exports, __dirname, __filename) {
    require('./http.js')

});
require("/suite.js");
