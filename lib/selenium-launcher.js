var fs = require('fs')
  , path = require('path')
  , request = require('request')
  , hashFile = require('hash_file')
  , spawn = require('child_process').spawn
  , freeport = require('freeport')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
  , AdmZip = require('adm-zip')
  , http = require('http')
  , url = require('url')

// Google lists the Selenium files here now: http://selenium-release.storage.googleapis.com/index.html

var seleniumOverride = process.env.SELENIUM_VERSION ? process.env.SELENIUM_VERSION.split(':') : []
  , seleniumVersion = seleniumOverride[0] || '2.42.2'
  , seleniumVersionSplitByDot = seleniumVersion.split('.')
  , seleniumVersionMajor = seleniumVersion.split('.')[0]
  , seleniumVersionMinor = seleniumVersion.split('.')[1]
  , seleniumVersionPatch = seleniumVersion.split('.')[2]
  , seleniumShaExpected = seleniumOverride[1] || 'e357c6c0a757311b0da571abd7386cac'
  , seleniumFileName = 'selenium-server-standalone-' + seleniumVersion + '.jar'
  , seleniumDownloadUrl = 'http://selenium-release.storage.googleapis.com/' + seleniumVersionMajor + '.' + seleniumVersionMinor+ '/' + seleniumFileName
  , seleniumOutfile = path.join(path.dirname(__filename), seleniumFileName)
  , seleniumOutfileAlreadyDownloaded = fs.existsSync(seleniumOutfile)
  ;

function downloadChromeDriver(cb) {
  var chromeDriverZipfile = './chromedriver.zip'
  var chromeDriverExecutable = '/Users/andersriutta/Sites/pathvisiojs/node_modules/selenium-launcher/lib/chromedriver'
  var real = function() {
    console.log('hi')
    var chromeDriverVersionRequestOptions = {url: 'http://chromedriver.storage.googleapis.com/LATEST_RELEASE'};
    if (process.env.http_proxy != null) {
      chromeDriverVersionRequestOptions.proxy = process.env.http_proxy;
    }
    request('http://chromedriver.storage.googleapis.com/LATEST_RELEASE', function (error, response, body) {
      if (error || response.statusCode !== 200) {
        console.log(error)
        console.log(response.statusCode)
      }
      console.log('body')
      console.log(body)
      var chromeDriverVersion = body || '2.9'
      , chromeDriverVersionSplitByDot = chromeDriverVersion.split('.')
      , chromeDriverVersionMajor = chromeDriverVersion.split('.')[0]
      , chromeDriverVersionMinor = chromeDriverVersion.split('.')[1]


      // http://chromedriver.storage.googleapis.com/2.10/chromedriver_mac32.zip

      // TODO detect OS and whether 32 or 64 bit
      var chromeDriverDownloadUrl = 'http://chromedriver.storage.googleapis.com/' + chromeDriverVersion + '/chromedriver_mac32.zip'

      var options = {
          host: url.parse(chromeDriverDownloadUrl).host,
          port: 80,
          path: url.parse(chromeDriverDownloadUrl).pathname
      };

      http.get(options, function(res) {
          var data = [], dataLen = 0; 

          res.on('data', function(chunk) {

                  data.push(chunk);
                  dataLen += chunk.length;

              }).on('end', function() {
                  var buf = new Buffer(dataLen);

                  for (var i=0, len = data.length, pos = 0; i < len; i++) { 
                      data[i].copy(buf, pos); 
                      pos += data[i].length; 
                  } 

                  var zip = new AdmZip(buf);
                  var zipEntries = zip.getEntries();
                  console.log(zipEntries.length)
                  var unzippedBuffer = zip.toBuffer()
                  console.log('unzippedBuffer length')
                  console.log(unzippedBuffer.length)
                  fs.writeFileSync(chromeDriverExecutable, unzippedBuffer)
                  cb();
              });
      });
      var i = 0
      var requestOptions = {
        url: chromeDriverDownloadUrl
      };

      if (process.env.http_proxy != null) {
        requestOptions.proxy = process.env.http_proxy;
      }
    })
  }

  fs.stat(chromeDriverExecutable, function(err, stat) {
    // TODO detect whether file exists
    return real()
    /*
    hashFile(chromeDriverOutfile, 'sha1', function(err, actualSha) {
      if (err) return cb(err)
      if (actualSha != chromeDriverShaExpected) return real()
      cb()
    })
    //*/
  })
}

function downloadSelenium(seleniumDownloadUrl, seleniumOutfile, seleniumShaExpected, cb) {
  var real = function() {
    console.log('Downloading Selenium ' + seleniumVersion + ' from ' + seleniumDownloadUrl);
    var i = 0
    var requestOptions = {url: seleniumDownloadUrl};
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
      .pipe(fs.createWriteStream(seleniumOutfile))
  }

  downloadChromeDriver(function() {
    fs.stat(seleniumOutfile, function(err, stat) {
      if (err) return real()
      hashFile(seleniumOutfile, 'sha1', function(err, actualSha) {
        if (err) return cb(err)
        if (actualSha != seleniumShaExpected) return real()
        cb()
      })
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

  freeport(function(err, port) {
    if (err) {
      throw err;
    }
    return cb(null, port);
  });
}

function run(cb) {
  getPort(function(err, port) {
    if (err) {
      throw err;
    }
    console.log('Starting Selenium ' + seleniumVersion + ' on port ' + port);
    var child = spawn('java', [
      '-jar', seleniumOutfile,
      '-port', port,
      //'', '-Dwebdriver.chrome.driver=./chromedriver',
      '', '-Dwebdriver.chrome.driver=/Users/andersriutta/Downloads/chromedriver',
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
  if (seleniumOutfileAlreadyDownloaded) {
    if (process.env.SELENIUM_CREATE_PROCESS) {
      return process.nextTick(
        cb.bind(null, null, new FakeProcess(process.env.SELENIUM_LAUNCHER_PORT))
      )
    }
    return run(cb);
  } 

  downloadSelenium(seleniumDownloadUrl, seleniumOutfile, seleniumShaExpected, function(err) {
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
