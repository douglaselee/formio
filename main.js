'use strict';

var fs      = require('fs');
var http    = require('http');
var https   = require('https');
var hooks   = require('./hooks');
var options = {
  key:  fs.readFileSync('./ssl/server.key'),
  cert: fs.readFileSync('./ssl/server.crt')
};

const util = require('./src/util/util');
require('colors');
require('./server')(hooks).then(function(state) {
  util.log(` > Serving the Form.io API Platform at ${state.config.domain.green}`);
//state.server.listen(state.config.port);
  http.createServer(state.server).listen(state.config.port, state.config.host);
  https.createServer(options, state.server).listen(state.config.sslPort, state.config.host);
});

const tls       = require('tls');
const opt       = {
  tls: {
    key:  './ssl/ftp/server.key',
    cert: './ssl/ftp/server.crt',
    ca:   './ssl/ftp/server.csr'
  }
};

const context   = tls.createSecureContext(opt);
const FtpSrv    = require('ftp-srv');
//nst ftpServer = new FtpSrv('ftps://0.0.0.0:990', opt);
const ftpServer = new FtpSrv('ftp://0.0.0.0:21', {});

ftpServer.on('login', function(data, resolve, reject) {
//return reject('WTF!');
  resolve({ root: '.', cwd: '.' });
});

ftpServer.listen().then(function() {
  var v = 1;
});

ftpServer.on('client-error', function(connection, context, error) {
  var v = 1;
});
