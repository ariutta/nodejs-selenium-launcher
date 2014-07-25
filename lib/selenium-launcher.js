var fs = require('fs')
  , path = require('path')
  , request = require('request')
  , hashFile = require('hash_file')
  , spawn = require('child_process').spawn
  , freeport = require('freeport')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')

// Google lists the Selenium files here now: http://selenium-release.storage.googleapis.com/index.html

var override = process.env.SELENIUM_VERSION ? process.env.SELENIUM_VERSION.split(':') : []
  , version = override[0] || '2.42.2'
  , versionSplitByDot = version.split('.')
  , versionMajor = version.split('.')[0]
  , versionMinor = version.split('.')[1]
  , versionPatch = version.split('.')[2]
  , expectedSha = override[1] || 'e357c6c0a757311b0da571abd7386cac'
  , filename = 'selenium-server-standalone-' + version + '.jar'
  , url = 'http://selenium-release.storage.googleapis.com/' + versionMajor + '.' + versionMinor+ '/' + filename
  , outfile = path.join(path.dirname(__filename), filename)
  , outfileAlreadyDownloaded = fs.existsSync(outfile)
  ;

function download(url, outfile, expectedSha, cb) {
  var real = function() {
    console.log('Downloading Selenium ' + version + ' from ' + url);
    var i = 0
    var requestOptions = {url: url};
    if (process.env.http_proxy != null) {
      requestOptions.proxy = process.env.http_proxy;
    }
    request(requestOptions)
      .on('end', function() {
        process.stdout.write('\n')
        cb()
      })
      .on('data', function() {
        if (i == 8000) {
          process.stdout.write('\n')
          i = 0
        }
        if (i % 100 === 0) process.stdout.write('.')
        i++
      })
      .pipe(fs.createWriteStream(outfile))
  }

  fs.stat(outfile, function(err, stat) {
    if (err) return real()
    hashFile(outfile, 'sha1', function(err, actualSha) {
      if (err) return cb(err)
      if (actualSha != expectedSha) return real()
      cb()
    })
  })
}

// from https://gist.github.com/timoxley/1689041
function isPortTaken(port, cb) {
  var net = require('net');
  var tester = net.createServer()
  .once('error', function (err) {
    if (err.code !== 'EADDRINUSE') {
      return cb(err);
    }
    cb(null, true);
  })
  .once('listening', function() {
    tester.once('close', function() { cb(null, false) })
    .close();
  })
  .listen(port);
}

function getPort(cb) {
  if (typeof process.env.SELENIUM_LAUNCHER_PORT !== 'undefined') {
    return cb(null, process.env.SELENIUM_LAUNCHER_PORT);
  }
  // port 4444 is what Selenium most commonly runs on
  isPortTaken('4444', function(err, result) {
    if (err) {
      throw err;
    }
    if (!result) {
      return cb(null, '4444');
    }
    freeport(function(err, port) {
      if (err) {
        throw err;
      }
      return cb(null, port);
    });
  });
}

function run(cb) {
  getPort(function(err, port) {
    if (err) {
      throw err;
    }
    console.log('Starting Selenium ' + version + ' on port ' + port);
    var child = spawn('java', [
      '-jar', outfile,
      '-port', port,
    ])
    child.host = '127.0.0.1'
    child.port = port

    var badExit = function() { cb(new Error('Could not start Selenium.')) }
    child.stdout.on('data', function(data) {
      var sentinal = 'Started org.openqa.jetty.jetty.Server'
      if (data.toString().indexOf(sentinal) != -1) {
        child.removeListener('exit', badExit)
        cb(null, child)
      }
    })
    child.on('exit', badExit)
  })
}

function FakeProcess(port) {
  EventEmitter.call(this)
  this.host = '127.0.0.1'
  this.port = port
}
util.inherits(FakeProcess, EventEmitter)
FakeProcess.prototype.kill = function() {
  this.emit('exit')
}

module.exports = function(cb) {
  if (outfileAlreadyDownloaded) {
    if (process.env.SELENIUM_CREATE_PROCESS) {
      return process.nextTick(
        cb.bind(null, null, new FakeProcess(process.env.SELENIUM_LAUNCHER_PORT))
      )
    }
    return run(cb);
  } 

  download(url, outfile, expectedSha, function(err) {
    if (err) {
      return cb(err);
    }
    if (process.env.SELENIUM_CREATE_PROCESS) {
      return process.nextTick(
        cb.bind(null, null, new FakeProcess(process.env.SELENIUM_LAUNCHER_PORT))
      )
    }
    return run(cb);
  });
}
